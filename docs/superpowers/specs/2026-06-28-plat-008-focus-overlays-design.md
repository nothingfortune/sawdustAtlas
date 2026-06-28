# PLAT-008 (slice 1): Visible focus + accessible overlays — Design

Date: 2026-06-28
Plan items: `PLAT-008` (accessible keyboard operation), supports `UX-002`.

## Problem

Keyboard and assistive-tech users can operate much of the app, but two gaps make it
unreliable:

1. **No app-wide visible focus.** There is no global `:focus-visible` styling, so when
   tabbing through nav, buttons, inputs, cards, and the canvas `role="button"` elements,
   there is no consistent indication of where focus is. The product plan calls this out
   directly ("all canvas operations need keyboard equivalents and **visible focus
   states**").
2. **Overlays added recently are not keyboard-dismissable or focus-managed.** The
   first-run `WelcomeDialog`, the `ImportSummaryDialog`, and the warning-center dropdown
   trap neither focus nor handle `Escape`, unlike the board-designer modals which already
   use the `useModalDialog` hook.

This is the first, highest-leverage slice of `PLAT-008`. It is bounded and improves every
screen.

## Current state (what already works — do not redo)

- Shop objects and blocked zones: `role="button"`, `tabIndex={0}`, `aria-label`,
  Enter/Space to select, and **arrow-key nudge** (10 mm, 100 mm with Shift, clamped to the
  room). See `ShopPlanner.onObjectKeyDown` / `onZoneKeyDown`.
- Board slices: `role="button"`, Enter/Space to cycle rotate/flip.
- Board-designer modals (`PreviewPopout`, `PatternPreviewDialog`) already use
  `useModalDialog` (focus trap + Escape + initial focus).
- Some coarse-pointer (`@media (pointer: coarse)`) sizing exists for the preview studio.

## Goals (this slice)

- A single, consistent **visible focus ring** on all interactive elements across light
  (paper) and dark (sidebar) backgrounds.
- The three new overlays gain **focus management + Escape**:
  - `WelcomeDialog` and `ImportSummaryDialog` adopt `useModalDialog` (focus trap, initial
    focus, Escape closes).
  - The warning-center dropdown closes on Escape and returns focus to its trigger.

## Non-goals (later PLAT-008 / UX-002 slices)

- Full WCAG audit, ARIA roles beyond what exists, screen-reader narration tuning.
- Touch hit-target sizing pass and long-press alternatives (UX-002).
- Portrait layout verification (UX-003).
- New keyboard *operations* (the canvas already nudges/cycles); this slice is about
  visibility and overlay dismissal, not adding commands.

## Design

### 1. Global visible focus

Add one focus-ring rule set in `styles.css`, driven by a CSS variable so the color is
centralized and tweakable:

```css
:root { --focus-ring: #1c6fb0; } /* high-contrast on both paper and the dark sidebar */
:where(button, a, input, select, textarea, [tabindex], [role="button"]):focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
```

- Uses `:focus-visible` so the ring shows for keyboard/AT focus but not on mouse click.
- `:where(...)` keeps specificity at 0 so existing component styles still win where needed.
- The canvas elements (`.shop-object`, `.blocked-zone`, board `.slice[role=button]`) are
  covered by the `[role="button"]` selector. `.shop-object.selected` keeps its orange
  *selection* outline (distinct meaning from focus); the blue focus ring layers on top
  when focused, so "selected" and "focused" remain visually distinguishable.
- The dark sidebar: a blue ring at 2 px offset reads clearly on `#19261e`; on the cream
  paper it is equally clear. One color works on both.

### 2. Accessible overlays

- **`WelcomeDialog`, `ImportSummaryDialog`** (in `App.tsx`): adopt `useModalDialog`
  exactly as the board-designer modals do — `const ref = useModalDialog<HTMLDivElement>(onClose)`,
  attach `ref` + `tabIndex={-1}` to the dialog box. This gives Escape-to-close, focus trap,
  and initial focus, with no behavior change for mouse users (scrim click-to-close stays).
- **Warning-center dropdown** (`WarningCenter` in `App.tsx`): add an Escape handler that
  closes the menu (it already closes on outside click via the scrim). Move keyboard focus
  into the menu on open and restore focus to the trigger button on close. Keep it a
  lightweight dropdown (not a full modal) since it is non-blocking.

## Testing

- **e2e** (`e2e/a11y.spec.ts`): Escape closes the first-run welcome, the import summary
  dialog, and the warning-center dropdown.
- Existing e2e for those overlays (open/click flows) must continue to pass.
- The focus ring itself is visual; covered by the CSS rule + manual/visual check (a unit
  test for CSS is not meaningful). A smoke assertion that a focused control has a
  non-`none` outline may be added if cheap.

## Files touched

- `src/styles.css` — focus-ring variable + `:focus-visible` rule.
- `src/App.tsx` — `useModalDialog` on the two dialogs; Escape/focus on the warning dropdown.
- `e2e/a11y.spec.ts` — new Escape-to-close coverage.

## Risks

- A global focus outline can look heavy if it lands on elements with their own focus
  styling; mitigated by `:focus-visible` (keyboard-only) and `:where()` (low specificity,
  easy to override per-component if a clash appears).
