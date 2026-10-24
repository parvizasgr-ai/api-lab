// Portal → real backend. Seed istifadəçiləri README-dən: student/student123, admin/admin123.
import { expect, test, type Page } from '@playwright/test'

const SESSION_KEY = 'api-lab-session'

async function signIn(page: Page, username: string, password: string) {
  await page.goto('/signin')
  await page.locator('.demo-login-form input[autocomplete="username"]').fill(username)
  await page.locator('.demo-login-form input[type="password"]').fill(password)
  await page.locator('.demo-login-form button[type="submit"]').click()
  await expect(page.locator('.user-chip')).toBeVisible()
}

const nav = (page: Page, label: string) => page.locator('.desktop-nav').getByText(label, { exact: true }).click()

async function session(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), SESSION_KEY)
}

test('login: student — real /auth/login + /auth/me, rol Tələbə', async ({ page }) => {
  await signIn(page, 'student', 'student123')
  await page.locator('.user-chip').click()
  const dropdown = page.locator('.user-dropdown')
  await expect(dropdown).toContainText('Aysel Məmmədova')
  await expect(dropdown).toContainText('student@apilab.az')
  await expect(dropdown).toContainText('Tələbə')
  const s = await session(page)
  expect(s.accessToken.split('.')).toHaveLength(3) // real JWT
  expect(s.refreshToken).toMatch(/^rt_/)
})

test('login: admin — rol Admin; səhv parol → backend xətası (kod + traceId)', async ({ page }) => {
  await page.goto('/signin')
  await page.locator('.demo-login-form input[autocomplete="username"]').fill('admin')
  await page.locator('.demo-login-form input[type="password"]').fill('wrong-pass')
  await page.locator('.demo-login-form button[type="submit"]').click()
  await expect(page.locator('.login-error')).toContainText('INVALID_CREDENTIALS')
  await expect(page.locator('.login-error code')).toContainText(/req_[a-f0-9]{12}/)

  await page.locator('.demo-login-form input[type="password"]').fill('admin123')
  await page.locator('.demo-login-form button[type="submit"]').click()
  await page.locator('.user-chip').click()
  await expect(page.locator('.user-dropdown')).toContainText('Admin')
  await expect(page.locator('.user-dropdown')).toContainText('admin@apilab.az')
})

test('401 → avtomatik refresh → sorğu təkrarlanır, sonra Bank dashboard yeni token ilə', async ({ page }) => {
  await signIn(page, 'student', 'student123')
  const before = await session(page)
  // Access token-i "xarab" edirik: növbəti API sorğusu 401 alacaq, refresh token isə etibarlıdır
  await page.evaluate(([key]) => {
    const s = JSON.parse(localStorage.getItem(key)!)
    localStorage.setItem(key, JSON.stringify({ ...s, accessToken: 'broken.token.value' }))
  }, [SESSION_KEY])

  const log: string[] = []
  page.on('response', (r) => {
    const url = new URL(r.url())
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/bff/')) log.push(`${r.status()} ${r.request().method()} ${url.pathname}`)
  })
  await page.reload()
  await expect.poll(() => log.some((l) => l.endsWith('/api/v1/auth/refresh'))).toBe(true)

  // Ardıcıllıq: X → 401, POST /auth/refresh → 200, eyni X → 200 (bir dəfə təkrar)
  const first401 = log.findIndex((l) => l.startsWith('401 '))
  expect(first401).toBeGreaterThanOrEqual(0)
  const failedPath = log[first401].split(' ').slice(1).join(' ')
  const refreshIndex = log.indexOf('200 POST /api/v1/auth/refresh')
  expect(refreshIndex).toBeGreaterThan(first401)
  await expect.poll(() => log.slice(refreshIndex).includes(`200 ${failedPath}`)).toBe(true)
  expect(log.filter((l) => l.endsWith('/api/v1/auth/refresh'))).toHaveLength(1)

  const after = await session(page)
  expect(after.accessToken).not.toBe('broken.token.value')
  expect(after.refreshToken).not.toBe(before.refreshToken) // rotation

  // Yeni token ilə BFF dashboard: Network panelində 200 + internal calls (meta.calls)
  await nav(page, 'Apps')
  await page.locator('.app-card').filter({ has: page.locator('h2', { hasText: /^Bank$/ }) }).getByRole('button').click()
  await expect(page.locator('.account-card').first()).toContainText('AZ21NABZ0001')
  const dashboardCall = page.locator('.network-call').filter({ hasText: '/bff/dashboard' })
  await expect(dashboardCall).toContainText('200')
  await expect(dashboardCall).toContainText('BFF')
  await dashboardCall.locator('.network-call-main').click()
  await expect(dashboardCall.locator('.internal-calls')).toContainText('accounts.list')
})

