# Instruction Platform: Design Spec (Wave 1)

**Status:** Approved for implementation (wave 1)
**Date:** 2026-10-10
**Scope:** Strategy Phases 0 and 1 for cutting boards (edge grain, end grain, composite), the build-run and readiness domain, and the platform fixes that the bench depends on. Furniture is excluded.

## Sources

This spec turns four Notion documents into buildable work:

- **Holistic strategy** (`sawdust-atlas-holistic-strategy`, 2026-09-27): the product thesis, the shared `InstructionPlan`, the phased roadmap, and the guardrails.
- **Stress test** (2026-10-05): 12 conceptual and 12 UI-flow findings (C1 to C12, F1 to F12) and nine decisions (D1 to D9).
- **Hosting options** (2026-10-05, addendum 2026-10-06): a public static HTTPS host, browser storage on each device, project package files for handoff between devices, bundled fonts, and Docker kept as a secondary path.
- **Rebuild assessment** (2026-10-10): port the calculation engines unchanged, rebuild the application spine, slices R0 to R4, and decisions RB1 to RB4.

Finding and decision ids (C4, F7, D5, RB1, and so on) refer to those documents.

## Summary

Sawdust Atlas becomes a planning and execution system: design a board, prove it is buildable, and follow trustworthy instructions at the bench or on paper. The foundation is one semantic `InstructionPlan` that every project domain emits and every surface consumes.

Wave 1 builds that foundation as pure, tested domain code, plus the platform fixes the bench needs (per-project handoff, a secure-connection notice, bundled fonts, static-host config). Wave 1 changes the UI in only three places: composite warnings in the warning center, project export and import buttons, and a read-only build-steps preview in the board designer. The tablet step runner, print products, and the Design, Plan, and Build modes come in waves 2 and 3, once wave 1's contracts have been proven against real boards.

## Decisions

### Adopted

These are the recommended defaults from the source documents, adopted for wave 1.

| Id | Decision | What it means for this spec |
| --- | --- | --- |
| D1 | Single device for build mode v1, plus a per-project package that merges on import | Project package (F1 to F2 in the plan). Shared LAN persistence stays deferred. |
| D2 | HTTPS is a stated prerequisite for full bench mode, detected and explained in the UI | Connection notice (G2). |
| D3 | Readiness v1 is a required list with per-line attestation; untracked dimensions show Not Tracked | `readiness.ts`. No stock inventory in wave 1. |
| D4 | Design, Plan, and Build are modes of one project with a persistent readiness strip | Wave 2. Wave 1 places the steps preview inside the existing designer. |
| D5 | Hard block on design and plan errors only; acknowledged soft gate for material and tool gaps | `StartGate` in `readiness.ts`. |
| D6 | Record the actual and flag downstream steps that consume it | `actuals.ts` verify-first flags. Recomputing the plan from actuals is deferred. |
| D7 | No photos in v1 | No blob store. Notes only. |
| D8 | Two print products (Bench Sheet, Step Manual) on a paginated layout model, browser print as transport | Waves 2 and 3. No PDF library. |
| D9 | Phases 0 to 2 come before the shared cut planner, with cut-plan types defined alongside the instruction contracts | Contracts carry `CutRef` and `StockLine`. CUT-001 extends them, not a parallel vocabulary. |
| Hosting | Public static web app over HTTPS, data in the browser, project packages for handoff, Docker as a secondary path | Fonts bundled (G1), static-host headers (G3). Choosing the host account and domain stays with the maintainer. |

### Departure: the spine is rebuilt in place

The rebuild assessment says to rebuild the spine (state, storage, navigation, data model) and port the engines with their tests unchanged. This spec does that **in place, one small PR at a time**, not in a new repository. The assessment's own proof test (every ported domain test passes) is then true continuously instead of only at the end of R0, every PR can be reviewed and reverted on its own, and the friend beta keeps working throughout. New modules go in new directories. Old modules are replaced only when their replacement is merged and proven.

### Open (not acted on in wave 1)

| Id | Decision | Status |
| --- | --- | --- |
| RB1 | Floor planner and geometry calculator leave the first rebuilt release | Needs Alex's confirmation. Wave 1 removes nothing. |
| RB2 | Markup and labor pricing become an opt-in seller setting | Open. Pricing is untouched in wave 1. |
| RB3 | Brick-and-mortar returns after the reusable-wafer decision (BOARD-020) | Open. |
| RB4 | Amend the strategy page with the shell replacement and composites | Recommended. This spec records both. |
| License | PolyForm Noncommercial and woodworkers who sell their work | A flag from the hosting addendum, not settled here. |

