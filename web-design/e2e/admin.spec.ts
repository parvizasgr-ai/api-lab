// Müəllim paneli (/admin): superadmin bütün tələbələri, qrupları, nəticələri görür; tələbəyə bağlıdır.
import { expect, test } from '@playwright/test'
import { go, signIn } from './helpers'

const TEACHER = { username: 'muellim.e2e', password: 'E2e-Muellim-Parol-9' }

test('Müəllim paneli: qeydiyyatlı tələbə qrupda görünür, tapşırıq nəticəsi və SQL sorğusu detalda, CSV endirilir', async ({ page, request }) => {
  const stamp = Date.now().toString(36)
  const group = `E2E-${stamp.slice(-5).toUpperCase()}`
  const username = `aysel.${stamp}`

  // Tələbə API ilə qeydiyyatdan keçir, 1 tapşırığı tamamlayır və SQL sorğusu icra edir
  const reg = await request.post('/api/v1/auth/register', {
    data: { firstName: 'Aysel', lastName: 'Kərimova', groupName: group, username, password: 'Gizli-Parol-42' },
  })
  expect(reg.status()).toBe(201)
  const token = (await reg.json()).access_token as string
  const headers = { Authorization: `Bearer ${token}` }
  const tasks = (await (await request.get('/api/v1/tasks?lesson=1', { headers })).json()).items as { id: number }[]
  expect((await request.put(`/api/v1/tasks/${tasks[0].id}/progress`, { headers, data: { done: true } })).status()).toBe(200)
  expect((await request.post('/api/v1/_db/query', { headers, data: { sql: 'SELECT id FROM books LIMIT 3' } })).status()).toBe(200)

  // Tələbənin naviqasiyasında panel yoxdur, birbaşa link 403 mesajı göstərir
  await signIn(page, username, 'Gizli-Parol-42')
  await expect(page.locator('.desktop-nav a[href="/admin"]')).toHaveCount(0)
  await page.goto('/admin')
  await expect(page.locator('.admin-error')).toContainText('403')
  await page.locator('.user-chip').click()
  await page.locator('.signout-button').click()

  // Müəllim daxil olur → nav-da "Müəllim paneli"
  await signIn(page, TEACHER.username, TEACHER.password)
  await go(page, 'admin')
  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.locator('h1')).toContainText(/Tələbələr|Students/)

  // Qrup kartı → filter; cədvəldə yalnız bu qrupun tələbəsi
  const card = page.locator('.admin-group').filter({ hasText: group })
  await expect(card).toContainText('1')
  await card.click()
  await expect(card).toHaveAttribute('aria-pressed', 'true')
  const rows = page.locator('.admin-table-card tbody tr')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Aysel Kərimova')
  await expect(rows.first()).toContainText(`1 / `)

  // Axtarış
  await page.locator('.admin-filters input[type="search"]').fill('heç-kim-yoxdur')
  await expect(page.locator('.admin-empty')).toBeVisible()
  await page.locator('.admin-filters input[type="search"]').fill('Aysel')
  await expect(rows).toHaveCount(1)

  // Detal paneli: dərs 1 irəliləyişi, tamamlanmış tapşırıq, SQL sorğusu; Escape bağlayır
  await rows.first().locator('.admin-user-link').click()
  const drawer = page.getByRole('dialog')
  await expect(drawer).toContainText('Aysel Kərimova')
  await expect(drawer.locator('.admin-task-list li.done')).toHaveCount(1)
  await expect(drawer.locator('.admin-log').last()).toContainText('SELECT id FROM books LIMIT 3')
  await expect(drawer.locator('.admin-drawer-close')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)

  // CSV: seçilmiş qrup üzrə, UTF-8 BOM, tələbə sətri
  const download = page.waitForEvent('download')
  await page.locator('.admin-download').click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(new RegExp(`^api-lab-netice-${group}-\\d{4}-\\d{2}-\\d{2}\\.csv$`))
  const text = (await import('node:fs')).readFileSync((await file.path())!, 'utf8')
  expect(text.charCodeAt(0)).toBe(0xfeff)
  expect(text).toContain(`${username},Aysel,Kərimova,${group}`)
  expect(text.split('\r\n').filter(Boolean)).toHaveLength(2) // başlıq + 1 tələbə
})

test('Müəllim paneli: a11y (axe), mobil en, dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 375, height: 812 })
  await signIn(page, TEACHER.username, TEACHER.password)
  await page.goto('/admin')
  await expect(page.locator('.admin-table-card tbody tr').first()).toBeVisible()
  const { default: AxeBuilder } = await import('@axe-core/playwright')
  const check = async () => {
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  }
  await check()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  expect(overflow).toBe(false)
  await page.locator('.admin-user-link').first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await check()
})
