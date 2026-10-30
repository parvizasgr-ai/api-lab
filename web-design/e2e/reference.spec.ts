// API Reference (/reference) və Callbox GUI (/callbox): sənəd → "Callbox GUI-də sına" → sorğu;
// token endpoint-i → token avtomatik Authorization-a düşür → bank API 200; OAuth 2.0 "Get New Access Token"; a11y + mobil.
import { expect, test } from '@playwright/test'
import { go, signIn } from './helpers'

test('API Reference: bölmələr, parametrlər, kod nümunələri; "Callbox GUI-də sına" sorğunu hazır açır', async ({ page }) => {
  await signIn(page, 'student', 'student123')
  await go(page, 'reference')
  await expect(page.locator('.ref-nav')).toContainText('Bank Cards')
  await page.locator('.ref-nav a', { hasText: 'Valyuta məzənnəsi' }).click()
  const section = page.locator('#op-v2GetExchangeRates')
  await expect(section.locator('.ref-attr-name', { hasText: /^from$/ })).toBeVisible()
  await expect(section.locator('.ref-auth-badge')).toContainText(/Autentifikasiya tələb olunmur/)
  await section.getByRole('tab', { name: 'Python' }).click()
  await expect(section.locator('.ref-code').first()).toContainText('import requests')
  await section.locator('.ref-try').click()
  await expect(page).toHaveURL(/\/callbox$/)
  await expect(page.locator('.kv-row input[aria-label]').first()).toHaveValue('from')
  await page.locator('.explorer-send').click()
  await expect(page.locator('.response-panel .status-chip, .response-panel-heading')).toContainText('200')
})

test('Callbox GUI: token endpoint-i → token yadda saxlanılır → bank API Authorization-a avtomatik düşür', async ({ page }) => {
  await signIn(page, 'student', 'student123')
  await go(page, 'explorer')
  await page.locator('.endpoint-item', { hasText: 'OpenID Connect token endpoint' }).click()
  await expect(page.locator('.body-mode input[type="radio"]').nth(1)).toBeChecked() // x-www-form-urlencoded
  await page.locator('.explorer-send').click()
  await expect(page.locator('.token-notice')).toBeVisible()

  await page.locator('.endpoint-item', { hasText: 'Hesabların siyahısı' }).click()
  await page.getByRole('tab', { name: /Auth/ }).click()
  await expect(page.locator('.auth-source')).toContainText(/Token endpoint-indən|token endpoint/)
  const [request] = await Promise.all([page.waitForRequest((r) => r.url().endsWith('/api/v2/accounts')), page.locator('.explorer-send').click()])
  expect(request.headers().authorization).toMatch(/^Bearer ey/)
  await expect(page.locator('.response-panel-heading')).toContainText('200')
})

test('Callbox GUI: OAuth 2.0 → Get New Access Token (səhv parol → xəta, düzgün → token)', async ({ page }) => {
  await signIn(page, 'student', 'student123')
  await go(page, 'explorer')
  await page.locator('.endpoint-item', { hasText: 'Kartların siyahısı' }).click()
  await page.getByRole('tab', { name: /Auth/ }).click()
  await page.locator('.auth-editor select').selectOption('oauth2')
  await page.locator('.oauth-box input[type="password"]').fill('wrong-pass')
  await page.locator('.oauth-box button', { hasText: 'Get New Access Token' }).click()
  await expect(page.locator('.oauth-error')).toContainText('400')
  await page.locator('.oauth-box input[type="password"]').fill('student123')
  await page.locator('.oauth-box button', { hasText: 'Get New Access Token' }).click()
  await expect(page.locator('.oauth-ok')).toBeVisible()
  await page.locator('.explorer-send').click()
  await expect(page.locator('.response-panel-heading')).toContainText('200')
})

test('API Reference: a11y (axe), mobil 375px, dark mode — üfüqi scroll yoxdur', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/reference#op-v2CreateDeposit')
  await expect(page.locator('#op-v2CreateDeposit')).toBeVisible()
  const { default: AxeBuilder } = await import('@axe-core/playwright')
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  expect(overflow).toBe(false)
})