## Primary User

The owner-builder: one woodworker who designs a project and builds it themselves (C10). The readiness pattern from Rebrickable is kept; its discovery and marketplace patterns are dropped. Estimated time, when shown, derives from the pricing tier hours rather than an invented difficulty rating.

## Architecture

```text
BoardProject ──────┐
CompositeBoard ────┼─→ generator ─→ InstructionPlan ─┬─→ validator (independent)
(furniture later) ─┘                                 ├─→ readiness + start gate
                                                     ├─→ build run (frozen copy)
                                                     ├─→ steps preview (wave 1)
                                                     └─→ tablet runner, print (waves 2 to 3)
```

New boundaries. All are pure, framework-free, deterministic, and unit-tested, except the two `components/` entries.

```text
src/domain/instructions/
├── types.ts               contracts (merged first)
├── tolerances.ts          default tolerances, glue clamp time (assumptions)
├── revisions.ts           plan content hash
├── graph.ts               dependency graph and step availability
├── validate.ts            independent plan validator
├── readiness.ts           readiness chips and start gate
├── lifecycle.ts           project lifecycle transitions
├── boardMarking.ts        physical part marks (strips, slices, panel, board)
├── boardInstructions.ts   edge- and end-grain generator
└── compositeInstructions.ts  composite generator

src/domain/buildRuns/
├── types.ts               contracts (merged first)
├── progress.ts            start, complete, undo, batch, waits, pause, resume
├── actuals.ts             measurements, problems, verify-first flags
└── resume.ts              bench inventory and resume summary

src/projectPackage.ts      per-project export and merge-import (beside storage.ts)
src/components/instructions/PlanStepList.tsx   read-only steps preview
```

## Contract Rules

The contracts live in `src/domain/instructions/types.ts` and `src/domain/buildRuns/types.ts`, and the hand-built fixtures in `tests/fixtures/instructionPlans.ts`. Every producer and consumer relies on these rules.

1. **Millimeters at full precision.** No rounding in the domain. Display rounding stays in `lengthUnits.ts`.
2. **Stable keys** (C6). Step, part, phase, and assembly keys derive from source identity (strip id, panel id, rip-group identity), never from a list position. Regenerating a plan for an unchanged design yields identical keys. Legacy positional ids (`rip-1`, `stock-1`) appear only as `CutRef.id`, as references back to the legacy cut list.
3. **Parts change state by consumption.** A transformation consumes its input part and outputs a new part with a new key (`stock:walnut` becomes `stock:walnut/milled`). `consumed: false` is only for parts used but physically unchanged. Bench inventory is therefore produced minus consumed, with no special cases. A part key never appears in both the inputs and the outputs of one step.
4. **Stock enters through a step.** Stock parts are outputs of a `select-stock` (or `acquire`) step with no inputs. Every step input is produced by one of that step's transitive prerequisites.
5. **No dimension in prose** (C4 exit). Titles and instructions carry no number followed by a unit (`mm`, `cm`, `in`, `"`, `°`, `deg`). Dimensions live in measurements, setup values, and part dimensions, so imperial display is a rendering concern and `convertMetricText` can retire.
6. **Assumptions are labelled.** A value not taken from the design (default tolerances, glue clamp time, kerf defaults) is tagged `source: 'assumption'`.
7. **Irreversible steps carry a check.** Kinds in `IRREVERSIBLE_KINDS` set `irreversible: true` and have a `verify-before` measurement or a critical checklist item.
8. **Batches** (C4). One machine setup repeated N times is one step with `batch.count = N`, not N steps.
9. **Wait is a step** (F4). Glue cure is a `wait` step with `minimumMinutes`. Timers are timestamps, never countdowns (F8).
10. **One warning model** (F11). `PlanWarning` has the same severity and location shape as `WorkspaceWarning`.
11. **Snapshot-on-start** (C6). A `BuildRun` embeds a frozen copy of its plan. Build-run state never enters the undoable design workspace.
12. **The clock is an input.** Domain functions take timestamps (`at`, `now`) as ISO strings and never read the clock.

## Module Specs

