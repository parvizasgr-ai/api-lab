// W3: Materials (admin və student), Explorer Tests, OAuth səssiz refresh, real Bank qrafiki və dərs kartları.
import { expect, test, type Page } from '@playwright/test'
import { makePdf } from './fixtures'

const SESSION_KEY = 'api-lab-session'

async function signIn(page: Page, username: string, password: string) {
  await page.goto('/signin')
  await page.locator('.demo-login-form input[autocomplete="username"]').fill(username)
  await page.locator('.demo-login-form input[type="password"]').fill(password)
  await page.locator('.demo-login-form button[type="submit"]').click()
  await expect(page.locator('.user-chip')).toBeVisible()
}
const nav = (page: Page, label: string) => page.locator('.desktop-nav').getByText(label, { exact: true }).click()
const session = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), SESSION_KEY)

async function uploadViaUi(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  await page.locator('.mat-dropzone input[type="file"]').setInputFiles(file)
}
const card = (page: Page, title: string) => page.locator('.mat-card').filter({ has: page.locator('h3', { hasText: title }) })

test('ADMIN: yükləmə → 202 → polling → READY → viewer → PATCH → reconvert → DELETE', async ({ page }) => {
  await signIn(page, 'admin', 'admin123')
  await nav(page, 'Materials')
  await expect(page.locator('.mat-uploader')).toBeVisible()

  await uploadViaUi(page, { name: 'API_Ders1_Giris.pdf', mimeType: 'application/pdf', buffer: makePdf(2) })
  await expect(page.locator('.mat-dropzone')).toContainText('API_Ders1_Giris.pdf')
  await expect(page.locator('.mat-form-row input').first()).toHaveValue('API Ders1 Giris') // fayl adından
  await expect(page.locator('.mat-form-row select').first()).toHaveValue('1') // Ders1 → dərs 1
  const uploaded = page.waitForResponse((r) => r.url().endsWith('/api/v1/materials') && r.request().method() === 'POST')
  await page.locator('.mat-uploader button[type="submit"]').click()
  expect((await uploaded).status()).toBe(202)

  const c = card(page, 'API Ders1 Giris')
  await expect(page.locator('.mat-lesson[data-lesson="1"]').locator('.mat-card')).toHaveCount(1)
  await expect(c.locator('.mat-badge')).toHaveText('READY', { timeout: 20_000 }) // polling
  await expect(c).toContainText('2 ')
  await expect(c.locator('.mat-thumb img')).toHaveAttribute('src', /\/pages\/1\/thumb\?exp=\d+&sig=[a-f0-9]{64}/)

  // Viewer: sol naviqasiya + böyük səhifə şəkli (pre-signed)
  await c.getByRole('button', { name: /^Aç$/ }).click()
  await expect(page.locator('.mat-page-nav button')).toHaveCount(2)
  const stage = page.locator('.mat-page-stage img')
  await expect(stage).toHaveAttribute('src', /\/pages\/1\/image\?exp=/)
  await expect.poll(() => stage.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1600)
  await page.locator('.mat-page-nav button').nth(1).click()
  await expect(page.locator('.mat-page-controls')).toContainText('2 / 2')
  await page.locator('.mat-viewer-tabs button', { hasText: 'PDF' }).click()
  await expect(page.locator('iframe.mat-pdf')).toHaveAttribute('src', /\/pdf\?exp=/)
  await page.locator('.mat-viewer-head > button').click()

  // PATCH
  await c.getByRole('button', { name: /Redaktə/ }).click()
  await c.locator('.mat-editor input').first().fill('Dərs 1 — API Giriş')
  const patched = page.waitForResponse((r) => r.request().method() === 'PATCH')
  await c.locator('.mat-editor button[type="submit"]').click()
  expect((await patched).status()).toBe(200)
  const renamed = card(page, 'Dərs 1 — API Giriş')
  await expect(renamed).toBeVisible()

  // Reconvert → UPLOADED/CONVERTING → READY
  const reconverted = page.waitForResponse((r) => r.url().includes('/reconvert'))
  await renamed.getByRole('button', { name: /Reconvert/ }).click()
  expect((await reconverted).status()).toBe(202)
  await expect(renamed.locator('.mat-badge')).toHaveText('READY', { timeout: 20_000 })

  // DELETE (təsdiq modalı)
  await renamed.getByRole('button', { name: /Sil/ }).click()
  const deleted = page.waitForResponse((r) => r.request().method() === 'DELETE')
  await page.locator('.delete-modal .modal-actions button').last().click()
  expect((await deleted).status()).toBe(204)
  await expect(renamed).toHaveCount(0)
})

