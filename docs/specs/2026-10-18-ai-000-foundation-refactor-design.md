# AI-000 Foundation Refactor — Design

Date: 2026-10-18. Status: draft for review.
Roadmap: [AI assistant roadmap](../plans/AI_ASSISTANT_ROADMAP.md), the first of six sub-projects (AI-000 to AI-005).

## Purpose

Stabilize the foundation before the AI assistant and sharing work. Today the ways a workspace can
change, the app's screen state, and the import normalizers are concentrated in two large files
(`App.tsx`, `storage.ts`) and one component (`BoardDesigner.tsx`). The later sub-projects need
those pieces as small, pure, reusable modules:

- AI-001's package kinds need per-domain normalizers and a way to open an imported project.
- AI-002's design operations, the AI-003 MCP server, and the AI-004 assistant need workspace
  changes that exist outside React.
- A share link (AI-001) or the assistant (AI-004) needs to open a project the same way a click does.

This is a refactor. **No user-visible behavior changes.**

## Current state

- `src/App.tsx` (539 lines, 37 KB, 22 `useState` calls) holds every workspace change inline:
  create, update, delete, and duplicate for shops, boards, composites, and furniture; the wood
  library (`addWood`, `updateWood`, `deleteWood` with its two guard rules); `updateAllowances` (the
  shop-wide write-through to every board); `updatePricing`; `makeComposite`; `createBoardForPanel`.
  `createBoard` and `createBoardForPanel` each build the same default board.
- The same file holds 10+ loose navigation states (`view`, `activeShop`, `activeBoard`,
  `activeComposite`, `boardsMode`, `boardBackTo`, `activeFurniture`, `furnitureMode`,
  `furnitureFocus`, `furnitureOpens`), synced to browser history with `pushState`/`popstate`. Each
  delete handler does its own "the open project was deleted, pick another" fallback. Undo snapshots
  store `activeShop` and `activeBoard` so undoing a delete re-selects what came back.
- `src/components/BoardDesigner.tsx` writes board edits inline: strip add, update, delete,
  reorder, duplicate pattern, mirror, reverse, and the end-grain settings update that clamps slice
  transforms to the new slice count.
- `src/storage.ts` (506 lines) mixes localStorage IO with every domain's normalizer and the shared
  coercers. `normalizeData` inlines board and strip normalization; the normalizers call
  `createId()` and `new Date()` themselves.

`updatedAt` is stamped in two different places: the furniture and composite updates stamp it in
`App.tsx`, while the board and shop updates stamp it in their components (`BoardDesigner.tsx:92`,
`ShopPlanner.tsx:65`). Every edit is stamped today; only the location differs.

## Design

### 1. Workspace actions

New folder `src/domain/workspace/`, one module per collection:

| Module | Actions |
| --- | --- |
| `boards.ts` | `newBoard`, `createBoard`, `updateBoard`, `deleteBoard`, `createPanelBoard` |
| `composites.ts` | `makeComposite`, `updateComposite` |
| `furniture.ts` | `createFurniture`, `duplicateFurniture`, `updateFurniture`, `deleteFurniture` |
| `shops.ts` | `createShop`, `updateShop`, `deleteShop` |
| `woods.ts` | `addWood`, `updateWood`, `deleteWood`, `woodDeleteBlocker` |
| `settings.ts` | `updateAllowances`, `updatePricing` |
| `context.ts` | `WorkspaceContext` type |

Every action has one shape:

```ts
interface WorkspaceContext { createId: () => string; now: string }
type WorkspaceAction<A> = (data: AtlasData, args: A, ctx: WorkspaceContext) => AtlasData
```

Creating actions also need to say what they created, so the UI can open it. They return
`{ data, id }` instead of bare `AtlasData`.

- **One default board.** `newBoard(ctx, { construction, name, allowances })` is the single source
  of the default board. `createBoard` and `createPanelBoard` both use it. The panel board's rule (it
  inherits the composite's construction) stays in `createPanelBoard`.