### `graph.ts`: dependency graph and availability

```ts
export function findCycle(steps: readonly InstructionStep[]): string[] | null
export function topologicalOrder(steps: readonly InstructionStep[]): { order: string[]; cycle: string[] | null }
export function prerequisitesOf(plan: InstructionPlan, stepKey: string): Set<string>   // transitive, excludes self
export function dependentsOf(plan: InstructionPlan, stepKey: string): Set<string>      // transitive, excludes self
export function producersOf(plan: InstructionPlan, partKey: string): string[]
export function consumersOf(plan: InstructionPlan, partKey: string): string[]          // any input, consumed or not
export interface ProgressView {
  completed: ReadonlySet<string>
  /** Started wait timers by step key. */
  waits: Readonly<Record<string, { readyAt: string }>>
}
export function stepAvailability(plan: InstructionPlan, progress: ProgressView, now: string): Record<string, StepAvailability>
export function nextStep(plan: InstructionPlan, progress: ProgressView, now: string): string | null
```

- `findCycle` and `topologicalOrder` ignore dependencies on unknown keys. Ties in topological order break by `order`, then by key. On a cycle, `order` lists every step not on a cycle and `cycle` lists one cycle's keys in dependency order.
- Availability, evaluated in topological order:
  - `done` when completed.
  - A wait step that is not done: `waiting` while its timer runs (`now < readyAt`), otherwise `available` when every dependency is done, otherwise as below.
  - Any other step that is not done: `available` when every direct dependency is done; `waiting` when every incomplete direct dependency is itself `waiting`; otherwise `blocked`.
- `nextStep` returns the available step with the lowest `order` (the linear default path for simple boards), or null.
- Timestamps compare with `Date.parse`.

### `validate.ts`: the independent validator

`export function validatePlan(plan: InstructionPlan): PlanValidation`. It is independent of every generator: it reads only the plan (plus `IRREVERSIBLE_KINDS` and `planRevision`). `ok` is true when no issue has severity `error`. Issues sort errors first and are otherwise stable. Each rule reports through its `PlanIssueCode`:

| Code | Severity | Rule |
| --- | --- | --- |
| `unsupported-version` | error | `version !== INSTRUCTION_PLAN_VERSION`. |
| `duplicate-key` | error | Duplicate keys among phases, steps, parts, assemblies, stock lines, cut ids, or requirement tools; duplicate measurement or checklist keys within one step; a part key in both the inputs and the outputs of one step. |
| `unknown-phase` | error | `step.phaseKey` is not a phase. |
| `unknown-dependency` | error | A `dependsOn` key is not a step. |
| `self-dependency` | error | A step depends on itself. |
| `dependency-cycle` | error | Reported once, naming the cycle's steps. |
| `order-invalid` | error | `order` is not a positive integer, or is duplicated. |
| `order-violates-dependency` | error | A dependency's `order` is not lower than its dependent's. |
| `unknown-part` | error | An input, output, visual, measurement, stock-line, or assembly part key is not a part. |
| `input-not-available` | error | An input part is not output by any transitive prerequisite of the step. |
| `over-consumed` | error | Total consumed quantity of a part exceeds total produced quantity. |
| `part-never-produced` | error | No step outputs a part. |
| `stock-not-consumed` | error | A stock line's part is never consumed. |
| `unknown-cut` | error | A `step.cutIds` id is not in `requirements.cuts`. |
| `cut-not-covered` | error | A `requirements.cuts` id appears in no step. |
| `missing-output` | error | A step has no outputs, unless its kind is `wait`, `mark`, or `dry-fit`. Those three must have at least one input and may not consume anything. |
| `irreversible-not-flagged` | error | The kind is in `IRREVERSIBLE_KINDS` but `irreversible` is false. |
| `irreversible-without-check` | error | An irreversible step has no `verify-before` measurement and no critical checklist item. |
| `invalid-batch` | error | `batch.count` is not an integer of at least 1, or `unitLabel` is empty. |
| `invalid-measurement` | error | A non-finite target; a tolerance that is negative or not finite; a non-integer target for unit `count`. |
| `invalid-wait` | error | A `wait` step without `wait`, or with `minimumMinutes` that is not finite and positive. A non-wait step carrying `wait` is a warning. |
| `invalid-visual` | warning | A part both highlighted and ghosted; a `camera` on a view other than `scene-3d`. |
| `dimension-in-prose` | error | A title or instruction matches a number followed by a unit (rule 5). |
| `unknown-step` | error | A plan warning's `stepKey` or an assembly's `stepKeys` names no step. |
| `revision-mismatch` | error | `plan.revision !== planRevision(plan)`. |

