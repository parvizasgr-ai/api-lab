// Callbox AI (/ai): mesaj → cavab (Markdown), söhbət sol paneldə qalır (reload sonrası da), 429 → xəta + retry.
// Gemini kvotası xərclənməsin deyə POST /api/v1/ai/chat brauzerdə mock olunur (server tərəfi tests/ai.test.ts-də yoxlanır).
import { expect, test, type Page } from '@playwright/test'
import { go, signIn } from './helpers'

async function mockChat(page: Page, replies: { status: number; body: unknown; headers?: Record<string, string> }[]) {
  const sent: unknown[] = []
  await page.route('**/api/v1/ai/chat', async (route) => {
    sent.push(route.request().postDataJSON())
    const next = replies.shift() ?? { status: 200, body: { reply: { role: 'model', text: 'ok' }, model: 'gemini-test', attempts: 1, usage: null, durationMs: 1 } }
    await route.fulfill({ status: next.status, contentType: 'application/json', headers: next.headers, body: JSON.stringify(next.body) })
  })
  return sent
}

const reply = (text: string) => ({ status: 200, body: { reply: { role: 'model', text }, model: 'gemini-3.5-flash', attempts: 1, usage: null, durationMs: 900 } })

test('Callbox AI: sual → Markdown cavab, kontekst növbəti sorğuda göndərilir, söhbət reload-dan sonra qalır', async ({ page }) => {
  const sent = await mockChat(page, [reply('**PUT** — tam əvəz, **PATCH** — qismən.\n\n- PUT idempotentdir'), reply('Bəli, `PATCH` də idempotent ola bilər.')])
  await signIn(page, 'student', 'student123')
  await go(page, 'ai')
  await expect(page.locator('.ai-welcome h1')).toBeVisible()
  await page.locator('#ai-input').fill('PUT və PATCH fərqi nədir?')
  await page.keyboard.press('Enter')
  await expect(page.locator('.ai-msg-model strong').first()).toHaveText('PUT')
  await page.locator('#ai-input').fill('PATCH idempotentdir?')
  await page.locator('.ai-send').click()
  await expect(page.locator('.ai-msg-model code')).toHaveText('PATCH')
  expect((sent[1] as { messages: unknown[] }).messages).toHaveLength(3) // user, model, user
  await expect(page.locator('.ai-chat-item')).toHaveCount(1)

  await page.reload()
  await expect(page.locator('.ai-chat-item button').first()).toContainText('PUT və PATCH')
  await page.locator('.ai-chat-item button').first().click()
  await expect(page.locator('.ai-msg-user')).toHaveCount(2)
  await page.locator('.ai-new-chat').click()
  await expect(page.locator('.ai-welcome')).toBeVisible()
})

test('Callbox AI: 429 → xəta mesajı və geri sayımlı "Yenidən cəhd et"; nümunə sualı düyməsi', async ({ page }) => {
  await mockChat(page, [
    { status: 429, headers: { 'Retry-After': '2' }, body: { timestamp: '2026-10-30T09:00:00Z', status: 429, code: 'AI_RATE_LIMITED', message: 'limit', details: [], traceId: 'req_1' } },
    reply('İndi işləyir'),
  ])
  await signIn(page, 'student', 'student123')
  await go(page, 'ai')
  await page.locator('.ai-examples button').first().click()
  await expect(page.locator('.ai-error')).toContainText(/Limit dolub|Rate limit/)
  const retry = page.locator('.ai-error button')
  await expect(retry).toBeDisabled()
  await expect(retry).toBeEnabled({ timeout: 5000 })
  await retry.click()
  await expect(page.locator('.ai-msg-model')).toContainText('İndi işləyir')
})

test('Callbox AI: a11y (axe), mobil 375px, dark mode, söhbət paneli menyu düyməsi ilə açılır', async ({ page }) => {
  await mockChat(page, [reply('Cavab')])
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 375, height: 812 })
  await signIn(page, 'student', 'student123')
  await page.goto('/ai')
  await page.locator('#ai-input').fill('Salam')
  await page.keyboard.press('Enter')
  await expect(page.locator('.ai-msg-model')).toContainText('Cavab')
  const { default: AxeBuilder } = await import('@axe-core/playwright')
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false)
  await page.locator('.ai-sidebar-toggle').click()
  await expect(page.locator('.ai-chat-item')).toBeVisible()
})