test('ADMIN: yükləmə xətaları aydın göstərilir — 415 (magic bytes), 413 (ölçü), 422 (başlıq), client 415 (uzantı)', async ({ page }) => {
  await signIn(page, 'admin', 'admin123')
  await nav(page, 'Materials')
  const alert = page.locator('.mat-alert')
  const submit = page.locator('.mat-uploader button[type="submit"]')

  // .pdf adlı HTML — backend magic bytes yoxlaması
  await uploadViaUi(page, { name: 'fake.pdf', mimeType: 'application/pdf', buffer: Buffer.from('<html><script>alert(1)</script></html>') })
  await submit.click()
  await expect(alert).toContainText('Fayl tipi dəstəklənmir')
  await expect(alert).toContainText('415 UNSUPPORTED_MEDIA_TYPE')
  await expect(alert).toContainText('%PDF-')

  // Server limiti (e2e: 1 MB) → 413
  await uploadViaUi(page, { name: 'big.pdf', mimeType: 'application/pdf', buffer: makePdf(1, 1_200_000) })
  await submit.click()
  await expect(alert).toContainText('Fayl çox böyükdür')
  await expect(alert).toContainText('413 PAYLOAD_TOO_LARGE')

  // Boş başlıq → 422 VALIDATION_ERROR (details ilə)
  await uploadViaUi(page, { name: 'ok.pdf', mimeType: 'application/pdf', buffer: makePdf(1) })
  await page.locator('.mat-form-row input').first().fill('')
  await submit.click()
  await expect(alert).toContainText('Məlumatlar düzgün deyil')
  await expect(alert).toContainText('422 VALIDATION_ERROR')
  await expect(alert).toContainText('/title')

  // İcazəsiz uzantı — client tərəfi dərhal (sorğu göndərilmir)
  let posted = false
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/v1/materials')) posted = true
  })
  await uploadViaUi(page, { name: 'setup.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') })
  await submit.click()
  await expect(alert).toContainText('.exe')
  expect(posted).toBe(false)
  await expect(page.locator('.mat-card')).toHaveCount(0)
})

test('STUDENT: yükləmə gizli, viewer oxunur (mobil də), tapşırıq done → progress bar', async ({ page, request }) => {
  // Material admin adından API ilə yüklənir
  const login = await request.post('/api/v1/auth/login', { data: { username: 'admin', password: 'admin123' } })
  const { access_token } = await login.json()
  const up = await request.post('/api/v1/materials', {
    headers: { Authorization: `Bearer ${access_token}` },
    multipart: { title: 'Dərs 2 — HTTP və REST', lesson: '2', file: { name: 'API_Ders2_HTTP_REST.pdf', mimeType: 'application/pdf', buffer: makePdf(3) } },
  })
  expect(up.status()).toBe(202)

  await signIn(page, 'student', 'student123')
  await nav(page, 'Materials')
  await expect(page.locator('.mat-uploader')).toHaveCount(0)
  const c = card(page, 'Dərs 2 — HTTP və REST')
  await expect(c.locator('.mat-badge')).toHaveText('READY', { timeout: 20_000 })
  await expect(c.getByRole('button', { name: /Redaktə|Reconvert|Sil/ })).toHaveCount(0)
  await expect(c.locator('a[download]')).toHaveAttribute('href', /\/download\?exp=/)

  // Axtarış və dərs filteri
  await page.locator('.mat-search input').fill('REST')
  await expect(page.locator('.mat-card')).toHaveCount(1)
  await page.locator('.mat-lesson-filter button', { hasText: 'Dərs 1' }).click()
  await expect(page.locator('.mat-lesson')).toHaveCount(1)
  await expect(page.locator('.mat-lesson .mat-empty')).toBeVisible()
  await page.locator('.mat-lesson-filter button', { hasText: 'Hamısı' }).click()
  await page.locator('.mat-search input').fill('')

  // Tapşırıqlar: Dərs 1 — 4 tapşırıq, birini done → 1/4 · 25%, reload-dan sonra qalır (DB)
  const lesson1 = page.locator('.mat-lesson[data-lesson="1"] .mat-tasks')
  await expect(lesson1.locator('.task-list article')).toHaveCount(4)
  const saved = page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().includes('/progress'))
  await lesson1.locator('.task-list article button').first().click()
  expect((await saved).status()).toBe(200)
  await expect(lesson1.locator('.mat-tasks-head span')).toHaveText('1 / 4 · 25%')
  await expect(lesson1.locator('.mat-progress')).toHaveAttribute('aria-valuenow', '25')
  await page.reload()
  await nav(page, 'Materials')
  await expect(page.locator('.mat-lesson[data-lesson="1"] .mat-tasks-head span')).toHaveText('1 / 4 · 25%')

  // Viewer mobil enində: üfüqi səhifə zolağı, üfüqi scroll yoxdur
  await page.setViewportSize({ width: 390, height: 844 })
  await card(page, 'Dərs 2 — HTTP və REST').getByRole('button', { name: /^Aç$/ }).click()
  await expect(page.locator('.mat-page-nav button')).toHaveCount(3)
  await expect(page.locator('.mat-page-nav')).toHaveCSS('display', 'flex')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  const box = await page.locator('.mat-page-stage img').boundingBox()
  expect(box!.width).toBeLessThanOrEqual(390)
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.mat-page-controls')).toContainText('2 / 3')
})