Tests: both fixtures validate with zero issues. Each rule has at least one failing case made by mutating a fresh fixture, asserting the code and the step or part key. Shuffling the `steps` array does not change the result.

### `readiness.ts`: readiness chips and the start gate

```ts
export interface ReadinessInput {
  plan: InstructionPlan
  validation: PlanValidation
  /** Workspace warnings already filtered to this project by the caller. */
  designWarnings: readonly WorkspaceWarning[]
  attestations: ReadinessAttestations
  decisions?: readonly PendingDecision[]
}
export function computeReadiness(input: ReadinessInput): ProjectReadiness
```

Six chips, always in this order: design, instructions, material, tools, warnings, decisions.

- **Design:** `blocked` on any error in `designWarnings` or among `plan.warnings`; `attention` on warnings in `designWarnings`; otherwise `ready`. Reasons keep their `location`.
- **Instructions:** `blocked` when `validation` has errors; `attention` when it has only warnings; otherwise `ready`. Reasons carry the issue's step key in `stepKeys`.
- **Material:** over `requirements.stock`. No lines means `ready`. Any line attested `need` means `attention`, with one reason per line whose `stepKeys` are the steps consuming that line's part. Otherwise, any line without an attestation means `not-tracked`. Otherwise `ready`. Not Tracked is never shown as satisfied (C3).
- **Tools:** the same, over `requirements.tools`.
- **Warnings:** `attention` when any plan or step warning has severity `warning`, otherwise `ready`.
- **Decisions:** `attention` when any pending decision exists, otherwise `ready`.

Start gate (D5): `hardBlocks` holds the error-severity reasons from design and instructions. `softGaps` holds every material and tool `need` reason, one reason per `not-tracked` dimension, and the warning and decision reasons. `allowed` is true when `hardBlocks` is empty. Summaries are short, human-readable text, such as "Ready", "2 errors", "1 of 3 lines needed", and "Not tracked".

### `lifecycle.ts`: project lifecycle

```ts
export function applyLifecycleEvent(current: ProjectLifecycle, event: LifecycleEvent): { lifecycle: ProjectLifecycle; error?: string }
```

| From | Event | To |
| --- | --- | --- |
| draft | mark-planned | planned |
| draft, planned, complete | build-started | building |
| planned, complete | reopen-design | draft |
| building | build-paused | paused |
| paused | build-resumed | building |
| building | build-completed | complete |
| building, paused | build-abandoned | planned |

Any other pair returns the current state unchanged, plus an `error` naming the event and the state. Readiness is never stored in the lifecycle (C11).

### `boardMarking.ts`: physical part marks (F7)

```ts
export interface StripMark { stripId: string; index: number; label: string; speciesId: string }
export interface SliceMark { physicalIndex: number; position: number; label: string; rotated: boolean; flipped: boolean }
export interface BoardMarks {
  strips: StripMark[]
  panelLabel: string
  slices: SliceMark[]     // end grain only; [] for edge grain
  boardLabel: string
  referenceMark: string   // plain-language reference-face convention
}
export function sliceLetter(index: number): string   // 0 → A, 25 → Z, 26 → AA
export function boardPartMarks(project: BoardProject, metrics?: EndGrainMetrics): BoardMarks
```

- Strips are `S1` to `Sn` in design order. The panel is `P1`; the board is `B1`.
- End-grain slices are lettered `A`, `B`, and onward in physical identity order, the order they come off the panel. `position` is their place in the assembled board, from `endGrain.rowOrder` (identity when absent). `rotated` and `flipped` come from `rowRotations` and `rowFlips`; check `boardSlices.ts` for whether those arrays index by position or by physical slice, and match it exactly.
- The reference mark is a cabinetmaker's triangle drawn across the panel face before crosscutting, so slices keep their order and orientation.

### `boardInstructions.ts`: cutting-board generator (Phase 1)

```ts
export const generateEdgeGrainPlan: InstructionGenerator<BoardProject>
export const generateEndGrainPlan: InstructionGenerator<BoardProject>
export const generateBoardInstructionPlan: InstructionGenerator<BoardProject>   // dispatches on construction
```

