import { expect, test } from '@playwright/test'

// Imperial sizes are longer than metric ones. At laptop widths the designer toolbar used
// to clip its finished size and the top bar wrapped its labels onto two lines.
for (const width of [1366, 1180, 1024]) {
  test(`board designer header fits in imperial at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.addInitScript(() => { window.localStorage.setItem('sawdust-atlas:onboarded', '1') })
    await page.goto('/')
    await page.getByRole('button', { name: 'Cutting boards', exact: true }).click()
    await page.getByRole('button', { name: /Walnut & maple daily board/ }).click()
    await page.getByRole('button', { name: /Preston/ }).click()
    await expect(page.locator('.toolbar-finished-size')).toContainText(/in$/)

    const fit = await page.evaluate(() => {
      const toolbar = document.querySelector('.designer-toolbar')!
      const size = document.querySelector('.toolbar-finished-size')!.getBoundingClientRect()
      const lineHeights = [...document.querySelectorAll('.topbar .breadcrumb, .topbar .save-state, .topbar .backup-button')]
        .map(el => el.getBoundingClientRect().height)
      return { clipped: toolbar.scrollHeight > toolbar.clientHeight + 1, sizeInside: size.bottom <= toolbar.getBoundingClientRect().bottom, tallest: Math.max(...lineHeights) }
    })
    expect(fit.clipped).toBe(false)
    expect(fit.sizeInside).toBe(true)
    // One line of 13 px text plus padding; a wrapped label would be roughly twice this.
    expect(fit.tallest).toBeLessThan(40)
  })
}
