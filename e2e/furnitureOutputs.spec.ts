import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

// Furniture outputs: the cut list and build steps tabs, and the printed build sheet.
// Expected numbers come from the domain (partsList and the template defaults).
test.describe('furniture outputs', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('sawdust-atlas:onboarded', '1'))
  })

  async function createFrom(page: Page, template: RegExp) {
    await page.goto('/')
    await page.getByRole('button', { name: 'Furniture', exact: true }).click()
    await page.getByRole('button', { name: 'New project' }).click()
    await page.getByRole('dialog').getByRole('radio', { name: template }).check()
    await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click()
    await expect(page.getByRole('textbox', { name: 'Project name' })).toBeVisible()
  }
  const outputs = (page: Page) => page.getByRole('region', { name: 'Project outputs' })
  const row = (page: Page, text: string) => outputs(page).getByRole('table', { name: 'Parts' }).locator('tbody tr', { hasText: text })

  test('starts collapsed and the cut list tab shows the table template numbers', async ({ page }) => {
    await createFrom(page, /Basic table/)
    await expect(outputs(page).getByRole('tabpanel')).toHaveCount(0)
    await outputs(page).getByRole('tab', { name: 'Cut list' }).click()
    await expect(outputs(page).getByRole('tab', { name: 'Cut list' })).toHaveAttribute('aria-selected', 'true')

    const top = row(page, 'Walnut')
    await expect(top.locator('td').nth(0)).toHaveText('1')
    await expect(top).toContainText('1200 × 700 × 25 mm')
    await expect(top).toContainText('1212 × 722 × 28 mm')
    await expect(top).toContainText('Glued panel of 5 boards, 140 mm each')
    await expect(top.locator('td').last()).toHaveText('10.38')

    const apron = row(page, 'A1, A2')
    await expect(apron).toContainText('1060 × 100 × 20 mm')
    await expect(apron).toContainText('1120 × 100 × 20 mm')
    await expect(apron).toContainText('+30 mm length: Tenon into the front left leg')
    await expect(apron.locator('td').last()).toHaveText('2.28')

    await expect(outputs(page).getByRole('table', { name: 'Lumber by species' }).locator('tr', { hasText: 'Walnut' })).toContainText('10.38 bf')
    await expect(outputs(page).getByRole('table', { name: 'Hardware' }).locator('tr', { hasText: 'Tabletop fastener' })).toContainText('8')
    await expect(outputs(page).locator('.cut-list-total')).toContainText('$186.13')
    await expect(outputs(page).getByRole('region', { name: 'Cut list assumptions' })).toContainText('Board feet are measured on rough volume')

    await outputs(page).getByRole('tab', { name: 'Cut list' }).click()
    await expect(outputs(page).getByRole('tabpanel')).toHaveCount(0)
  })

  test('sheet goods are labelled as an estimate', async ({ page }) => {
    await createFrom(page, /Bookcase/)
    await outputs(page).getByRole('tab', { name: 'Cut list' }).click()
    const sheets = outputs(page).getByRole('table', { name: 'Sheet goods (estimate)' })
    await expect(sheets.locator('tr', { hasText: 'Birch plywood 18 mm' })).toContainText('1 sheet (estimate)')
    await expect(row(page, 'Back')).toContainText('Sheet')
    await expect(outputs(page).getByRole('region', { name: 'Cut list assumptions' })).toContainText('Sheet counts are an estimate')
  })

  test('the cut list follows a parameter change', async ({ page }) => {
    await createFrom(page, /Basic table/)
    await outputs(page).getByRole('tab', { name: 'Cut list' }).click()
    await page.getByRole('tab', { name: 'Parameters' }).click()
    const width = page.locator('.parameter-row', { has: page.locator('input[value="width"]') }).getByRole('textbox', { name: /^Value/ })
    await width.fill('1500')
    await width.press('Enter')
    await expect(row(page, 'Walnut')).toContainText('1500 × 700 × 25 mm')
  })

  test('the build steps tab lists steps with irreversible markers', async ({ page }) => {
    await createFrom(page, /Basic table/)
    await outputs(page).getByRole('tab', { name: 'Build steps' }).click()
    const panel = outputs(page).getByRole('tabpanel')
    await expect(panel.locator('.furniture-steps-summary')).toContainText(/\d+ steps in \d+ phases, \d+ irreversible/)
    await expect(panel.locator('.furniture-steps-check')).toHaveText('Plan check passed.')
    await expect(panel.locator('.steps-phase h4').first()).toBeVisible()
    await expect(panel.locator('.steps-step').first()).toBeVisible()
    const marker = panel.locator('.steps-irreversible').first()
    await expect(marker).toContainText('Irreversible')
    await expect(marker.locator('svg')).toBeVisible()
    await expect(panel.locator('.steps-step', { hasText: 'Irreversible' }).first()).toHaveAttribute('data-step-kind', /.+/)
  })

  test('print emulation shows the cover, drawings, cut list, and steps in place of the designer', async ({ page }) => {
    await createFrom(page, /Basic table/)
    await outputs(page).getByRole('tab', { name: 'Build steps' }).click()
    const revision = (await outputs(page).locator('.furniture-steps-revision').innerText()).replace('Plan revision ', '')
    expect(revision).not.toBe('')

    const sheet = page.getByRole('article', { name: 'Printable build sheet' })
    await expect(sheet).toBeHidden()
    await page.emulateMedia({ media: 'print' })
    await expect(sheet).toBeVisible()
    await expect(page.locator('.furniture-header')).toBeHidden()
    await expect(page.locator('.furniture-body')).toBeHidden()
    await expect(page.locator('.furniture-bottom')).toBeHidden()

    const cover = sheet.locator('.furniture-print-cover')
    await expect(cover.getByRole('heading', { level: 1 })).toHaveText('Basic table')
    await expect(cover).toContainText('1200 × 700 × 750 mm')
    await expect(cover).toContainText('Millimeters')
    await expect(cover.locator('div', { has: page.getByText('Plan revision') }).locator('dd')).toHaveText(revision)

    const drawings = sheet.getByRole('region', { name: 'Drawings' })
    for (const title of ['Front', 'Side', 'Top', 'Isometric']) await expect(drawings.locator('figcaption', { hasText: title })).toBeVisible()
    await expect(drawings.locator('svg')).toHaveCount(4)
    for (const box of await drawings.locator('svg').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height))) expect(box).toBeGreaterThan(100)

    const cutList = sheet.getByRole('region', { name: 'Cut list' })
    await expect(cutList.locator('tr', { hasText: 'Walnut' }).first()).toContainText('1212 × 722 × 28 mm')
    await expect(cutList.getByRole('table', { name: 'Hardware' })).toContainText('Tabletop fastener')
    const steps = sheet.getByRole('region', { name: 'Build steps' })
    await expect(steps.locator('.steps-step').first()).toBeVisible()
    await expect(steps.locator('.steps-irreversible').first()).toBeVisible()
  })

  test('the Print button asks the browser to print', async ({ page }) => {
    await createFrom(page, /Basic table/)
    await page.evaluate(() => { (window as unknown as { printed: number }).printed = 0; window.print = () => { (window as unknown as { printed: number }).printed += 1 } })
    await outputs(page).getByRole('button', { name: 'Print' }).click()
    expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1)
  })

  test('imperial display converts every length, in the tab and on the cover', async ({ page }) => {
    await createFrom(page, /Basic table/)
    await page.getByRole('button', { name: /Preston/ }).click()
    await outputs(page).getByRole('tab', { name: 'Cut list' }).click()
    const top = row(page, 'Walnut')
    await expect(top).toContainText('47 1/4 × 27 9/16')
    await expect(top).toContainText('in')
    await expect(top).not.toContainText('mm')
    await expect(row(page, 'A1, A2')).toContainText('+1 3/16 in length')
    await expect(outputs(page).getByRole('region', { name: 'Cut list assumptions' })).not.toContainText(' mm')

    await page.emulateMedia({ media: 'print' })
    const cover = page.locator('.furniture-print-cover')
    await expect(cover).toContainText('29 17/32')
    await expect(cover).toContainText('Inches')
    await expect(cover).not.toContainText('mm')
  })
})
