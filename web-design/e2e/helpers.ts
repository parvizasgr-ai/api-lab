// E2E ümumi köməkçilər: giriş, naviqasiya (desktop nav və ya mobil menyu), problem toplayıcı
import { expect, type Page } from '@playwright/test'

export const PAGES = ['home', 'reference', 'explorer', 'apps', 'auth', 'sql', 'materials', 'external', 'infra'] as const

export type Issue = { where: string; kind: string; detail: string }

// Səhifədə baş verən problemləri toplayır (testi dərhal dayandırmadan — sonda hamısı birlikdə göstərilir)
export function watch(page: Page, issues: Issue[], where: () => string) {
  page.on('pageerror', (e) => issues.push({ where: where(), kind: 'pageerror', detail: e.message }))
  page.on('console', (m) => {
    if (m.type() === 'error') issues.push({ where: where(), kind: 'console.error', detail: m.text() })
  })
  page.on('requestfailed', (r) => {
    const reason = r.failure()?.errorText ?? ''
    if (!/ERR_ABORTED|NS_BINDING_ABORTED/.test(reason)) issues.push({ where: where(), kind: 'requestfailed', detail: `${r.method()} ${r.url()} ${reason}` })
  })
  page.on('response', (r) => {
    if (r.status() >= 400) issues.push({ where: where(), kind: `http ${r.status()}`, detail: `${r.request().method()} ${r.url()}` })
  })
}

export async function signIn(page: Page, username: string, password: string) {
  await page.goto('/signin')
  await page.locator('.demo-login-form input[autocomplete="username"]').fill(username)
  await page.locator('.demo-login-form input[type="password"]').fill(password)
  await page.locator('.demo-login-form button[type="submit"]').click()
  await expect(page.locator('.user-chip')).toBeVisible()
}

export const pathOf = (target: string) => (target === 'home' ? '/' : target === 'external' ? '/external-apis' : target === 'explorer' ? '/callbox' : `/${target}`)

export async function go(page: Page, target: string) {
  // Apps və Auth Lab menyuda yoxdur — API Reference-in "Laboratoriyalar" bölməsindən açılır
  if (target === 'apps' || target === 'auth') {
    await go(page, 'reference')
    await page.locator('.ref-nav a').filter({ hasText: target === 'apps' ? /Demo tətbiqlər|Demo apps/ : /Auth Lab/ }).click()
    await expect(page).toHaveURL(new RegExp(`/${target}$`))
    await page.waitForLoadState('networkidle')
    return
  }
  const desktop = page.locator(`.desktop-nav a[href="${pathOf(target)}"]`)
  if (await desktop.isVisible()) {
    await desktop.click()
  } else {
    await page.locator('.menu-button').click()
    await page.locator(`.mobile-nav a[href="${pathOf(target)}"]`).click()
  }
  await expect(page.locator('main')).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`${pathOf(target).replace('/', '\\/')}(\\?.*)?$`)) // QA-M04: real URL
  await page.waitForLoadState('networkidle')
}

