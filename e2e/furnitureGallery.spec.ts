import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

// Furniture gallery: creating from the dialog, card actions, persistence, and browser
// history. Each test starts from an empty workspace.
test.describe('furniture gallery', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('sawdust-atlas:onboarded', '1'))
    page.on('dialog', dialog => { void dialog.accept() })
  })

  async function openGallery(page: Page) {
    await page.goto('/')
    await page.getByRole('button', { name: 'Furniture', exact: true }).click()
    await expect(page.getByRole('button', { name: 'New project' })).toBeVisible()
  }

  test('creates a blank project and opens its designer', async ({ page }) => {
    await openGallery(page)
    await page.getByRole('button', { name: 'New project' }).click()
    const dialog = page.getByRole('dialog', { name: 'New furniture project' })
    await expect(dialog.getByRole('radio', { name: /Blank/ })).toBeChecked()
    await dialog.getByRole('button', { name: 'Create project' }).click()
    await expect(page.getByRole('heading', { name: 'Untitled furniture' })).toBeVisible()
    await expect(page.locator('.breadcrumb strong')).toHaveText('Furniture')
  })

  test('creates a project from every template with its parameters', async ({ page }) => {
    await openGallery(page)
    await page.getByRole('button', { name: 'New project' }).click()
    const radios = page.getByRole('dialog').getByRole('radio')
    const count = await radios.count()
    expect(count).toBe(7)
    await page.getByRole('button', { name: 'Cancel' }).click()

    for (let index = 1; index < count; index++) {
      await page.getByRole('button', { name: 'New project' }).click()
      const dialog = page.getByRole('dialog')
      await dialog.getByRole('radio').nth(index).check()
      // Defaults are filled, so Create works straight away.
      await expect(dialog.locator('.template-params input').first()).not.toHaveValue('')
      await dialog.getByRole('button', { name: 'Create project' }).click()
      await expect(page.locator('.furniture-size')).toContainText('mm')
      await expect(page.locator('.furniture-header')).toContainText(/[1-9]\d* parts?/)
      await page.getByRole('button', { name: /^Furniture$/ }).first().click()
    }
    await expect(page.locator('.furniture-card')).toHaveCount(count - 1)
  })

  test('template parameters use display units and reject out-of-range values', async ({ page }) => {
    await openGallery(page)
    await page.getByRole('button', { name: 'New project' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('radio', { name: /Bookcase/ }).check()
    const create = dialog.getByRole('button', { name: 'Create project' })
    const shelves = dialog.getByRole('textbox', { name: 'Shelves' })
    await expect(shelves).toHaveValue('3')
    await shelves.fill('99')
    await expect(dialog.getByRole('alert')).toContainText('1 to 8')
    await expect(create).toBeDisabled()
    await shelves.fill('2')
    await expect(create).toBeEnabled()

    const width = dialog.getByRole('textbox', { name: /^Overall width/ })
    await width.fill('1000')
    await create.click()
    await expect(page.locator('.furniture-size')).toContainText('1000')
  })

  test('shows imperial units in the dialog and on cards', async ({ page }) => {
    await openGallery(page)
    await page.getByRole('button', { name: /Preston's button/ }).click()
    await page.getByRole('button', { name: 'New project' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('radio', { name: /Basic table/ }).check()
    await expect(dialog.getByRole('textbox', { name: /^Overall height \(in\)/ })).toHaveValue('29 17/32')
    await dialog.getByRole('textbox', { name: /^Overall height \(in\)/ }).fill('30')
    await dialog.getByRole('button', { name: 'Create project' }).click()
    await expect(page.locator('.furniture-size')).toContainText(' in')
  })

  test('duplicates and deletes a project from its card', async ({ page }) => {
    await openGallery(page)
    await page.getByRole('button', { name: 'New project' }).click()
    await page.getByRole('dialog').getByRole('radio', { name: /Basic table/ }).check()
    await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click()
    const name = await page.getByRole('heading', { level: 2 }).first().innerText()
    await page.getByRole('button', { name: /^Furniture$/ }).first().click()

    await page.getByRole('button', { name: `Duplicate ${name}` }).click()
    await expect(page.locator('.furniture-card')).toHaveCount(2)
    await expect(page.locator('.furniture-card .gallery-name', { hasText: `${name} copy` })).toBeVisible()

    await page.getByRole('button', { name: `Delete ${name} copy` }).click()
    await expect(page.locator('.furniture-card')).toHaveCount(1)
  })

  test('keeps projects after a reload', async ({ page }) => {
    await openGallery(page)
    await page.getByRole('button', { name: 'New project' }).click()
    await page.getByRole('dialog').getByRole('radio', { name: /Desk/ }).check()
    await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click()
    await expect(page.locator('.furniture-header')).toBeVisible()

    await page.reload()
    await page.getByRole('button', { name: 'Furniture', exact: true }).click()
    await expect(page.locator('.furniture-card')).toHaveCount(1)
  })

  test('undo removes a just-created project and leaves the designer', async ({ page }) => {
    await openGallery(page)
    await page.getByRole('button', { name: 'New project' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click()
    await expect(page.locator('.furniture-header')).toBeVisible()
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(page.getByRole('button', { name: 'New project' })).toBeVisible()
    await expect(page.locator('.furniture-card')).toHaveCount(0)
  })

  test('browser back from the designer returns to the gallery', async ({ page }) => {
    await openGallery(page)
    await page.getByRole('button', { name: 'New project' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click()
    await expect(page.locator('.furniture-header')).toBeVisible()
    await page.goBack()
    await expect(page.getByRole('button', { name: 'New project' })).toBeVisible()
    await page.goForward()
    await expect(page.locator('.furniture-header')).toBeVisible()
  })

  test('the warning center opens a furniture project', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('sawdust-atlas:v1', JSON.stringify({
        schemaVersion: 3, shops: [], boards: [], composites: [],
        furniture: [{
          id: 'f1', name: 'Broken shelf', maxBoardWidth: 140, updatedAt: '2026-01-01T00:00:00.000Z',
          parameters: [], relationships: [], joints: [], subassemblies: [], sheetMaterials: [],
          parts: [{ id: 'p1', label: 'P1', name: 'Plank', role: 'shelf', kind: 'solid', length: 'nope + 1', width: 100, thickness: 20, orientation: 'xyz', position: { x: 0, y: 0, z: 0 }, visibleFaces: [] }],
        }],
      }))
    })
    await page.goto('/')
    await page.locator('.warning-pill').click()
    await page.locator('.warning-row', { hasText: 'Broken shelf' }).first().click()
    await expect(page.getByRole('heading', { name: 'Broken shelf' })).toBeVisible()
  })
})