This is a new generator that wraps the existing engines (C4). It adds no new geometry.

- **Numbers come from the existing engines:** `calculateEndGrainMetrics`, `calculateBuildDimensions`, `generateCuttingBoardPlan`, `calculateStockRequirements`, `summarizeBenchSetup`, `calculateAngleSetup`, and `boardPartMarks`. Pass the computed `build` and `metrics` through, as the designer pipeline does.
- **Parity (Phase 1 exit):** every legacy `StockRequirement` maps to one `StockLine` with identical quantity, length, width, thickness, and board feet. Every legacy `CutListItem` maps to one `CutRef` (same id, label, stage, quantity) and is covered by at least one step. Legacy warning strings become `PlanWarning`s: end-grain metric errors as `error`, everything else as `warning`, located at `{ view: 'boards', targetId: project.id }`.
- **Stable keys:** stock line keys are `${speciesId}|${length}|${width}|${thickness}|${trailingAngle}`, with parts `stock:<lineKey>` and `stock:<lineKey>/milled`. Strip parts are `strip:<stripId>`. Rip steps are keyed by rip-group identity (species, finished width, angle, rough width), never by index. The panel is `panel:<boardId>`, slices are `slice:<boardId>:<physicalIndex>`, and the board is `board:<boardId>` in each stage it passes through (`board:<boardId>/squared`, and so on). Every key, including phase keys, is prefixed with `context.keyPrefix`.
- **Batches:** one rip step per rip group (one fence setting), with `batch.count` set to the group size. One crosscut step for all slices, with `batch.count = sliceCount`.
- **Measurements and setups:** milled thickness (achieve-after, critical), fence setting (verify-before, critical, source `design`), bevel angle on angled end-grain groups (verify-before, critical, from `calculateAngleSetup`), stop block equal to slice thickness (verify-before, critical), and finished thickness and length (achieve-after). Tolerances are copied from `DEFAULT_TOLERANCES`.
- **Marks:** a `mark` step labels strips after ripping. End grain adds a `mark` step for the reference triangle before crosscutting and one for the slice letters after. Part labels come from `boardPartMarks`.
- **Waits:** a `wait` step after each glue-up, `DEFAULT_GLUE_CLAMP_MINUTES`, source `assumption`.
- **Tools:** every step's tools appear in `requirements.tools`, de-duplicated by key.
- **Composite panels:** with `context.asCompositePanel`, the plan ends at the flattened glued panel, with no final squaring, surfacing, or finish steps. Its cuts are still covered, so any legacy trim `CutRef` is left out of `requirements.cuts`.

Edge-grain sequence, by phase:

| Phase | Steps |
| --- | --- |
| Prepare stock | select stock, mill |
| Rip strips | rip (one step per rip group), mark strips |
| Glue-up | arrange and dry fit, glue and clamp, wait |
| Square and surface | trim length, trim width, surface to thickness, finish |

End-grain sequence, by phase:

| Phase | Steps |
| --- | --- |
| Prepare stock | select stock, mill |
| Rip strips | rip and bevel (one step per rip group), mark strips |
| First glue-up | arrange and dry fit, glue and clamp, wait, flatten panel |
| Crosscut slices | mark reference triangle, crosscut (batch), mark slice letters |
| Final glue-up | turn and arrange (a checklist item per slice giving its position, rotation, and flip), dry fit, glue and clamp, wait |
| Square and surface | square the board, surface to thickness, finish |

Golden fixtures (Phase 0): `tests/fixtures/boards/` holds an edge-grain board (three species, at least six strips) and an end-grain board (at least one angled strip, with `rowOrder`, flips, and rotations set). Their plans are snapshotted with `toMatchFileSnapshot` under `tests/__golden__/`. A test asserts each golden plan validates with zero errors. The golden plans still need hand-verification by Alex against a real build before Phase 2 exits, and the PR must say so.

### `compositeInstructions.ts`: composite generator (C9)

`export const generateCompositeInstructionPlan: InstructionGenerator<CompositeBoard>`

