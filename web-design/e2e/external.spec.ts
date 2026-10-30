// W4 — External APIs səhifəsi. Real RapidAPI-yə getmirik: kataloq və proxy cavabları brauzer səviyyəsində mock edilir
// (backend proxy-nin özü tests/external.test.ts-də upstream mock ilə yoxlanır). Boş kataloq real serverlə yoxlanır.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'
import { go, signIn } from './helpers'

const KEY = 'my-own-rapidapi-key-0123456789abcdef'

const CATALOG = {
  serverKeyEnabled: false,
  items: [
    {
      id: 'jokes', name: 'JokeAPI', host: 'jokeapi-v2.p.rapidapi.com', rapidApiUrl: 'https://rapidapi.com/Sv443/api/jokeapi-v2',
      description: { az: 'Proqramçı zarafatları', en: 'Programming jokes' }, freeLimit: { az: 'Pulsuz', en: 'Free' },
      hardLimit: false, verified: true, serverKeyAvailable: false,
      endpoints: [{ operationId: 'externalJoke', method: 'GET', path: '/external/jokes/joke/{category}', produces: 'json', summary: { az: 'Təsadüfi zarafat', en: 'Random joke' }, example: { path: '/external/jokes/joke/Programming', query: { type: 'single' } } }],
    },
    {
      id: 'geodb', name: 'GeoDB Cities', host: 'wft-geo-db.p.rapidapi.com', rapidApiUrl: 'https://rapidapi.com/wirefreethought/api/geodb-cities',
      description: { az: 'Şəhərlər', en: 'Cities' }, freeLimit: { az: '1 000 sorğu/gün (Hard Limit)', en: '1,000/day (Hard Limit)' },
      hardLimit: true, verified: true, serverKeyAvailable: false,
      endpoints: [{ operationId: 'externalGeoCountry', method: 'GET', path: '/external/geodb/v1/geo/countries/AZ', produces: 'json', summary: { az: 'Ölkə', en: 'Country' }, example: { path: '/external/geodb/v1/geo/countries/AZ' } }],
    },
    {
      id: 'translate', name: 'Deep Translate', host: 'deep-translate1.p.rapidapi.com', rapidApiUrl: 'https://rapidapi.com/gatzuma/api/deep-translate1',
      description: { az: 'Tərcümə', en: 'Translation' }, freeLimit: { az: 'Kvota', en: 'Quota' },
      hardLimit: false, verified: true, serverKeyAvailable: false,
      endpoints: [{ operationId: 'externalTranslate', method: 'POST', path: '/external/translate/language/translate/v2', produces: 'json', summary: { az: 'Tərcümə et', en: 'Translate' }, example: { path: '/external/translate/language/translate/v2', body: { q: 'Salam', source: 'az', target: 'en' } } }],
    },
  ],
}

const errorBody = (status: number, code: string) => JSON.stringify({ timestamp: new Date().toISOString(), status, code, message: code, details: [], traceId: 'req_e2e' })

// Proxy mock: açar yoxdursa 503; GeoDB → abunə yoxdur; jokes → 200; translate → limit
async function mockExternal(page: Page, seenKeys: (string | undefined)[] = []) {
  await page.route('**/external/catalog', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CATALOG) }))
  await page.route(/\/external\/(jokes|geodb|translate)\//, (route: Route) => {
    const key = route.request().headers()['x-rapidapi-key']
    seenKeys.push(key)
    const url = route.request().url()
    if (!key) return route.fulfill({ status: 503, contentType: 'application/json', body: errorBody(503, 'EXTERNAL_KEY_MISSING') })
    if (url.includes('/geodb/')) return route.fulfill({ status: 502, contentType: 'application/json', body: errorBody(502, 'EXTERNAL_NOT_SUBSCRIBED') })
    if (url.includes('/translate/')) return route.fulfill({ status: 502, contentType: 'application/json', headers: { 'Retry-After': '45' }, body: errorBody(502, 'EXTERNAL_RATE_LIMITED') })
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'X-Cache': 'MISS' }, body: JSON.stringify({ error: false, category: 'Programming', joke: 'E2E zarafatı' }) })
  })
}

const card = (page: Page, id: string) => page.locator(`.ext-card[data-api="${id}"]`)

test('boş kataloq (real server — hamısı verified:false): student mesaj görür, admin external:verify göstərişi', async ({ page }) => {
  await signIn(page, 'student', 'student123')
  await go(page, 'external')
  await expect(page).toHaveURL(/\/external-apis$/)
  await expect(page.locator('.ext-empty')).toContainText(/təsdiqlənmiş external API yoxdur|No verified/)
  await expect(page.locator('.ext-empty')).not.toContainText('external:verify')
  await page.locator('.user-chip').click()
  await page.locator('.signout-button').click()
  await signIn(page, 'admin', 'admin123')
  await go(page, 'external')
  // ADMIN yoxlanmamış API-ləri "Yoxlanmayıb" nişanı ilə görür, "Sına" bağlıdır; göstəriş banneri
  await expect(page.locator('.ext-admin-note')).toContainText('npm run external:verify')
  await expect(page.locator('.ext-card')).toHaveCount(7)
  await expect(page.locator('.ext-badge.unverified')).toHaveCount(7)
  await expect(page.locator('.ext-card').first().getByRole('button', { name: /Sına|Try/ })).toBeDisabled()
})

