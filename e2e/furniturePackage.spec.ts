import { test, expect } from '@playwright/test'

// A furniture project leaves as a package file and comes back intact after the original is deleted.
test.describe('furniture package', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('sawdust-atlas:onboarded', '1'))
    page.on('dialog', dialog => { void dialog.accept() })
  })

  test('exports a project, deletes it, and imports it back', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Furniture', exact: true }).click()
    await page.getByRole('button', { name: 'New project' }).click()
    const create = page.getByRole('dialog', { name: 'New furniture project' })
    await create.getByRole('radio', { name: /Bookcase/ }).check()
    await create.getByRole('button', { name: 'Create project' }).click()

    const name = await page.getByRole('textbox', { name: 'Project name' }).inputValue()
    const parts = await page.locator('.furniture-parts').textContent()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export project file' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe(`${name}.sawdust-project.json`)
    const path = await download.path()

    await page.getByRole('button', { name: /^Furniture$/ }).first().click()
    await page.getByRole('button', { name: `Delete ${name}` }).click()
    await expect(page.locator('.furniture-card')).toHaveCount(0)

    await page.locator('input[type=file][aria-label="Project file"]').setInputFiles(path)
    const dialog = page.getByRole('dialog', { name: 'Project import summary' })
    await expect(dialog).toContainText('1 furniture project')
    await expect(dialog).not.toContainText(/added as a copy/i)
    await dialog.getByRole('button', { name: 'Done' }).click()

    await expect(page.locator('.furniture-card')).toHaveCount(1)
    await page.locator('.furniture-card-open').first().click()
    await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue(name)
    await expect(page.locator('.furniture-parts')).toHaveText(parts ?? '')
  })
})
