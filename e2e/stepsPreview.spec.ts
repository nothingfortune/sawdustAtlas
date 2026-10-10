import { test, expect } from '@playwright/test'

// The read-only "Build steps (preview)" section in the board designer renders the
// generated instruction plan: a rip step and an Irreversible marker (icon + text).
test('build steps preview shows a rip step and an Irreversible marker', async ({ page }) => {
  await page.addInitScript(() => { window.localStorage.clear(); window.localStorage.setItem('sawdust-atlas:onboarded', '1') })
  await page.goto('/')
  await page.getByRole('button', { name: 'Cutting boards' }).click()
  await page.getByRole('button', { name: /Walnut & maple daily board/ }).click()

  const toggle = page.getByRole('button', { name: /Build steps \(preview\)/ })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('.steps-step')).toHaveCount(0)

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('.steps-step[data-step-kind="cut"]').first()).toBeVisible()
  await expect(page.locator('.steps-step').filter({ hasText: /rip/i }).first()).toBeVisible()
  await expect(page.locator('.steps-irreversible').first()).toContainText('Irreversible')
  await expect(page.locator('.steps-irreversible svg').first()).toBeVisible()
})
