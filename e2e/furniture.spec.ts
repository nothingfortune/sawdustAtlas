import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

// The furniture modeler end to end: one working session from template to printed build
// sheet and backup. The per-feature specs (furnitureDesigner, furnitureJoinery,
// furnitureViews, furnitureOutputs) own the detail; this one proves the pieces hold
// together, so each step checks one result that depends on the steps before it.
// The 3D view needs a WebGL context: a software rasterizer makes that dependable in CI.
// launchOptions force a new worker, so this sits at file level and covers every test here.
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } })

async function openDesigner(page: Page, template: RegExp) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Furniture', exact: true }).click()
  await page.getByRole('button', { name: 'New project' }).click()
  await page.getByRole('dialog').getByRole('radio', { name: template }).check()
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('textbox', { name: 'Project name' })).toBeVisible()
}
const field = (page: Page, name: RegExp | string) => page.getByRole('textbox', { name })
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true })
const partRow = (page: Page, name: RegExp | string) => page.getByRole('button', { name }).filter({ has: page.locator('.part-row-title') })
const outputs = (page: Page) => page.getByRole('region', { name: 'Project outputs' })
const parts = (page: Page) => page.locator('span.furniture-parts')
async function enter(page: Page, name: RegExp | string, text: string) {
  const input = field(page, name)
  await input.fill(text)
  await input.press('Enter')
}
async function setParameter(page: Page, name: string, value: string) {
  await tab(page, 'Parameters').click()
  const input = page.locator('.parameter-row', { has: page.locator(`input[value="${name}"]`) }).getByRole('textbox', { name: /^Value/ })
  await input.fill(value)
  await input.press('Enter')
}

test.describe('furniture modeler session', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('sawdust-atlas:onboarded', '1'))
    page.on('dialog', dialog => { void dialog.accept() })
  })

  test('template to build sheet: parameters, imperial editing, undo, joint, issue, outputs, reload', async ({ page }) => {
    await openDesigner(page, /Basic table/)
    await expect(page.locator('.furniture-size')).toContainText('1200 × 700 × 750')
    await outputs(page).getByRole('tab', { name: 'Cut list' }).click()
    const top = outputs(page).getByRole('table', { name: 'Parts' }).locator('tbody tr', { hasText: 'Walnut' })
    await expect(top).toContainText('1200 × 700 × 25 mm')

    // A parameter change reaches the parts, the overall size, and the cut list.
    await setParameter(page, 'width', '1500')
    await expect(page.locator('.furniture-size')).toContainText('1500 × 700 × 750')
    await expect(top).toContainText('1500 × 700 × 25 mm')

    // Edit a new part in imperial display units; storage stays metric.
    await tab(page, 'Parts').click()
    await page.getByRole('button', { name: 'Solid part' }).click()
    await expect(parts(page)).toHaveText('10 parts')
    await page.getByRole('button', { name: /Preston/ }).click()
    await enter(page, /^Thickness \(in\)/, '3/4')
    await enter(page, /^Name/, 'Shelf')
    await page.getByRole('button', { name: /Preston/ }).click()
    await expect(field(page, /^Thickness \(mm\)/)).toHaveValue('19.05')

    const size = (await page.locator('.furniture-size').innerText()).replace(/\s*mm$/, '')

    // Undo and redo step through those edits.
    const undo = page.getByRole('button', { name: 'Undo', exact: true })
    const redo = page.getByRole('button', { name: 'Redo', exact: true })
    await undo.click()
    await expect(field(page, /^Name/)).toHaveValue('New part')
    await redo.click()
    await expect(field(page, /^Name/)).toHaveValue('Shelf')

    // Join two parts that touch.
    await partRow(page, /^T Top/).click()
    await partRow(page, /Front apron/).click({ modifiers: ['Shift'] })
    await tab(page, 'Joints').click()
    const before = await page.locator('.joint-item').count()
    await page.getByRole('button', { name: 'Add joint', exact: true }).click()
    await expect(page.locator('.joint-item')).toHaveCount(before + 1)
    await expect(page.locator('p[role=status]')).toContainText('Added')

    // The build steps and the printed sheet describe the edited piece.
    await outputs(page).getByRole('tab', { name: 'Build steps' }).click()
    await expect(outputs(page).locator('.furniture-steps-check')).toHaveText('Plan check passed.')
    const sheet = page.getByRole('article', { name: 'Printable build sheet' })
    await page.emulateMedia({ media: 'print' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('heading', { level: 1 })).toHaveText('Basic table')
    await expect(sheet.locator('.furniture-print-cover')).toContainText(`${size} mm`)
    const printedCutList = sheet.getByRole('region', { name: 'Cut list' }).first()
    await expect(printedCutList).toContainText('1512 × 722 × 28 mm')
    await expect(printedCutList).toContainText('Shelf')
    await page.emulateMedia({ media: 'screen' })

    // An invalid parameter raises an issue that leads to the field to fix.
    await setParameter(page, 'apron_h', '0')
    await page.locator('.furniture-issue-count').click()
    await page.getByRole('region', { name: 'Errors' }).getByRole('button').first().click()
    await expect(field(page, /^Width/)).toBeFocused()
    await setParameter(page, 'apron_h', '100')
    await expect(page.locator('.furniture-issue-count')).not.toContainText('error')

    // Everything survives a reload.
    await page.reload()
    await page.getByRole('button', { name: 'Furniture', exact: true }).click()
    await page.locator('.furniture-card-open').click()
    await expect(parts(page)).toHaveText('10 parts')
    await expect(page.locator('.furniture-size')).toContainText(size)
    await tab(page, 'Joints').click()
    await expect(page.locator('.joint-item')).toHaveCount(before + 1)
  })

  test('a backup carries furniture out and back in', async ({ page }) => {
    await openDesigner(page, /Bookcase/)
    await enter(page, 'Project name', 'Backed up bookcase')
    await page.getByRole('button', { name: 'Solid part' }).click()
    await enter(page, /^Name/, 'Extra shelf')
    const size = await page.locator('.furniture-size').innerText()
    const count = await parts(page).innerText()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.topbar').getByRole('button', { name: 'Export backup' }).click(),
    ])
    const path = await download.path()
    const backup = JSON.parse(await readFile(path, 'utf8')) as { furniture: { name: string, parts: { name: string }[] }[] }
    expect(backup.furniture.map(project => project.name)).toEqual(['Backed up bookcase'])
    expect(backup.furniture[0]?.parts.some(part => part.name === 'Extra shelf')).toBe(true)

    // Wipe the workspace, then restore it from the file.
    await page.evaluate(() => window.localStorage.removeItem('sawdust-atlas:v1'))
    await page.reload()
    await page.getByRole('button', { name: 'Furniture', exact: true }).click()
    await expect(page.locator('.furniture-card')).toHaveCount(0)
    await page.locator('input[type=file]').setInputFiles(path)
    await expect(page.locator('.import-dialog')).toContainText('1 furniture project')
    await page.locator('.import-dialog').getByRole('button', { name: 'Done' }).click()

    await page.getByRole('button', { name: 'Furniture', exact: true }).click()
    await expect(page.locator('.furniture-card .gallery-name')).toHaveText('Backed up bookcase')
    await page.locator('.furniture-card-open').click()
    await expect(page.locator('.furniture-size')).toHaveText(size)
    await expect(parts(page)).toHaveText(count)
    await expect(partRow(page, /Extra shelf/)).toBeVisible()
  })
})

