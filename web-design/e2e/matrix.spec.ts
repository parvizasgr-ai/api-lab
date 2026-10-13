// W5 — vizual/a11y QA matrisi: bütün səhifələr × rollar × dillər × tema × enlər.
// Hər səhifədə: console error, uğursuz sorğu (≥400, network xətası), 404 resurs, üfüqi overflow, axe (WCAG 2 A/AA — kontrast daxil).
// Ekran görüntüləri: <repo>/artifacts/e2e/<rol>/<en>/<dil>-<tema>-<səhifə>.png
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { go, PAGES, signIn, watch, type Issue } from './helpers'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Məlum, triage olunmuş (Medium/Low — təsdiq gözləyir) axe qaydaları: hesabata yazılır, testi qırmır.
// Siyahıdan çıxarılan qayda yenidən regresiya kimi yoxlanır. Yeni qayda pozuntusu dərhal testi qırır.
const KNOWN_AXE: Record<string, string> = {
  'color-contrast': 'QA-M01',
  'link-name': 'QA-M02',
  'scrollable-region-focusable': 'QA-L01',
}

const ARTIFACTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../artifacts/e2e')

const ROLES = [
  { name: 'student', password: 'student123' },
  { name: 'admin', password: 'admin123' },
] as const
const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
] as const
const LANGS = ['az', 'en'] as const
const THEMES = ['light', 'dark'] as const

async function setLanguage(page: Page, lang: string) {
  await page.locator('.language-switcher button', { hasText: lang.toUpperCase() }).click()
  await expect(page.locator('.language-switcher button', { hasText: lang.toUpperCase() })).toHaveAttribute('aria-pressed', 'true')
}

async function setTheme(page: Page, theme: string) {
  if ((await page.locator('html').getAttribute('data-theme')) !== theme) await page.locator('.theme-button').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
}

async function overflow(page: Page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth
    if (document.documentElement.scrollWidth <= width + 1) return null
    // Kənara çıxan ən dərin elementlər — səbəbi tapmaq üçün
    const culprits = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((el) => el.getBoundingClientRect().right > width + 1 && el.children.length === 0)
      .slice(0, 3)
      .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`)
    return `scrollWidth ${document.documentElement.scrollWidth} > ${width}: ${culprits.join(', ')}`
  })
}

for (const role of ROLES) {
  for (const vp of VIEWPORTS) {
    test(`matris: ${role.name} × ${vp.name} (${vp.width}px) × AZ/EN × light/dark × ${PAGES.length} səhifə`, async ({ page }) => {
      test.setTimeout(10 * 60_000)
      await page.setViewportSize({ width: vp.width, height: vp.height })
      const issues: Issue[] = []
      const known: Issue[] = []
      let where = `${role.name}/${vp.name}/signin`
      watch(page, issues, () => where)
      await signIn(page, role.name, role.password)
      // Regresiya QA-H01: fontlar lokaldır və həqiqətən yüklənir (əvvəl CSP Google Fonts-u bloklayırdı)
      expect(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('600 16px Inter') && document.fonts.check('16px "JetBrains Mono"') })).toBe(true)

      for (const lang of LANGS) {
        for (const theme of THEMES) {
          await setLanguage(page, lang)
          await setTheme(page, theme)
          for (const target of PAGES) {
            where = `${role.name}/${vp.name}/${lang}-${theme}/${target}`
            await go(page, target)
            const o = await overflow(page)
            if (o) issues.push({ where, kind: 'overflow', detail: o })
            const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
            for (const v of axe.violations) {
              if (KNOWN_AXE[v.id]) {
                known.push({ where, kind: `axe:${v.id} (${KNOWN_AXE[v.id]})`, detail: v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ') })
                continue
              }
              issues.push({ where, kind: `axe:${v.id}`, detail: `${v.impact} — ${v.nodes.length} node: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}` })
            }
            await page.screenshot({ path: path.join(ARTIFACTS, role.name, vp.name, `${lang}-${theme}-${target}.png`), fullPage: true })
          }
        }
      }
      // Bütün problemlər bir yerdə — hesabat üçün
      await test.info().attach('issues.json', { body: JSON.stringify(issues, null, 2), contentType: 'application/json' })
      fs.mkdirSync(ARTIFACTS, { recursive: true })
      fs.writeFileSync(path.join(ARTIFACTS, `known-${role.name}-${vp.name}.json`), JSON.stringify(known, null, 2))
      expect(issues, issues.map((i) => `${i.where} [${i.kind}] ${i.detail}`).join('\n')).toEqual([])
    })
  }
}
