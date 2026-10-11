import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

// Critical path for the cutting board designer: create a board, edit its strips,
// switch construction, apply a recipe, undo/redo, and enter imperial fractions.
// Every test starts from an empty workspace (no seed board), so each one builds
// exactly the state it asserts on and the numbers below derive from its own inputs.
// A new board is 450 x 38 mm with no strips, defaulting to end grain.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Only on the first load: a reload inside a test must keep what it saved.
    if (window.sessionStorage.getItem('e2e-seeded')) return
    window.sessionStorage.setItem('e2e-seeded', '1')
    window.localStorage.clear()
    window.localStorage.setItem('sawdust-atlas:onboarded', '1')
  })
  await page.goto('/')
})

const finishedSize = (page: Page) => page.locator('.toolbar-finished-size b')
const stripRows = (page: Page) => page.locator('[data-strip-row]')
const stripWidth = (page: Page, n: number) => page.getByLabel(`Strip ${n} width`)

async function newEdgeBoard(page: Page) {
  await page.getByRole('button', { name: 'Cutting boards' }).click()
  await page.getByRole('button', { name: 'New board' }).click()
  await page.getByRole('button', { name: 'Edge grain', exact: true }).click()
}

test.describe('board design workflow', () => {
  test('creates a new board from the gallery and lands in the designer', async ({ page }) => {
    await page.getByRole('button', { name: 'Cutting boards' }).click()
    await page.getByRole('button', { name: 'New board' }).click()

    await expect(page.getByText('CUTTING BOARD DESIGNER')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Untitled cutting board' })).toBeVisible()
    await expect(page.getByLabel('Select board')).toHaveValue(/.+/)
    await expect(stripRows(page)).toHaveCount(0)
    // The gallery card for it exists after going back.
    await page.getByRole('button', { name: 'Back to boards' }).click()
    await expect(page.getByRole('button', { name: /Untitled cutting board/ })).toBeVisible()
  })

  test('adds and removes strips; the strip count and finished width follow', async ({ page }) => {
    await newEdgeBoard(page)
    await expect(finishedSize(page)).toHaveText('450 × 0 × 38 mm')

    await page.getByRole('button', { name: 'Add strip', exact: true }).first().click()
    await page.getByRole('button', { name: 'Add strip', exact: true }).first().click()
    await page.getByRole('button', { name: 'Add strip', exact: true }).first().click()
    await expect(stripRows(page)).toHaveCount(3)
    await expect(page.getByText('3 strips · 114 mm panel width')).toBeVisible()
    await expect(finishedSize(page)).toHaveText('450 × 114 × 38 mm')

    await page.getByRole('button', { name: 'Delete strip 2' }).click()
    await expect(stripRows(page)).toHaveCount(2)
    await expect(page.getByText('2 strips · 76 mm panel width')).toBeVisible()
    await expect(finishedSize(page)).toHaveText('450 × 76 × 38 mm')
  })

  test('changing a strip width and species updates the stats', async ({ page }) => {
    await newEdgeBoard(page)
    await page.getByRole('button', { name: 'Add strip', exact: true }).first().click()
    await page.getByRole('button', { name: 'Add strip', exact: true }).first().click()

    await stripWidth(page, 1).fill('50')
    await stripWidth(page, 2).fill('25')
    await expect(finishedSize(page)).toHaveText('450 × 75 × 38 mm')
    await expect(page.getByText('2 strips · 75 mm panel width')).toBeVisible()

    const material = page.locator('.board-stats > div', { hasText: 'Material' }).locator('b')
    const before = await material.textContent()
    // Walnut ($12.50/bf) -> Padauk ($18/bf): the same wood volume costs more.
    await expect(page.getByLabel('Strip 1 species')).toHaveValue('walnut')
    await page.getByLabel('Strip 1 species').selectOption({ label: 'Padauk' })
    await expect(page.getByLabel('Strip 1 species')).toHaveValue('padauk')
    await expect(material).not.toHaveText(before!)
    // Width is unchanged by a species swap.
    await expect(finishedSize(page)).toHaveText('450 × 75 × 38 mm')
  })

  test('switching edge <-> end grain shows and hides the end-grain controls', async ({ page }) => {
    await page.getByRole('button', { name: 'Cutting boards' }).click()
    await page.getByRole('button', { name: 'New board' }).click()

    // New boards start end grain.
    await expect(page.getByText('Glue-up length')).toBeVisible()
    await expect(page.getByText('Blade kerf (mm)')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'End-grain pattern' })).toBeVisible()
    await expect(page.getByLabel('Strip 1 trailing angle')).toHaveCount(0)

    await page.getByRole('button', { name: 'Edge grain', exact: true }).click()
    await expect(page.getByText('Glue-up length')).toHaveCount(0)
    await expect(page.getByText('Blade kerf (mm)')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'End-grain pattern' })).toHaveCount(0)
    await expect(page.getByText('Length (mm)')).toBeVisible()
    await expect(page.getByText('Edge-grain board · finished dimensions')).toBeVisible()

    await page.getByRole('button', { name: 'End grain', exact: true }).click()
    await expect(page.getByText('Glue-up length')).toBeVisible()
    await expect(page.getByText('End-grain workflow')).toBeVisible()
  })

  test('applying a pattern preset rewrites the strip recipe', async ({ page }) => {
    await page.getByRole('button', { name: 'Cutting boards' }).click()
    await page.getByRole('button', { name: 'New board' }).click()
    await expect(stripRows(page)).toHaveCount(0)

    // Stripe on an empty board generates the 8-strip starter recipe, alternating species.
    await page.getByRole('button', { name: 'Stripe', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Preview Stripe pattern' })
    await expect(dialog).toBeVisible()
    // Previewing does not change the board until applied.
    await expect(stripRows(page)).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Apply pattern' }).click()
    await expect(dialog).toHaveCount(0)

    await expect(stripRows(page)).toHaveCount(8)
    await expect(page.getByText('8 strips · 320 mm panel width')).toBeVisible()
    await expect(stripWidth(page, 1)).toHaveValue('40')
    await expect(page.getByLabel('Strip 1 species')).not.toHaveValue(await page.getByLabel('Strip 2 species').inputValue())
    await expect(page.getByLabel('Strip 1 trailing angle')).toHaveValue('0')

    // Chevron re-skins the same strips with alternating +/- angles; widths are kept.
    await page.getByRole('button', { name: 'Chevron', exact: true }).click()
    await page.getByRole('dialog', { name: 'Preview Chevron pattern' }).getByRole('button', { name: 'Apply pattern' }).click()
    await expect(stripRows(page)).toHaveCount(8)
    await expect(stripWidth(page, 1)).toHaveValue('40')
    const first = Number(await page.getByLabel('Strip 1 trailing angle').inputValue())
    const second = Number(await page.getByLabel('Strip 2 trailing angle').inputValue())
    expect(first).toBeGreaterThan(0)
    expect(second).toBe(-first)
  })

  test('undo and redo restore exact prior values via buttons and keyboard shortcuts', async ({ page }) => {
    await newEdgeBoard(page)
    const undo = page.getByRole('button', { name: 'Undo', exact: true })
    const redo = page.getByRole('button', { name: 'Redo', exact: true })
    const blur = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())

    await page.getByRole('button', { name: 'Add strip', exact: true }).first().click()
    await stripWidth(page, 1).fill('55')
    await stripWidth(page, 1).fill('62')
    await expect(finishedSize(page)).toHaveText('450 × 62 × 38 mm')

    // Button: 62 -> 55, then 55 -> 38 (the strip's default width).
    await undo.click()
    await expect(stripWidth(page, 1)).toHaveValue('55')
    await expect(finishedSize(page)).toHaveText('450 × 55 × 38 mm')
    // Keyboard: Ctrl+Z (ignored while typing in a field, so leave the field first).
    await blur()
    await page.keyboard.press('Control+z')
    await expect(stripWidth(page, 1)).toHaveValue('38')
    await expect(finishedSize(page)).toHaveText('450 × 38 × 38 mm')

    // Redo by button, then by Ctrl+Shift+Z, walks forward through the same values.
    await redo.click()
    await expect(stripWidth(page, 1)).toHaveValue('55')
    await blur()
    await page.keyboard.press('Control+Shift+z')
    await expect(stripWidth(page, 1)).toHaveValue('62')
    await expect(finishedSize(page)).toHaveText('450 × 62 × 38 mm')
    await expect(redo).toBeDisabled()

    // Undoing the strip add removes the strip again (and the width with it).
    await undo.click(); await undo.click(); await undo.click()
    await expect(stripRows(page)).toHaveCount(0)
    await expect(finishedSize(page)).toHaveText('450 × 0 × 38 mm')
  })

  test('imperial entry accepts a fraction and converts back to exact millimeters', async ({ page }) => {
    await newEdgeBoard(page)
    await page.getByRole('button', { name: 'Add strip', exact: true }).first().click()
    await expect(stripWidth(page, 1)).toHaveValue('38')

    await page.getByRole('button', { name: /Preston/ }).click()
    const width = stripWidth(page, 1)
    // 38 mm = 1 1/2" (to the nearest 1/32): the field is now free text in inches.
    await expect(width).toHaveValue('1 1/2')
    await width.fill('2 1/2')
    await width.press('Enter')
    await expect(width).toHaveValue('2 1/2')
    await expect(finishedSize(page)).toContainText('2 1/2')

    // Imperial commits snap to the nearest 1/2" (Preston's button): 1 5/8 lands on 1 1/2.
    await width.fill('1 5/8')
    await width.press('Enter')
    await expect(width).toHaveValue('1 1/2')

    await page.getByRole('button', { name: /Preston/ }).click()
    await expect(stripWidth(page, 1)).toHaveValue('38.1')
    await expect(finishedSize(page)).toHaveText('450 × 38.1 × 38 mm')
  })
})
