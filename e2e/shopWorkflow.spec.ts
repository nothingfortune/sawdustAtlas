import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

// Critical path for the workshop floor planner: room size, catalog, dragging with a
// single undo step, the blocked-zone warning, and persistence of a deletion. Each test
// starts from a seeded workshop (6000 x 4000 mm) so positions and counts are exact.

const ROOM = { width: 6000, depth: 4000 }
const BENCH = { x: 500, y: 500 }   // a 600 x 600 mm bench
const ZONE = { x: 3500, y: 2000 }  // a 1000 x 1000 mm no-go zone

function seededWorkspace(withItem: boolean, withZone: boolean) {
  return {
    schemaVersion: 2,
    shops: [{
      id: 'shop', name: 'Test shop', ...ROOM, gridSize: 300, updatedAt: '',
      blockedZones: withZone ? [{ id: 'zone', name: 'Stair well', ...ZONE, width: 1000, depth: 1000 }] : [],
      items: withItem ? [{
        id: 'bench', name: 'Test bench', kind: 'bench', ...BENCH, width: 600, depth: 600, height: 900, rotation: 0,
        clearance: 0, feedDirection: null, infeedClearance: 0, outfeedClearance: 0, sideClearance: 0, color: '#66826d',
      }] : [],
    }],
    boards: [],
    composites: [],
  }
}

async function openShop(page: Page, workspace: unknown) {
  await page.addInitScript(seed => {
    // Seed only on the first load so a reload inside a test keeps what the app saved.
    if (window.sessionStorage.getItem('e2e-seeded')) return
    window.sessionStorage.setItem('e2e-seeded', '1')
    window.localStorage.clear()
    window.localStorage.setItem('sawdust-atlas:onboarded', '1')
    window.localStorage.setItem('sawdust-atlas:v1', JSON.stringify(seed))
  }, workspace)
  await page.goto('/')
  await page.getByRole('button', { name: 'Workshop layout' }).click()
  await expect(page.getByText('WORKSHOP PLANNER')).toBeVisible()
}

// The side panels are always docked on a landscape tablet and desktop, but become
// slide-over drawers in portrait / narrow windows; open the drawer only if needed.
async function showObjectsPanel(page: Page) {
  const fab = page.getByRole('button', { name: 'Toggle objects panel' })
  if (await fab.isVisible()) await fab.click()
}

async function centerOf(locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('element not visible')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 12 })
  await page.mouse.up()
}

test.describe('workshop planner workflow', () => {
  test('setting the room size resizes the floor', async ({ page }) => {
    await openShop(page, seededWorkspace(false, false))
    const floor = page.locator('.room-canvas')
    const before = (await floor.boundingBox())!
    // 6000 x 4000 mm floor = 3:2 (the canvas has an equal border on every side).
    expect(before.width / before.height).toBeCloseTo(1.5, 1)

    await showObjectsPanel(page)
    await page.getByLabel('Width (mm)').first().fill('8000')
    await page.getByLabel('Depth (mm)').first().fill('4000')

    await expect(page.locator('.dimension.width-dimension')).toHaveText('8000 mm')
    await expect(page.locator('.dimension.depth-dimension')).toHaveText('4000 mm')
    await expect.poll(async () => (await floor.boundingBox())!.width / (await floor.boundingBox())!.height).toBeCloseTo(2, 1)
    expect((await floor.boundingBox())!.width).toBeGreaterThan(before.width)
  })

  test('adds an item from the catalog', async ({ page }) => {
    await openShop(page, seededWorkspace(false, false))
    await showObjectsPanel(page)
    await expect(page.locator('.shop-object')).toHaveCount(0)

    await page.getByRole('button', { name: /^Table Saw/ }).click()

    const saw = page.getByRole('button', { name: 'Table Saw, 1070 × 970 mm' })
    await expect(saw).toBeVisible()
    await expect(page.locator('.shop-object')).toHaveCount(1)
    // It is selected and shown in the inspector.
    await expect(page.getByText('SELECTED OBJECT')).toBeVisible()
    await expect(page.getByLabel('Object name')).toHaveValue('Table Saw')
    // Stored at full size on the dashboard card too.
    await page.getByRole('button', { name: 'Go to home' }).click()
    await expect(page.getByText('1 objects')).toBeVisible()
  })

  test('one drag is one undo step', async ({ page }) => {
    await openShop(page, seededWorkspace(true, false))
    const undo = page.getByRole('button', { name: 'Undo', exact: true })
    const redo = page.getByRole('button', { name: 'Redo', exact: true })
    const bench = page.getByRole('button', { name: /^Test bench/ })
    await expect(undo).toBeDisabled()

    const start = (await bench.boundingBox())!
    const from = await centerOf(bench)
    await dragTo(page, from, { x: from.x + 140, y: from.y + 70 })

    const moved = (await bench.boundingBox())!
    expect(moved.x - start.x).toBeCloseTo(140, 0)
    expect(moved.y - start.y).toBeCloseTo(70, 0)
    await expect(page.locator('.shop-object.dragging')).toHaveCount(0)

    // 12 pointermoves later there is exactly ONE history entry: a single undo puts the
    // bench back exactly and leaves nothing more to undo.
    await expect(undo).toBeEnabled()
    await undo.click()
    await expect(undo).toBeDisabled()
    await expect.poll(() => bench.boundingBox()).toEqual(start)

    // And redo restores the dropped position.
    await redo.click()
    await expect.poll(() => bench.boundingBox()).toEqual(moved)
  })

  test('a blocked-zone overlap shows in the warning center and navigates to the shop', async ({ page }) => {
    await openShop(page, seededWorkspace(true, true))
    await expect(page.locator('.warning-pill')).toHaveCount(0)
    await expect(page.getByText(/overlap out-of-bounds floor zones/)).toHaveCount(0)

    const bench = page.getByRole('button', { name: /^Test bench/ })
    await dragTo(page, await centerOf(bench), await centerOf(page.locator('.blocked-zone')))

    await expect(page.getByText('1 object overlap out-of-bounds floor zones.')).toBeVisible()
    await expect(bench).toHaveClass(/warning/)

    // Leave the shop, then use the warning center to get back to it.
    await page.getByRole('button', { name: 'Cutting boards' }).click()
    await expect(page.getByText('WORKSHOP PLANNER')).toHaveCount(0)
    const pill = page.getByRole('button', { name: '1 workspace issue to review' })
    await expect(pill).toBeVisible()
    await pill.click()
    const row = page.getByRole('menuitem', { name: 'Test shop: 1 object overlap a blocked floor zone.' })
    await expect(row).toBeVisible()
    await row.click()

    await expect(page.getByText('WORKSHOP PLANNER')).toBeVisible()
    await expect(page.getByText('1 object overlap out-of-bounds floor zones.')).toBeVisible()
  })

  test('deleting an item persists after a reload', async ({ page }) => {
    await openShop(page, seededWorkspace(true, false))
    const bench = page.getByRole('button', { name: /^Test bench/ })
    await bench.click()
    await expect(page.getByLabel('Object name')).toHaveValue('Test bench')

    await page.getByRole('button', { name: 'Delete object' }).click()
    await expect(page.locator('.shop-object')).toHaveCount(0)

    await page.reload()
    await page.getByRole('button', { name: 'Workshop layout' }).click()
    await expect(page.getByText('WORKSHOP PLANNER')).toBeVisible()
    await expect(page.locator('.shop-object')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Test bench/ })).toHaveCount(0)
  })
})
