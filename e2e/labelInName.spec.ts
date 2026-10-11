import { expect, test } from '@playwright/test'

// WCAG 2.5.3 (label in name): when a control has an aria-label, it must contain the
// text the control shows, or a voice-control user saying the visible label cannot
// activate it. SVG content (drawings, scale bars) is not part of the visible label.
async function mismatches(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    const visibleText = (el: Element): string => [...el.childNodes].map(node => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
      if (node instanceof SVGElement || !(node instanceof HTMLElement)) return ''
      return getComputedStyle(node).display === 'none' ? '' : visibleText(node)
    }).join(' ')
    return [...document.querySelectorAll('button[aria-label], [role="button"][aria-label], a[aria-label]')].flatMap(el => {
      const text = norm(visibleText(el))
      const label = norm(el.getAttribute('aria-label') ?? '')
      return text && !label.includes(text) ? [`"${text}" is not in "${label}"`] : []
    })
  })
}

test('every labelled control includes its visible text in its accessible name', async ({ page }) => {
  await page.goto('/')
  const welcome = page.getByRole('button', { name: 'Got it' })
  if (await welcome.isVisible()) await welcome.click()
  expect(await mismatches(page)).toEqual([])

  for (const view of ['Workshop layout', 'Cutting boards', 'Wood library', 'Geometry', 'Milling allowances', 'Pricing']) {
    await page.getByRole('button', { name: view, exact: true }).click()
    expect(await mismatches(page), view).toEqual([])
  }

  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await page.getByRole('button', { name: 'Open board sample' }).click()
  expect(await mismatches(page), 'board designer').toEqual([])
  await page.getByRole('button', { name: /^Preston/ }).click()
  expect(await mismatches(page), 'board designer in imperial').toEqual([])
  await page.getByRole('button', { name: /^Make composite/ }).click()
  expect(await mismatches(page), 'composite designer').toEqual([])
})
