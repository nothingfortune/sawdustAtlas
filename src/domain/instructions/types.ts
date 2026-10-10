import type { BoardProject, WoodSpecies } from '../../types'
import type { WarningLocation, WarningSeverity } from '../workspaceWarnings'

// Shared instruction platform contracts (holistic strategy, Phase 0). Every project
// domain (cutting boards, composites, later furniture) emits one InstructionPlan;
// tablet build mode, print, readiness, and build runs all consume it. Pure types plus
// a few vocabulary constants — no React, no DOM.
//
// Rules every producer and consumer relies on (see
// docs/superpowers/specs/2026-10-10-instruction-platform-design.md):
// - Millimeters at full float precision. Rounding happens only at display.
// - Keys are stable: derived from source identity (strip id, panel id), never from a
//   position in a list, so a regenerated plan keeps the same step and part keys.
// - Dimensions live in structured fields (measurements, setup values, part
//   dimensions). Instruction prose never carries a unit-bearing number.
// - A plan is a semantic document. Page coordinates, rendered images, and screen
//   state never become part of it.

export const INSTRUCTION_PLAN_VERSION = 1

// ---- Vocabulary ----------------------------------------------------------------

/** Operation vocabulary from the strategy, plus 'arrange' (lay out parts in pattern
 *  order) and 'wait' (glue cure, finish dry — a first-class step, stress test F4). */
export type OperationKind =
  | 'acquire'
  | 'select-stock'
  | 'mill'
  | 'mark'
  | 'cut'
  | 'machine-joinery'
  | 'drill'
  | 'arrange'
  | 'dry-fit'
  | 'assemble'
  | 'glue-clamp'
  | 'wait'
  | 'surface'
  | 'finish'
  | 'install'

/** Operations that change material irreversibly. A step of one of these kinds must set
 *  `irreversible: true` and carry a check before it (validator rule). */
export const IRREVERSIBLE_KINDS: readonly OperationKind[] = ['mill', 'cut', 'machine-joinery', 'drill', 'glue-clamp', 'surface']

export type PartKind = 'stock' | 'strip' | 'panel' | 'slice' | 'wafer' | 'row' | 'board' | 'offcut'

/** Physical state of a part. A transformation consumes a part in one stage and
 *  produces a new part (new key) in the next, so bench inventory is produced minus
 *  consumed with no special cases. */
export type PartStage = 'rough' | 'milled' | 'cut' | 'arranged' | 'glued' | 'surfaced' | 'finished'

export type ToolCategory =
  | 'table-saw'
  | 'miter-saw'
  | 'crosscut-sled'
  | 'jointer'
  | 'planer'
  | 'router-table'
  | 'drum-sander'
  | 'sander'
  | 'clamps'
  | 'glue'
  | 'measuring'
  | 'marking'
  | 'finish'
  | 'other'

export type MeasurementUnit = 'mm' | 'deg' | 'count'

/** Safety guardrail 5: dimensions to verify before cutting are distinct from
 *  dimensions to achieve after cutting. */
export type MeasurementPhase = 'verify-before' | 'achieve-after'

/** Where a machine value comes from (safety guardrail 3). 'assumption' must be shown
 *  as an assumption to the woodworker. */
export type SetupValueSource = 'design' | 'profile' | 'assumption'

/** Stress test C5: the step visual is a per-domain view kind with shared highlight
 *  semantics. Cutting boards use the 2D kinds; 'scene-3d' is reserved for furniture. */
export type StepViewKind = 'board-face' | 'cross-section' | 'cut-diagram' | 'assembly-layout' | 'scene-3d'

// ---- Parts ---------------------------------------------------------------------

export interface PartDimensions {
  length: number
  width: number
  thickness: number
}

export interface PlanPart {
  /** Stable key, unique within the plan (e.g. `strip:<stripId>`, `stock:<lineKey>/milled`). */
  key: string
  kind: PartKind
  stage: PartStage
  /** Mark written on the physical part at the bench (stress test F7), e.g. "S3", "A", "P1". */
  label: string
  /** Human name, e.g. "Walnut strip S3". */
  name: string
  speciesId?: string
  /** Nominal dimensions of the part in this stage, mm. */
  dimensions?: PartDimensions
  /** Id in the source domain this part derives from (strip id, board id, panel id). */
  sourceId?: string
}

/** A part a step uses. `consumed: false` only for parts used but physically unchanged
 *  (a reference board, a template); a transformed part is consumed and the new state
 *  is an output with a new key. */
export interface StepInput {
  partKey: string
  quantity: number
  consumed: boolean
}

export interface StepOutput {
  partKey: string
  quantity: number
}

// ---- Step content ----------------------------------------------------------------