- **Panels:** for each panel, resolve its board from `context.boards`. A missing board becomes an error `PlanWarning` and the panel is skipped. Otherwise, embed the board's plan from `generateBoardInstructionPlan` with `keyPrefix: 'panel:<panelId>/'` and `asCompositePanel: true`. Keep its phases, with titles prefixed by the panel's label (`P1`, `P2` in panel order).
- **Wafers:** per panel, a `mark` step for the reference triangle, then one batch `cut` step (crosscut for axis `x`, rip for axis `y`). The batch count is `panelPieces(panel, boards).length`. Setups are the stop block (`stripWidthMm`, source `design`) and the kerf (`kerfMm`). Wafer parts are `wafer:<panelId>:<pieceIndex>`, labelled `<panelLabel>-<n>`. The cut ref is `wafers:<panelId>`.
- **Assembly:** per row, an `arrange` step (a checklist item per wafer giving its rotation and flip), then a glue-up and a wait, producing `row:<rowId>`. Then a final glue-up of the rows, a wait, and square, surface, and finish producing `board:<compositeId>`.
- **Unplaced wafers** stay in bench inventory as spares. They are not errors.
- **Assemblies:** one per panel and one per row, with the board as parent.
- **Parity:** wafer counts and source lengths match `compositeCutPlan`. `finished` matches `assembledSize`.
- **Golden:** a two-panel composite fixture validates with zero errors and is snapshotted as the third golden plan.

### `PlanStepList.tsx`: read-only steps preview

A collapsed section, "Build steps (preview)", in the board designer, below the existing build content. It replaces nothing. It renders `generateBoardInstructionPlan` with `useMemo`: phases as headings, then each step's order, title, instruction, and kind. It shows:

- An **Irreversible** marker with an icon and text, never color alone.
- The batch count ("× 6 strips").
- Measurements and setup values formatted in the current unit system through `lengthUnits.ts`, with assumption values tagged "(assumption)".
- The output part labels and the step warnings.

It is hidden in print. The existing `BuildSheet` print output is unchanged. An e2e test opens a starter board, expands the section, and sees a rip step and an Irreversible marker.

### `progress.ts`: build-run lifecycle

```ts
export interface StartBuildRunInput {
  id: string
  plan: InstructionPlan
  startedAt: string
  displayUnits: 'metric' | 'imperial'
  acknowledgedGaps?: AcknowledgedGap[]
}
export function startBuildRun(input: StartBuildRunInput): BuildRun
export function buildRunAvailability(run: BuildRun, now: string): Record<string, StepAvailability>
export function completeStep(run: BuildRun, stepKey: string, at: string): BuildRunResult
export function advanceBatch(run: BuildRun, stepKey: string, at: string): BuildRunResult
export function undoLastCompletion(run: BuildRun, at: string): BuildRunResult
export function startWait(run: BuildRun, stepKey: string, at: string): BuildRunResult
export function setChecklistItem(run: BuildRun, stepKey: string, itemKey: string, checked: boolean, at: string): BuildRunResult
export function addStepNote(run: BuildRun, stepKey: string, note: { id: string; text: string }, at: string): BuildRunResult
export function pauseRun(run: BuildRun, at: string): BuildRunResult
export function resumeRun(run: BuildRun, at: string): BuildRunResult
export function completeRun(run: BuildRun, at: string): BuildRunResult
export function abandonRun(run: BuildRun, at: string): BuildRunResult
export function runProgress(run: BuildRun): { done: number; total: number; phases: Array<{ phaseKey: string; title: string; done: number; total: number }> }
```

- **`startBuildRun`** deep-copies the plan with `structuredClone`, so the run shares no references with its source. It creates one pending `StepProgress` per step and logs a `start` event.
- **Every mutation is immutable** and appends an event. A refused request returns the run unchanged with an `error` naming the reason ("blocked by: Glue-up", "curing until …", "build is paused").
- **`completeStep`** requires an active run and an `available` step. A wait step whose timer is still running is refused. A batch step's `batchDone` is set to its count.
- **`advanceBatch`** increments `batchDone`, and completes the step when it reaches the count (one primary action, F9).
- **`undoLastCompletion`** reverts the most recent completion: a mis-tap (F6), as opposed to physical rework, which goes through `reportProblem`. A batch step returns to `count − 1`.
- **`startWait`** sets `waitStartedAt` and `readyAt = at + minimumMinutes`.
- **`completeRun`** requires every step to be complete.
- **`buildRunAvailability`** delegates to `graph.stepAvailability`.

### `actuals.ts`: measurements, problems, and verify-first

