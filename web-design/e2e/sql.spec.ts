// SQL dərsliyi (/sql): W3Schools üslubu — dərs naviqasiyası (?lesson=), "Özün sına" redaktoru, tapşırıq yoxlaması,
// verilənlər bazası paneli → SQL Editor, yazma əmri bloklanır; a11y + mobil.
import { expect, test } from '@playwright/test'
import { go, signIn } from './helpers'

// SQL endpoint-inin limiti istifadəçi başına 20/dəq-dir; student və rauf-un limitini portal.spec-in 429 testi doldurur
const login = (page: Parameters<typeof signIn>[0]) => signIn(page, 'admin', 'admin123')

test('dərs: WHERE → Özün sına (redaktə + işə sal) → Növbəti dərs; URL ?lesson= saxlanılır', async ({ page }) => {
  await login(page)
  await go(page, 'sql')
  await page.locator('.sql-nav-list a', { hasText: /^WHERE$/ }).click()
  await expect(page).toHaveURL(/lesson=where/)
  await expect(page.locator('.sql-lesson h1')).toHaveText('WHERE')
  const example = page.locator('.sql-example').first()
  await example.locator('textarea').fill("SELECT name, stars FROM hotels WHERE city = 'Qəbələ'")
  await example.locator('.tryit-run').click()
  await expect(example.locator('.sql-results tbody tr').first()).toBeVisible()
  await page.locator('.sql-pager button', { hasText: /Növbəti|Next/ }).first().click()
  await expect(page).toHaveURL(/lesson=order-by/)
  await page.reload()
  await expect(page.locator('.sql-lesson h1')).toContainText('ORDER BY')
})

test('tapşırıq: səhv → izah (sütun sayı), düzgün → ✓ və menyuda işarə; ORDER BY tapşırığında sıra yoxlanılır', async ({ page }) => {
  await login(page)
  await page.goto('/sql?lesson=having')
  const ex = page.locator('.sql-exercise')
  await ex.locator('textarea').fill('SELECT to_code FROM flights GROUP BY to_code HAVING COUNT(*) > 5')
  await ex.locator('.sql-btn-primary').click()
  await expect(ex.locator('.sql-verdict.bad')).toContainText(/Sütun sayı|Column count/)
  await ex.locator('textarea').fill('SELECT to_code, COUNT(*) AS n FROM flights GROUP BY to_code HAVING COUNT(*) > 5')
  await ex.locator('.sql-btn-primary').click()
  await expect(ex.locator('.sql-verdict.ok')).toBeVisible()
  await expect(page.locator('.sql-nav-list a.active .sql-nav-done')).toBeVisible()

  await page.goto('/sql?lesson=order-by')
  await page.locator('.sql-exercise textarea').fill('SELECT title, pages FROM books ORDER BY pages ASC')
  await page.locator('.sql-exercise .sql-btn-primary').click()
  await expect(page.locator('.sql-verdict.bad')).toContainText(/sıra|order/)
})

test('verilənlər bazası paneli → SELECT * redaktorda işləyir; DROP → SQL_NOT_ALLOWED', async ({ page }) => {
  await login(page)
  await page.goto('/sql')
  await page.locator('.sql-db-table', { hasText: 'deposits' }).click()
  await page.locator('.sql-db-columns button').click()
  await expect(page).toHaveURL(/lesson=editor/)
  await expect(page.locator('.sql-editor-page .sql-results tbody tr')).toHaveCount(1)
  await page.locator('.sql-editor-page textarea').fill('DROP TABLE cards')
  await page.locator('.sql-editor-page .tryit-run').click()
  await expect(page.locator('.sql-error')).toContainText('SQL_NOT_ALLOWED')
})

test('a11y (axe), mobil 375px (dərs seçimi select ilə), dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 375, height: 812 })
  await login(page)
  await page.goto('/sql?lesson=group-by')
  await page.locator('.sql-example .tryit-run').first().click()
  await expect(page.locator('.sql-example .sql-results').first()).toBeVisible()
  await page.locator('.sql-lesson-select select').selectOption('having')
  await expect(page.locator('.sql-lesson h1')).toHaveText('HAVING')
  const { default: AxeBuilder } = await import('@axe-core/playwright')
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false)
})