test('Explorer: real request + History (request_log)', async ({ page }) => {
  await signIn(page, 'student', 'student123')
  await nav(page, 'Explorer')
  await expect(page.locator('.endpoint-sidebar small').first()).toContainText(/\d{2,} ENDPOINTS/)
  await page.locator('.request-url-input input').fill('http://localhost:3000/api/v1/accounts')
  await page.locator('.explorer-send').click()
  await expect(page.locator('.response-panel-heading')).toContainText('200')
  await expect(page.locator('.response-code')).toContainText('AZ21NABZ0001')
  await expect(page.locator('.response-panel-heading small')).toContainText(/\d+ ms · \d/)

  // History serverdən gəlir: indicə göndərilən sorğu orada olmalıdır
  await expect(page.locator('.history-card tbody tr').filter({ hasText: '/api/v1/accounts' }).first()).toBeVisible()

  // Tokensiz (Auth: None) → real 401, error view-da kod və traceId
  await page.locator('.builder-tabs button').filter({ hasText: /^Auth/ }).click()
  await page.locator('.auth-editor select').selectOption('none')
  await page.locator('.explorer-send').click()
  await expect(page.locator('.response-error')).toContainText('UNAUTHORIZED')
  await expect(page.locator('.response-error dd').nth(1)).toContainText(/req_/)
})

test('429 UI: SQL Playground limiti (20/dəq) — banner və geri sayım', async ({ page }) => {
  await signIn(page, 'student', 'student123')
  const { accessToken } = await session(page)
  // Eyni istifadəçi (subject = user:1) adından limiti 429-a qədər doldururuq. Fixed window: dolum dəqiqə sərhədini
  // keçərsə sayğac sıfırlanır — ona görə "20 sorğu" yox, "429 görünənə qədər" (maks. 45)
  let limited = false
  for (let i = 0; i < 45 && !limited; i++) {
    const res = await page.request.post('/api/v1/_db/query', { headers: { Authorization: `Bearer ${accessToken}` }, data: { sql: 'SELECT 1' } })
    expect([200, 429]).toContain(res.status())
    limited = res.status() === 429
  }
  expect(limited).toBe(true)
  await nav(page, 'Explorer')
  await page.locator('.request-builder select').first().selectOption('POST')
  await page.locator('.request-url-input input').fill('http://localhost:3000/api/v1/_db/query')
  await page.locator('.builder-tabs button').filter({ hasText: /^Body/ }).click()
  await page.locator('.code-editor textarea').fill('{"sql": "SELECT 1"}')
  await page.locator('.explorer-send').click()

  const banner = page.locator('.retry-banner')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText('429')
  await expect(banner.locator('.retry-countdown strong')).toHaveText(/^\d+$/)
  await expect(page.locator('.explorer-send')).toBeDisabled()
})

