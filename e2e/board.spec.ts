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

  test('a slightly-jittery tap still rotates only that one wafer', async ({ page }, testInfo) => {
    await page.getByRole('button', { name: 'Pop out preview at full size' }).click()
    const popout = page.locator('.preview-popout')
    await expect(popout).toBeVisible()

    const slot0 = popout.locator('g[data-slot="0"]')
    const label0 = slot0.locator('text.slice-label')
    const label1 = popout.locator('g[data-slot="1"] text.slice-label')
    await expect(label0).toHaveText('N')
    await expect(label1).toHaveText('N')

    const box = await slot0.boundingBox()
    if (!box) throw new Error('slice 0 not visible')
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    if (testInfo.project.name === 'tablet') {
      // A real single-finger touchscreen tap — exercises the genuine touch
      // pointer-event path (pointerType 'touch'), which is what this project exists
      // to cover. The jittery-mouse-drag regression this test guards is a distinct,
      // mouse-only code path and stays below on the desktop project.
      await page.touchscreen.tap(cx, cy)
    } else {
      // Simulate a real touch-tap that jitters a few px: press, nudge under the
      // drag threshold, release. This must rotate the wafer (cycle its label),
      // not be read as a drag that lifts the whole column and does nothing — the
      // regression that broke wafer rotation.
      await page.mouse.move(cx, cy)
      await page.mouse.down()
      await page.mouse.move(cx + 6, cy)
      await page.mouse.up()
    }

    await expect(label0).not.toHaveText('N')
    // Its neighbour is untouched — rotation is per wafer, independent of others.
    await expect(label1).toHaveText('N')
  })

  test('the 90° turn preview rotates wafers too, not only the finished board', async ({ page }, testInfo) => {
    await page.getByRole('button', { name: 'Pop out preview at full size' }).click()
    const popout = page.locator('.preview-popout')
    await expect(popout).toBeVisible()
    await popout.getByRole('tab', { name: '90° turn' }).click()

    const slot0 = popout.locator('g[data-slot="0"]')
    const label0 = slot0.locator('text.slice-label')
    await expect(label0).toHaveText('N')

    if (testInfo.project.name === 'tablet') {
      await slot0.tap()
    } else {
      const box = await slot0.boundingBox()
      if (!box) throw new Error('slice 0 not visible on the 90° turn tab')
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.up()
    }

    await expect(label0).not.toHaveText('N')
  })

  test('shows a rip & stock list with rip widths and per-species board feet', async ({ page }) => {
    const card = page.locator('.stock-card')
    await expect(card).toBeVisible()
    await expect(card).toContainText(/Rip & stock list/i)
    await expect(card.locator('.stock-rip-row').first()).toBeVisible()
    await expect(card).toContainText(/bf/)
  })

  test('shows a bench setup card with rip fence and crosscut numbers', async ({ page }) => {
    const card = page.locator('.bench-card')
    await expect(card).toBeVisible()
    await expect(card).toContainText('Bench setup')
    await expect(card).toContainText(/RIP FENCE/i)
    await expect(card).toContainText(/CROSSCUT/i)
  })

  test('pop-out close button is reachable above the chrome', async ({ page }) => {
    await page.getByRole('button', { name: 'Pop out preview at full size' }).click()
    const close = page.getByRole('button', { name: 'Close preview' })
    await expect(close).toBeVisible()
    await close.click()
    await expect(page.locator('.preview-popout')).toHaveCount(0)
  })

  test('no angle & setup card when no strip is angled', async ({ page }) => {
    await expect(page.locator('.angle-card')).toHaveCount(0)
  })
})

test.describe('angle & setup card', () => {
  test('shows saw setup numbers for an angled end-grain board', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('sawdust-atlas:onboarded', '1')
      window.localStorage.setItem('sawdust-atlas:v1', JSON.stringify({
        schemaVersion: 2, shops: [],
        boards: [{ id: 'a', name: 'Chevron', construction: 'end', thickness: 38,
          strips: [{ id: '1', speciesId: 'walnut', width: 40, trailingAngle: 30 }, { id: '2', speciesId: 'maple', width: 40, trailingAngle: -30 }],
          endGrain: { sourceLength: 900, stockThickness: 38, sliceThickness: 45, kerf: 3.2, trimAllowance: 20, rowFlips: [], rowRotations: [] } }],
      }))
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Cutting boards' }).click()
    await page.getByRole('button', { name: /Chevron/ }).click()
    const card = page.locator('.angle-card')
    await expect(card).toBeVisible()
    await expect(card).toContainText('Angle & setup')
    await expect(card).toContainText('30°')

    // the bench setup card (BOARD-025) also surfaces the saw angle high up
    await expect(page.locator('.bench-card')).toContainText(/SAW ANGLE/i)
    await expect(page.locator('.bench-card')).toContainText('30°')

    // angled strip rows show both face widths so the asymmetry is visible
    const hint = page.locator('.strip-face-hint').first()
    await expect(hint).toBeVisible()
    await expect(hint).toContainText(/Faces .+→/)
  })
})