/** One machine setup repeated `count` times, shown as a single step with a counter
 *  (stress test C4). */
export interface StepBatch {
  count: number
  /** What one repetition produces, singular: "strip", "slice". */
  unitLabel: string
}

export interface Measurement {
  /** Unique within its step. */
  key: string
  label: string
  target: number
  unit: MeasurementUnit
  /** Acceptable deviation below and above `target`, same unit, both >= 0. */
  tolerance: { minus: number; plus: number }
  /** Critical measurements feed later steps; a deviation flags them (decision D6) and
   *  the runner asks for a typed actual instead of a tap. */
  critical: boolean
  phase: MeasurementPhase
  partKey?: string
}

export interface ToolRequirement {
  /** Stable key, unique within the plan's requirements (e.g. 'table-saw'). */
  key: string
  name: string
  category: ToolCategory
}

export interface SetupValue {
  label: string
  value: number
  unit: 'mm' | 'deg'
  source: SetupValueSource
}

export interface MachineSetup {
  tool: ToolCategory
  settings: SetupValue[]
}

export interface ChecklistItem {
  /** Unique within its step. */
  key: string
  text: string
  critical: boolean
}

export interface WaitSpec {
  /** Minimum clamp/cure time before the dependent steps may start. */
  minimumMinutes: number
  reason: string
  /** Whether minimumMinutes is a stated assumption (e.g. glue clamp time). */
  source: SetupValueSource
}

export interface DurationEstimate {
  minutes: number
  kind: 'active' | 'cure'
}

/** One warning model app-wide (stress test F11): the same severity and fix-location
 *  shape as WorkspaceWarning, optionally pinned to a step. */
export interface PlanWarning {
  id: string
  severity: WarningSeverity
  message: string
  stepKey?: string
  location?: WarningLocation
}

export interface CameraPose {
  position: [number, number, number]
  target: [number, number, number]
  up?: [number, number, number]
}

export interface VisualAnnotation {
  kind: 'dimension' | 'label' | 'arrow' | 'reference-face' | 'cut-line' | 'warning'
  text: string
  partKey?: string
  measurementKey?: string
}

export interface StepVisual {
  view: StepViewKind
  /** Which state the visual shows. A cut usually shows 'before' with its cut line. */
  state: 'before' | 'after' | 'both'
  highlightPartKeys: string[]
  ghostPartKeys: string[]
  annotations: VisualAnnotation[]
  /** Only for 'scene-3d'; unused by 2D view kinds. */
  camera?: CameraPose
}

// ---- Plan ----------------------------------------------------------------------

export interface InstructionPhase {
  key: string
  order: number
  title: string
}

export interface InstructionStep {
  /** Stable key, unique within the plan (stress test C6). */
  key: string
  phaseKey: string
  /** Default linear order, 1-based, unique; consistent with `dependsOn`. */
  order: number
  /** Direct prerequisites, by step key. */
  dependsOn: string[]
  kind: OperationKind
  title: string
  /** Plain-language instruction. Never the only carrier of a dimension. */
  instruction: string
  irreversible: boolean
  batch?: StepBatch
  inputs: StepInput[]
  outputs: StepOutput[]
  tools: ToolRequirement[]
  machineSetup?: MachineSetup
  measurements: Measurement[]
  checklist: ChecklistItem[]
  warnings: PlanWarning[]
  duration?: DurationEstimate
  /** Required when kind is 'wait'. */
  wait?: WaitSpec
  visual: StepVisual
  /** Traceability (acceptance criterion 2): ids from `requirements.cuts` this step executes. */
  cutIds: string[]
}

export interface InstructionAssembly {
  key: string
  label: string
  name: string
  /** Parts that make up this subassembly. */
  partKeys: string[]
  /** Steps that build it. */
  stepKeys: string[]
  parentKey?: string
}

/** One line of stock to buy or pull, mapped from the source domain's stock list. */
export interface StockLine {
  key: string
  speciesId: string
  speciesName: string
  quantity: number
  length: number
  width: number
  thickness: number
  boardFeet: number
  /** The plan part this line supplies (kind 'stock', stage 'rough'). */
  partKey: string
}

/** A reference to one cut in the source domain's cut list, for coverage checks. */
export interface CutRef {
  id: string
  label: string
  stage: string
  quantity: number
}

export interface ProjectRequirements {
  stock: StockLine[]
  cuts: CutRef[]
  tools: ToolRequirement[]
  /** Free-text consumables (glue, finish, abrasives). */
  consumables: string[]
}

export type PlanSourceKind = 'board' | 'composite'

export interface PlanSource {
  kind: PlanSourceKind
  projectId: string
  projectName: string
  /** Design revision stamp: the project's updatedAt when the plan was generated. */
  designRevision: string
}

