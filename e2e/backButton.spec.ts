import { test, expect } from '@playwright/test'

// Browser Back/Forward walks the boards area one screen at a time, and a fresh
// in-app navigation after a Back still pushes a history entry.
test.describe('browser back across the boards area', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { window.localStorage.clear(); window.localStorage.setItem('sawdust-atlas:onboarded', '1') })
    await page.goto('/')
  })

  test('back and forward step through gallery, composite and panel designer', async ({ page }) => {
    const home = page.locator('.dashboard-page')
    const gallery = page.getByRole('button', { name: /Walnut & maple daily board.*9 strips/ })
    const composite = page.locator('.composite-screen')
    const makeComposite = page.getByRole('button', { name: 'Make composite: build a composite board from this design' })
    const panelEditor = page.getByRole('button', { name: 'Back to boards' })

    await expect(home).toBeVisible()
    await page.getByRole('button', { name: 'Cutting boards' }).click()
    await gallery.click()
    await makeComposite.click()
    await expect(composite).toBeVisible()
    await page.getByRole('button', { name: 'Add panel' }).click()
    await page.getByRole('button', { name: 'Design a new board' }).click()
    await expect(panelEditor).toBeVisible()
    await expect(composite).toHaveCount(0)

    await page.goBack()
    await expect(composite).toBeVisible()

    // The composite was made from the seeded board's designer, which is its own history entry.
    await page.goBack()
    await expect(makeComposite).toBeVisible()
    await expect(composite).toHaveCount(0)

    await page.goBack()
    await expect(gallery).toBeVisible()
    await expect(composite).toHaveCount(0)

    await page.goBack()
    await expect(home).toBeVisible()

    await page.goForward()
    await expect(gallery).toBeVisible()
  })

  test('a fresh navigation after Back still pushes history', async ({ page }) => {
    await page.getByRole('button', { name: 'Cutting boards' }).click()
    await expect(page.locator('.dashboard-page')).toHaveCount(0)
    await page.goBack()
    await expect(page.locator('.dashboard-page')).toBeVisible()

    await page.getByRole('button', { name: 'Wood library' }).click()
    await expect(page.locator('.breadcrumb strong')).toHaveText('Wood library')

    await page.goBack()
    await expect(page.locator('.dashboard-page')).toBeVisible()
  })
})