- **`updatedAt` in one place.** Every `update*` action stamps `updatedAt = ctx.now`, and the
  components stop stamping. The result is identical, because every edit is already stamped; the
  implementation plan confirms that every caller of `onChange` for boards and shops was already
  stamping before removing it from the component.
- **Guard rules are pure.** `woodDeleteBlocker(data, id)` returns `'last-wood' | 'in-use' | null`.
  The UI keeps its `alert` and `confirm` prompts and maps each blocker to its existing message.
  Delete actions never prompt.
- **Template creation.** `createFurniture` takes a template id and values. `remapMissingSpecies`
  stays where it is (`furniture/project.ts`) and is called from the action.
- **Board editing.** New `src/domain/boardEditing.ts` (mirroring `furniture/editing.ts`):
  `addStrip`, `updateStrip`, `deleteStrip`, `reorderStrips`, `duplicatePattern`, `mirrorPattern`,
  `reverseStrips`, `updateEndGrain` (merges the patch, then clamps slice transforms to the new
  slice count with the existing `clampTransforms`), and the slice-row edits `setRowPattern` and
  `cycleSliceRow`. Each is
  `(project: BoardProject, args, ctx) => BoardProject`. The existing pattern helpers in
  `boardPatterns.ts` stay where they are.
- **The UI stays thin.** `App.tsx` handlers become one-liners:
  `commitData(d => updateBoard(d, project, ctx()))`, followed by a navigation action where the
  screen should change.

Out of scope: edits inside a shop (shop fields, drag) and inside a furniture project (parameter and
settings panels). Shops are outside the AI roadmap, and AI-002 covers furniture edits.

### 2. Navigation reducer

New `src/navigation.ts`, pure and unit-tested:

```ts
interface NavState {
  view: View
  activeShop: string
  activeBoard: string
  activeComposite: string
  boardsMode: 'gallery' | 'board' | 'composite'
  boardBackTo: 'gallery' | 'composite'
  activeFurniture: string
  furnitureMode: 'gallery' | 'designer'
  furnitureFocus: string | undefined
  furnitureOpens: number
}
```

Named actions replace direct setter calls: `goTo(view)`, `browseBoards`, `browseFurniture`,
`openShop`, `selectShop`, `selectBoard`, `openBoard`, `editPanelBoard`, `openComposite`,
`boardBack`, `compositeBack`, `openFurniture(id, focusId?)`, `furnitureBack`,
`projectRemoved(kind, id, remainingIds)`, `restoreSelection(activeShop, activeBoard)` (undo, redo,
and "Undo import"), `backupImported(activeShop, activeBoard)` (after a backup import), and
`restoreFromHistory(state)` (browser Back and Forward).

- **One fallback rule.** `projectRemoved` holds the "the open project was deleted" behavior that
  each delete handler repeats today: a deleted shop or board selects the first remaining one, and a
  deleted furniture project returns to the furniture gallery.
- **Browser history.** A `useNavigationHistory(nav, dispatch)` hook takes over the existing
  `pushState`/`popstate` effects. It serializes exactly the fields serialized today, so Back and
  Forward behave as they do now.
- **Undo selection.** The undo snapshot keeps its current shape: data plus `activeShop` and
  `activeBoard`, read from `NavState`. Undo and redo restore them through `restoreSelection`. Widening the snapshot to all of `NavState` would change undo behavior, so it is out of
  scope.
- `App.tsx` holds `useReducer(navigate, initialNav(data))` in place of the ten states.

### 3. Normalizer split

New folder `src/normalize/`:

