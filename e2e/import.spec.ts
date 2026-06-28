import { test, expect } from '@playwright/test'

// PLAT-004: importing a backup shows a confirmation with project counts and surfaces
// anything it couldn't carry over (unrecognized fields, unknown wood references) so
// nothing is dropped silently. This is a friend-beta exit flow.
test.describe('backup import', () => {
  test('shows a summary with counts and never-silent-drop warnings', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear())
    await page.goto('/')
    page.on('dialog', dialog => { void dialog.accept() }) // the replace-confirmation

    const backup = {
      schemaVersion: 2,
      shops: [{ id: 's', name: 'Imported shop', width: 3000, depth: 3000, gridSize: 300, blockedZones: [], items: [], updatedAt: '' }],
      boards: [
        { id: 'b1', name: 'B1', construction: 'edge', notes: 'an extra field', strips: [{ id: 'x', speciesId: 'mystery-wood', width: 40, trailingAngle: 0 }] },
        { id: 'b2', name: 'B2', construction: 'edge', strips: [] },
      ],
      composites: [],
    }

    await page.locator('input[type=file]').setInputFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    })

    const dialog = page.locator('.import-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('2 boards')
    await expect(dialog).toContainText(/unrecognized field/i)
    await expect(dialog).toContainText(/mystery-wood/i)
    await expect(dialog.getByRole('button', { name: /Export a backup/i })).toBeVisible()
  })

  test('rejects an invalid file with a clear error, not a crash', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear())
    await page.goto('/')
    page.on('dialog', dialog => { void dialog.accept() })

    await page.locator('input[type=file]').setInputFiles({
      name: 'not-a-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from('"just a string"'),
    })

    const dialog = page.locator('.import-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(/couldn't import/i)
  })
})
