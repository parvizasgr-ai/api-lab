// W5 QA Medium/Low düzəlişlərinin portal regresiya testləri (ID-lər docs/qa/W5-report.md-dəndir)
import { expect, test, type Page } from '@playwright/test'
import { makePdf } from './fixtures'
import { go, signIn } from './helpers'

async function openApp(page: Page, title: string) {
  await go(page, 'apps')
  const back = page.locator('.app-detail-topbar button')
  if (await back.isVisible()) await back.click()
  await page.locator('.app-card').filter({ has: page.locator('h2', { hasText: new RegExp(`^${title}$`) }) }).getByRole('button').click()
}

test('QA-M04: real URL — reload və paylaşılan link eyni səhifəni açır, Geri/İrəli işləyir', async ({ page }) => {
  await signIn(page, 'student', 'student123')
  await go(page, 'sql')
  await expect(page).toHaveURL(/\/sql$/)
  await page.reload()
  await expect(page.locator('.schema-panel')).toBeVisible()
  await expect(page.locator('.desktop-nav a[href="/sql"]')).toHaveClass(/active/)

  // Tətbiq səviyyəsində dərin link
  await openApp(page, 'Bank')
  await expect(page).toHaveURL(/\/apps\/bank$/)
  await page.reload()
  await expect(page.locator('.bank-app')).toBeVisible()

  // Geri → /apps (kataloq), Geri → /sql, İrəli → /apps
  await page.goBack()
  await expect(page).toHaveURL(/\/apps$/)
  await expect(page.locator('.app-card').first()).toBeVisible()
  await page.goBack()
  await expect(page.locator('.schema-panel')).toBeVisible()
  await page.goForward()
  await expect(page.locator('.app-card').first()).toBeVisible()

  // Yeni vərəqədə birbaşa link
  const other = await page.context().newPage()
  await other.goto('/materials')
  await expect(other.locator('.task-list').first()).toBeVisible()
  await other.close()
})

test('QA-M04: sessiyasız qorunan link → sign-in → girişdən sonra həmin səhifəyə qayıdır', async ({ page }) => {
  await page.goto('/apps/customers')
  await expect(page).toHaveURL(/\/signin$/)
  await page.locator('.demo-login-form input[autocomplete="username"]').fill('student')
  await page.locator('.demo-login-form input[type="password"]').fill('student123')
  await page.locator('.demo-login-form button[type="submit"]').click()
  await expect(page).toHaveURL(/\/apps\/customers$/)
  await expect(page.locator('.customers-app')).toBeVisible()
})

test('QA-M03 + QA-L02: <html lang> dilə uyğundur və dil seçimi reload-dan sonra qalır', async ({ page }) => {
  await signIn(page, 'student', 'student123')
  await expect(page.locator('html')).toHaveAttribute('lang', 'az')
  await page.locator('.language-switcher button', { hasText: 'EN' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.locator('.language-switcher button', { hasText: 'EN' })).toHaveAttribute('aria-pressed', 'true')
  await page.locator('.language-switcher button', { hasText: 'AZ' }).click()
})

test('QA-L03: Materials dərs filteri URL-də və reload-dan sonra qalır', async ({ page }) => {
  await signIn(page, 'student', 'student123')
  await go(page, 'materials')
  await page.locator('.mat-lesson-filter button', { hasText: /2/ }).click()
  await expect(page).toHaveURL(/\/materials\?lesson=2$/)
  await expect(page.locator('section[data-lesson]')).toHaveCount(1)
  await page.reload()
  await expect(page.locator('.mat-lesson-filter button.active')).toContainText('2')
  await go(page, 'home')
  await go(page, 'materials')
  await expect(page.locator('.mat-lesson-filter button.active')).toContainText('2')
  await page.locator('.mat-lesson-filter button').first().click() // "Hamısı" — sonrakı testlərə təsir etməsin
  await expect(page).toHaveURL(/\/materials$/)
})

test('QA-L04: footer ili cari ildir', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('footer')).toContainText(`© ${new Date().getFullYear()} API Lab`)
})

test('QA-L10 + QA-M06: müştərilər səhifələnir; silmə xətası göstərilir və modal açıq qalır', async ({ page }) => {
  await signIn(page, 'student', 'student123')
  await openApp(page, 'Müştərilər')
  await expect(page.locator('.table-pager')).toContainText('1 /')
  const firstPageFirstRow = await page.locator('.customer-table-card tbody tr').first().textContent()
  await page.locator('.table-pager button').last().click()
  await expect(page.locator('.table-pager')).toContainText('2 /')
  await expect(page.locator('.customer-table-card tbody tr').first()).not.toHaveText(firstPageFirstRow!)
  await page.locator('.table-pager button').first().click()
  await expect(page.locator('.table-pager')).toContainText('1 /')

  await page.route(/\/api\/v1\/customers\/\d+$/, (route) =>
    route.request().method() === 'DELETE'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ timestamp: new Date().toISOString(), status: 500, code: 'INTERNAL_ERROR', message: 'E2E', details: [], traceId: 'req_e2e' }) })
      : route.continue(),
  )
  await page.locator('.customer-actions button').last().click()
  await page.locator('.delete-modal .modal-actions button').last().click()
  await expect(page.locator('.delete-modal p[role="alert"]')).toContainText('500 INTERNAL_ERROR')
  await expect(page.locator('.delete-modal')).toBeVisible()
})

test('QA-L11: student-in açıq Materials səhifəsi yeni hazır materialı reload-suz göstərir', async ({ page, request }) => {
  await signIn(page, 'student', 'student123')
  await go(page, 'materials')
  const title = `Avto yenilənmə ${Date.now()}`
  await expect(page.locator('.mat-card', { hasText: title })).toHaveCount(0)
  const { access_token } = await (await request.post('/api/v1/auth/login', { data: { username: 'admin', password: 'admin123' } })).json()
  const up = await request.post('/api/v1/materials', {
    headers: { Authorization: `Bearer ${access_token}` },
    multipart: { title, lesson: '3', file: { name: 'avto.pdf', mimeType: 'application/pdf', buffer: makePdf(1) } },
  })
  const { id } = await up.json()
  await expect.poll(async () => (await (await request.get(`/api/v1/materials/${id}`, { headers: { Authorization: `Bearer ${access_token}` } })).json()).status, { timeout: 20_000 }).toBe('READY')
  // Vərəqəyə qayıtma (visibilitychange) — 30 saniyəlik taymeri gözləmədən
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.locator('.mat-card', { hasText: title })).toBeVisible()
  await request.delete(`/api/v1/materials/${id}`, { headers: { Authorization: `Bearer ${access_token}` } })
})