test.describe('furniture 3D viewport', () => {
  test('renders the piece and picks a part by clicking it', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('sawdust-atlas:onboarded', '1'))
    await openDesigner(page, /Basic table/)
    await page.getByRole('button', { name: '3D', exact: true }).click()
    const canvas = page.locator('.furniture-viewport canvas')
    await expect(canvas).toBeVisible()
    await expect(page.getByRole('heading', { name: '3D view unavailable' })).toHaveCount(0)

    // A drawn scene has more than the background: count distinct colors in a capture.
    await expect.poll(async () => {
      const png = (await canvas.screenshot()).toString('base64')
      return page.evaluate(async data => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob())
        const probe = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!
        probe.drawImage(bitmap, 0, 0)
        const pixels = probe.getImageData(0, 0, bitmap.width, bitmap.height).data
        const colors = new Set<number>()
        for (let at = 0; at < pixels.length; at += 4 * 7) colors.add((pixels[at]! << 16) | (pixels[at + 1]! << 8) | pixels[at + 2]!)
        return colors.size
      }, png)
    }).toBeGreaterThan(8)

    await expect(page.locator('.furniture-selection-line')).toHaveText('No part selected')
    const box = (await canvas.boundingBox())!
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.33)
    await expect(page.locator('.furniture-selection-line')).not.toHaveText('No part selected')
    await expect(page.locator('.part-row.selected')).toHaveCount(1)
  })
})

test.describe('furniture 3D fallback', () => {
  test('without WebGL the designer says so and the isometric drawing carries on', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('sawdust-atlas:onboarded', '1')
      const original = HTMLCanvasElement.prototype.getContext as (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) => unknown
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
        return /^(experimental-)?webgl2?$/.test(kind) ? null : original.call(this, kind, ...rest)
      } as typeof HTMLCanvasElement.prototype.getContext
    })
    await openDesigner(page, /Basic table/)
    await page.getByRole('button', { name: '3D', exact: true }).click()
    await expect(page.getByRole('heading', { name: '3D view unavailable' })).toBeVisible()
    await page.getByRole('button', { name: 'Show the isometric view' }).click()
    const drawing = page.getByRole('region', { name: 'Design area' }).locator('svg.furniture-drawing')
    await expect(drawing).toHaveAttribute('data-view', 'iso')
    // The rest of the designer is unaffected: select a part from the drawing's list.
    await partRow(page, /Front left leg/).click()
    await expect(page.locator('.furniture-selection-line')).toContainText('Front left leg')
  })
})
