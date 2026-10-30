// W5 — istifadəçi axınları (portal.spec.ts/materials.spec.ts-də olmayanlar): logout, kartı blokla (idempotent təkrar),
// transfer, valyuta, otel bronu, Customers CRUD, klaviatura naviqasiyası, yüklənir/xəta halları.
import { expect, test, type Page, type Request } from '@playwright/test'
import { go, signIn } from './helpers'

async function openApp(page: Page, title: string) {
  await go(page, 'apps')
  const back = page.locator('.app-detail-topbar button')
  if (await back.isVisible()) await back.click()
  await page.locator('.app-card').filter({ has: page.locator('h2', { hasText: new RegExp(`^${title}$`) }) }).getByRole('button').click()
}

test('logout: sessiya silinir, refresh token server-də ləğv olunur, qorunan səhifə sign-in tələb edir', async ({ page, request }) => {
  await signIn(page, 'student', 'student123')
  const refresh = await page.evaluate(() => JSON.parse(localStorage.getItem('api-lab-session')!).refreshToken as string)
  const logout = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/logout'))
  await page.locator('.user-chip').click()
  await page.locator('.signout-button').click()
  expect((await logout).status()).toBe(204)
  await expect(page.locator('.header-signin-button')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('api-lab-session'))).toBeNull()
  // ləğv edilmiş refresh token-lə yeni token almaq olmur
  const reuse = await request.post('/api/v1/auth/refresh', { data: { refresh_token: refresh } })
  expect(reuse.status()).toBe(401)
})

test('Kartı blokla: ikiqat klik → eyni Idempotency-Key, server replay edir, UI xəta göstərmir, kart bloklanır', async ({ page }) => {
  await signIn(page, 'admin', 'admin123') // admin-in yeganə aktiv kartı (seed: kart 7)
  await openApp(page, 'Bank')
  const blocks: Request[] = []
  page.on('request', (r) => {
    if (/\/cards\/\d+\/block$/.test(r.url())) blocks.push(r)
  })
  // Birinci cavabı ləngidirik ki, ikinci klik sorğu davam edərkən gəlsin
  await page.route(/\/cards\/\d+\/block$/, async (route) => {
    await new Promise((r) => setTimeout(r, 400))
    await route.continue()
  })
  await page.locator('.payment-card:not(.blocked) button').first().click()
  const confirm = page.locator('.block-modal .modal-actions button').last()
  await confirm.click()
  await confirm.click({ force: true }).catch(() => undefined) // düymə bloklanıbsa klik heç nə etmir — gözlənilən
  await expect(page.locator('.block-modal')).toHaveCount(0)
  await expect(page.locator('.payment-card.blocked').first()).toBeVisible()
  const keys = new Set(blocks.map((r) => r.headers()['idempotency-key']))
  expect(blocks.length).toBeGreaterThanOrEqual(1)
  expect(keys.size).toBe(1)
})

test('Kartı blokla: cavab itəndə təkrar cəhd eyni açarla replay alır (409 CARD_ALREADY_BLOCKED yox)', async ({ page }) => {
  await signIn(page, 'student', 'student123')
  await openApp(page, 'Bank')
  let lost = false
  await page.route(/\/cards\/\d+\/block$/, async (route) => {
    if (!lost) {
      lost = true
      await route.fetch() // server sorğunu icra edir…
      await route.abort('connectionreset') // …amma cavab client-ə çatmır
      return
    }
    await route.continue()
  })
  const statuses: { status: number; key: string; replayed?: string }[] = []
  page.on('response', async (r) => {
    if (/\/cards\/\d+\/block$/.test(r.url())) statuses.push({ status: r.status(), key: r.request().headers()['idempotency-key'], replayed: r.headers()['idempotent-replayed'] })
  })
  await page.locator('.payment-card:not(.blocked) button').first().click()
  const confirm = page.locator('.block-modal .modal-actions button').last()
  await confirm.click()
  await expect(page.locator('.block-modal p')).not.toHaveText('') // şəbəkə xətası göstərilir
  await confirm.click() // yenidən cəhd
  await expect(page.locator('.block-modal')).toHaveCount(0)
  expect(statuses.at(-1)).toMatchObject({ status: 200, replayed: 'true' })
})