export interface InstructionPlan {
  version: typeof INSTRUCTION_PLAN_VERSION
  /** Deterministic: `${source.kind}:${source.projectId}`. */
  key: string
  /** Content hash of everything except this field (see revisions.ts). */
  revision: string
  source: PlanSource
  construction: 'edge' | 'end'
  /** Units of record. Display units are a presentation concern. */
  units: 'mm'
  finished: PartDimensions
  phases: InstructionPhase[]
  steps: InstructionStep[]
  parts: PlanPart[]
  assemblies: InstructionAssembly[]
  requirements: ProjectRequirements
  warnings: PlanWarning[]
}

// ---- Generators ----------------------------------------------------------------

export interface GenerationContext {
  woods: readonly WoodSpecies[]
  /** Every board in the workspace; composites resolve their panel boards from it. */
  boards: readonly BoardProject[]
  /** Prefix for every phase, step, part, assembly, and cut key when a plan is
   *  embedded in a parent plan (composite panels). Defaults to ''. */
  keyPrefix?: string
  /** The board is a composite panel: its plan ends at a flattened panel ready to be cut
   *  into wafers, with no final squaring, surfacing, or finishing steps. */
  asCompositePanel?: boolean
}

export type InstructionGenerator<TProject> = (project: TProject, context: GenerationContext) => InstructionPlan

// ---- Validation ----------------------------------------------------------------

export type PlanIssueCode =
  | 'unsupported-version'
  | 'duplicate-key'
  | 'unknown-phase'
  | 'unknown-dependency'
  | 'self-dependency'
  | 'dependency-cycle'
  | 'order-invalid'
  | 'order-violates-dependency'
  | 'unknown-part'
  | 'input-not-available'
  | 'over-consumed'
  | 'part-never-produced'
  | 'stock-not-consumed'
  | 'unknown-cut'
  | 'cut-not-covered'
  | 'missing-output'
  | 'irreversible-not-flagged'
  | 'irreversible-without-check'
  | 'invalid-batch'
  | 'invalid-measurement'
  | 'invalid-wait'
  | 'invalid-visual'
  | 'dimension-in-prose'
  | 'unknown-step'
  | 'revision-mismatch'

export interface PlanValidationIssue {
  code: PlanIssueCode
  severity: WarningSeverity
  message: string
  stepKey?: string
  partKey?: string
}

export interface PlanValidation {
  /** True when no issue has severity 'error'. */
  ok: boolean
  issues: PlanValidationIssue[]
}

// ---- Step availability (stress test F4) ----------------------------------------

/** done: complete. available: every prerequisite done (a wait step whose timer is not
 *  running). waiting: held only by a running wait timer. blocked: anything else. */
export type StepAvailability = 'done' | 'available' | 'waiting' | 'blocked'

// ---- Readiness (stress test C3, decision D3) -------------------------------------

export type ReadinessDimension = 'design' | 'instructions' | 'material' | 'tools' | 'warnings' | 'decisions'

/** 'not-tracked' means the app has no data for this dimension; it is never shown as
 *  satisfied by default. */
export type ReadinessStatus = 'ready' | 'attention' | 'blocked' | 'not-tracked'

export interface ReadinessReason {
  message: string
  severity: WarningSeverity
  location?: WarningLocation
  /** Steps affected by this gap, carried onto the build when the gap is acknowledged. */
  stepKeys?: string[]
}

export interface ReadinessChip {
  dimension: ReadinessDimension
  status: ReadinessStatus
  summary: string
  reasons: ReadinessReason[]
}

/** Self-attested readiness: the woodworker marks each required line by hand. */
export type Attestation = 'have' | 'need'

export interface ReadinessAttestations {
  /** By StockLine.key. A missing key means not tracked. */
  stock: Record<string, Attestation>
  /** By ToolRequirement.key. A missing key means not tracked. */
  tools: Record<string, Attestation>
}

export interface PendingDecision {
  key: string
  message: string
}

/** Decision D5: hard block only on design and plan errors; material and tool gaps are a
 *  soft gate the woodworker acknowledges. */
export interface StartGate {
  allowed: boolean
  hardBlocks: ReadinessReason[]
  softGaps: ReadinessReason[]
}

export interface ProjectReadiness {
  chips: ReadinessChip[]
  startGate: StartGate
}

// ---- Project lifecycle (stress test C11) -----------------------------------------

/** User- or event-driven lifecycle. Readiness is computed, never stored here. */
export type ProjectLifecycle = 'draft' | 'planned' | 'building' | 'paused' | 'complete'

export type LifecycleEvent =
  | 'mark-planned'
  | 'reopen-design'
  | 'build-started'
  | 'build-paused'
  | 'build-resumed'
  | 'build-completed'
  | 'build-abandoned'
