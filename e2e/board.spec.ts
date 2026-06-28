import { test, expect } from '@playwright/test'

// Smoke coverage for the cutting board designer, focused on the interaction bugs
// that unit tests miss: pointer tap-vs-drag on the SVG board, and the strip list
// rendering. Starts from a clean localStorage so the seed board is deterministic.
test.describe('cutting board designer', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { window.localStorage.clear(); window.localStorage.setItem('sawdust-atlas:onboarded', '1') })
    await page.goto('/')
    await page.getByRole('button', { name: 'Cutting boards' }).click()
    // 'Cutting boards' opens the gallery; open the seed board, then switch to
    // end-grain for wafers + slice tools. (Beforehand this clicked 'End grain'
    // straight away and silently rotted when the gallery was introduced.)
    await page.getByRole('button', { name: /Walnut & maple daily board/ }).click()
    await page.getByRole('button', { name: 'End grain', exact: true }).click()
  })

  test('Reverse keeps every strip (they do not vanish)', async ({ page }) => {
    const strips = page.locator('[data-strip-row]')
    const before = await strips.count()
    expect(before).toBeGreaterThan(1)

    await page.getByRole('button', { name: 'Reverse' }).click()
    await expect(strips).toHaveCount(before)

    // And again after a duplicating arrangement, which regenerates strip ids.
    await page.getByRole('button', { name: 'Repeat' }).click()
    const afterRepeat = await strips.count()
    expect(afterRepeat).toBe(before * 2)
    await page.getByRole('button', { name: 'Reverse' }).click()
    await expect(strips).toHaveCount(afterRepeat)
  })

  test('a slightly-jittery tap still rotates only that one wafer', async ({ page }) => {
    await page.getByRole('button', { name: 'Pop out preview at full size' }).click()
    const popout = page.locator('.preview-popout')
    await expect(popout).toBeVisible()

    const slot0 = popout.locator('g[data-slot="0"]')
    const label0 = slot0.locator('text.slice-label')
    const label1 = popout.locator('g[data-slot="1"] text.slice-label')
    await expect(label0).toHaveText('N')
    await expect(label1).toHaveText('N')

    // Simulate a real touch-tap that jitters a few px: press, nudge under the
    // drag threshold, release. This must rotate the wafer (cycle its label),
    // not be read as a drag that lifts the whole column and does nothing — the
    // regression that broke wafer rotation.
    const box = await slot0.boundingBox()
    if (!box) throw new Error('slice 0 not visible')
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 6, cy)
    await page.mouse.up()

    await expect(label0).not.toHaveText('N')
    // Its neighbour is untouched — rotation is per wafer, independent of others.
    await expect(label1).toHaveText('N')
  })

  test('pop-out close button is reachable above the chrome', async ({ page }) => {
    await page.getByRole('button', { name: 'Pop out preview at full size' }).click()
    const close = page.getByRole('button', { name: 'Close preview' })
    await expect(close).toBeVisible()
    await close.click()
    await expect(page.locator('.preview-popout')).toHaveCount(0)
  })
})
