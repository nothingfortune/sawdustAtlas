import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

// Furniture designer editing: parameters, parts, the dimension input (imperial and
// expressions), undo and redo, and persistence.
test.describe('furniture designer editing', () => {
  let dialogs: string[]

  test.beforeEach(async ({ page }) => {
    dialogs = []
    await page.addInitScript(() => window.localStorage.setItem('sawdust-atlas:onboarded', '1'))
    page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.accept() })
  })

  async function createTable(page: Page) {
    await page.goto('/')
    await page.getByRole('button', { name: 'Furniture', exact: true }).click()
    await page.getByRole('button', { name: 'New project' }).click()
    await page.getByRole('dialog').getByRole('radio', { name: /Basic table/ }).check()
    await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click()
    await expect(page.getByRole('textbox', { name: 'Project name' })).toBeVisible()
  }
  const partRow = (page: Page, name: RegExp | string) => page.getByRole('button', { name }).filter({ has: page.locator('.part-row-title') })
  const field = (page: Page, name: RegExp | string) => page.getByRole('textbox', { name })
  async function enter(page: Page, name: RegExp | string, text: string) {
    const input = field(page, name)
    await input.fill(text)
    await input.press('Enter')
  }
  const paramRow = (page: Page, name: string) => page.locator('.parameter-row', { has: page.locator(`input[value="${name}"]`) })

  test('shows the header, parts grouped by subassembly, and a neutral center', async ({ page }) => {
    await createTable(page)
    await expect(page.locator('.furniture-size')).toContainText('1200 × 700 × 750')
    await expect(page.locator('span.furniture-parts')).toHaveText('9 parts')
    await expect(page.getByRole('region', { name: 'Front leg frame' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Design area' })).toContainText('No part selected')
    await partRow(page, /Front left leg/).click()
    await expect(page.getByRole('region', { name: 'Design area' })).toContainText('Selected: L1 Front left leg')
    await expect(page.getByRole('region', { name: 'Design area' })).toContainText('Overall size: 1200 × 700 × 750')
    await expect(partRow(page, /Front left leg/)).toHaveAttribute('aria-pressed', 'true')
  })

  test('editing a parameter makes dependent part sizes follow', async ({ page }) => {
    await createTable(page)
    await partRow(page, /Front left leg/).click()
    const width = page.locator('.dim-field', { has: page.getByRole('textbox', { name: /^Width/ }) })
    await expect(field(page, /^Width/)).toHaveValue('=leg')
    await expect(width.locator('.dim-evaluated')).toHaveText('= 45 mm')

    await page.getByRole('tab', { name: 'Parameters' }).click()
    await paramRow(page, 'leg').getByRole('textbox', { name: /^Value/ }).fill('60')
    await paramRow(page, 'leg').getByRole('textbox', { name: /^Value/ }).press('Enter')

    await page.getByRole('tab', { name: 'Parts' }).click()
    await expect(width.locator('.dim-evaluated')).toHaveText('= 60 mm')
    await expect(partRow(page, /Front left leg/)).toContainText('60')
  })

  test('adds, duplicates, and deletes a part', async ({ page }) => {
    await createTable(page)
    await page.getByRole('button', { name: 'Solid part' }).click()
    await expect(page.locator('span.furniture-parts')).toHaveText('10 parts')
    await expect(field(page, /^Name/)).toHaveValue('New part')
    await expect(field(page, /^Mark/)).toHaveValue('P1')
    await expect(page.locator('p[role=status]')).toHaveText(/Added P1 New part/)

    await page.getByRole('button', { name: 'Duplicate' }).click()
    await expect(page.locator('span.furniture-parts')).toHaveText('11 parts')
    await expect(field(page, /^Name/)).toHaveValue('New part copy')
    await expect(field(page, /^Mark/)).toHaveValue('P2')

    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    expect(dialogs.at(-1)).toContain('Delete P2 New part copy?')
    await expect(page.locator('span.furniture-parts')).toHaveText('10 parts')
    await expect(page.getByText('Select a part in the Parts list')).toBeVisible()
  })

  test('adds sheet and hardware parts with their own material fields', async ({ page }) => {
    await createTable(page)
    await page.getByRole('button', { name: 'Sheet part' }).click()
    await expect(page.getByLabel('Sheet material')).toBeVisible()
    await expect(page.getByLabel('Sheet material')).toContainText('Birch plywood 18 mm')
    await expect(field(page, /^Thickness/)).toHaveValue('18')
    await page.getByRole('button', { name: 'Hardware', exact: true }).click()
    await expect(field(page, /^Hardware name/)).toHaveValue('Hardware')
    await page.getByLabel('Kind').selectOption('solid')
    await expect(page.getByLabel('Species')).toBeVisible()
  })

  test('deleting a part lists the joints and relationships that go with it', async ({ page }) => {
    await createTable(page)
    await partRow(page, /Front left leg/).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    const message = dialogs.at(-1) ?? ''
    expect(message).toContain('These joints are removed')
    expect(message).toContain('mortise-tenon joint between')
    expect(message).toContain('These relationships are removed')
    expect(message).toContain('It leaves these subassemblies')
    await expect(page.locator('span.furniture-parts')).toHaveText('8 parts')
  })

  test('shows what drives a relationship-controlled position and keeps it read-only', async ({ page }) => {
    await createTable(page)
    await partRow(page, /Front apron/).click()
    await expect(field(page, /^Position X/)).toBeDisabled()
    await expect(page.locator('.dim-driver').first()).toContainText('Driven by: A1 Front apron')
    // A leg is what the aprons hang from, so its own position is typed.
    await partRow(page, /Front left leg/).click()
    await expect(field(page, /^Position X/)).toBeEnabled()
    await expect(field(page, /^Position X/)).toHaveValue('=overhang')
  })

  test('accepts imperial fractions in display units', async ({ page }) => {
    await createTable(page)
    await page.getByRole('button', { name: 'Solid part' }).click()
    await page.getByRole('button', { name: /Preston's button/ }).click()
    await expect(field(page, /^Length \(in\)/)).toHaveValue('19 11/16')
    await enter(page, /^Thickness \(in\)/, '3/4')
    await expect(field(page, /^Thickness \(in\)/)).toHaveValue('3/4')
    await page.getByRole('button', { name: /Preston's button/ }).click()
    await expect(field(page, /^Thickness \(mm\)/)).toHaveValue('19.05')
  })

  test('accepts an expression, shows its value, and refuses an invalid one', async ({ page }) => {
    await createTable(page)
    await page.getByRole('button', { name: 'Solid part' }).click()
    const length = field(page, /^Length/)
    const box = page.locator('.dim-field', { has: length })

    await enter(page, /^Length/, '=leg * 2')
    await expect(length).toHaveValue('=leg * 2')
    await expect(box.locator('.dim-fx')).toBeVisible()
    await expect(box.locator('.dim-evaluated')).toHaveText('= 90 mm')

    await length.fill('=nope * 2')
    await length.press('Enter')
    await expect(box.getByRole('alert')).toContainText(/nope/i)
    await expect(length).toHaveAttribute('aria-invalid', 'true')
    await length.press('Escape')
    await expect(length).toHaveValue('=leg * 2')
    await expect(box.getByRole('alert')).toHaveCount(0)

    await enter(page, /^Length/, 'abc')
    await expect(box.getByRole('alert')).toBeVisible()
    await enter(page, /^Length/, '0')
    await expect(box.getByRole('alert')).toContainText(/greater than zero/i)
    await length.press('Escape')
    await expect(length).toHaveValue('=leg * 2')
  })

  test('adds, renames, and deletes a parameter, warning when it is referenced', async ({ page }) => {
    await createTable(page)
    await page.getByRole('tab', { name: 'Parameters' }).click()
    // The row is found by position because its name field no longer matches "leg" once typed in.
    const leg = page.locator('.parameter-row').nth(4)
    await expect(leg.getByRole('textbox', { name: /^Name/ })).toHaveValue('leg')
    await leg.getByRole('textbox', { name: /^Name/ }).fill('post')
    await leg.getByRole('textbox', { name: /^Name/ }).press('Enter')
    await page.getByRole('tab', { name: 'Parts' }).click()
    await partRow(page, /Front left leg/).click()
    await expect(field(page, /^Width/)).toHaveValue('=post')

    await page.getByRole('tab', { name: 'Parameters' }).click()
    await page.getByRole('button', { name: 'Add parameter' }).click()
    const added = page.locator('.parameter-row').last()
    await added.getByRole('textbox', { name: /^Name/ }).fill('post')
    await added.getByRole('textbox', { name: /^Name/ }).press('Enter')
    await expect(added.getByRole('alert')).toContainText('already named post')
    await added.getByRole('textbox', { name: /^Name/ }).press('Escape')
    await expect(added.getByRole('textbox', { name: /^Name/ })).toHaveValue('param_1')

    await page.getByRole('button', { name: 'Delete parameter param_1' }).click()
    expect(dialogs).toHaveLength(0)
    await page.getByRole('button', { name: 'Delete parameter post' }).click()
    expect(dialogs.at(-1)).toContain('post is used by')
    await expect(page.locator('.furniture-issue-count')).toContainText('error')
  })

  test('edits the project name, board width, and sheet materials', async ({ page }) => {
    await createTable(page)
    await enter(page, 'Project name', 'Kitchen table')
    await page.getByRole('tab', { name: 'Settings' }).click()
    await enter(page, /^Widest board on hand/, '200')
    await page.getByRole('button', { name: 'Add sheet material' }).click()
    await enter(page, /^Material name/, 'Baltic birch')
    await enter(page, /^Thickness/, '12')
    await expect(field(page, /^Thickness/)).toHaveValue('12')
    await field(page, /^Widest board/).fill('=5')
    await field(page, /^Widest board/).press('Enter')
    await expect(page.getByRole('alert')).toContainText(/plain length/i)

    await page.getByRole('tab', { name: 'Parts' }).click()
    await page.getByRole('button', { name: 'Sheet part' }).click()
    await page.getByRole('tab', { name: 'Settings' }).click()
    await page.getByRole('button', { name: 'Delete sheet material Baltic birch' }).click()
    expect(dialogs.at(-1)).toContain('is used by 1 part')
    await expect(page.getByRole('textbox', { name: /^Material name/ })).toHaveValue('Baltic birch')
  })

  test('undo and redo walk back and forward through edits', async ({ page }) => {
    await createTable(page)
    await page.getByRole('button', { name: 'Solid part' }).click()
    await enter(page, /^Name/, 'Shelf')
    await expect(page.locator('span.furniture-parts')).toHaveText('10 parts')

    const undo = page.getByRole('button', { name: 'Undo', exact: true })
    const redo = page.getByRole('button', { name: 'Redo', exact: true })
    await undo.click()
    await expect(field(page, /^Name/)).toHaveValue('New part')
    await undo.click()
    await expect(page.locator('span.furniture-parts')).toHaveText('9 parts')
    await expect(page.getByText('Select a part in the Parts list')).toBeVisible()
    await redo.click()
    await redo.click()
    await expect(field(page, /^Name/)).toHaveValue('Shelf')
  })

  test('keeps edits after a reload', async ({ page }) => {
    await createTable(page)
    await enter(page, 'Project name', 'Reloadable')
    await page.getByRole('button', { name: 'Solid part' }).click()
    await page.reload()
    await page.getByRole('button', { name: 'Furniture', exact: true }).click()
    await expect(page.locator('.furniture-card .gallery-name')).toHaveText('Reloadable')
    await page.locator('.furniture-card-open').click()
    await expect(page.locator('span.furniture-parts')).toHaveText('10 parts')
  })

  test('the parts list and inspector work from the keyboard', async ({ page }) => {
    await createTable(page)
    await partRow(page, /Top/).focus()
    await page.keyboard.press('Enter')
    await expect(field(page, /^Name/)).toHaveValue('Top')
    await field(page, /^Thickness/).focus()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('30')
    await page.keyboard.press('Tab')
    await expect(field(page, /^Thickness/)).toHaveValue('30')
  })

  test('actions and tabs are at least 44px tall', async ({ page }) => {
    await createTable(page)
    for (const locator of [page.getByRole('button', { name: 'Solid part' }), page.getByRole('tab', { name: 'Parameters' }), partRow(page, /Top/)]) {
      const box = await locator.boundingBox()
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    }
  })
})