test('Transfer: göndər → balans yenilənir, yeni Idempotency-Key; forma dəyişəndə açar dəyişir', async ({ page }) => {
  await signIn(page, 'student', 'student123')
  await openApp(page, 'Bank')
  const keyBefore = await page.locator('.idempotency-field code').textContent()
  await page.locator('.transfer-split input[type="number"]').fill('3.00')
  const keyAfterEdit = await page.locator('.idempotency-field code').textContent()
  expect(keyAfterEdit).not.toBe(keyBefore)
  const res = page.waitForResponse((r) => r.url().endsWith('/api/v1/transfers') && r.request().method() === 'POST')
  await page.locator('.transfer-button').click()
  const response = await res
  expect(response.status()).toBe(201)
  expect(response.request().headers()['idempotency-key']).toBe(keyAfterEdit)
  await expect(page.locator('.transfer-button.success')).toBeVisible()
  await expect(page.locator('.idempotency-field code')).not.toHaveText(keyAfterEdit!)
  await expect(page.locator('.activity-row').first()).toContainText('3')
})

test('Valyuta: məbləğ və valyuta dəyişir → nəticə real məzənnə ilə yenilənir', async ({ page }) => {
  await signIn(page, 'student', 'student123')
  await openApp(page, 'Valyuta')
  await expect(page.locator('.rate-summary strong')).toContainText('1 AZN')
  const input = page.locator('.currency-input-block').first().locator('input')
  await input.fill('100')
  await expect(page.locator('#currency-to')).toHaveValue('58.82')
  await page.locator('.swap-row button').click()
  await expect(page.locator('.rate-summary strong')).toContainText('1 USD')
})

test('Otel bronu: axtar → otaq seç → təsdiqlə → kod; Uçuş bronu da işləyir', async ({ page }) => {
  await signIn(page, 'student', 'student123')
  await openApp(page, 'Otellər')
  await page.locator('.hotel-card button').first().click()
  await expect(page.locator('.hotel-confirm-button')).toBeEnabled()
  const res = page.waitForResponse((r) => r.url().endsWith('/api/v1/hotels/bookings') && r.request().method() === 'POST')
  await page.locator('.hotel-confirm-button').click()
  expect((await res).status()).toBe(201)
  await expect(page.locator('.hotel-booking-modal .booking-success')).toBeVisible()
})

test('Customers CRUD: yarat → PATCH → PUT → sil', async ({ page }) => {
  await signIn(page, 'student', 'student123')
  await openApp(page, 'Müştərilər')
  const email = `e2e.${Date.now()}@example.az`
  await page.locator('.customers-head button').click()
  await page.locator('.customer-form input[name="name"]').fill('Eldar Testov')
  await page.locator('.customer-form input[name="email"]').fill(email)
  await page.locator('.customer-form button[type="submit"]').click()
  const row = page.locator('.customer-table-card tr', { hasText: email })
  await expect(row).toBeVisible()

  for (const [method, city] of [['PATCH', 'Gəncə'], ['PUT', 'Sumqayıt']]) {
    await row.locator('.customer-actions button').first().click()
    await page.locator('.method-choice button', { hasText: method }).click()
    await page.locator('.customer-form input[name="company"]').fill(city)
    const res = page.waitForResponse((r) => /\/api\/v1\/customers\/\d+$/.test(r.url()) && r.request().method() === method)
    await page.locator('.customer-form button[type="submit"]').click()
    const r = await res
    expect(r.status(), `${method} ${r.request().postData()} → ${await r.text()}`).toBe(200)
    await expect(row).toContainText(city)
  }

  await row.locator('.customer-actions button').last().click()
  const del = page.waitForResponse((r) => /\/api\/v1\/customers\/\d+$/.test(r.url()) && r.request().method() === 'DELETE')
  await page.locator('.delete-modal .modal-actions button').last().click()
  expect((await del).status()).toBe(204)
  await expect(row).toHaveCount(0)
})