| Module | Contents |
| --- | --- |
| `coerce.ts` | `records`, `isRecord`, `stringValue`, `finiteNumber`, `signedFinite`, `nonNegativeFinite`, `validColor`. Each documented once, including which coercer to use for signed values. |
| `context.ts` | `NormalizeContext { createId: () => string; now: string }`. |
| `woods.ts` | `normalizeWood`, the default species fallback, and placeholder species for missing ids. |
| `settings.ts` | `normalizeAllowances` (including the `drumSanding` migration), `normalizePricing`. |
| `boards.ts` | `normalizeBoard` (strips, end grain), extracted from `normalizeData`. |
| `composites.ts` | `normalizeComposite` with rows, wafers, cells, and cuts, and the legacy-panel migration that creates boards. |
| `shops.ts` | `normalizeShop`, `normalizeBlockedZone`. |

- **`normalizeData` stays the one funnel**, in `storage.ts`, and keeps its signature. It runs
  `migrate`, then calls the domain normalizers in the current order, which is load-bearing: woods,
  then allowances, then boards, then composites (they read the boards list and may append migrated
  boards), then furniture (existing `normalizeFurnitureProject`), then shops and pricing.
- **Ids and timestamps come from the context.** `normalizeData` builds a default context from
  `createId` and the current time, so callers do not change. The domain normalizers no longer call
  the clock or the id factory themselves.
- **`storage.ts` keeps** localStorage load and save, corrupt-data recovery, `importData` and its
  warnings, the pre-import snapshot, onboarding, and sketch storage.
- `normalizePricing` is exported today; `storage.ts` re-exports it from `normalize/settings.ts` so
  its importers do not change.

## Delivery

Three PRs to `develop`, in this order, each green on its own and revertible on its own:

1. **Normalizer split.** It has the strongest existing tests (`storage.test.ts`, migration
   fixtures), and AI-001 depends on it first.
2. **Workspace actions and board editing.**
3. **Navigation reducer.** It is last because it touches the most `App.tsx` wiring, and by then the
   handlers it rewires are already one-liners.

## Guardrails

- **No behavior change.** All unit tests, the golden plans in `tests/__golden__/`, and both e2e
  projects (desktop and tablet) pass at every commit. Existing tests change only their import paths.
- **Coverage.** `src/normalize/**` and `src/navigation.ts` join the coverage include list in
  `vite.config.ts` (`src/domain/workspace/**` and `boardEditing.ts` are already covered by
  `src/domain/**`). Thresholds stay as they are and stay green.
- **Tests per module.** Each new module gets a sibling test file. Workspace actions are tested with
  a fixed `WorkspaceContext` (deterministic ids and time). The navigation reducer is tested per
  action, including every `projectRemoved` case and a serialize-then-restore round trip.
- **Bugs found are logged, not fixed.** Anything that would change behavior goes into `TODO.md`
  under a new AI-000 heading for a separate fix.
- **Comments.** One-line why comments only; the rationale lives in this spec.

## Testing

- `tests/normalize*.test.ts` (flat, like the existing `tests/furniture*.test.ts`): each domain normalizer on valid, legacy, and malformed input, and
  each coercer's sign and NaN behavior. Existing `storage.test.ts` keeps passing as the end-to-end
  check of `normalizeData`.
- `tests/workspace*.test.ts`: every action, including that `updateAllowances` writes through to
  every board, `duplicateFurniture` keeps internal ids, `createPanelBoard` inherits construction,
  `deleteWood` blockers, and `updatedAt` stamping from the context.
- `tests/boardEditing.test.ts`: strip edits and `updateEndGrain` clamping when the slice count
  shrinks.
- `tests/navigation.test.ts`: every action, the fallback rules, and history serialization.
- E2E: the existing suite is the regression net (board, composite, furniture, back button, undo).
  No new e2e specs are required.

## Out of scope

- Moving the backup and package import or export flows out of `App.tsx`. AI-001 rewrites them.
- Edits inside shops and inside furniture projects (AI-002 covers furniture).
- Widening the undo snapshot to the full navigation state.
- Any URL-based routing beyond the existing history sync.
