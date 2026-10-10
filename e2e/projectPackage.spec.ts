import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

// Single-project package: export a starter board from the designer, import the file
// from the gallery, and get a merged " (imported)" copy without touching the original.
test.describe('project package', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (!window.sessionStorage.getItem('seeded')) {
        window.localStorage.clear()
        window.localStorage.setItem('sawdust-atlas:onboarded', '1')
        window.sessionStorage.setItem('seeded', '1')
      }
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Cutting boards' }).click()
  })

  test('exports a board and imports it back as a copy', async ({ page }) => {
    await page.getByRole('button', { name: /Walnut & maple daily board/ }).click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export project file' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('Walnut & maple daily board.sawdust-project.json')
    const path = await download.path()
    const pkg = JSON.parse(await readFile(path, 'utf8')) as { kind: string; project: { type: string } }
    expect(pkg.kind).toBe('sawdust-atlas/project-package')
    expect(pkg.project.type).toBe('board')

    await page.getByRole('button', { name: 'Back to boards' }).click()
    await page.locator('input[type=file][aria-label="Project file"]').setInputFiles(path)

    const dialog = page.getByRole('dialog', { name: 'Project import summary' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(/added as a copy/i)
    await dialog.getByRole('button', { name: 'Done' }).click()

    await expect(page.getByRole('button', { name: /Walnut & maple daily board \(imported\)/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Walnut & maple daily board \d/ })).toBeVisible()
  })

  test('rejects a file that is not a project package', async ({ page }) => {
    await page.locator('input[type=file][aria-label="Project file"]').setInputFiles({
      name: 'nope.json', mimeType: 'application/json', buffer: Buffer.from('{"boards":[]}'),
    })
    const dialog = page.getByRole('dialog', { name: 'Project import failed' })
    await expect(dialog).toContainText(/not a SawdustAtlas project package/)
  })
})