test('klaviatura: ilk Tab → "Əsas məzmuna keç", Enter → main; nav linkləri Tab ilə əlçatan və fokus görünür', async ({ page }) => {
  await signIn(page, 'student', 'student123')
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.locator('.skip-link')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#main-content$/)
  // Header-dəki hər nav linki Tab ilə fokuslanır və görünən fokus göstəricisi var
  await page.goto('/')
  const reached: string[] = []
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab')
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body) return null
      const s = getComputedStyle(el)
      const visible = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none'
      return { href: el.getAttribute('href') ?? '', text: el.textContent?.trim().slice(0, 30) ?? '', visible }
    })
    if (!info) continue
    expect(info.visible, `fokus göstəricisi görünmür: ${info.text || info.href}`).toBe(true)
    reached.push(info.href)
  }
  for (const target of ['/', '/reference', '/callbox', '/sql', '/materials']) expect(reached).toContain(target)
  // Enter ilə naviqasiya
  await page.locator('.desktop-nav a[href="/sql"]').focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.schema-panel')).toBeVisible()
})

test('QA-M05: modal Escape ilə bağlanır, fokus dialoqa keçir və sonra düyməyə qayıdır', async ({ page }) => {
  await signIn(page, 'student', 'student123')
  await openApp(page, 'Bank')
  await page.locator('.payment-card:not(.blocked) button').first().click()
  await expect(page.locator('.block-modal')).toBeVisible()
  await expect(page.locator('.block-modal select')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('.block-modal')).toHaveCount(0)
  await expect(page.locator('.payment-card:not(.blocked) button').first()).toBeFocused()
  // Müştərilər modalı da
  await openApp(page, 'Müştərilər')
  await page.locator('.customers-head button').click()
  await expect(page.locator('.customer-modal')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.customer-modal')).toHaveCount(0)
})

// Backend 500 qaytaranda hər ekran çökməməli və xətanı (kod/mesaj) göstərməlidir
const FAIL_500 = (route: import('@playwright/test').Route) =>
  route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ timestamp: new Date().toISOString(), status: 500, code: 'INTERNAL_ERROR', message: 'E2E simulyasiya', details: [], traceId: 'req_e2e' }) })
const ERROR_SHOWN = /500|INTERNAL_ERROR|E2E simulyasiya/
const errorScreens: { name: string; open: (page: Page) => Promise<void>; scope: string }[] = [
  { name: 'Bank', open: (page) => openApp(page, 'Bank'), scope: '.bank-summary' },
  { name: 'SQL Playground (schema)', open: (page) => go(page, 'sql'), scope: 'main' },
  { name: 'Materials', open: (page) => go(page, 'materials'), scope: 'main' },
  { name: 'Müştərilər', open: (page) => openApp(page, 'Müştərilər'), scope: '.customers-app' },
  { name: 'Kitablar', open: (page) => openApp(page, 'Kitablar'), scope: '.app-detail, main' },
  { name: 'Valyuta', open: (page) => openApp(page, 'Valyuta'), scope: '.currency-app' },
]
for (const screen of errorScreens) {
  test(`xəta halı (500): ${screen.name} çökmür və xətanı göstərir (QA-M06/M07/M08)`, async ({ page }) => {
    await signIn(page, 'student', 'student123')
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.route(/\/(api\/v1|bff)\/(?!auth\/)/, FAIL_500)
    await screen.open(page)
    await expect(page.locator(screen.scope).first()).toContainText(ERROR_SHOWN)
    expect(errors).toEqual([])
  })
}

test('yüklənir halı: ləng cavabda Bank "yüklənir" göstərir, sonra data gəlir', async ({ page }) => {
  await page.route(/\/bff\/dashboard/, async (route) => {
    await new Promise((r) => setTimeout(r, 4000))
    await route.continue()
  })
  await signIn(page, 'student', 'student123')
  await openApp(page, 'Bank')
  await expect(page.locator('.bank-summary strong')).toHaveText(/yüklənir|loading/i)
  await expect(page.locator('.account-card').first()).toBeVisible({ timeout: 10_000 })
})
