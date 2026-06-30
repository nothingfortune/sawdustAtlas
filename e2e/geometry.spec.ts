import { test, expect } from '@playwright/test'

// BOARD-026: the standalone geometry calculator — place points, read measurements, and the
// scratchpad survives reload.
test.describe('geometry calculator', () => {
  test.beforeEach(async ({ page }) => {
    // No clear() here: it re-runs on reload and would wipe the persisted sketch. Each test
    // gets a fresh empty context anyway.
    await page.addInitScript(() => { window.localStorage.setItem('sawdust-atlas:onboarded', '1') })
    await page.goto('/')
    await page.getByRole('button', { name: 'Geometry' }).click()
  })

  test('places points, reads a distance, and connects a member', async ({ page }) => {
    const canvas = page.locator('.geo-canvas')
    await expect(canvas).toBeVisible()
    const box = (await canvas.boundingBox())!
    await page.mouse.click(box.x + 160, box.y + 360)
    await page.mouse.click(box.x + 460, box.y + 200)
    await expect(page.locator('.geo-point')).toHaveCount(2)
    // two selected points -> a distance readout, visualized on the canvas as a dimension line
    await expect(page.locator('.geo-readout')).toContainText(/distance/i)
    await expect(page.locator('.geo-readout')).toContainText(/mm/)
    await expect(page.locator('.geo-dim')).toBeVisible()
    // connect them into a member; the selected member shows cut-angle readouts
    await page.getByRole('button', { name: 'Connect' }).click()
    await expect(page.locator('.geo-member')).toHaveCount(1)
    await expect(page.locator('.geo-readout')).toContainText(/bearing/i)
    await expect(page.locator('.geo-readout')).toContainText(/from vertical/i)
  })

  test('a point can be dragged to a new position', async ({ page }) => {
    const box = (await page.locator('.geo-canvas').boundingBox())!
    await page.mouse.click(box.x + 200, box.y + 300)
    const point = page.locator('.geo-point').first()
    const before = await point.getAttribute('cx')
    await page.mouse.move(box.x + 200, box.y + 300)
    await page.mouse.down()
    await page.mouse.move(box.x + 380, box.y + 300, { steps: 8 })
    // the point shows a drag state while it's being moved, and drops it on release
    await expect(page.locator('.geo-point.dragging')).toHaveCount(1)
    await page.mouse.up()
    await expect(page.locator('.geo-point.dragging')).toHaveCount(0)
    await expect(point).not.toHaveAttribute('cx', before ?? '')
  })

  test('builds a rectangle from two corners and reads a bisection angle', async ({ page }) => {
    const box = (await page.locator('.geo-canvas').boundingBox())!
    await page.mouse.click(box.x + 200, box.y + 500) // corner 1
    await page.mouse.click(box.x + 440, box.y + 300) // opposite corner (distinct x and y)
    await expect(page.locator('.geo-point')).toHaveCount(2)
    await page.getByRole('button', { name: 'Rectangle' }).click()
    // 2 placed + 2 generated corners; 4 sides + 2 diagonals
    await expect(page.locator('.geo-point')).toHaveCount(4)
    await expect(page.locator('.geo-member')).toHaveCount(6)
    // a diagonal + side are pre-selected -> the bisection (inside) angle shows
    await expect(page.locator('.geo-readout')).toContainText(/inside angle/i)
  })

  test('the compound-angle mode computes miter + bevel from two tilts', async ({ page }) => {
    await page.getByRole('tab', { name: 'Compound angle' }).click()
    await page.getByLabel('Tilt A degrees').fill('6')
    await page.getByLabel('Tilt B degrees').fill('4')
    const results = page.locator('.compound-results')
    await expect(results).toContainText('Miter')
    await expect(results).toContainText('6°')
    await expect(results).toContainText('Bevel')
    await expect(results).toContainText('4.02°')
    // back to sketch keeps the canvas
    await page.getByRole('tab', { name: 'Sketch' }).click()
    await expect(page.locator('.geo-canvas')).toBeVisible()
  })

  test('persists the sketch across reload', async ({ page }) => {
    const box = (await page.locator('.geo-canvas').boundingBox())!
    await page.mouse.click(box.x + 200, box.y + 200)
    await expect(page.locator('.geo-point')).toHaveCount(1)
    await page.reload()
    await page.getByRole('button', { name: 'Geometry' }).click()
    await expect(page.locator('.geo-point')).toHaveCount(1)
  })
})
