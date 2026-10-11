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

async function openSteps(page: import('@playwright/test').Page) {
  await page.addInitScript(() => { window.localStorage.clear(); window.localStorage.setItem('sawdust-atlas:onboarded', '1') })
  await page.goto('/')
  await page.getByRole('button', { name: 'Cutting boards' }).click()
  await page.getByRole('button', { name: /Walnut & maple daily board/ }).click()
  const toggle = page.getByRole('button', { name: /Build steps \(preview\)/ })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('.steps-step').first()).toBeVisible()
}

test('print media hides the steps preview but keeps the build sheet', async ({ page }) => {
  await openSteps(page)
  await expect(page.locator('.steps-preview')).toBeVisible()
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.steps-preview')).toBeHidden()
  await expect(page.locator('.steps-step').first()).toBeHidden()
  await expect(page.locator('.print-sheet-header')).toBeVisible()
  await expect(page.locator('.print-sheet-header')).toContainText('CUTTING BOARD BUILD SHEET')
  await expect(page.locator('.build-summary')).toBeVisible()
})

test('steps preview measurements switch to inches under imperial units', async ({ page }) => {
  await openSteps(page)
  const measurements = page.locator('.steps-measurements').first()
  await expect(measurements).toContainText('mm')
  await expect(measurements).not.toContainText(/\d\s*in\b/)

  await page.getByRole('button', { name: /Preston/ }).click()
  await expect(measurements).toContainText(/\d\s*in\b/)
  await expect(measurements).not.toContainText('mm')
  // A quarter-millimeter tolerance must not round away to "± 0 in".
  await expect(measurements).toContainText('± 0.010 in')
  await expect(measurements).not.toContainText(/± 0 in/)
  const setup = page.locator('.steps-setup').first()
  await expect(setup).not.toContainText('mm')
})

test('an end-grain board shows a crosscut batch step and a slice-marking step', async ({ page }) => {
  await openSteps(page)
  await page.getByRole('button', { name: 'End grain', exact: true }).click()

  const crosscut = page.locator('.steps-step[data-step-kind="cut"]').filter({ hasText: 'Crosscut the slices' })
  await expect(crosscut).toBeVisible()
  await expect(crosscut.locator('.steps-batch')).toHaveText(/^× \d+ slices?$/)
  await expect(crosscut.locator('.steps-irreversible')).toContainText('Irreversible')

  const marking = page.locator('.steps-step[data-step-kind="mark"]').filter({ hasText: 'Letter the slices' })
  await expect(marking).toBeVisible()
  await expect(marking).toContainText(/slice letter/i)
})

test('a fence setting and its re-check read as one line, and repeated parts are counted', async ({ page }) => {
  await openSteps(page)
  const rip = page.locator('.steps-step[data-step-kind="cut"]').first()
  await expect(rip.locator('.steps-setup li').filter({ hasText: 'Fence to blade' })).toContainText('verify before')
  await expect(rip.locator('.steps-measurements li').filter({ hasText: 'Fence to blade' })).toHaveCount(0)
  const select = page.locator('.steps-step[data-step-kind="select-stock"]').first()
  await expect(select.locator('.steps-outputs')).toContainText('Walnut ×2')
})