test('kataloq kartları, açar yoxdur → 503 halı, öz açarım → 200, abunə yoxdur və limit halları', async ({ page }) => {
  const seenKeys: (string | undefined)[] = []
  await mockExternal(page, seenKeys)
  await signIn(page, 'student', 'student123')
  await go(page, 'external')
  await expect(page.locator('.ext-card')).toHaveCount(3)
  await expect(card(page, 'geodb').locator('.ext-badge.hard')).toBeVisible()
  await expect(card(page, 'jokes')).toContainText('jokeapi-v2.p.rapidapi.com')

  // 1) Açar yoxdur
  await card(page, 'jokes').getByRole('button', { name: /Sına|Try/ }).click()
  await expect(card(page, 'jokes').locator('.ext-error')).toHaveAttribute('data-code', 'EXTERNAL_KEY_MISSING')
  expect(seenKeys[0]).toBeUndefined()

  // 2) Öz açarım (yalnız yaddaş)
  await page.locator('#ext-key-input').fill(KEY)
  await expect(page.locator('#ext-key-input')).toHaveAttribute('type', 'password')
  await page.getByRole('button', { name: /İstifadə et|Use/ }).click()
  await expect(page.locator('.ext-key-status')).toContainText(KEY.slice(-4))
  await expect(page.locator('.ext-key-status')).not.toContainText(KEY.slice(0, 10))
  await card(page, 'jokes').getByRole('button', { name: /Sına|Try/ }).click()
  await expect(card(page, 'jokes').locator('.ext-result')).toContainText('E2E zarafatı')
  await expect(card(page, 'jokes').locator('.ext-result')).toContainText('200')
  expect(seenKeys.at(-1)).toBe(KEY)

  // 3) Abunə yoxdur → RapidAPI linki
  await card(page, 'geodb').getByRole('button', { name: /Sına|Try/ }).click()
  const subscribe = card(page, 'geodb').locator('.ext-error')
  await expect(subscribe).toHaveAttribute('data-code', 'EXTERNAL_NOT_SUBSCRIBED')
  await expect(subscribe.locator('a')).toHaveAttribute('href', 'https://rapidapi.com/wirefreethought/api/geodb-cities/pricing')

  // 4) Limit bitib → geri sayım, düymə bağlı
  await card(page, 'translate').getByRole('button', { name: /Sına|Try/ }).click()
  await expect(card(page, 'translate').locator('.ext-error')).toHaveAttribute('data-code', 'EXTERNAL_RATE_LIMITED')
  await expect(card(page, 'translate').locator('.ext-error')).toContainText(/4\d (san|s)/)
  await expect(card(page, 'translate').getByRole('button', { name: /Sına|Try/ })).toBeDisabled()

  // a11y (kartlar + xəta halları)
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])

  // Açar heç bir saxlama yerində yoxdur; reload-dan sonra yoxa çıxır
  const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie }))
  expect(stored).not.toContain(KEY)
  await page.reload()
  await expect(page.locator('.ext-key-status')).toContainText(/Açar daxil edilməyib|No key entered/)
})

test('"Explorer-də aç": metod, URL, X-RapidAPI-Key (yaddaşdan) və POST body ötürülür', async ({ page }) => {
  await mockExternal(page)
  await signIn(page, 'student', 'student123')
  await go(page, 'external')
  await page.locator('#ext-key-input').fill(KEY)
  await page.getByRole('button', { name: /İstifadə et|Use/ }).click()
  await card(page, 'translate').getByRole('button', { name: /Callbox GUI/ }).click()
  await expect(page).toHaveURL(/\/callbox$/)
  await expect(page.locator('.request-url-input input')).toHaveValue(/\/external\/translate\/language\/translate\/v2$/)
  await expect(page.locator('textarea').filter({ hasText: '"target": "en"' }).first()).toBeVisible()

  await go(page, 'external')
  await card(page, 'jokes').getByRole('button', { name: /Callbox GUI/ }).click()
  await expect(page.locator('.request-url-input input')).toHaveValue(/\/external\/jokes\/joke\/Programming$/)
  const headerValues = await page.locator('.key-value-editor .kv-row input').evaluateAll((inputs) => inputs.map((i) => (i as HTMLInputElement).value))
  expect(headerValues).toContain('X-RapidAPI-Key')
  expect(headerValues).toContain(KEY)
  // query string Params cədvəlinə köçür (Postman kimi)
  await page.locator('.builder-tabs [role="tab"]').first().click()
  await expect(page.locator('.kv-row').first().locator('input').nth(1)).toHaveValue('single')
})
