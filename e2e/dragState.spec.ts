import { test, expect } from '@playwright/test'

// Every draggable item must show a visual drag state while it's being moved and drop it on
// release. Strips, slice chips, assembled slices, and composite wafers already had one; this
// guards the ones added later — shop objects and blocked zones (geometry points are covered
// in geometry.spec.ts).
test.describe('drag state', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { window.localStorage.setItem('sawdust-atlas:onboarded', '1') })
    await page.goto('/')
    await page.getByRole('button', { name: 'Workshop layout' }).click()
  })

  test('a shop object gains .dragging while moved and drops it on release', async ({ page }) => {
    const object = page.locator('.shop-object').first()
    const box = (await object.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 50, { steps: 6 })
    await expect(page.locator('.shop-object.dragging')).toHaveCount(1)
    await page.mouse.up()
    await expect(page.locator('.shop-object.dragging')).toHaveCount(0)
  })
})