```ts
export function evaluateMeasurement(measurement: Measurement, actual: number): { withinTolerance: boolean; deviation: number }
export function recordMeasurement(run: BuildRun, stepKey: string, measurementKey: string, actual: number, at: string): BuildRunResult & { flaggedStepKeys: string[] }
export function reportProblem(run: BuildRun, stepKey: string, report: { id: string; kind: ProblemKind; outcome: ProblemOutcome; note: string; measurementKey?: string }, at: string): BuildRunResult & { flaggedStepKeys: string[]; reviewStepKeys: string[] }
export function reopenStep(run: BuildRun, stepKey: string, at: string): BuildRunResult & { reviewStepKeys: string[] }
export function clearVerifyFirst(run: BuildRun, stepKey: string): BuildRunResult
```

- **Tolerance:** `deviation = actual − target`. The value is within tolerance when `−minus ≤ deviation ≤ plus`, inclusive, with a `1e-9` epsilon.
- **Deviations (D6):** an out-of-tolerance critical measurement flags every incomplete step that consumes the deviated part. The deviated part is `measurement.partKey`, or the step's outputs when it has none. The flag is `verifyFirst` naming the source step and measurement.
- **Problem outcomes (F5):**
  - `continue-with-note`: record the problem and its note.
  - `rework-step`: the step returns to pending with `batchDone` 0; its completed transitive dependents are returned as `reviewStepKeys` and flagged verify-first, not auto-reopened.
  - `flag-downstream`: flag every incomplete transitive dependent.
  - `abandon-build`: the run becomes `abandoned`.
- **`reopenStep`:** the step returns to pending and its completed dependents are returned for review.

### `resume.ts`: bench inventory and resume summary (F8)

```ts
export interface BenchItem { partKey: string; label: string; name: string; quantity: number }
export function benchInventory(plan: InstructionPlan, completed: ReadonlySet<string>): BenchItem[]
export interface ResumeSummary {
  status: BuildRunStatus
  lastCompleted: { stepKey: string; title: string; at: string } | null
  pausedMinutes: number | null
  nextStepKey: string | null
  runningWaits: Array<{ stepKey: string; title: string; readyAt: string; ready: boolean }>
  recentNotes: Array<{ stepKey: string; text: string; at: string }>
  flaggedSteps: Array<{ stepKey: string; title: string; reason: string }>
  benchInventory: BenchItem[]
  progress: ReturnType<typeof runProgress>
}
export function resumeSummary(run: BuildRun, now: string): ResumeSummary
```

Bench inventory is the outputs of completed steps minus the consumed inputs of completed steps, listing only quantities above zero, in `plan.parts` order. `recentNotes` holds the five newest. `pausedMinutes` is set only when the run is paused.

### Composite warnings (F11, rebuild assessment)

Extend `collectWorkspaceWarnings` to composites, which raise none today. Add `'composite'` to `WarningLocation.view` and make the app's warning navigation open the composite. Candidate rules (confirm each against `compositeBoard.ts` before adding it):

- A panel whose source board is missing (error).
- A panel that yields zero wafers (warning).
- A composite with no rows, or with an empty row (warning).
- A wafer referencing an unknown panel or a piece beyond the panel's yield (error).
- Panels of differing thickness, where the assembled board takes the thinnest (warning).

### Project package (D1, hosting handoff)

`src/projectPackage.ts`. It is not domain code, because it reuses `normalizeData`; add it to the coverage `include` and to `tsconfig.test.json`.

```ts
export const PROJECT_PACKAGE_KIND = 'sawdust-atlas/project-package'
export interface ProjectPackage {
  kind: typeof PROJECT_PACKAGE_KIND
  packageVersion: 1
  schemaVersion: number
  exportedAt: string
  project: { type: 'board'; board: BoardProject } | { type: 'composite'; composite: CompositeBoard; panelBoards: BoardProject[] }
  woods: WoodSpecies[]   // only the species the project uses
}
export function buildProjectPackage(data: AtlasData, ref: { type: 'board' | 'composite'; id: string }, exportedAt: string): ProjectPackage | null
export function readProjectPackage(parsed: unknown): { ok: true; pkg: ProjectPackage } | { ok: false; error: string }
export function mergeProjectPackage(data: AtlasData, pkg: ProjectPackage, createId: () => string): { data: AtlasData; summary: { boards: number; composites: number; woodsAdded: number; woodsKept: number; importedAsCopy: boolean } }
```

