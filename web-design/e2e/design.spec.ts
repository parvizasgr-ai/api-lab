// Design (/design): prompt → "Generasiya edilir…" → nəticə sandbox iframe-də; redaktə; limit xətası; a11y.
// Stitch kreditləri xərclənməsin deyə /api/v1/design/* brauzerdə mock olunur (server tərəfi tests/design.test.ts-də).
import { expect, test, type Page, type Route } from '@playwright/test'
import { go, signIn } from './helpers'

const usage = (used = 0) => ({ configured: true, day: '2026-10-30', resetsAt: '2026-10-31T00:00:00Z', resetsAtBaku: '31.10.2026 04:00', user: { used, limit: 8, remaining: 8 - used }, pool: { usedCredits: 12, hardLimit: 350, dailyCredits: 400, requests: 4, percent: 3, warning: false, exhausted: false }, creditEstimates: {} })
const job = (id: string, status: string, kind = 'GENERATE', prompt = 'Login ekranı') => ({ id, sessionId: 'ds_0000000000000001', kind, prompt, deviceType: 'MOBILE', status, credits: 3, complexity: 'SIMPLE', screenId: status === 'SUCCEEDED' ? `scr_${id}` : null, message: status === 'SUCCEEDED' ? 'Hazırdır' : null, error: null, createdAt: new Date().toISOString(), startedAt: new Date().toISOString(), finishedAt: null, hasHtml: status === 'SUCCEEDED' })

async function mockDesign(page: Page, options: { limit?: boolean } = {}) {
  const jobs: ReturnType<typeof job>[] = []
  let polls = 0
  const json = (route: Route, status: number, body: unknown, headers: Record<string, string> = {}) => route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) })
  const session = () => ({ id: 'ds_0000000000000001', title: 'Login ekranı', deviceType: 'MOBILE', stitchProjectId: '1', currentScreenId: jobs.some((j) => j.status === 'SUCCEEDED') ? 'scr' : null, createdAt: '2026-10-30T09:00:00Z', updatedAt: '2026-10-30T09:00:00Z', messages: jobs })
  await page.route('**/api/v1/design/**', async (route) => {
    const url = new URL(route.request().url()), method = route.request().method(), path = url.pathname
    if (path.endsWith('/usage')) return json(route, 200, usage(jobs.length))
    if (path.endsWith('/sessions') && method === 'GET') return json(route, 200, { items: jobs.length ? [session()] : [] })
    if (path.endsWith('/sessions') && method === 'POST') return json(route, 201, session())
    if (path.endsWith('/messages')) {
      if (options.limit) return json(route, 429, { timestamp: '2026-10-30T09:00:00Z', status: 429, code: 'DESIGN_DAILY_LIMIT', message: 'Bu gün üçün 8 generasiya limitiniz bitib. Limit 31.10.2026 04:00-də (Bakı vaxtı) yenilənəcək', details: [], traceId: 'req_1' }, { 'Retry-After': '100' })
      const prompt = route.request().postDataJSON().prompt
      const j = job(`dj_${jobs.length + 1}`, 'QUEUED', jobs.length ? 'EDIT' : 'GENERATE', prompt)
      jobs.push(j)
      polls = 0
      return json(route, 202, j)
    }
    if (/\/jobs\/[^/]+\/html$/.test(path)) return json(route, 200, { jobId: path.split('/')[5], screenId: 's', html: '', previewUrl: `/api/v1/design/preview/${path.split('/')[5]}?exp=1&sig=x` })
    if (path.includes('/preview/')) return route.fulfill({ status: 200, contentType: 'text/html', body: `<!DOCTYPE html><html><body><h1 id="t">Dizayn ${path.split('/').pop()}</h1><a href="https://stitch.withgoogle.com">x</a></body></html>` })
    if (/\/jobs\/[^/]+$/.test(path)) {
      const j = jobs.find((x) => x.id === path.split('/').pop())!
      if (++polls >= 2) Object.assign(j, { status: 'SUCCEEDED', hasHtml: true, screenId: `scr_${j.id}`, message: 'Hazırdır' })
      else j.status = 'RUNNING'
      return json(route, 200, j)
    }
    if (/\/sessions\/[^/]+$/.test(path)) return json(route, 200, session())
    return route.fallback()
  })
}

test('Design: prompt → loading → nəticə sandbox iframe-də (Stitch-ə keçid yoxdur) → redaktə 2-ci versiya', async ({ page }) => {
  await mockDesign(page)
  await signIn(page, 'student', 'student123')
  await go(page, 'design')
  await page.locator('#design-input').fill('Bank tətbiqi üçün mobil login ekranı')
  await page.locator('.design-send').click()
  await expect(page.locator('.design-msg.pending')).toContainText(/Generasiya edilir|Növbədədir/)
  const frame = page.locator('iframe.design-frame')
  await expect(frame).toBeVisible({ timeout: 20_000 })
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts')
  await expect(page.frameLocator('iframe.design-frame').locator('#t')).toHaveText('Dizayn dj_1')
  await page.frameLocator('iframe.design-frame').locator('a').click()
  await expect(page).toHaveURL(/\/design$/) // keçid yoxdur

  await page.locator('#design-input').fill('Düyməni yaşıl et')
  await page.locator('.design-send').click()
  await expect(page.locator('.design-msg.version')).toHaveCount(2, { timeout: 20_000 })
  await expect(page.frameLocator('iframe.design-frame').locator('#t')).toHaveText('Dizayn dj_2')
  await page.locator('.design-msg.version').first().click()
  await expect(page.frameLocator('iframe.design-frame').locator('#t')).toHaveText('Dizayn dj_1')
})

test('Design: günlük limit → aydın mesaj (Bakı vaxtı)', async ({ page }) => {
  await mockDesign(page, { limit: true })
  await signIn(page, 'student', 'student123')
  await go(page, 'design')
  await page.locator('#design-input').fill('Login ekranı')
  await page.locator('.design-send').click()
  await expect(page.locator('.design-error')).toContainText('04:00')
})

test('Design: a11y (axe), mobil 375px, dark mode', async ({ page }) => {
  await mockDesign(page)
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 375, height: 812 })
  await signIn(page, 'student', 'student123')
  await page.goto('/design')
  await expect(page.locator('.design-usage')).toBeVisible()
  const { default: AxeBuilder } = await import('@axe-core/playwright')
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false)
})
