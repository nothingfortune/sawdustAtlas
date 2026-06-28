# PLAT-008 Slice 1: Visible Focus + Accessible Overlays — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the app a consistent visible focus ring and make the three newest overlays keyboard-dismissable + focus-managed.

**Architecture:** One global `:focus-visible` rule in `styles.css`; reuse the existing `useModalDialog` hook for the welcome/import dialogs; extract the warning dropdown's open menu into a small component that uses the same hook.

**Tech Stack:** React 19 + TypeScript, Vite, Playwright e2e. Spec: `docs/superpowers/specs/2026-06-28-plat-008-focus-overlays-design.md`.

## Global Constraints

- Strict TypeScript (`tsconfig.base.json`): unchecked-index + exact-optional; bracket-access for index signatures.
- No new dependencies.
- Canvas keyboard ops (shop nudge, slice cycle) already exist — do not re-add.
- Out of scope: touch hit-targets, full a11y audit, portrait.

---

### Task 1: Global visible-focus ring

**Files:**
- Modify: `src/styles.css` (near the top `:root`/base rules).

- [ ] **Step 1: Add the focus-ring variable and rule.** After the `:root { ... }` declaration near the top of `styles.css`, add:

```css
:root { --focus-ring: #1c6fb0; }
:where(button, a, input, select, textarea, [tabindex], [role="button"]):focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
```

- [ ] **Step 2: Verify build/lint.** Run: `pnpm lint && pnpm build` — Expected: pass.

- [ ] **Step 3: Commit.**
```bash
git add src/styles.css
git commit -m "feat(a11y): app-wide visible focus ring"
```

---

### Task 2: Focus-trap + Escape for the welcome and import dialogs

**Files:**
- Modify: `src/App.tsx` (`WelcomeDialog`, `ImportSummaryDialog`, and the `useModalDialog` import).

**Interfaces:**
- Consumes: `useModalDialog<T>(onClose) => RefObject<T>` from `./components/useModalDialog` (focuses ref on open, Escape calls onClose, traps Tab, restores focus on unmount).

- [ ] **Step 1: Import the hook.** Add to `src/App.tsx` imports:
```ts
import { useModalDialog } from './components/useModalDialog'
```

- [ ] **Step 2: Wire `ImportSummaryDialog`.** Inside the component, before the return, add the ref; attach it with `tabIndex={-1}` to the `.import-dialog` div:
```tsx
const dialogRef = useModalDialog<HTMLDivElement>(onClose)
// ...
<div ref={dialogRef} tabIndex={-1} className="import-dialog" role="dialog" aria-modal="true" aria-label={ok ? 'Import summary' : 'Import failed'}>
```

- [ ] **Step 3: Wire `WelcomeDialog`.** Same pattern on the `.welcome-dialog` div:
```tsx
const dialogRef = useModalDialog<HTMLDivElement>(onClose)
// ...
<div ref={dialogRef} tabIndex={-1} className="welcome-dialog" role="dialog" aria-modal="true" aria-label="Welcome to SawdustAtlas">
```

- [ ] **Step 4: Verify.** Run: `pnpm typecheck && pnpm lint` — Expected: pass.

- [ ] **Step 5: Commit.**
```bash
git add src/App.tsx
git commit -m "feat(a11y): focus-trap + Escape on welcome and import dialogs"
```

---

### Task 3: Escape + focus for the warning-center dropdown

**Files:**
- Modify: `src/App.tsx` (`WarningCenter` — extract the open menu so the hook can run on mount).

**Interfaces:**
- Consumes: `useModalDialog` (as Task 2). Produces: a local `WarningMenu` component used only by `WarningCenter`.