- **Reading** runs the package contents through `normalizeData`, so a package from an older or newer app is repaired the same way a backup is.
- **Merging never removes or replaces** an existing project (D1: merge, not replace).
  - A wood whose id is absent is added. One that already exists keeps the local copy, and is counted in `woodsKept`.
  - If the board or composite id already exists, the import becomes a copy: fresh ids for the board(s) and the composite, composite panel references remapped, and the name suffixed " (imported)".
- **UI:** an Export project action in the board designer and the composite screen downloads `<name>.sawdust-project.json`. An Import project action in the board gallery merges through `commitData`, so it is undoable, and shows a summary. The whole-workspace backup is unchanged.

### Platform

- **Bundled fonts (hosting):** replace the Google Fonts `@import` with `@fontsource` packages for exactly the weights in use: DM Sans 400, 500, 600, and 700; DM Mono 400 and 500; and Newsreader italic 500. Remove `fonts.googleapis.com` and `fonts.gstatic.com` from the CSP in `nginx.conf` and wherever CI asserts it.
- **Connection notice (C2, D2):** a pure `describeBenchCapabilities({ secureContext, serviceWorker, wakeLock, storageManager })` returns `full` or `limited`, plus the missing capabilities in plain language. A dismissible notice explains limited mode on an insecure address and links to the tablet guide. When the context is secure, call `navigator.storage.persist()` once. Update `docs/howTo/use-on-a-tablet.md`.
- **Static-host config (hosting):** `public/_headers` (Cloudflare Pages format) mirrors nginx's security headers, and `public/_redirects` holds the single-page fallback. A unit test fails when the `_headers` CSP drifts from `nginx.conf`. Document it in `docs/howTo/install.md` as the planned primary path. Nothing is deployed.

## Testing Requirements

- Every new domain module has a sibling test file in `tests/`. The coverage gate on `src/domain/**` (lines 90, functions 85, branches 75, statements 88) stays green.
- Generators assert parity with the legacy engines, validate with zero errors, and match their golden snapshots. A property-style test runs the generators over every pattern preset and checks validity and key stability (generate twice, compare keys).
- The validator and generators are tested independently (testing guardrail 6).
- UI changes add or extend a Playwright spec. Touch-sensitive changes run in the `tablet` project too.

## Waves 2 and Later

| Wave | Scope | Strategy, stress test, and rebuild references |
| --- | --- | --- |
| 2 | Hash routes for project, mode, and step; Design, Plan, and Build modes with a readiness strip; persisted attestations; minimal machine profile (kerf) and shop profile read at plan time, ending the allowance write-through; storage boundary with an IndexedDB adapter and persistent storage; build runs stored outside undo; Bench Sheet on a paginated layout model | F1, F2, D4, C3, C6, C7, D8; R0 to R1 |
| 3 | Tablet step runner, step list with availability states, problem sheet, resume screen, wait timers with wake lock, Step Manual print product, project packages that carry a build run, tablet portrait e2e profile | Phase 2; F4 to F10; R3 |
| 4 | Readiness dashboard across projects, build history, actual versus planned | Phase 3; R4 |
| Later | Stock inventory and cut optimizer (CUT-001 extending these contracts), joinery, furniture modeler, floor-planner return (after RB1) | Phases 4 to 6 |

## Roadmap Reconciliation (C8)

| Product plan item | Where it lands |
| --- | --- |
| BOARD-022 interactive build instructions | Wave 1 generator and preview, wave 3 runner |
| UX-008 tablet build mode | Wave 3 |
| BOARD-014 printable build sheet | Wave 2 Bench Sheet replaces the print stylesheet |
| UX-006 warning center | Wave 1 composite warnings, wave 2 readiness chips |
| CUT-001 and CUT-002 typed cut plan | Wave 1 `StockLine` and `CutRef`; CUT-001 extends them |
| DATA-005 and DATA-006 shared persistence and conflicts | Deferred by D1; project package handoff instead |
| DATA-007 private HTTPS | Superseded by the static HTTPS host; Docker and Tailscale stay as self-host paths |
| M1 friend beta | Unaffected: wave 1 removes nothing |

## Out of Scope for Wave 1

Furniture, 3D, the step runner UI, print products, IndexedDB, routes, schema changes to `AtlasData`, removing any existing feature, deploying to a host, and photos.
