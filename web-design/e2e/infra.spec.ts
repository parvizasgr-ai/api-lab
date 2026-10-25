// Infrastruktur səhifəsi (/infra): Redis keşi (MISS → HIT), redis-cli, Kafka hadisəsi → bildiriş (MongoDB), Mongo sorğusu.
import { expect, test } from '@playwright/test'
import { go, signIn } from './helpers'

test('Redis: keş sınağı MISS → HIT, açar TTL ilə görünür; konsolda sandbox yazma və FLUSHALL bloku', async ({ page }) => {
  await signIn(page, 'student', 'student123')
  await go(page, 'infra')
  await expect(page).toHaveURL(/\/infra/)
  await page.getByRole('button', { name: /2 dəfə göndər|Send twice/ }).click()
  await expect(page.locator('.infra-probes li')).toHaveCount(2)
  await expect(page.locator('.infra-probes li').first()).toContainText('MISS')
  await expect(page.locator('.infra-probes li').last()).toContainText('HIT')
  await expect(page.locator('.infra-table')).toContainText('cache:rates:AZN:latest')

  const input = page.locator('#redis-command')
  await input.fill('SET sandbox:student:salam "dünya" EX 60')
  await input.press('Enter')
  await expect(page.locator('.infra-console')).toContainText('OK')
  await input.fill('FLUSHALL')
  await input.press('Enter')
  await expect(page.locator('.infra-console pre.bad')).toContainText('FLUSHALL')
})

test('Kafka → MongoDB: hadisə yarat → bank.cards-da mesaj → bildiriş; Mongo aggregate sorğusu', async ({ page }) => {
  await signIn(page, 'student', 'student123')
  await page.goto('/infra?tab=kafka')
  await expect(page.getByRole('tab', { selected: true })).toContainText('Kafka')
  await page.getByRole('button', { name: /Hadisə yarat|Create an event/ }).click()
  await expect(page.locator('.infra-ok')).toContainText('card.')
  await expect(page.locator('.infra-messages li').first()).toContainText(/card\.(blocked|unblocked)/)
  // Consumer ≈1.5 san sonra emal edir → lag 0
  await expect(page.locator('.infra-table tbody tr').filter({ hasText: 'notification-service' }).filter({ hasText: 'bank.cards' }).locator('.infra-badge.hit')).toBeVisible({ timeout: 10_000 })

  await page.getByRole('tab', { name: /MongoDB/ }).click()
  await expect(page).toHaveURL(/tab=mongo/)
  await expect(page.locator('.infra-notifications li').first()).toContainText(/Kart/, { timeout: 10_000 })
  await page.getByRole('button', { name: '$group: şəhər → orta' }).click()
  await page.locator('.infra-form button[type="submit"]').click()
  await expect(page.locator('.infra-shell')).toContainText('db.hotel_reviews.aggregate')
  await expect(page.locator('.infra-json')).toContainText('avgRating')
  await page.getByRole('button', { name: '$where → 422' }).click()
  await page.locator('.infra-form button[type="submit"]').click()
  await expect(page.locator('.infra-error')).toContainText('$where')

  // vəziyyəti geri qaytar (kart əvvəlki statusuna)
  await page.getByRole('tab', { name: /Kafka/ }).click()
  await page.getByRole('button', { name: /Hadisə yarat|Create an event/ }).click()
  await expect(page.locator('.infra-ok')).toContainText('card.')
})

test('Infra: a11y (axe), mobil en, dark mode — hər üç tab', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 375, height: 812 })
  await signIn(page, 'student', 'student123')
  const { default: AxeBuilder } = await import('@axe-core/playwright')
  for (const tab of ['redis', 'kafka', 'mongo']) {
    await page.goto(`/infra?tab=${tab}`)
    await expect(page.locator('.infra-panel').first()).toBeVisible()
    await page.waitForTimeout(500)
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(axe.violations.map((v) => `${tab} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    expect(overflow, tab).toBe(false)
  }
})