- [ ] **Step 1: Extract the open menu into a component that uses the hook.** Replace the inline `{open && <>…menu…</>}` in `WarningCenter` with a `<WarningMenu …/>` rendered when `open`, and define:
```tsx
function WarningMenu({ warnings, onNavigate, onClose }: { warnings: WorkspaceWarning[], onNavigate: (location?: WarningLocation) => void, onClose: () => void }) {
  const menuRef = useModalDialog<HTMLDivElement>(onClose)
  return <>
    <div className="warning-scrim" role="presentation" onClick={onClose} />
    <div ref={menuRef} tabIndex={-1} className="warning-menu" role="menu" aria-label="Workspace issues">
      <div className="warning-menu-head">{warnings.length} issue{warnings.length === 1 ? '' : 's'} to review</div>
      {warnings.map(warning => <button key={warning.id} role="menuitem" className={`warning-row ${warning.severity}`} disabled={!warning.location} onClick={() => { onNavigate(warning.location); onClose() }}>
        <TriangleAlert size={13} /><span>{warning.message}</span>
      </button>)}
    </div>
  </>
}
```
And in `WarningCenter`: `{open && <WarningMenu warnings={warnings} onNavigate={onNavigate} onClose={() => setOpen(false)} />}`.

- [ ] **Step 2: Verify.** Run: `pnpm typecheck && pnpm lint` — Expected: pass.

- [ ] **Step 3: Commit.**
```bash
git add src/App.tsx
git commit -m "feat(a11y): Escape + focus management for the warning dropdown"
```

---

### Task 4: e2e — Escape closes all three overlays

**Files:**
- Create: `e2e/a11y.spec.ts`

- [ ] **Step 1: Write the spec.**
```ts
import { test, expect } from '@playwright/test'

test.describe('overlay keyboard dismissal (PLAT-008)', () => {
  test('Escape closes the first-run welcome', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.welcome-dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.welcome-dialog')).toHaveCount(0)
  })

  test('Escape closes the warning dropdown', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('sawdust-atlas:onboarded', '1')
      window.localStorage.setItem('sawdust-atlas:v1', JSON.stringify({
        schemaVersion: 2, shops: [],
        boards: [{ id: 'bad', name: 'Bad', construction: 'end', thickness: 20, strips: [{ id: 's', speciesId: 'walnut', width: 10, trailingAngle: -45 }], endGrain: { sourceLength: 900, stockThickness: 20, sliceThickness: 45, kerf: 3.2, trimAllowance: 20, rowFlips: [], rowRotations: [] } }],
      }))
    })
    await page.goto('/')
    await page.locator('.warning-pill').click()
    await expect(page.locator('.warning-menu')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.warning-menu')).toHaveCount(0)
  })

  test('Escape closes the import summary dialog', async ({ page }) => {
    await page.addInitScript(() => { window.localStorage.clear(); window.localStorage.setItem('sawdust-atlas:onboarded', '1') })
    await page.goto('/')
    page.on('dialog', d => { void d.accept() })
    await page.locator('input[type=file]').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ schemaVersion: 2, shops: [], boards: [] })) })
    await expect(page.locator('.import-dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.import-dialog')).toHaveCount(0)
  })
})
```

- [ ] **Step 2: Run e2e.** Run: `pnpm exec playwright test e2e/a11y.spec.ts` — Expected: 3 passed.

- [ ] **Step 3: Full suite + checks.** Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm exec playwright test` — Expected: all pass.

- [ ] **Step 4: Commit.**
```bash
git add e2e/a11y.spec.ts
git commit -m "test(a11y): Escape closes welcome, import, and warning overlays"
```

---

## Self-Review

- **Spec coverage:** focus ring → Task 1; welcome/import focus+Escape → Task 2; warning dropdown Escape+focus → Task 3; Escape e2e → Task 4. All spec goals covered.
- **Placeholders:** none — every step has concrete code/commands.
- **Type consistency:** `WarningMenu` props (`warnings`, `onNavigate`, `onClose`) match `WorkspaceWarning` / `WarningLocation` already used by `WarningCenter`; `useModalDialog<HTMLDivElement>` matches its definition.
