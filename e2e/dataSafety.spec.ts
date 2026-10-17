import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

// DATA SAFETY: all work lives in this browser's localStorage, so losing it is the worst
// failure the app can have. These tests guard the paths that stand between a user and
// lost work: autosave, backup export/import, undo-import, corrupt-save recovery, failed
// writes being surfaced, and destructive actions being confirmed.

const WORKSPACE_KEY = 'sawdust-atlas:v1'
const CORRUPT_KEY = 'sawdust-atlas:corrupt'
const STARTER_BOARD = 'Walnut & maple daily board'

// Suppress the first-run welcome without touching the workspace key (idempotent, so it
// is safe across reloads).
async function skipWelcome(page: Page) {
  await page.addInitScript(() => { window.localStorage.setItem('sawdust-atlas:onboarded', '1') })
}

async function openStarterBoard(page: Page, name = STARTER_BOARD) {
  await page.getByRole('button', { name: 'Cutting boards' }).click()
  await page.getByRole('button', { name }).click()
}

async function renameOpenBoard(page: Page, name: string) {
  const field = page.getByLabel('Name', { exact: true })
  await field.fill(name)
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible()
}

test.describe('data safety', () => {
  test('autosave: an edit survives a reload', async ({ page }) => {
    await skipWelcome(page)
    await page.goto('/')
    await openStarterBoard(page)
    await renameOpenBoard(page, 'Autosaved board')
    await expect(page.getByRole('status').filter({ hasText: 'Saved in this browser' })).toBeVisible()

    await page.reload()
    await page.getByRole('button', { name: 'Cutting boards' }).click()
    await expect(page.getByRole('button', { name: /Autosaved board/ })).toBeVisible()
    await expect(page.getByRole('button', { name: STARTER_BOARD })).toHaveCount(0)
  })

  test('backup round trip: export, wipe the workspace, import, work is back', async ({ page }, testInfo) => {
    await skipWelcome(page)
    page.on('dialog', dialog => { void dialog.accept() }) // the replace-confirmation
    await page.goto('/')
    await openStarterBoard(page)
    await renameOpenBoard(page, 'Heirloom board')

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.topbar-actions').getByRole('button', { name: 'Export backup' }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(/^sawdust-atlas-.*\.json$/)
    const backupPath = testInfo.outputPath('backup.json')
    await download.saveAs(backupPath)

    // Wipe the workspace entirely: the app comes back with starter data.
    await page.evaluate(key => window.localStorage.removeItem(key), WORKSPACE_KEY)
    await page.reload()
    await page.getByRole('button', { name: 'Cutting boards' }).click()
    await expect(page.getByRole('button', { name: STARTER_BOARD })).toBeVisible()
    await expect(page.getByRole('button', { name: /Heirloom board/ })).toHaveCount(0)

    await page.getByLabel('Backup file').setInputFiles(backupPath)
    const summary = page.locator('.import-dialog')
    await expect(summary).toBeVisible()
    await expect(summary).toContainText('Imported 1 shop, 1 board, 0 composites, and 0 furniture projects')
    await summary.getByRole('button', { name: 'Done' }).click()
    await expect(summary).toHaveCount(0)

    await page.getByRole('button', { name: 'Cutting boards' }).click()
    await expect(page.getByRole('button', { name: /Heirloom board/ })).toBeVisible()

    // And the restored workspace is itself persisted.
    await page.reload()
    await page.getByRole('button', { name: 'Cutting boards' }).click()
    await expect(page.getByRole('button', { name: /Heirloom board/ })).toBeVisible()
  })

  test('undo import: the sidebar action brings the previous workspace back', async ({ page }) => {
    await skipWelcome(page)
    page.on('dialog', dialog => { void dialog.accept() })
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Restore the workspace from before the last import' })).toHaveCount(0)

    const backup = {
      schemaVersion: 2,
      shops: [{ id: 's', name: 'Imported shop', width: 3000, depth: 3000, gridSize: 300, blockedZones: [], items: [], updatedAt: '' }],
      boards: [{ id: 'imp', name: 'Replacement board', construction: 'edge', strips: [] }],
      composites: [],
    }
    await page.getByLabel('Backup file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
    const summary = page.locator('.import-dialog')
    await expect(summary).toContainText('Imported 1 shop, 1 board')
    await summary.getByRole('button', { name: 'Done' }).click()

    await page.getByRole('button', { name: 'Cutting boards' }).click()
    await expect(page.getByRole('button', { name: /Replacement board/ })).toBeVisible()
    await expect(page.getByRole('button', { name: STARTER_BOARD })).toHaveCount(0)

    await page.getByRole('button', { name: 'Restore the workspace from before the last import' }).click()
    await expect(page.getByRole('button', { name: STARTER_BOARD })).toBeVisible()
    await expect(page.getByRole('button', { name: /Replacement board/ })).toHaveCount(0)
    // The action is spent once used.
    await expect(page.getByRole('button', { name: 'Restore the workspace from before the last import' })).toHaveCount(0)
  })

  test('corrupt save: app loads starter data and keeps the corrupt blob for recovery', async ({ page }) => {
    const blob = '{"schemaVersion":2,"boards":[{"id":"x","name":"Truncated wri'
    await page.addInitScript(({ key, raw }) => {
      window.localStorage.setItem('sawdust-atlas:onboarded', '1')
      // Seed once per tab session so the app's own autosave isn't clobbered on reload.
      if (!window.sessionStorage.getItem('corrupt-seeded')) {
        window.sessionStorage.setItem('corrupt-seeded', '1')
        window.localStorage.setItem(key, raw)
      }
    }, { key: WORKSPACE_KEY, raw: blob })

    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/')

    await page.getByRole('button', { name: 'Cutting boards' }).click()
    await expect(page.getByRole('button', { name: STARTER_BOARD })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'Saved in this browser' })).toBeVisible()

    expect(await page.evaluate(key => window.localStorage.getItem(key), CORRUPT_KEY)).toBe(blob)
    expect(errors).toEqual([])

    // After the app's autosave replaces the workspace, a reload still has the recovery copy.
    await page.reload()
    await expect(page.getByRole('button', { name: 'Cutting boards' })).toBeVisible()
    expect(await page.evaluate(key => window.localStorage.getItem(key), CORRUPT_KEY)).toBe(blob)
  })

  test('failed writes are surfaced in the warning center', async ({ page }) => {
    await skipWelcome(page)
    await page.addInitScript(key => {
      const original = Storage.prototype.setItem
      Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
        if (k === key) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
        return original.call(this, k, v)
      }
    }, WORKSPACE_KEY)
    await page.goto('/')
    await openStarterBoard(page)
    await renameOpenBoard(page, 'Unsaveable board')

    await expect(page.getByRole('status').filter({ hasText: /Not saved/ })).toBeVisible()
    await page.locator('.warning-pill').click()
    const menu = page.getByRole('menu', { name: 'Workspace issues' })
    await expect(menu.getByRole('menuitem', { name: /Changes aren.t saving in this browser/ })).toBeVisible()
  })

  test('delete asks for confirmation, and an accepted delete persists', async ({ page }) => {
    await skipWelcome(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Cutting boards' }).click()
    await page.getByRole('button', { name: 'New board' }).click()
    await renameOpenBoard(page, 'Doomed board')

    // Dismissing the confirm keeps the project.
    const messages: string[] = []
    page.once('dialog', dialog => { messages.push(dialog.message()); void dialog.dismiss() })
    await page.getByRole('button', { name: 'Delete this design' }).click()
    await expect.poll(() => messages).toEqual(['Delete board "Doomed board"?'])
    await expect(page.getByRole('heading', { level: 2, name: 'Doomed board' })).toBeVisible()
    await page.getByRole('button', { name: 'Back to boards' }).click()
    await expect(page.getByRole('button', { name: /Doomed board/ })).toBeVisible()

    // Accepting removes it.
    await page.getByRole('button', { name: /Doomed board/ }).click()
    page.once('dialog', dialog => { void dialog.accept() })
    await page.getByRole('button', { name: 'Delete this design' }).click()
    await page.getByRole('button', { name: 'Cutting boards' }).click()
    await expect(page.getByRole('button', { name: STARTER_BOARD })).toBeVisible()
    await expect(page.getByRole('button', { name: /Doomed board/ })).toHaveCount(0)

    // ...and stays gone after a reload.
    await page.reload()
    await page.getByRole('button', { name: 'Cutting boards' }).click()
    await expect(page.getByRole('button', { name: STARTER_BOARD })).toBeVisible()
    await expect(page.getByRole('button', { name: /Doomed board/ })).toHaveCount(0)
  })
})
