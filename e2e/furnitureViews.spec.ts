import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

// Furniture designer views: the view switcher, selection shared between the parts list,
// the inspector and the drawings, arrow-key nudges, arranging parts with relationships,
// the 3D fallback, and the gallery thumbnail.
test.describe('furniture designer views', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('sawdust-atlas:onboarded', '1'))
    page.on('dialog', dialog => { void dialog.accept() })
  })

  async function openGallery(page: Page) {
    await page.goto('/')
    await page.getByRole('button', { name: 'Furniture', exact: true }).click()
    await page.getByRole('button', { name: 'New project' }).click()
  }
  async function createTable(page: Page) {
    await openGallery(page)
    await page.getByRole('dialog').getByRole('radio', { name: /Basic table/ }).check()
    await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click()
    await expect(page.getByRole('textbox', { name: 'Project name' })).toBeVisible()
  }
  async function createBlank(page: Page) {
    await openGallery(page)
    await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click()
    await expect(page.getByRole('textbox', { name: 'Project name' })).toBeVisible()
  }
  const partRow = (page: Page, name: RegExp | string) => page.getByRole('button', { name }).filter({ has: page.locator('.part-row-title') })
  const drawn = (page: Page, name: string) => page.locator('svg.furniture-drawing').getByRole('button', { name, exact: true })
  const view = (page: Page, name: string) => page.getByRole('group', { name: 'View', exact: true }).getByRole('button', { name, exact: true })
  const field = (page: Page, name: RegExp | string) => page.getByRole('textbox', { name })
  const status = (page: Page) => page.locator('p[role=status]')
  const selectionLine = (page: Page) => page.locator('.furniture-selection-line')

  test('switches between the orthographic, isometric, and exploded drawings', async ({ page }) => {
    await createTable(page)
    // Iso is the default, so the page never needs WebGL to show the piece.
    await expect(page.locator('svg.furniture-drawing')).toHaveAttribute('data-view', 'iso')
    await expect(view(page, 'Iso')).toHaveAttribute('aria-pressed', 'true')
    for (const [name, key] of [['Front', 'front'], ['Side', 'side'], ['Top', 'top'], ['Exploded', 'exploded'], ['Iso', 'iso']] as const) {
      await view(page, name).click()
      await expect(page.locator('svg.furniture-drawing')).toHaveAttribute('data-view', key)
      await expect(view(page, name)).toHaveAttribute('aria-pressed', 'true')
    }
    await expect(page.locator('.furniture-dimension')).toHaveCount(0)
    await view(page, 'Front').click()
    await expect(page.locator('.furniture-dimension')).toHaveCount(2)
    await expect(page.locator('.furniture-dimension').first()).toContainText('1200')
  })

  test('the exploded view spreads the parts and the slider changes how far', async ({ page }) => {
    await createTable(page)
    await view(page, 'Iso').click()
    const width = async () => (await page.locator('svg.furniture-drawing').getAttribute('viewBox'))!.split(' ').map(Number)[2]!
    const together = await width()
    await view(page, 'Exploded').click()
    const apart = await width()
    expect(apart).toBeGreaterThan(together)
    await page.getByLabel('Explode distance').fill('80')
    expect(await width()).toBeGreaterThan(apart)
  })

  test('selection is shared by the list, the inspector, and the drawings', async ({ page }) => {
    await createTable(page)
    await view(page, 'Front').click()
    await drawn(page, 'L1 Front left leg').click()
    await expect(partRow(page, /Front left leg/)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('textbox', { name: /^Name/ })).toHaveValue('Front left leg')
    await expect(selectionLine(page)).toHaveText('Selected: L1 Front left leg')
    await expect(drawn(page, 'L1 Front left leg')).toHaveAttribute('aria-pressed', 'true')

    // Shift adds to the selection; the inspector follows the newest pick.
    await drawn(page, 'L2 Front right leg').click({ modifiers: ['Shift'] })
    await expect(selectionLine(page)).toContainText('2 parts selected')
    await expect(partRow(page, /Front left leg/)).toHaveAttribute('aria-pressed', 'true')
    await expect(partRow(page, /Front right leg/)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('textbox', { name: /^Name/ })).toHaveValue('Front right leg')

    // Shift again removes it, and a plain pick in the list replaces the selection.
    await drawn(page, 'L2 Front right leg').click({ modifiers: ['Shift'] })
    await expect(selectionLine(page)).toHaveText('Selected: L1 Front left leg')
    await partRow(page, /Back left leg/).click()
    await expect(selectionLine(page)).toHaveText('Selected: L3 Back left leg')
    await expect(drawn(page, 'L3 Back left leg')).toHaveAttribute('aria-pressed', 'true')

    // Empty drawing space clears it.
    await page.locator('svg.furniture-drawing').click({ position: { x: 6, y: 6 } })
    await expect(selectionLine(page)).toHaveText('No part selected')
    await expect(page.getByText('Select a part in the Parts list')).toBeVisible()
  })

  test('arrow keys nudge the selection in a drawing and in the parts list, and undo steps back', async ({ page }) => {
    await createTable(page)
    await view(page, 'Front').click()
    await drawn(page, 'L1 Front left leg').click()
    const x = field(page, /^Position X/)
    await expect(x).toHaveValue('=overhang')

    await page.keyboard.press('ArrowRight')
    await expect(x).toHaveValue('26')
    await expect(status(page)).toContainText('Moved L1 Front left leg 1 mm +X')
    await page.keyboard.press('Shift+ArrowRight')
    await expect(x).toHaveValue('36')
    // In the front view up is up (z); in the side view the arrows run front to back.
    await page.keyboard.press('ArrowUp')
    await expect(field(page, /^Position Z/)).toHaveValue('1')
    await view(page, 'Top').click()
    await drawn(page, 'L1 Front left leg').focus()
    await page.keyboard.press('ArrowUp')
    await expect(field(page, /^Position Y/)).toHaveValue('26')

    // The parts list nudges too, with the same keys.
    await partRow(page, /Front right leg/).click()
    await page.keyboard.press('ArrowLeft')
    await expect(field(page, /^Position X/)).toHaveValue('1129')

    const undo = page.getByRole('button', { name: 'Undo', exact: true })
    await undo.click()
    await expect(field(page, /^Position X/)).toHaveValue('=width - overhang - leg')
    await partRow(page, /Front left leg/).click()
    await undo.click()
    await expect(field(page, /^Position Y/)).toHaveValue('=overhang')
  })

  test('a part placed by a relationship does not move, and says why', async ({ page }) => {
    await createTable(page)
    await partRow(page, /Front apron/).click()
    await partRow(page, /Front apron/).focus()
    await page.keyboard.press('ArrowRight')
    await expect(status(page)).toContainText('placed along X by a relationship')
    await expect(field(page, /^Position X/)).toBeDisabled()
  })

  test('snap grid sets the nudge distance', async ({ page }) => {
    await createTable(page)
    await page.getByLabel('Snap grid').selectOption({ label: '5 mm' })
    await partRow(page, /Front left leg/).click()
    await partRow(page, /Front left leg/).focus()
    await page.keyboard.press('ArrowRight')
    await expect(field(page, /^Position X/)).toHaveValue('30')
    await page.keyboard.press('Shift+ArrowLeft')
    await expect(field(page, /^Position X/)).toHaveValue('-20')
  })

  test('attaches two parts, shows the relationship, removes it, and undoes the removal', async ({ page }) => {
    await createBlank(page)
    await page.getByRole('button', { name: 'Solid part' }).click()
    await page.getByRole('button', { name: 'Solid part' }).click()
    await expect(page.locator('.furniture-header .furniture-parts')).toHaveText('2 parts')
    await partRow(page, /P1/).click()
    await expect(page.getByRole('button', { name: 'Attach', exact: true })).toBeDisabled()
    await partRow(page, /P2/).click({ modifiers: ['Shift'] })
    await expect(selectionLine(page)).toContainText('2 parts selected')

    await page.getByRole('button', { name: 'Attach', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Attach parts' })
    await expect(dialog.getByLabel('Part that moves')).toHaveValue(/.+/)
    await expect(dialog.locator('.arrange-result')).toContainText('P2 New part copy'.replace(' copy', ''))
    await dialog.getByLabel('Moving face').selectOption('left')
    await dialog.getByLabel(/^Meets/).selectOption('right')
    await dialog.getByRole('textbox', { name: /^Offset/ }).fill('10')
    await dialog.getByRole('textbox', { name: /^Offset/ }).press('Enter')
    await expect(dialog.locator('.arrange-result')).toContainText('left face against')
    await dialog.getByRole('button', { name: 'Create relationship' }).click()
    await expect(dialog).toBeHidden()

    // P2 is the moving part: its X is read-only and shows what drives it.
    await expect(field(page, /^Position X/)).toBeDisabled()
    await expect(page.locator('.dim-driver')).toContainText('left face against')
    const relationships = page.getByRole('region', { name: 'Relationships' })
    await expect(relationships).toContainText('left face against')
    // The part sits 10 mm off the first part's right face: 500 + 10.
    await view(page, 'Front').click()
    await expect(page.locator('.furniture-dimension').first()).toContainText('1010')

    await relationships.getByRole('button', { name: /^Remove relationship/ }).click()
    await expect(relationships).toBeHidden()
    await expect(field(page, /^Position X/)).toBeEnabled()
    await expect(field(page, /^Position X/)).toHaveValue('510')
    await expect(status(page)).toContainText('Parts stay where they are')
    await expect(page.locator('.furniture-dimension').first()).toContainText('1010')

    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Relationships' })).toContainText('left face against')
    await expect(field(page, /^Position X/)).toBeDisabled()
  })

  test('align and center build their relationships, and a loop is refused', async ({ page }) => {
    await createBlank(page)
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Solid part' }).click()
    await partRow(page, /P1/).click()
    await partRow(page, /P2/).click({ modifiers: ['Shift'] })

    await page.getByRole('button', { name: 'Align', exact: true }).click()
    let dialog = page.getByRole('dialog', { name: 'Align parts' })
    await dialog.getByLabel(/^Face to line up/).selectOption('front')
    await dialog.getByRole('button', { name: 'Create relationship' }).click()
    await expect(field(page, /^Position Y/)).toBeDisabled()
    await expect(page.getByRole('region', { name: 'Relationships' })).toContainText('flush with')

    await page.getByRole('button', { name: 'Center', exact: true }).click()
    dialog = page.getByRole('dialog', { name: 'Center a part' })
    await dialog.getByLabel('Along').selectOption('x')
    await dialog.getByRole('button', { name: 'Create relationship' }).click()
    await expect(field(page, /^Position X/)).toBeDisabled()
    await expect(page.getByRole('region', { name: 'Relationships' }).getByRole('listitem')).toHaveCount(2)

    // Making P1 follow P2 on the same axis would loop; the dialog says so and keeps the model.
    await page.getByRole('button', { name: 'Align', exact: true }).click()
    dialog = page.getByRole('dialog', { name: 'Align parts' })
    await dialog.getByLabel('Part that moves').selectOption({ label: 'P1 New part' })
    await dialog.getByLabel(/^Face to line up/).selectOption('front')
    await dialog.getByRole('button', { name: 'Create relationship' }).click()
    await expect(dialog.getByRole('alert')).toContainText('loop')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('region', { name: 'Relationships' }).getByRole('listitem')).toHaveCount(2)
  })

  test('between and distribute arrange shelves in a bookcase', async ({ page }) => {
    await openGallery(page)
    await page.getByRole('dialog').getByRole('radio', { name: /Bookcase/ }).check()
    await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click()
    await expect(page.getByRole('button', { name: 'Between', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Distribute', exact: true })).toBeDisabled()
    await partRow(page, /Shelf 1/).click()
    await partRow(page, /Bottom/).click({ modifiers: ['Shift'] })
    await partRow(page, /Top/).click({ modifiers: ['Shift'] })
    await expect(page.getByRole('button', { name: 'Between', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Between', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Center between two parts' })
    await expect(dialog.getByLabel('Part to center')).toContainText('Shelf 1')
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    await partRow(page, /Shelf 2/).click({ modifiers: ['Shift'] })
    await expect(page.getByRole('button', { name: 'Distribute', exact: true })).toBeEnabled()
    // The template already spaces the shelves, and a distribution is never replaced silently.
    await page.getByRole('button', { name: 'Distribute', exact: true }).click()
    let distribute = page.getByRole('dialog', { name: 'Distribute parts' })
    await expect(distribute.getByLabel('From end part')).toContainText('Bottom')
    await expect(distribute.locator('.arrange-result')).toContainText('2 parts spaced between')
    await distribute.getByRole('button', { name: 'Create relationship' }).click()
    await expect(distribute.getByRole('alert')).toContainText('already spaced along Z by a distribution')
    await distribute.getByRole('button', { name: 'Cancel' }).click()

    await partRow(page, /Shelf 1/).click()
    await page.getByRole('button', { name: /^Remove relationship: 3 parts spaced between/ }).click()
    await partRow(page, /Shelf 2/).click({ modifiers: ['Shift'] })
    await partRow(page, /Bottom/).click({ modifiers: ['Shift'] })
    await partRow(page, /Top/).click({ modifiers: ['Shift'] })
    await page.getByRole('button', { name: 'Distribute', exact: true }).click()
    distribute = page.getByRole('dialog', { name: 'Distribute parts' })
    await distribute.getByRole('button', { name: 'Create relationship' }).click()
    await expect(distribute).toBeHidden()
    await expect(status(page)).toContainText('2 parts spaced between')
  })

  test('the 3D view explains a missing WebGL and switches to the isometric drawing', async ({ page }) => {
    await page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null })
    await createTable(page)
    await view(page, '3D').click()
    await expect(page.getByRole('heading', { name: '3D view unavailable' })).toBeVisible()
    await expect(page.getByText('cannot draw WebGL graphics')).toBeVisible()
    await page.getByRole('button', { name: 'Show the isometric view' }).click()
    await expect(page.locator('svg.furniture-drawing')).toHaveAttribute('data-view', 'iso')
    await expect(view(page, 'Iso')).toHaveAttribute('aria-pressed', 'true')
    await expect(status(page)).toContainText('isometric view is showing')
  })

  test('the drag axis control and snap grid are offered in the 3D view', async ({ page }) => {
    await createTable(page)
    await expect(page.getByRole('group', { name: 'Drag along' })).toBeHidden()
    await view(page, '3D').click()
    const axes = page.getByRole('group', { name: 'Drag along' })
    await expect(axes.getByRole('button')).toHaveCount(3)
    await axes.getByRole('button', { name: 'Drag along Z' }).click()
    await expect(axes.getByRole('button', { name: 'Drag along Z' })).toHaveAttribute('aria-pressed', 'true')
    for (const button of await axes.getByRole('button').all()) {
      const box = (await button.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
    // A relationship-driven part names the reason before anyone tries to drag it.
    await partRow(page, /Front apron/).click()
    await expect(page.locator('.design-note')).toContainText('placed along Z by a relationship')
    await partRow(page, /Front left leg/).click()
    await expect(page.locator('.design-note')).toBeHidden()
  })

  test('dragging a selected part in 3D moves it along the chosen axis in one undoable step', async ({ page }) => {
    // Needs a WebGL context; headless Chromium provides a software one.
    await createTable(page)
    await view(page, '3D').click()
    const canvas = page.locator('.furniture-viewport canvas')
    await expect(canvas).toBeVisible()
    await partRow(page, /Table top|Top/).first().click()
    await page.getByLabel('Snap grid').selectOption({ label: '10 mm' })
    await expect(field(page, /^Position X/)).toHaveValue('0')

    const box = (await canvas.boundingBox())!
    const at = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.33 }
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.move(at.x + 70, at.y, { steps: 10 })
    // Nothing is committed until the pointer is released.
    await expect(field(page, /^Position X/)).toHaveValue('0')
    await page.mouse.up()
    await expect.poll(async () => Number(await field(page, /^Position X/).inputValue())).toBeGreaterThan(0)
    await expect(status(page)).toContainText('Moved')
    await expect(status(page)).toContainText('on X')
    // Only the position changed: the table is still 1200 wide, and one undo undoes the drag.
    await expect(field(page, /^Length/)).toHaveValue('=width')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(field(page, /^Position X/)).toHaveValue('0')
  })

  test('gallery cards show an isometric thumbnail of the design', async ({ page }) => {
    await createTable(page)
    await page.getByRole('button', { name: /^Furniture$/ }).first().click()
    const card = page.locator('.furniture-card').first()
    await expect(card.locator('.furniture-thumb svg.furniture-drawing')).toHaveAttribute('data-view', 'iso')
    await expect(card.locator('.furniture-thumb [data-part-id]')).toHaveCount(9)
  })
})