test('Explorer Tests: assertion-lar real cavab üzərində icra olunur (pass/fail)', async ({ page }) => {
  await signIn(page, 'student', 'student123')
  await nav(page, 'Explorer')
  await page.locator('.request-url-input input').fill('http://localhost:3000/api/v1/health')
  await page.locator('.builder-tabs button').filter({ hasText: /^Tests/ }).click()
  await page.locator('.code-editor textarea').fill('status == 200\njson $.status == "ok"\nheader x-request-id exists\njson $.db == "down"')
  await page.locator('.explorer-send').click()
  const testsTab = page.locator('.response-tabs button').filter({ hasText: /^Tests/ })
  await expect(testsTab).toHaveText('Tests 3/4')
  await testsTab.click()
  await expect(page.locator('.test-results li.pass')).toHaveCount(3)
  await expect(page.locator('.test-results li.fail')).toHaveCount(1)
  await expect(page.locator('.test-results li.fail')).toContainText('$.db = "ok"')
})

test('OAuth girişində refresh token var; token bitməzdən əvvəl səssiz yenilənir (banner çıxmır)', async ({ page }) => {
  await page.goto('/signin')
  await page.locator('.google-signin-button').click()
  await page.locator('.account-chooser').getByRole('button').filter({ hasText: 'Aysel Məmmədova' }).click()
  await page.locator('.consent-password input').fill('student123')
  await page.locator('.google-consent-actions button').last().click()
  await expect(page.locator('.user-chip')).toBeVisible()
  const s = await session(page)
  expect(s.refreshToken).toMatch(/^rt_/)

  // Token-in 5 saniyəsi qalıb kimi: səhifə açılan kimi taymer refresh edir
  await page.evaluate(([key]) => {
    const current = JSON.parse(localStorage.getItem(key)!)
    localStorage.setItem(key, JSON.stringify({ ...current, expiresAt: Date.now() + 5_000 }))
  }, [SESSION_KEY])
  const refresh = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/refresh'))
  await page.reload()
  const res = await refresh
  expect(res.status()).toBe(200)
  expect((await res.json()).scope).not.toContain('admin')
  await expect.poll(async () => (await session(page)).expiresAt).toBeGreaterThan(Date.now() + 10 * 60_000)
  await expect(page.locator('.session-expired-banner')).toHaveCount(0)
})

test('Real data: Bank balans qrafiki və Home dərs kartları (/tasks/progress/me)', async ({ page }) => {
  await signIn(page, 'rauf', 'rauf123')
  await nav(page, 'Home')
  await expect(page.locator('.lesson-card').first()).toContainText(/0 \/ 4 tapşırıq/)
  await expect(page.locator('.lesson-card').nth(2)).toContainText(/\/ 7 tapşırıq/)
  await nav(page, 'Apps')
  await page.locator('.app-card').filter({ has: page.locator('h2', { hasText: /^Bank$/ }) }).getByRole('button').click()
  const spark = page.locator('.balance-spark path')
  await expect(spark).toHaveAttribute('d', /^M[\d.]+ [\d.]+( L[\d.]+ [\d.]+){3,}$/)
  await expect(page.locator('.balance-spark span')).toHaveText(/^[+-]?\d+\.\d%$/)
})