test('Sign-in-də Google yoxdur; OAuth2 Authorization Code dərs demosu (Apps) real provider ilə işləyir', async ({ page }) => {
  await page.goto('/signin')
  await expect(page.locator('.google-signin-button')).toHaveCount(0)
  await signIn(page, 'student', 'student123')
  await nav(page, 'Apps')
  await page.locator('.app-card').filter({ has: page.locator('h2', { hasText: /Google/ }) }).getByRole('button').click()
  const card = page.locator('.consent-card')
  const authorize = page.waitForResponse((r) => r.url().includes('/oauth/authorize') && r.request().method() === 'GET')
  await card.getByRole('button').click() // 1. GET /oauth/authorize
  expect((await authorize).status()).toBe(200)
  await card.locator('.consent-password input').fill('student123')
  const consent = page.waitForResponse((r) => r.url().endsWith('/oauth/authorize') && r.request().method() === 'POST')
  await card.locator('.consent-actions button').last().click() // 2. consent → code
  expect((await consent).status()).toBe(200)
  await expect(card.locator('code')).toContainText('code=ac_')
  await card.getByRole('button').click() // 3. code göstərildi
  const token = page.waitForResponse((r) => r.url().endsWith('/oauth/token'))
  await card.getByRole('button').click() // 4. POST /oauth/token
  expect((await token).status()).toBe(200)
  await expect(card.locator('.oauth-complete')).toContainText('access_token')
})

test('smoke: bütün Apps və səhifələr real datanı JS xətası olmadan göstərir', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  // rauf: 429 testi student-in SQL limitini (20/dəq) bu dəqiqə doldurub — ayrıca subyekt
  await signIn(page, 'rauf', 'rauf123')

  const openApp = async (title: string) => {
    await nav(page, 'Apps')
    const back = page.locator('.app-detail-topbar button')
    if (await back.isVisible()) await back.click()
    await page.locator('.app-card').filter({ has: page.locator('h2', { hasText: new RegExp(`^${title}$`) }) }).getByRole('button').click()
  }

  await openApp('Valyuta')
  await expect(page.locator('.rate-summary strong')).toContainText('1 AZN = 0.5882 USD')
  await expect(page.locator('.network-call').filter({ hasText: '/api/v1/currencies/rates' })).toContainText('200')

  await openApp('Uçuşlar')
  await expect(page.locator('.flight-card').first()).toContainText('GYD')
  await page.locator('.flight-card button').first().click()
  await page.locator('.booking-form button[type="submit"]').click()
  await expect(page.locator('.booking-success code')).toContainText(/^BK-\d+$/)
  await page.locator('.booking-success button').click()

  await openApp('Otellər')
  await expect(page.locator('.hotel-card').first()).toContainText('Bakı')

  await openApp('Kitablar')
  await expect(page.locator('.book-card').first()).toBeVisible()
  await expect.poll(() => page.locator('.genre-chips button').count()).toBeGreaterThan(3) // janrlar real kataloqdan

  await openApp('Musiqi')
  await page.locator('.track-row button').first().click()
  await expect(page.locator('.network-call').filter({ hasText: '/play' })).toContainText('200')

  await openApp('Müştərilər')
  await expect(page.locator('.customer-table-card')).toContainText('example.az')

  await nav(page, 'Auth Lab')
  await page.locator('.login-lab-card button[type="submit"]').click()
  await expect(page.locator('.payload-part pre')).toContainText('"username": "student"')

  await nav(page, 'SQL')
  await expect(page.locator('.schema-panel')).toContainText('card_status_history')
  await page.locator('.quick-query-row button').first().click()
  await expect(page.locator('.sql-results tbody tr')).toHaveCount(3)
  await page.locator('.sql-code-editor textarea').fill('DROP TABLE cards')
  await page.locator('.sql-panel-head button').last().click()
  await expect(page.locator('.sql-error')).toContainText('SQL_NOT_ALLOWED')

  await nav(page, 'Materials')
  await expect(page.locator('.task-list article')).toHaveCount(16)
  await page.locator('.task-list article button').first().click()
  await expect(page.locator('.task-list article.complete')).toHaveCount(1)

  expect(errors).toEqual([])
})
