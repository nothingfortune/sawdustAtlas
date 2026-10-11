import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

// Furniture designer joinery: the Joints and Assemblies panels, the issues list and the
// way an issue leads to its field, error outlines in the drawings, and the warning
// center selecting a part on arrival.
test.describe('furniture designer joinery', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('sawdust-atlas:onboarded', '1'))
    page.on('dialog', dialog => { void dialog.accept() })
  })

  async function createFrom(page: Page, template: RegExp | null) {
    await page.goto('/')
    await page.getByRole('button', { name: 'Furniture', exact: true }).click()
    await page.getByRole('button', { name: 'New project' }).click()
    if (template) await page.getByRole('dialog').getByRole('radio', { name: template }).check()
    await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click()
    await expect(page.getByRole('textbox', { name: 'Project name' })).toBeVisible()
  }
  const createTable = (page: Page) => createFrom(page, /Basic table/)
  const partRow = (page: Page, name: RegExp | string) => page.getByRole('button', { name }).filter({ has: page.locator('.part-row-title') })
  const jointRow = (page: Page, name: RegExp | string) => page.locator('.joint-row', { hasText: name })
  const field = (page: Page, name: RegExp | string) => page.getByRole('textbox', { name })
  const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true })
  const status = (page: Page) => page.locator('p[role=status]')
  const issuesButton = (page: Page) => page.locator('.furniture-issue-count')

  async function enter(page: Page, name: RegExp | string, text: string) {
    const input = field(page, name)
    await input.fill(text)
    await input.press('Enter')
  }

  test('lists the joints, shows entered values and assumptions, and edits one', async ({ page }) => {
    await createTable(page)
    await tab(page, 'Joints').click()
    await expect(page.getByRole('button', { name: /^All \(12\)/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.joint-item')).toHaveCount(12)

    await jointRow(page, 'Mortise and tenon: A1 Front apron into L1 Front left leg').click()
    await expect(page.getByRole('tabpanel', { name: 'Joints' }).getByLabel('Kind', { exact: true })).toHaveValue('mortise-tenon')
    await expect(page.getByLabel('Glue this joint')).toBeChecked()
    // Nothing is entered on a template joint: every size is a default, labelled as one.
    await expect(field(page, /^Shoulder/)).toHaveValue('6')
    await expect(field(page, /^Depth/)).toHaveValue('30')
    await expect(page.locator('.joint-assumption')).toHaveCount(4)
    await expect(page.locator('.joint-assumption').first()).toContainText('Assumed')

    // Typing a value makes it the woodworker's own, with a way back to the assumption.
    await enter(page, /^Shoulder/, '8')
    await expect(page.locator('.joint-assumption')).toHaveCount(3)
    await expect(field(page, /^Shoulder/)).toHaveValue('8')
    await page.getByRole('button', { name: 'Use the assumed shoulder for this joint' }).click()
    await expect(field(page, /^Shoulder/)).toHaveValue('6')
    await expect(page.locator('.joint-assumption')).toHaveCount(4)

    await page.getByLabel('Glue this joint').uncheck()
    await expect(jointRow(page, 'Mortise and tenon: A1 Front apron into L1 Front left leg')).toContainText('Not glued')

    await page.getByRole('button', { name: 'Delete joint' }).click()
    await expect(page.getByRole('button', { name: /^All \(11\)/ })).toBeVisible()
    await expect(page.locator('.joint-item')).toHaveCount(11)
    await expect(status(page)).toContainText('Deleted Mortise and tenon')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(page.locator('.joint-item')).toHaveCount(12)
  })

  test('shows only the selected part\'s joints on request', async ({ page }) => {
    await createTable(page)
    await partRow(page, /Front left leg/).click()
    await tab(page, 'Joints').click()
    await expect(page.getByRole('button', { name: 'Selected part' })).toBeEnabled()
    await page.getByRole('button', { name: 'Selected part' }).click()
    await expect(page.locator('.joint-item')).toHaveCount(2)
    await expect(page.locator('.joint-item').first()).toContainText('L1 Front left leg')
    await page.getByRole('button', { name: /^All/ }).click()
    await expect(page.locator('.joint-item')).toHaveCount(12)
  })

  test('adds a joint for two selected parts, offering only the kinds their contact allows', async ({ page }) => {
    await createTable(page)
    await tab(page, 'Joints').click()
    await expect(page.getByText('Select two parts')).toBeVisible()

    await tab(page, 'Parts').click()
    await partRow(page, /^T Top/).click()
    await partRow(page, /Front apron/).click({ modifiers: ['Shift'] })
    await tab(page, 'Joints').click()
    const kinds = page.getByLabel('New joint kind').locator('option')
    const pair = page.locator('.joint-pair')
    // The smaller part is fitted by default: the apron's edge can be tenoned into the top.
    await expect(pair).toHaveText('A1 Front apron into T Top')
    await expect(kinds.filter({ hasText: 'Mortise and tenon' })).toHaveCount(1)

    // Swapped, the broad face of the top lies on the apron's edge, so no socket joints fit.
    await page.getByRole('button', { name: 'Swap parts' }).click()
    await expect(pair).toHaveText('T Top into A1 Front apron')
    await expect(kinds.filter({ hasText: 'Mortise and tenon' })).toHaveCount(0)
    await expect(kinds.filter({ hasText: 'Dado' })).toHaveCount(0)
    await expect(kinds.filter({ hasText: 'Tabletop fastener' })).toHaveCount(1)
    await expect(kinds.filter({ hasText: /^Screw$/ })).toHaveCount(1)

    await page.getByLabel('New joint kind').selectOption('screw')
    await page.getByRole('button', { name: 'Add joint', exact: true }).click()
    await expect(page.locator('.joint-item')).toHaveCount(13)
    await expect(status(page)).toContainText('Added Screw joint')
    // The new joint opens with its sizes shown as assumptions.
    await expect(field(page, /^Diameter/)).toHaveValue('4')
    await expect(page.locator('.joint-assumption')).toHaveCount(2)
    await expect(page.getByLabel('Glue this joint')).not.toBeChecked()
  })

  test('refuses a joint between parts that do not touch and says why', async ({ page }) => {
    await createTable(page)
    await partRow(page, /Front left leg/).click()
    await partRow(page, /Back right leg/).click({ modifiers: ['Shift'] })
    await tab(page, 'Joints').click()
    await expect(page.getByLabel('New joint kind')).toHaveCount(0)
    await expect(page.locator('.joint-add [role=status]')).toContainText('do not touch')
    await expect(page.getByRole('button', { name: 'Add joint', exact: true })).toBeDisabled()
  })

  test('builds, names, nests, orders, and removes an assembly', async ({ page }) => {
    await createTable(page)
    const errorsBefore = await issuesButton(page).textContent()
    await partRow(page, /^T Top/).click()
    await tab(page, 'Assemblies').click()
    await page.getByRole('button', { name: 'Create from selection' }).click()
    await expect(page.locator('.assembly-item')).toHaveCount(4)
    await expect(status(page)).toContainText('Created Assembly 4 with 1 part')

    const panel = page.getByRole('tabpanel', { name: 'Assemblies' })
    await panel.getByRole('textbox', { name: /^Name/ }).fill('Tabletop')
    await panel.getByRole('textbox', { name: /^Name/ }).press('Enter')
    await panel.getByRole('textbox', { name: /^Mark/ }).fill('T')
    await panel.getByRole('textbox', { name: /^Mark/ }).press('Enter')
    await expect(page.locator('.assembly-item .joint-row-title').last()).toHaveText('Tabletop (T)')
    await expect(panel.locator('.assembly-parts')).toContainText('T Top')

    // Built into the base, after the two leg frames, then moved earlier.
    await page.getByLabel('Built into').selectOption({ label: 'Base' })
    const titles = page.locator('.assembly-item .joint-row-title')
    await expect(titles).toHaveText(['Base (S)', 'Front leg frame (F)', 'Back leg frame (B)', 'Tabletop (T)'])
    await page.getByRole('button', { name: 'Build earlier' }).click()
    await expect(titles).toHaveText(['Base (S)', 'Front leg frame (F)', 'Tabletop (T)', 'Back leg frame (B)'])
    await expect(page.getByRole('button', { name: 'Build later' })).toBeEnabled()

    // The Parts panel groups by the same structure.
    await tab(page, 'Parts').click()
    await expect(page.getByRole('region', { name: 'Tabletop' })).toContainText('T Top')

    await tab(page, 'Assemblies').click()
    await page.locator('.joint-row', { hasText: 'Tabletop (T)' }).click()
    await page.getByRole('button', { name: 'Remove T Top from Tabletop' }).click()
    await expect(page.getByText('No parts yet.')).toBeVisible()
    await page.getByRole('button', { name: 'Delete assembly' }).click()
    await expect(page.locator('.assembly-item')).toHaveCount(3)
    await expect(issuesButton(page)).toHaveText(errorsBefore!.trim())
  })

  test('an assembly refuses to be built into itself or its own child', async ({ page }) => {
    await createTable(page)
    await tab(page, 'Assemblies').click()
    await page.locator('.joint-row', { hasText: 'Base (S)' }).click()
    const parent = page.getByLabel('Built into')
    const options = await parent.locator('option').allTextContents()
    expect(options).toEqual(['Nothing (top level)'])
    await page.locator('.joint-row', { hasText: 'Front leg frame' }).click()
    expect(await parent.locator('option').allTextContents()).toEqual(['Nothing (top level)', 'Back leg frame', 'Base'])
  })

  test('the issues list groups by severity and each issue leads to its field', async ({ page }) => {
    await createTable(page)
    await expect(issuesButton(page)).toHaveAttribute('aria-expanded', 'false')
    // A tenon that would go all the way through the leg is a joint error.
    await tab(page, 'Joints').click()
    await jointRow(page, 'Mortise and tenon: A1 Front apron into L1 Front left leg').click()
    await enter(page, /^Depth/, '400')
    await expect(issuesButton(page)).toContainText('error')

    await issuesButton(page).click()
    const panel = page.getByRole('region', { name: 'Issues', exact: true })
    await expect(panel.getByRole('region', { name: 'Errors' })).toContainText('all the way through')
    await expect(panel.getByRole('region', { name: 'Errors' }).getByRole('button')).toHaveCount(1)

    await tab(page, 'Parts').click()
    await panel.getByRole('region', { name: 'Errors' }).getByRole('button').click()
    // Picking closes the list, opens the Joints panel on that joint, and focuses the depth.
    await expect(panel).toBeHidden()
    await expect(tab(page, 'Joints')).toHaveAttribute('aria-selected', 'true')
    await expect(field(page, /^Depth/)).toBeFocused()
    await expect(field(page, /^Depth/)).toHaveValue('400')
    await expect(page.locator('.part-row.selected, .joint-row[aria-expanded=true]')).toHaveCount(1)
    await expect(page.locator('.furniture-selection-line')).toContainText('2 parts selected')
  })

  test('a part dimension issue selects the part and focuses the field', async ({ page }) => {
    await createTable(page)
    await tab(page, 'Parameters').click()
    const row = page.locator('.parameter-row', { has: page.locator('input[value="apron_h"]') })
    await row.getByRole('textbox', { name: /^Value/ }).fill('0')
    await row.getByRole('textbox', { name: /^Value/ }).press('Enter')

    await issuesButton(page).click()
    const errors = page.getByRole('region', { name: 'Errors' })
    await expect(errors).toContainText('apron')
    await errors.getByRole('button').first().click()
    await expect(tab(page, 'Parts')).toHaveAttribute('aria-selected', 'true')
    await expect(field(page, /^Name/)).toHaveValue(/apron/i)
    await expect(field(page, /^Width/)).toBeFocused()
    await expect(page.locator('.furniture-selection-line')).toContainText('apron')
  })

  test('a parameter issue leads to the parameter', async ({ page }) => {
    await createTable(page)
    await tab(page, 'Parameters').click()
    const leg = page.locator('.parameter-row', { has: page.locator('input[value="leg"]') })
    await leg.getByRole('textbox', { name: /^Value/ }).fill('=apron_h')
    await leg.getByRole('textbox', { name: /^Value/ }).press('Enter')
    const apron = page.locator('.parameter-row', { has: page.locator('input[value="apron_h"]') })
    await apron.getByRole('textbox', { name: /^Value/ }).fill('=leg')
    await apron.getByRole('textbox', { name: /^Value/ }).press('Enter')
    await tab(page, 'Parts').click()

    await issuesButton(page).click()
    await page.getByRole('region', { name: 'Errors' }).getByRole('button').filter({ hasText: /loop|cycle|depend/i }).first().click()
    await expect(tab(page, 'Parameters')).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('[data-focus-key^="parameter:"]:focus')).toHaveCount(1)
  })

  test('warnings list apart from errors, and picking one selects its part', async ({ page }) => {
    await createFrom(page, null)
    await page.getByRole('button', { name: 'Solid part' }).click()
    await page.getByRole('button', { name: 'Solid part' }).click()
    // Lifting the second part off the floor leaves it touching nothing.
    await enter(page, /^Position Z/, '200')
    await expect(issuesButton(page)).toContainText('1 issue')
    await issuesButton(page).click()
    const panel = page.getByRole('region', { name: 'Issues', exact: true })
    await expect(panel.getByRole('region', { name: 'Warnings' })).toBeVisible()
    await expect(panel.getByRole('region', { name: 'Errors' })).toHaveCount(0)
    await expect(panel.getByRole('region', { name: 'Warnings' }).locator('b').first()).toHaveText('Warning:')
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()

    await issuesButton(page).click()
    await panel.getByRole('region', { name: 'Warnings' }).getByRole('button').first().click()
    await expect(page.locator('.furniture-selection-line')).toContainText('New part')
    await expect(field(page, /^Name/)).toHaveValue('New part')
  })

  test('parts with an error are outlined with a pattern in the drawings', async ({ page }) => {
    await createTable(page)
    await expect(page.locator('.furniture-part.error')).toHaveCount(0)
    await tab(page, 'Joints').click()
    await jointRow(page, 'Mortise and tenon: A1 Front apron into L1 Front left leg').click()
    await enter(page, /^Depth/, '400')
    const errored = page.locator('svg.furniture-drawing .furniture-part.error')
    await expect(errored).toHaveCount(2)
    await expect(page.locator('svg.furniture-drawing .furniture-error-hatch').first()).toBeAttached()
    await expect(page.locator('svg.furniture-drawing pattern')).toHaveCount(1)
  })

  test('the warning center opens a furniture project with the part selected', async ({ page }) => {
    await createFrom(page, null)
    await page.getByRole('button', { name: 'Solid part' }).click()
    await page.getByRole('button', { name: 'Solid part' }).click()
    // Pull the second part onto the first so the pair collides.
    await enter(page, /^Position X/, '0')
    await page.getByRole('button', { name: /^Furniture$/ }).first().click()
    await expect(page.locator('.furniture-card')).toHaveCount(1)

    await page.locator('.warning-pill').click()
    const row = page.locator('.warning-row', { hasText: 'Untitled furniture' }).first()
    await expect(row).toBeVisible()
    await row.click()
    await expect(page.getByRole('textbox', { name: 'Project name' })).toBeVisible()
    await expect(page.locator('.furniture-selection-line')).toContainText('Selected: P')
    await expect(field(page, /^Name/)).toHaveValue('New part')
  })
})
