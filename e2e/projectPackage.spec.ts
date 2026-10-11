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

  test('exports a composite and imports it back with its panels', async ({ page }) => {
    await page.getByRole('button', { name: /Walnut & maple daily board/ }).click()
    await page.getByRole('button', { name: 'Make composite: build a composite board from this design' }).click()
    const screen = page.locator('.composite-screen')
    await expect(screen).toBeVisible()
    const name = await screen.getByLabel('Composite name').inputValue()
    expect(name.length).toBeGreaterThan(0)

    const downloadPromise = page.waitForEvent('download')
    await screen.getByRole('button', { name: 'Export project' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe(`${name}.sawdust-project.json`)
    const path = await download.path()
    const pkg = JSON.parse(await readFile(path, 'utf8')) as {
      kind: string
      project: { type: string; composite: { panels: unknown[] }; boards?: unknown[] }
    }
    expect(pkg.kind).toBe('sawdust-atlas/project-package')
    expect(pkg.project.type).toBe('composite')
    expect(pkg.project.composite.panels.length).toBeGreaterThan(0)

    await screen.getByRole('button', { name: 'Boards' }).click()
    await page.locator('input[type=file][aria-label="Project file"]').setInputFiles(path)

    const dialog = page.getByRole('dialog', { name: 'Project import summary' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(/added as a copy/i)
    await dialog.getByRole('button', { name: 'Done' }).click()

    const copy = page.locator('.gallery-composite', { hasText: `${name} (imported)` })
    await expect(copy).toBeVisible()
    await expect(copy).toContainText(/1 panel/)
    await expect(page.locator('.gallery-composite', { hasText: name })).toHaveCount(2)

    // Opening the copy shows its panels came along.
    await copy.click()
    await expect(page.locator('.composite-screen').getByLabel('Composite name')).toHaveValue(`${name} (imported)`)
    await expect(page.locator('.panel-card')).not.toHaveCount(0)
  })

  test('rejects a file that is not a project package', async ({ page }) => {
    await page.locator('input[type=file][aria-label="Project file"]').setInputFiles({
      name: 'nope.json', mimeType: 'application/json', buffer: Buffer.from('{"boards":[]}'),
    })
    const dialog = page.getByRole('dialog', { name: 'Project import failed' })
    await expect(dialog).toContainText(/not a SawdustAtlas project package/)
  })
})
