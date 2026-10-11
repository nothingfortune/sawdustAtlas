import { test, expect } from '@playwright/test'

// The limited-bench-mode notice reads window.isSecureContext (plus a few navigator
// feature checks). Localhost is a secure context, so it must stay hidden by default and
// only appear when the context is simulated as insecure before the app loads.
test.describe('connection notice', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('sawdust-atlas:onboarded', '1'))
  })

  test('never appears in a normal secure context', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.dashboard-page')).toBeVisible()
    expect(await page.evaluate(() => window.isSecureContext)).toBe(true)
    await expect(page.getByRole('status', { name: 'Limited bench mode' })).toHaveCount(0)
  })

  test('explains limited bench mode on an insecure address and stays dismissed after reload', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true }))
    await page.goto('/')

    const notice = page.getByRole('status', { name: 'Limited bench mode' })
    await expect(notice).toBeVisible()
    await expect(notice).toContainText('Limited bench mode.')
    await expect(notice).toContainText('need a secure (HTTPS) address, and this one is not')
    await expect(notice).toContainText('You can still design and save projects.')
    const guide = notice.getByRole('link', { name: 'How to set up a secure address on a tablet' })
    await expect(guide).toHaveAttribute('href', /docs\/howTo\/use-on-a-tablet\.md$/)
    await expect(guide).toHaveAttribute('target', '_blank')

    await notice.getByRole('button', { name: 'Dismiss' }).click()
    await expect(notice).toHaveCount(0)

    await page.reload()
    await expect(page.locator('.dashboard-page')).toBeVisible()
    await expect(page.getByRole('status', { name: 'Limited bench mode' })).toHaveCount(0)
  })

  test('shows the missing-feature message on a secure address that lacks a capability', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true }))
    await page.goto('/')
    const notice = page.getByRole('status', { name: 'Limited bench mode' })
    await expect(notice).toContainText('This browser is missing some features the bench relies on.')
    await expect(notice).toContainText('protect your saved projects from automatic cleanup')
  })
})
