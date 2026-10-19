# AI-001 Project Packages and Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every design type (board, composite, furniture) leaves the app as one package file or share link and comes back in safely, through registries that later sub-projects extend without edits across the codebase.

**Architecture:** `src/projectPackage.ts` becomes `src/packages/`: an envelope that reads and writes the package once and delegates to a `PACKAGE_KINDS` registry (board, composite, furniture). Share links are `#<intent>=<codec>.<payload>` fragments made by a versioned `LINK_CODECS` registry (v1 = deflate-raw + base64url). The share dialog renders a `SHARE_TARGETS` registry (file, link, QR). An incoming fragment is routed through a `LINK_INTENTS` registry (share). Pure logic lives in `src/packages/`; DOM work sits in thin adapters next to the components, behind an injected `ShareIO`.

**Tech Stack:** React 19, TypeScript (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Vite, Vitest (node environment), Playwright, `CompressionStream`/`DecompressionStream` (built into browsers and Node 24), `qrcode-generator@2.0.4` (new, MIT).

**Spec:** [`docs/specs/2026-10-18-ai-001-project-packages-sharing-design.md`](../specs/2026-10-18-ai-001-project-packages-sharing-design.md)

## Global Constraints

- PRs target `develop`. Three PRs, in order, each green and revertible on its own: **PR A** packages (Tasks 1–4), **PR B** share out (Tasks 5–7), **PR C** share in (Tasks 8–9).
- No attribution footers in commits or PR bodies. Comments are one line stating why; rationale lives in this plan or the spec.
- Every change to the workspace goes through `commitData`, so Undo removes an import.
- Millimeters at full precision; nothing in `src/packages/` rounds.
- `src/packages/**` is pure: no `window`, `document`, `navigator`, or React. Browser calls live in `src/components/share/`.
- `packageVersion` stays `1`. `SUPPORTED_PACKAGE_VERSION = 1`.
- Exact user-facing strings (copy verbatim):
  - Newer version: `This project was made with a newer version of SawdustAtlas. Update this app to open it.`
  - Damaged link: `This share link is damaged or incomplete. Ask for the file instead.`
  - Unknown codec: `This link needs a newer version of SawdustAtlas.`
  - Too large: `This share link or file is too large to be a SawdustAtlas project.`
  - Not a package (existing): `This file is not a SawdustAtlas project package.`
  - Unknown type (existing): `The project package holds an unknown kind of project.`
- `SHARE_CONFIG` values: `maxLinkLength: 8000`, `maxQrLinkLength: 2900`, `maxIncomingFragmentLength: 16000`, `maxDecodedBytes: 1024 * 1024`, `maxPackageFileBytes: 5 * 1024 * 1024`.
- Fragment format: `#share=v1.<base64url payload>`.
- `tests/projectPackage.test.ts` keeps passing with only its import path changed (`../src/projectPackage` → `../src/packages`).
- Coverage gate unchanged (lines 90 / functions 85 / branches 75 / statements 88); `src/packages/**` replaces `src/projectPackage.ts` in the include list.
- New e2e specs go in `tabletSpecs` in `playwright.config.ts` so they run in both projects.

## Rulings made while planning

These fill gaps the spec leaves open. Each is cheap to reverse.

| # | Ruling | Why |
| --- | --- | --- |
| P1 | `PackageKind.read` takes `{ project, woods, schemaVersion }`, not only the raw project, and returns the normalized woods with the payload. | `migrate` reads top-level lists and woods normalization depends on the kind's species references. |
| P2 | `describe` returns `{ name, label, size }`. `label` is the type name ("Cutting board"); `size` is a count ("7 strips"), not dimensions. | The preview shows name, type, and size; a count needs no unit formatting in pure code. |
| P3 | `KindMergeSummary` carries `furniture` and `projectId`. | The dialog text covers furniture, and open-after-import needs the id. |
| P4 | The furniture gallery gets its own "Import project" button using the same `importProjectFile` handler. | The spec's e2e imports furniture from the furniture screen; the handler stays in one place. |
| P5 | `ShareTarget` gains `action(ctx)` (button label or `null`) and `detail(ctx)` (text or QR data), and `run(ctx, io)` takes an injected `ShareIO`. | The dialog stays free of per-target logic, and `run` is unit-testable with a fake, so no coverage exclusion is needed. |
| P6 | The QR code renders as React `<rect>`s from the module grid, never `createSvgTag` + `dangerouslySetInnerHTML`. | No raw HTML injection. |
| P7 | `downloadProjectPackage` moves into the browser `ShareIO` adapter, not into `share/targets/file.ts`. | `targets/` stays pure (follows P5). |
| P8 | The fragment is cleared as soon as it is read, before the preview shows. | A reload never asks again, and `useNavigationHistory`'s `pushState` never copies the fragment into new history entries. |
| P9 | Navigation gains `{ type: 'openProject'; kind: 'board' \| 'composite' \| 'furniture'; id }` (parked in AI-000). | A share import opens the project the same way a click does. |
| P10 | `ShareDialog` is lazy-loaded so `qrcode-generator` lands in its own chunk. | The main bundle does not grow. |
| P11 | A package's furniture species missing from its `woods` get placeholder woods (same as board strips). A backup with the same gap is logged in `TODO.md`, not fixed. | Prevents silent species loss in packages; backups are out of scope. |

## Review Focus

1. **Old packages still migrate.** A schema-v1 board package with running-bond `rowOffsets` in mm must come back as cell fractions. A kind that called `migrate` on its own payload would skip it. Pinned in Task 2.
2. **Truncated woods list.** A furniture package whose `woods` is missing or incomplete must keep every part's `speciesId` and gain placeholder woods, not a different wood. Pinned in Task 3.
3. **Large payloads.** Base64url of a payload over ~100 KB must not throw `RangeError` from argument spreading. Pinned in Task 5.
4. **Decompression bomb.** A few KB that inflates past 1 MB is cancelled mid-stream and refused. Pinned in Task 5.
5. **Back/Forward after a share link.** Clearing the fragment must keep `history.state`, or browser Back stops restoring screens. Pinned in Task 9 (e2e).

Also pinned: `packageVersion: "1"` (a string) and `packageVersion` missing both read as 1 (Task 2).

---

# PR A: Packages (Tasks 1–4)

Branch: `feat/ai-001-packages` from `develop`.

### Task 1: Package registry with board and composite kinds

Move the existing logic behind the registry with no behavior change.

**Files:**
- Create: `src/packages/kind.ts`, `src/packages/shared.ts`, `src/packages/envelope.ts`, `src/packages/index.ts`, `src/packages/kinds/index.ts`, `src/packages/kinds/board.ts`, `src/packages/kinds/composite.ts`
- Delete: `src/projectPackage.ts`
- Modify: `src/projectPackageDownload.ts` (import path), `src/App.tsx` (import paths), `tests/projectPackage.test.ts` (import path only), `vite.config.ts:95`, `tsconfig.test.json:9`, `CLAUDE.md` (two mentions of `projectPackage.ts`)

**Interfaces:**
- Produces:
  - `PackageKind<P extends { type: string }>` with method members `build`, `read`, `merge`, `usedWoodIds`, `describe` (see code)
  - `RawPackageInput`, `ReadContext` (= `NormalizeContext`), `MergeContext { createId }`, `KindMergeSummary { boards; composites; furniture; importedAsCopy; projectId }`, `PackageDescription { name; label; size }`, `KindReadResult<P>`
  - `normalizeIncoming(raw, ctx): IncomingProjects`, `isPlainRecord`, `fail`, `IMPORTED_SUFFIX`, `woodsUsedBy`, `mergeWoods`
  - `PACKAGE_KINDS`, `findKind(type: unknown)`, `ProjectPayload`, `ProjectType`, `BoardPayload`, `CompositePayload`
  - `PROJECT_PACKAGE_KIND`, `SUPPORTED_PACKAGE_VERSION`, `ProjectPackage`, `ProjectMergeSummary`, `PackageReadResult`, `buildProjectPackage(data, ref, exportedAt)`, `readProjectPackage(parsed, ctx?)`, `mergeProjectPackage(data, pkg, createId)`, `describeProject(pkg)`, `projectPackageFileName(pkg)`

- [ ] **Step 1: Write the kind contract types and prove the registry typing compiles**

Create `src/packages/kind.ts`:

```ts
import type { NormalizeContext } from '../normalize/context'
import type { AtlasData, WoodSpecies } from '../types'

/** The raw, untrusted pieces of a package that a kind reads. */
export interface RawPackageInput {
  project: Record<string, unknown>
  woods: unknown[]
  schemaVersion: number
}

export type ReadContext = NormalizeContext

export interface MergeContext {
  createId: () => string
}

export interface KindMergeSummary {
  boards: number
  composites: number
  furniture: number
  importedAsCopy: boolean
  /** The id the project was added under, so the UI can open it. */
  projectId: string
}

export interface PackageDescription {
  name: string
  /** Plain type name, e.g. "Cutting board". */
  label: string
  /** Short count for previews, e.g. "7 strips". */
  size: string
}

export type KindReadResult<P> = { ok: true; payload: P; woods: WoodSpecies[] } | { ok: false; error: string }

// Method syntax on purpose: it keeps parameters bivariant, so a PackageKind<BoardPayload> fits the PackageKind<ProjectPayload> registry.
export interface PackageKind<P extends { type: string }> {
  readonly type: P['type']
  build(data: AtlasData, id: string): P | null
  read(input: RawPackageInput, ctx: ReadContext): KindReadResult<P>
  merge(data: AtlasData, payload: P, ctx: MergeContext): { data: AtlasData; summary: KindMergeSummary }
  usedWoodIds(payload: P): ReadonlySet<string>
  describe(payload: P): PackageDescription
}
```

Run: `pnpm typecheck`
Expected: PASS (the file is self-contained).

- [ ] **Step 2: Write the shared helpers**

Create `src/packages/shared.ts`:

```ts
import { normalizeFurnitureProject } from '../domain/furniture/project'
import type { FurnitureProject } from '../domain/furniture/types'
import { migrate } from '../domain/migrations'
import { normalizeBoard } from '../normalize/boards'
import { records } from '../normalize/coerce'
import { normalizeComposite } from '../normalize/composites'
import { normalizeAllowances } from '../normalize/settings'
import { normalizeWoodLibrary, placeholderWoods } from '../normalize/woods'
import type { BoardProject, BuildAllowances, CompositeBoard, WoodSpecies } from '../types'
import type { ReadContext } from './kind'

export const IMPORTED_SUFFIX = ' (imported)'

// Unlike normalize/coerce's isRecord, arrays are rejected: every package section is an object.
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

export interface IncomingProjects {
  boards: BoardProject[]
  composites: CompositeBoard[]
  furniture: FurnitureProject[]
  woods: WoodSpecies[]
}

export interface IncomingRaw {
  schemaVersion: number
  woods: unknown[]
  boards?: unknown[]
  composites?: unknown[]
  furniture?: unknown[]
}

// Migrations read top-level lists, so a package's pieces are put back into a workspace shape before migrating.
export function normalizeIncoming(raw: IncomingRaw, ctx: ReadContext): IncomingProjects {
  const migrated = migrate({ schemaVersion: raw.schemaVersion, woods: raw.woods, boards: raw.boards ?? [], composites: raw.composites ?? [], furniture: raw.furniture ?? [] }).data
  const rawBoards = records(migrated['boards'])
  const library = normalizeWoodLibrary(migrated['woods'], ctx)
  const fallbackSpeciesId = library[0]?.id ?? 'walnut'
  const allowances = normalizeAllowances(rawBoards[0]?.['allowances'] as (BuildAllowances & { drumSanding?: number }) | undefined)
  const boards = rawBoards.map(board => normalizeBoard(board, { allowances, fallbackSpeciesId }, ctx))
  const migratedBoards: BoardProject[] = []
  const composites = records(migrated['composites']).map(composite => normalizeComposite(composite, { boardSink: migratedBoards, allowances, boards }, ctx))
  const furniture = records(migrated['furniture'])
    .map(project => normalizeFurnitureProject(project, { createId: ctx.createId, now: ctx.now, fallbackSpeciesId }))
    .filter((project): project is FurnitureProject => project !== null)
  return { boards: [...boards, ...migratedBoards], composites, furniture, woods: [...library, ...placeholderWoods(rawBoards, library, ctx)] }
}

export function woodsUsedBy(woods: readonly WoodSpecies[], used: ReadonlySet<string>): WoodSpecies[] {
  return woods.filter(wood => used.has(wood.id))
}

/** Adds incoming species the workspace lacks; a species already present keeps the local version. */
export function mergeWoods(local: readonly WoodSpecies[], incoming: readonly WoodSpecies[]): { woods: WoodSpecies[]; added: number; kept: number } {
  const localIds = new Set(local.map(wood => wood.id))
  const added = incoming.filter(wood => !localIds.has(wood.id))
  return { woods: [...local, ...added], added: added.length, kept: incoming.length - added.length }
}
```

- [ ] **Step 3: Write the board kind**

Create `src/packages/kinds/board.ts`:

```ts
import type { BoardProject } from '../../types'
import type { PackageKind } from '../kind'
import { IMPORTED_SUFFIX, fail, isPlainRecord, normalizeIncoming } from '../shared'

export interface BoardPayload {
  type: 'board'
  board: BoardProject
}

export function boardWoodIds(boards: readonly BoardProject[]): Set<string> {
  return new Set(boards.flatMap(board => board.strips.map(strip => strip.speciesId)))
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

export const boardKind: PackageKind<BoardPayload> = {
  type: 'board',
  build(data, id) {
    const board = data.boards.find(b => b.id === id)
    return board ? { type: 'board', board } : null
  },
  read(input, ctx) {
    const raw = input.project['board']
    if (!isPlainRecord(raw)) return fail('The project package has no board in it.')
    const incoming = normalizeIncoming({ schemaVersion: input.schemaVersion, woods: input.woods, boards: [raw] }, ctx)
    const board = incoming.boards[0]
    if (!board) return fail('The project package has no board in it.')
    return { ok: true, payload: { type: 'board', board }, woods: incoming.woods }
  },
  merge(data, payload, ctx) {
    const copy = data.boards.some(b => b.id === payload.board.id)
    const board = copy ? { ...payload.board, id: ctx.createId(), name: payload.board.name + IMPORTED_SUFFIX } : payload.board
    return {
      // Allowances are shop-wide; an incoming board follows the local setup.
      data: { ...data, boards: [...data.boards, { ...board, allowances: data.allowances }] },
      summary: { boards: 1, composites: 0, furniture: 0, importedAsCopy: copy, projectId: board.id },
    }
  },
  usedWoodIds(payload) {
    return boardWoodIds([payload.board])
  },
  describe(payload) {
    return { name: payload.board.name, label: 'Cutting board', size: plural(payload.board.strips.length, 'strip') }
  },
}
```

- [ ] **Step 4: Write the composite kind**

Create `src/packages/kinds/composite.ts`:

```ts
import type { BoardProject, CompositeBoard } from '../../types'
import type { PackageKind } from '../kind'
import { IMPORTED_SUFFIX, fail, isPlainRecord, normalizeIncoming } from '../shared'
import { boardWoodIds } from './board'

export interface CompositePayload {
  type: 'composite'
  composite: CompositeBoard
  panelBoards: BoardProject[]
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

export const compositeKind: PackageKind<CompositePayload> = {
  type: 'composite',
  build(data, id) {
    const composite = data.composites.find(c => c.id === id)
    if (!composite) return null
    const panelIds = new Set(composite.panels.map(panel => panel.boardId))
    return { type: 'composite', composite, panelBoards: data.boards.filter(b => panelIds.has(b.id)) }
  },
  read(input, ctx) {
    const raw = input.project['composite']
    if (!isPlainRecord(raw)) return fail('The project package has no composite in it.')
    const rawBoards = Array.isArray(input.project['panelBoards']) ? input.project['panelBoards'] : []
    const incoming = normalizeIncoming({ schemaVersion: input.schemaVersion, woods: input.woods, boards: rawBoards, composites: [raw] }, ctx)
    const composite = incoming.composites[0]
    if (!composite) return fail('The project package has no composite in it.')
    return { ok: true, payload: { type: 'composite', composite, panelBoards: incoming.boards }, woods: incoming.woods }
  },
  merge(data, payload, ctx) {
    const boardIds = new Set(data.boards.map(b => b.id))
    // A clash on the composite or any board it carries copies the whole set so the pieces stay together.
    const copy = data.composites.some(c => c.id === payload.composite.id) || payload.panelBoards.some(board => boardIds.has(board.id))
    const idMap = new Map<string, string>()
    const boards = payload.panelBoards.map(board => {
      if (!copy) return board
      const id = ctx.createId()
      idMap.set(board.id, id)
      return { ...board, id, name: board.name + IMPORTED_SUFFIX }
    })
    const source = payload.composite
    const composite: CompositeBoard = {
      ...source,
      id: copy ? ctx.createId() : source.id,
      name: copy ? source.name + IMPORTED_SUFFIX : source.name,
      panels: source.panels.map(panel => ({ ...panel, boardId: idMap.get(panel.boardId) ?? panel.boardId })),
    }
    return {
      data: {
        ...data,
        boards: [...data.boards, ...boards.map(board => ({ ...board, allowances: data.allowances }))],
        composites: [...data.composites, composite],
      },
      summary: { boards: boards.length, composites: 1, furniture: 0, importedAsCopy: copy, projectId: composite.id },
    }
  },
  usedWoodIds(payload) {
    return boardWoodIds(payload.panelBoards)
  },
  describe(payload) {
    return { name: payload.composite.name, label: 'Composite board', size: plural(payload.composite.panels.length, 'panel') }
  },
}
```

- [ ] **Step 5: Write the registry**

Create `src/packages/kinds/index.ts`:

```ts
import type { PackageKind } from '../kind'
import { boardKind } from './board'
import type { BoardPayload } from './board'
import { compositeKind } from './composite'
import type { CompositePayload } from './composite'

export type { BoardPayload, CompositePayload }

export type ProjectPayload = BoardPayload | CompositePayload
export type ProjectType = ProjectPayload['type']

// One entry per design type: a new type is one module, one union member above, and one entry here.
export const PACKAGE_KINDS: readonly PackageKind<ProjectPayload>[] = [boardKind, compositeKind]

export function findKind(type: unknown): PackageKind<ProjectPayload> | undefined {
  return PACKAGE_KINDS.find(kind => kind.type === type)
}
```

Run: `pnpm typecheck`
Expected: PASS. If TypeScript rejects `boardKind` in the array, a member of `PackageKind` was written with property-arrow syntax (`merge: (...) => ...`) in `kind.ts`; it must be method syntax.

- [ ] **Step 6: Write the envelope and the public facade**

Create `src/packages/envelope.ts`:

```ts
import { LATEST_SCHEMA_VERSION } from '../domain/migrations'
import { defaultNormalizeContext } from '../normalize/context'
import type { AtlasData, WoodSpecies } from '../types'
import type { KindMergeSummary, PackageDescription, ReadContext } from './kind'
import { findKind } from './kinds'
import type { ProjectPayload, ProjectType } from './kinds'
import { fail, isPlainRecord, mergeWoods, woodsUsedBy } from './shared'

export const PROJECT_PACKAGE_KIND = 'sawdust-atlas/project-package'
export const SUPPORTED_PACKAGE_VERSION = 1

export interface ProjectPackage {
  kind: typeof PROJECT_PACKAGE_KIND
  packageVersion: typeof SUPPORTED_PACKAGE_VERSION
  schemaVersion: number
  exportedAt: string
  project: ProjectPayload
  /** Only the species the project uses. */
  woods: WoodSpecies[]
}

export interface ProjectMergeSummary extends KindMergeSummary {
  woodsAdded: number
  woodsKept: number
}

export type PackageReadResult = { ok: true; pkg: ProjectPackage } | { ok: false; error: string }

function schemaVersionOf(raw: Record<string, unknown>): number {
  const version = raw['schemaVersion']
  return typeof version === 'number' && Number.isFinite(version) ? version : 1
}

export function buildProjectPackage(data: AtlasData, ref: { type: ProjectType; id: string }, exportedAt: string): ProjectPackage | null {
  const entry = findKind(ref.type)
  const project = entry?.build(data, ref.id)
  if (!entry || !project) return null
  return { kind: PROJECT_PACKAGE_KIND, packageVersion: SUPPORTED_PACKAGE_VERSION, schemaVersion: data.schemaVersion, exportedAt, project, woods: woodsUsedBy(data.woods, entry.usedWoodIds(project)) }
}

export function readProjectPackage(parsed: unknown, ctx: ReadContext = defaultNormalizeContext()): PackageReadResult {
  if (!isPlainRecord(parsed) || parsed['kind'] !== PROJECT_PACKAGE_KIND) return fail('This file is not a SawdustAtlas project package.')
  const project = parsed['project']
  if (!isPlainRecord(project)) return fail('The project package has no project in it.')
  const entry = findKind(project['type'])
  if (!entry) return fail('The project package holds an unknown kind of project.')
  const read = entry.read({ project, woods: Array.isArray(parsed['woods']) ? parsed['woods'] : [], schemaVersion: schemaVersionOf(parsed) }, ctx)
  if (!read.ok) return read
  return {
    ok: true,
    pkg: {
      kind: PROJECT_PACKAGE_KIND,
      packageVersion: SUPPORTED_PACKAGE_VERSION,
      schemaVersion: LATEST_SCHEMA_VERSION,
      exportedAt: typeof parsed['exportedAt'] === 'string' ? parsed['exportedAt'] : '',
      project: read.payload,
      woods: woodsUsedBy(read.woods, entry.usedWoodIds(read.payload)),
    },
  }
}

export function mergeProjectPackage(data: AtlasData, pkg: ProjectPackage, createId: () => string): { data: AtlasData; summary: ProjectMergeSummary } {
  const entry = findKind(pkg.project.type)
  if (!entry) throw new Error(`No package kind is registered for "${pkg.project.type}".`)
  const merged = entry.merge(data, pkg.project, { createId })
  const woods = mergeWoods(merged.data.woods, pkg.woods)
  return { data: { ...merged.data, woods: woods.woods }, summary: { ...merged.summary, woodsAdded: woods.added, woodsKept: woods.kept } }
}

export function describeProject(pkg: ProjectPackage): PackageDescription {
  return findKind(pkg.project.type)?.describe(pkg.project) ?? { name: 'project', label: 'Project', size: '' }
}

/** The download name for a package: `<project name>.sawdust-project.json`, made filesystem-safe. */
export function projectPackageFileName(pkg: ProjectPackage): string {
  // eslint-disable-next-line no-control-regex
  const safe = describeProject(pkg).name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim().replace(/^\.+/, '')
  return `${safe || 'project'}.sawdust-project.json`
}
```

Create `src/packages/index.ts`:

```ts
export { PROJECT_PACKAGE_KIND, SUPPORTED_PACKAGE_VERSION, buildProjectPackage, describeProject, mergeProjectPackage, projectPackageFileName, readProjectPackage } from './envelope'
export type { PackageReadResult, ProjectMergeSummary, ProjectPackage } from './envelope'
export type { KindMergeSummary, PackageDescription, PackageKind } from './kind'
export { PACKAGE_KINDS, findKind } from './kinds'
export type { ProjectPayload, ProjectType } from './kinds'
```

- [ ] **Step 7: Point callers and the existing tests at the new module, and delete the old one**

- `tests/projectPackage.test.ts` line 4: change `'../src/projectPackage'` to `'../src/packages'`. Change nothing else in the file.
- `src/projectPackageDownload.ts`: change both imports from `'./projectPackage'` to `'./packages'`.
- `src/App.tsx` lines 11–12: change `'./projectPackage'` to `'./packages'`. Also change `exportProject`'s parameter type from `{ type: 'board' | 'composite'; id: string }` to `{ type: ProjectType; id: string }` and add `ProjectType` to the type import from `'./packages'`.
- Delete `src/projectPackage.ts`.
- `vite.config.ts:95`: replace `'src/projectPackage.ts'` with `'src/packages/**'`.
- `tsconfig.test.json:9`: replace `"src/projectPackage.ts"` with `"src/packages"`.
- `CLAUDE.md`: in the coverage sentence replace `projectPackage.ts` with `src/packages/**`; replace the paragraph starting "`src/projectPackage.ts` exports and imports a single board or composite" with: "`src/packages/` exports and imports a single board, composite, or furniture project as a package file, through a `PACKAGE_KINDS` registry (one module per design type). Reads run `migrate` and the per-domain normalizers, and merges go through `commitData` so Undo removes an import."

- [ ] **Step 8: Run the existing package tests and the full gate**

Run: `pnpm test tests/projectPackage.test.ts`
Expected: PASS, all 16 tests, unchanged except the import path.

Run: `pnpm typecheck && pnpm lint && pnpm test:coverage`
Expected: PASS; coverage thresholds green.

Run: `pnpm test:e2e e2e/projectPackage.spec.ts`
Expected: PASS (3 tests × chromium).

- [ ] **Step 9: Commit**

```bash
git add src/packages src/projectPackageDownload.ts src/App.tsx tests/projectPackage.test.ts vite.config.ts tsconfig.test.json CLAUDE.md
git rm src/projectPackage.ts
git commit -m "refactor(packages): package kinds registry for board and composite"
```

### Task 2: Refuse packages from a newer app

**Files:**
- Modify: `src/packages/envelope.ts`
- Test: `tests/packageEnvelope.test.ts` (new)

**Interfaces:**
- Consumes: `readProjectPackage`, `buildProjectPackage`, `PROJECT_PACKAGE_KIND` from Task 1; `LATEST_SCHEMA_VERSION` from `src/domain/migrations.ts`
- Produces: `NEWER_VERSION_ERROR` exported from `src/packages/envelope.ts` and `src/packages/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/packageEnvelope.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { starterData } from '../src/data'
import { LATEST_SCHEMA_VERSION } from '../src/domain/migrations'
import { NEWER_VERSION_ERROR, PROJECT_PACKAGE_KIND, buildProjectPackage, readProjectPackage } from '../src/packages'
import { normalizeData } from '../src/storage'
import { fixedContext, FIXED_NOW } from './fixtures/context'

function boardPackage(): Record<string, unknown> {
  const data = normalizeData(structuredClone(starterData), fixedContext())
  const pkg = buildProjectPackage(data, { type: 'board', id: data.boards[0]!.id }, FIXED_NOW)!
  return JSON.parse(JSON.stringify(pkg)) as Record<string, unknown>
}

describe('package version refusal', () => {
  it('refuses a newer packageVersion', () => {
    expect(readProjectPackage({ ...boardPackage(), packageVersion: 2 })).toEqual({ ok: false, error: NEWER_VERSION_ERROR })
  })

  it('refuses a newer schemaVersion', () => {
    expect(readProjectPackage({ ...boardPackage(), schemaVersion: LATEST_SCHEMA_VERSION + 1 })).toEqual({ ok: false, error: NEWER_VERSION_ERROR })
  })

  it('refuses before reading the project at all', () => {
    // A board package with no board would otherwise fail with "no board in it".
    expect(readProjectPackage({ kind: PROJECT_PACKAGE_KIND, packageVersion: 2, project: { type: 'board' } })).toEqual({ ok: false, error: NEWER_VERSION_ERROR })
    expect(readProjectPackage({ kind: PROJECT_PACKAGE_KIND, packageVersion: 2 })).toEqual({ ok: false, error: NEWER_VERSION_ERROR })
  })

  it('reads a missing, string, or fractional packageVersion as 1', () => {
    const { packageVersion: _dropped, ...withoutVersion } = boardPackage()
    for (const pkg of [withoutVersion, { ...boardPackage(), packageVersion: '1' }, { ...boardPackage(), packageVersion: '2' }, { ...boardPackage(), packageVersion: 1.5 }]) {
      expect(readProjectPackage(pkg).ok).toBe(true)
    }
  })

  it('accepts the current versions', () => {
    expect(readProjectPackage(boardPackage()).ok).toBe(true)
  })
})

describe('package migration', () => {
  it('migrates a schema-1 board package (running-bond offsets from mm to cell fractions)', () => {
    const result = readProjectPackage({
      kind: PROJECT_PACKAGE_KIND,
      schemaVersion: 1,
      project: {
        type: 'board',
        board: {
          id: 'old', name: 'Old board', construction: 'end',
          strips: [{ id: 'a', speciesId: 'walnut', width: 38 }, { id: 'b', speciesId: 'walnut', width: 38 }],
          endGrain: { rowOffsets: [19, -38] },
        },
      },
      woods: [],
    }, fixedContext())
    if (!result.ok || result.pkg.project.type !== 'board') throw new Error('expected a board')
    expect(result.pkg.project.board.endGrain.rowOffsets).toEqual([0.5, -1])
  })
})
```

If the `_dropped` binding trips `@typescript-eslint/no-unused-vars`, build `withoutVersion` with `const withoutVersion = boardPackage(); delete withoutVersion['packageVersion']` instead.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/packageEnvelope.test.ts`
Expected: FAIL. `NEWER_VERSION_ERROR` is not exported, and the refusal tests get `ok: true`. The migration test should already PASS, because Task 1's `normalizeIncoming` migrates; if it fails, fix `normalizeIncoming` before continuing.

- [ ] **Step 3: Implement the refusal**

In `src/packages/envelope.ts`, add below `SUPPORTED_PACKAGE_VERSION`:

```ts
export const NEWER_VERSION_ERROR = 'This project was made with a newer version of SawdustAtlas. Update this app to open it.'
```

Add beside `schemaVersionOf`:

```ts
// Files exported before the field was checked carry no usable packageVersion; they are version 1.
function packageVersionOf(raw: Record<string, unknown>): number {
  const version = raw['packageVersion']
  return typeof version === 'number' && Number.isInteger(version) ? version : 1
}
```

In `readProjectPackage`, insert directly after the `PROJECT_PACKAGE_KIND` check (before the `project` check):

```ts
  if (packageVersionOf(parsed) > SUPPORTED_PACKAGE_VERSION || schemaVersionOf(parsed) > LATEST_SCHEMA_VERSION) return fail(NEWER_VERSION_ERROR)
```

In `src/packages/index.ts`, add `NEWER_VERSION_ERROR` to the `./envelope` export list.

- [ ] **Step 4: Run the tests**

Run: `pnpm test tests/packageEnvelope.test.ts tests/projectPackage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/packages tests/packageEnvelope.test.ts
git commit -m "feat(packages): refuse packages from a newer app version"
```

### Task 3: Furniture kind and the kind contract suite

**Files:**
- Create: `src/packages/kinds/furniture.ts`, `tests/fixtures/packageKinds.ts`, `tests/packageKinds.test.ts`, `tests/packageFurniture.test.ts`
- Modify: `src/packages/kinds/index.ts`, `src/packages/shared.ts`, `src/normalize/woods.ts`, `TODO.md`

**Interfaces:**
- Consumes: everything from Task 1; `createFurniture` (`src/domain/workspace/furniture.ts`), `makeComposite` (`src/domain/workspace/composites.ts`), `fixedContext`, `FIXED_NOW` (`tests/fixtures/context.ts`)
- Produces: `FurniturePayload { type: 'furniture'; furniture: FurnitureProject }`, `furnitureKind`, `placeholderWoodsFor(speciesIds, library, ctx)` in `src/normalize/woods.ts`, `PACKAGE_KIND_FIXTURES` in `tests/fixtures/packageKinds.ts`

- [ ] **Step 1: Write the fixtures**

Create `tests/fixtures/packageKinds.ts`:

```ts
import { starterData } from '../../src/data'
import { makeComposite } from '../../src/domain/workspace/composites'
import { createFurniture } from '../../src/domain/workspace/furniture'
import { normalizeData } from '../../src/storage'
import type { AtlasData } from '../../src/types'
import { fixedContext } from './context'

export interface KindFixture {
  data: AtlasData
  id: string
}

function starter(): AtlasData {
  return normalizeData(structuredClone(starterData), fixedContext())
}

/** One workspace per registered package kind; the contract suite fails for a kind without one. */
export const PACKAGE_KIND_FIXTURES: Readonly<Record<string, () => KindFixture>> = {
  board: () => {
    const data = starter()
    return { data, id: data.boards[0]!.id }
  },
  composite: () => {
    const data = starter()
    const created = makeComposite(data, data.boards[0]!.id, fixedContext())!
    return { data: normalizeData(created.data, fixedContext()), id: created.id }
  },
  furniture: () => {
    // base-cabinet carries sheet materials and a subassembly, so the round trip covers them.
    const created = createFurniture(starter(), { templateId: 'base-cabinet', values: {} }, fixedContext())
    return { data: normalizeData(created.data, fixedContext()), id: created.id }
  },
}
```

- [ ] **Step 2: Write the contract suite**

Create `tests/packageKinds.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { LATEST_SCHEMA_VERSION } from '../src/domain/migrations'
import { NEWER_VERSION_ERROR, PACKAGE_KINDS, buildProjectPackage, describeProject, mergeProjectPackage, projectPackageFileName, readProjectPackage } from '../src/packages'
import type { AtlasData } from '../src/types'
import { fixedContext, FIXED_NOW } from './fixtures/context'
import { PACKAGE_KIND_FIXTURES } from './fixtures/packageKinds'

function freshIds() {
  let next = 0
  return () => `copy-${++next}`
}

function emptied(data: AtlasData): AtlasData {
  return { ...data, boards: [], composites: [], furniture: [], woods: [] }
}

// Runs against every registered kind; a new kind is covered by adding its fixture.
describe.each(PACKAGE_KINDS.map(kind => [kind.type, kind] as const))('package kind %s', (type, kind) => {
  function roundTrip() {
    const make = PACKAGE_KIND_FIXTURES[type]
    if (!make) throw new Error(`Register a fixture for package kind "${type}" in tests/fixtures/packageKinds.ts`)
    const { data, id } = make()
    const pkg = buildProjectPackage(data, { type, id }, FIXED_NOW)
    if (!pkg) throw new Error(`The ${type} fixture did not build a package`)
    const read = readProjectPackage(JSON.parse(JSON.stringify(pkg)), fixedContext())
    if (!read.ok) throw new Error(read.error)
    return { data, id, pkg, read: read.pkg }
  }

  it('reads back exactly what it built', () => {
    const { pkg, read } = roundTrip()
    expect(read.project).toEqual(pkg.project)
    expect(read.woods).toEqual(pkg.woods)
  })

  it('carries exactly the woods the project uses', () => {
    const { pkg } = roundTrip()
    const used = kind.usedWoodIds(pkg.project)
    expect(used.size).toBeGreaterThan(0)
    expect(new Set(pkg.woods.map(wood => wood.id))).toEqual(used)
  })

  it('merges into an empty workspace under its own id', () => {
    const { data, id, read } = roundTrip()
    const { data: merged, summary } = mergeProjectPackage(emptied(data), read, freshIds())
    expect(summary.importedAsCopy).toBe(false)
    expect(summary.projectId).toBe(id)
    expect(merged.woods.map(wood => wood.id).sort()).toEqual(read.woods.map(wood => wood.id).sort())
    expect(buildProjectPackage(merged, { type, id }, FIXED_NOW)?.project).toEqual(read.project)
  })

  it('imports a suffixed copy when the id is taken, leaving the original alone', () => {
    const { data, id, read } = roundTrip()
    const before = buildProjectPackage(data, { type, id }, FIXED_NOW)?.project
    const { data: merged, summary } = mergeProjectPackage(data, read, freshIds())
    expect(summary.importedAsCopy).toBe(true)
    expect(summary.projectId).not.toBe(id)
    const copy = buildProjectPackage(merged, { type, id: summary.projectId }, FIXED_NOW)
    if (!copy) throw new Error('the copy is missing')
    expect(describeProject(copy).name).toMatch(/ \(imported\)$/)
    expect(buildProjectPackage(merged, { type, id }, FIXED_NOW)?.project).toEqual(before)
  })

  it('describes itself for file names and previews', () => {
    const { pkg } = roundTrip()
    const description = describeProject(pkg)
    expect(description.name).not.toBe('')
    expect(description.label).not.toBe('')
    expect(description.size).not.toBe('')
    expect(projectPackageFileName(pkg)).toMatch(/\.sawdust-project\.json$/)
  })

  it('is refused when it comes from a newer app', () => {
    const { pkg } = roundTrip()
    const raw = JSON.parse(JSON.stringify(pkg)) as Record<string, unknown>
    expect(readProjectPackage({ ...raw, packageVersion: 2 })).toEqual({ ok: false, error: NEWER_VERSION_ERROR })
    expect(readProjectPackage({ ...raw, schemaVersion: LATEST_SCHEMA_VERSION + 1 })).toEqual({ ok: false, error: NEWER_VERSION_ERROR })
  })
})

describe('PACKAGE_KINDS', () => {
  it('registers board, composite, and furniture once each', () => {
    expect(PACKAGE_KINDS.map(kind => kind.type).sort()).toEqual(['board', 'composite', 'furniture'])
  })
})
```

- [ ] **Step 3: Write the furniture-specific tests**

Create `tests/packageFurniture.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildProjectPackage, mergeProjectPackage, readProjectPackage } from '../src/packages'
import type { AtlasData, WoodSpecies } from '../src/types'
import { fixedContext, FIXED_NOW } from './fixtures/context'
import { PACKAGE_KIND_FIXTURES } from './fixtures/packageKinds'

const ZEBRAWOOD: WoodSpecies = { id: 'zebrawood', name: 'Zebrawood', color: '#aa8855', accent: '#ccaa77', pricePerBoardFoot: 20 }

// The fixture's furniture with its first solid part made of zebrawood, a species most workspaces lack.
function zebrawoodWorkspace(): { data: AtlasData; id: string; partId: string } {
  const { data, id } = PACKAGE_KIND_FIXTURES['furniture']!()
  const project = data.furniture.find(p => p.id === id)!
  const part = project.parts.find(p => p.kind === 'solid')!
  const furniture = { ...project, parts: project.parts.map(p => p.id === part.id ? { ...p, speciesId: 'zebrawood' } : p) }
  return { data: { ...data, woods: [...data.woods, ZEBRAWOOD], furniture: [furniture] }, id, partId: part.id }
}

describe('furniture package', () => {
  it('round-trips every section of the project', () => {
    const { data, id } = PACKAGE_KIND_FIXTURES['furniture']!()
    const pkg = buildProjectPackage(data, { type: 'furniture', id }, FIXED_NOW)!
    const read = readProjectPackage(JSON.parse(JSON.stringify(pkg)), fixedContext())
    if (!read.ok || read.pkg.project.type !== 'furniture') throw new Error('expected furniture')
    const furniture = read.pkg.project.furniture
    for (const section of [furniture.parts, furniture.parameters, furniture.relationships, furniture.joints, furniture.subassemblies, furniture.sheetMaterials]) {
      expect(section.length).toBeGreaterThan(0)
    }
    expect(furniture).toEqual(data.furniture.find(p => p.id === id))
  })

  it('brings its species into a workspace that lacks them', () => {
    const { data, id, partId } = zebrawoodWorkspace()
    const pkg = buildProjectPackage(data, { type: 'furniture', id }, FIXED_NOW)!
    expect(pkg.woods.map(w => w.id)).toContain('zebrawood')
    const read = readProjectPackage(JSON.parse(JSON.stringify(pkg)), fixedContext())
    if (!read.ok) throw new Error(read.error)
    const target: AtlasData = { ...data, woods: data.woods.filter(w => w.id !== 'zebrawood'), furniture: [] }
    const { data: merged, summary } = mergeProjectPackage(target, read.pkg, () => 'unused')
    expect(merged.woods.find(w => w.id === 'zebrawood')).toEqual(ZEBRAWOOD)
    expect(merged.furniture[0]!.parts.find(p => p.id === partId)!.speciesId).toBe('zebrawood')
    expect(summary).toMatchObject({ boards: 0, composites: 0, furniture: 1, woodsAdded: 1 })
  })

  it('keeps a species id and adds a placeholder wood when the package lost its woods list', () => {
    const { data, id, partId } = zebrawoodWorkspace()
    const raw = JSON.parse(JSON.stringify(buildProjectPackage(data, { type: 'furniture', id }, FIXED_NOW))) as Record<string, unknown>
    delete raw['woods']
    const read = readProjectPackage(raw, fixedContext())
    if (!read.ok || read.pkg.project.type !== 'furniture') throw new Error('expected furniture')
    expect(read.pkg.project.furniture.parts.find(p => p.id === partId)!.speciesId).toBe('zebrawood')
    expect(read.pkg.woods.find(w => w.id === 'zebrawood')).toMatchObject({ id: 'zebrawood', name: 'zebrawood' })
  })

  it('fails cleanly when the furniture project is missing', () => {
    const result = readProjectPackage({ kind: 'sawdust-atlas/project-package', project: { type: 'furniture' } })
    expect(result).toEqual({ ok: false, error: 'The project package has no furniture project in it.' })
  })
})
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm test tests/packageKinds.test.ts tests/packageFurniture.test.ts`
Expected: FAIL. The registry test lists only board and composite, and the furniture tests get "unknown kind of project".

- [ ] **Step 5: Add placeholder woods for any list of species ids**

In `src/normalize/woods.ts`, replace `placeholderWoods` with:

```ts
/** Placeholder species for strip references missing from the library, so colors and prices stay visible. */
export function placeholderWoods(rawBoards: readonly Record<string, unknown>[], library: readonly WoodSpecies[], ctx: NormalizeContext): WoodSpecies[] {
  return placeholderWoodsFor(rawBoards.flatMap(board => records(board['strips']).map(strip => String(strip['speciesId'] ?? ''))), library, ctx)
}

/** Placeholder species for any referenced ids missing from the library. */
export function placeholderWoodsFor(speciesIds: readonly string[], library: readonly WoodSpecies[], ctx: NormalizeContext): WoodSpecies[] {
  const known = new Set(library.map(wood => wood.id))
  const missing = speciesIds.filter(id => id && !known.has(id))
  return [...new Set(missing)].map(id => normalizeWood({ id, name: id, color: '#8c6a48', accent: '#b18a5e', pricePerBoardFoot: 0 }, ctx))
}
```

- [ ] **Step 6: Make `normalizeIncoming` cover furniture species**

In `src/packages/shared.ts`, change the import from `'../normalize/woods'` to `import { normalizeWoodLibrary, placeholderWoodsFor } from '../normalize/woods'`, and replace the `return` line of `normalizeIncoming` with:

```ts
  const stripSpecies = rawBoards.flatMap(board => records(board['strips']).map(strip => String(strip['speciesId'] ?? '')))
  // A part naming a species the package does not carry gets a placeholder, so the id is never lost.
  const partSpecies = records(migrated['furniture']).flatMap(project => records(project['parts']).map(part => typeof part['speciesId'] === 'string' ? part['speciesId'] : ''))
  return { boards: [...boards, ...migratedBoards], composites, furniture, woods: [...library, ...placeholderWoodsFor([...stripSpecies, ...partSpecies], library, ctx)] }
```

- [ ] **Step 7: Write the furniture kind**

Create `src/packages/kinds/furniture.ts`:

```ts
import type { FurnitureProject } from '../../domain/furniture/types'
import type { PackageKind } from '../kind'
import { IMPORTED_SUFFIX, fail, isPlainRecord, normalizeIncoming } from '../shared'

export interface FurniturePayload {
  type: 'furniture'
  furniture: FurnitureProject
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

export const furnitureKind: PackageKind<FurniturePayload> = {
  type: 'furniture',
  build(data, id) {
    const furniture = data.furniture.find(p => p.id === id)
    return furniture ? { type: 'furniture', furniture } : null
  },
  read(input, ctx) {
    const raw = input.project['furniture']
    if (!isPlainRecord(raw)) return fail('The project package has no furniture project in it.')
    const incoming = normalizeIncoming({ schemaVersion: input.schemaVersion, woods: input.woods, furniture: [raw] }, ctx)
    const furniture = incoming.furniture[0]
    if (!furniture) return fail('The project package has no furniture project in it.')
    return { ok: true, payload: { type: 'furniture', furniture }, woods: incoming.woods }
  },
  merge(data, payload, ctx) {
    // Part, joint, and relationship ids are project-scoped, so only the project id can clash.
    const copy = data.furniture.some(p => p.id === payload.furniture.id)
    const furniture = copy ? { ...payload.furniture, id: ctx.createId(), name: payload.furniture.name + IMPORTED_SUFFIX } : payload.furniture
    return {
      data: { ...data, furniture: [...data.furniture, furniture] },
      summary: { boards: 0, composites: 0, furniture: 1, importedAsCopy: copy, projectId: furniture.id },
    }
  },
  usedWoodIds(payload) {
    return new Set(payload.furniture.parts.flatMap(part => part.speciesId === undefined ? [] : [part.speciesId]))
  },
  describe(payload) {
    return { name: payload.furniture.name, label: 'Furniture project', size: plural(payload.furniture.parts.length, 'part') }
  },
}
```

In `src/packages/kinds/index.ts`, import `furnitureKind` and `FurniturePayload`, re-export the type, and change:

```ts
export type ProjectPayload = BoardPayload | CompositePayload | FurniturePayload
// ...
export const PACKAGE_KINDS: readonly PackageKind<ProjectPayload>[] = [boardKind, compositeKind, furnitureKind]
```

- [ ] **Step 8: Run the tests**

Run: `pnpm test tests/packageKinds.test.ts tests/packageFurniture.test.ts tests/packageEnvelope.test.ts tests/projectPackage.test.ts tests/normalizeWoods.test.ts`
Expected: PASS. If `reads back exactly what it built` fails for furniture, the furniture normalizer is not idempotent on its own output. That is a real bug: report it as DONE_WITH_CONCERNS with the differing field and do not weaken the assertion.

- [ ] **Step 9: Log the backup gap**

In `TODO.md`, under the "AI-000 follow-ups" heading, add:

```markdown
- [ ] A full backup whose furniture names a species missing from its wood library gets no placeholder wood (packages do, via `placeholderWoodsFor`); `normalizeData` should add part species to its placeholder pass.
```

- [ ] **Step 10: Full gate and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test:coverage`
Expected: PASS.

```bash
git add src/packages src/normalize/woods.ts tests/fixtures/packageKinds.ts tests/packageKinds.test.ts tests/packageFurniture.test.ts TODO.md
git commit -m "feat(packages): furniture package kind and kind contract suite"
```

### Task 4: Furniture export and import in the UI

**Files:**
- Create: `src/packages/summary.ts`, `tests/packageSummary.test.ts`, `e2e/furniturePackage.spec.ts`
- Modify: `src/packages/index.ts`, `src/App.tsx`, `src/components/furniture/FurnitureDesigner.tsx`, `src/components/furniture/FurnitureGallery.tsx`, `playwright.config.ts:16`

**Interfaces:**
- Consumes: `KindMergeSummary`, `describeProject`, `ProjectType` (Tasks 1–3)
- Produces: `importedCountsText(summary: KindMergeSummary): string`; `FurnitureDesigner` prop `onExportProject: () => void`; `FurnitureGallery` prop `onImportProject: (file: File | undefined) => void`

- [ ] **Step 1: Write the failing summary test**

Create `tests/packageSummary.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { importedCountsText } from '../src/packages'

const base = { boards: 0, composites: 0, furniture: 0, importedAsCopy: false, projectId: 'x' }

describe('importedCountsText', () => {
  it('names what was added', () => {
    expect(importedCountsText({ ...base, boards: 1 })).toBe('1 board')
    expect(importedCountsText({ ...base, boards: 2, composites: 1 })).toBe('2 boards and 1 composite')
    expect(importedCountsText({ ...base, furniture: 1 })).toBe('1 furniture project')
    expect(importedCountsText({ ...base, boards: 1, composites: 2, furniture: 3 })).toBe('1 board, 2 composites and 3 furniture projects')
    expect(importedCountsText(base)).toBe('nothing')
  })
})
```

Run: `pnpm test tests/packageSummary.test.ts`
Expected: FAIL, `importedCountsText` is not exported.

- [ ] **Step 2: Implement it**

Create `src/packages/summary.ts`:

```ts
import type { KindMergeSummary } from './kind'

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** "2 boards and 1 composite": what an import added, for the summary dialog. */
export function importedCountsText(summary: KindMergeSummary): string {
  const parts = [
    summary.boards > 0 ? plural(summary.boards, 'board') : '',
    summary.composites > 0 ? plural(summary.composites, 'composite') : '',
    summary.furniture > 0 ? plural(summary.furniture, 'furniture project') : '',
  ].filter(part => part !== '')
  if (parts.length <= 1) return parts[0] ?? 'nothing'
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1] ?? ''}`
}
```

Add `export { importedCountsText } from './summary'` to `src/packages/index.ts`.

Run: `pnpm test tests/packageSummary.test.ts`
Expected: PASS.

- [ ] **Step 3: Use the kind description and counts in `App.tsx`**

- Add `describeProject` and `importedCountsText` to the import from `'./packages'`.
- In `importProjectFile`, replace the last line with:

```ts
    setProjectImport({ ok: true, summary: merged.summary, name: describeProject(read.pkg).name })
```

and delete the now-unused `const project = read.pkg.project` line.
- In `ProjectImportDialog`, replace the first `<p className="import-counts">` line with:

```tsx
          <p className="import-counts">Added <b>{result.name}</b> ({importedCountsText(result.summary)}). Nothing you already had was changed. Use Undo to take it back out.</p>
```

- Pass the new props:

```tsx
? <FurnitureDesigner key={`${project.id}:${furnitureOpens}`} project={project} woods={data.woods} boards={data.boards} allowances={data.allowances} {...(furnitureFocus ? { focusId: furnitureFocus } : {})} onChange={updateFurniture} onExportProject={() => exportProject({ type: 'furniture', id: project.id })} onBack={() => dispatch({ type: 'furnitureBack' })} />
: <FurnitureGallery projects={data.furniture} woods={data.woods} allowances={data.allowances} onCreate={createFurniture} onOpen={openFurniture} onDuplicate={duplicateFurniture} onDelete={deleteFurniture} onImportProject={importProjectFile} />
```

- [ ] **Step 4: Add the furniture designer's export button**

In `src/components/furniture/FurnitureDesigner.tsx`:
- Change the lucide import to `import { ArrowLeft, Download, X } from 'lucide-react'`.
- Add `onExportProject: () => void` to the props type (after `onChange`) and to the destructured parameter list.
- In `<header className="furniture-header">`, after the `furniture-issue-count` button, add:

```tsx
      <button type="button" className="button secondary" onClick={onExportProject} aria-label="Export project file"><Download size={15} />Export project</button>
```

- [ ] **Step 5: Add the furniture gallery's import button**

In `src/components/furniture/FurnitureGallery.tsx`:
- Change the React import to `import { memo, useMemo, useRef, useState } from 'react'` and add `Upload` to the lucide import.
- Add `onImportProject: (file: File | undefined) => void` to the props type and the destructured list.
- Add `const fileRef = useRef<HTMLInputElement>(null)` after `const [creating, setCreating] = useState(false)`.
- Directly inside `<div className="board-gallery furniture-gallery">`, before `<div className="gallery-grid">`, add (same markup as `BoardGallery`):

```tsx
    <div className="gallery-actions">
      <button type="button" className="button secondary" onClick={() => fileRef.current?.click()}><Upload size={15} />Import project</button>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden aria-label="Project file" onChange={e => { onImportProject(e.target.files?.[0]); e.currentTarget.value = '' }} />
    </div>
```

- [ ] **Step 6: Write the e2e spec**

Create `e2e/furniturePackage.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

// A furniture project leaves as a package file and comes back intact after the original is deleted.
test.describe('furniture package', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('sawdust-atlas:onboarded', '1'))
    page.on('dialog', dialog => { void dialog.accept() })
  })

  test('exports a project, deletes it, and imports it back', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Furniture', exact: true }).click()
    await page.getByRole('button', { name: 'New project' }).click()
    const create = page.getByRole('dialog', { name: 'New furniture project' })
    await create.getByRole('radio', { name: /Bookcase/ }).check()
    await create.getByRole('button', { name: 'Create project' }).click()

    const name = await page.getByRole('textbox', { name: 'Project name' }).inputValue()
    const parts = await page.locator('.furniture-parts').textContent()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export project file' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe(`${name}.sawdust-project.json`)
    const path = await download.path()

    await page.getByRole('button', { name: /^Furniture$/ }).first().click()
    await page.getByRole('button', { name: `Delete ${name}` }).click()
    await expect(page.locator('.furniture-card')).toHaveCount(0)

    await page.locator('input[type=file][aria-label="Project file"]').setInputFiles(path)
    const dialog = page.getByRole('dialog', { name: 'Project import summary' })
    await expect(dialog).toContainText('1 furniture project')
    await expect(dialog).not.toContainText(/added as a copy/i)
    await dialog.getByRole('button', { name: 'Done' }).click()

    await expect(page.locator('.furniture-card')).toHaveCount(1)
    await page.locator('.furniture-card-open').first().click()
    await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue(name)
    await expect(page.locator('.furniture-parts')).toHaveText(parts ?? '')
  })
})
```

In `playwright.config.ts:16`, append `'**/furniturePackage.spec.ts'` to `tabletSpecs`.

- [ ] **Step 7: Run everything**

Run: `pnpm typecheck && pnpm lint && pnpm test:coverage`
Expected: PASS.

Run: `pnpm test:e2e e2e/furniturePackage.spec.ts e2e/projectPackage.spec.ts e2e/furnitureGallery.spec.ts`
Expected: PASS in both `chromium` and `tablet` for `furniturePackage.spec.ts`.

- [ ] **Step 8: Commit and open PR A**

```bash
git add src/packages src/App.tsx src/components/furniture/FurnitureDesigner.tsx src/components/furniture/FurnitureGallery.tsx tests/packageSummary.test.ts e2e/furniturePackage.spec.ts playwright.config.ts
git commit -m "feat(packages): export and import furniture projects"
git push -u origin feat/ai-001-packages
gh pr create --base develop --title "feat: AI-001 PR A, package kinds registry and furniture packages" --body "Implements Tasks 1-4 of docs/plans/2026-10-18-ai-001-project-packages-sharing.md: package kinds registry (board, composite, furniture), newer-version refusal, kind contract suite, furniture Export project and Import project."
```

---

# PR B: Share out (Tasks 5–7)

Branch: `feat/ai-001-share-out` from `develop` after PR A merges.

### Task 5: Share config, link codec v1, and link encoding

**Files:**
- Create: `src/packages/share/config.ts`, `src/packages/link/errors.ts`, `src/packages/link/codec.ts`, `src/packages/link/base64url.ts`, `src/packages/link/codecs/v1.ts`, `src/packages/link/codecs/index.ts`, `src/packages/link/link.ts`
- Test: `tests/packageLink.test.ts`

**Interfaces:**
- Consumes: `buildProjectPackage`, `readProjectPackage` (PR A); `PACKAGE_KIND_FIXTURES` (`tests/fixtures/packageKinds.ts`)
- Produces:
  - `ShareConfig`, `SHARE_CONFIG`, `TOO_LARGE_ERROR`, `packageFileTooLarge(size, config?)` (`share/config.ts`)
  - `LINK_DAMAGED_ERROR`, `LINK_NEWER_CODEC_ERROR` (`link/errors.ts`)
  - `LinkCodec { version; encode(value): Promise<string>; decode(payload, limits): Promise<DecodeResult> }`, `DecodeResult` (`link/codec.ts`)
  - `bytesToBase64Url(bytes)`, `base64UrlToBytes(text): Uint8Array<ArrayBuffer> | null`
  - `v1Codec`, `LINK_CODECS`, `CURRENT_CODEC`, `findCodec(version)`
  - `LinkLimits`, `parseFragment(hash)`, `encodeLink(intent, value, baseUrl, codec?)`, `decodeValue(encoded, limits)`, `decodeFragment(hash, limits)` (`link/link.ts`)

- [ ] **Step 1: Write the failing tests**

Create `tests/packageLink.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { base64UrlToBytes, bytesToBase64Url } from '../src/packages/link/base64url'
import { v1Codec } from '../src/packages/link/codecs/v1'
import { LINK_DAMAGED_ERROR, LINK_NEWER_CODEC_ERROR } from '../src/packages/link/errors'
import { decodeFragment, encodeLink, parseFragment } from '../src/packages/link/link'
import { PACKAGE_KINDS, buildProjectPackage, readProjectPackage } from '../src/packages'
import { SHARE_CONFIG, TOO_LARGE_ERROR, packageFileTooLarge } from '../src/packages/share/config'
import { fixedContext, FIXED_NOW } from './fixtures/context'
import { PACKAGE_KIND_FIXTURES } from './fixtures/packageKinds'

const BASE = 'https://atlas.example/'

// Deterministic, poorly compressible bytes (a linear congruential generator).
function noise(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length)
  let seed = 12345
  for (let i = 0; i < length; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0
    bytes[i] = seed >>> 24
  }
  return bytes
}

const fragmentOf = (link: string) => link.slice(BASE.length)

describe('base64url', () => {
  it('round-trips bytes, including payloads too large to spread into one call', () => {
    for (const length of [0, 1, 2, 3, 4, 1000, 300_000]) {
      const bytes = noise(length)
      const text = bytesToBase64Url(bytes)
      expect(text).toMatch(/^[A-Za-z0-9_-]*$/)
      expect(base64UrlToBytes(text)).toEqual(bytes)
    }
  })

  it('rejects text that is not base64url', () => {
    for (const bad of ['ab+c', 'ab/c', 'abc=', 'a', 'abcde', 'ab c']) expect(base64UrlToBytes(bad)).toBeNull()
  })
})

describe('share links', () => {
  it.each(PACKAGE_KINDS.map(kind => kind.type))('round-trips a %s package', async type => {
    const { data, id } = PACKAGE_KIND_FIXTURES[type]!()
    const pkg = buildProjectPackage(data, { type, id }, FIXED_NOW)!
    const link = await encodeLink('share', pkg, BASE)
    expect(link.startsWith(`${BASE}#share=v1.`)).toBe(true)
    const decoded = await decodeFragment(fragmentOf(link), SHARE_CONFIG)
    if (!decoded.ok) throw new Error(decoded.error)
    expect(decoded.intent).toBe('share')
    const read = readProjectPackage(decoded.value, fixedContext())
    expect(read.ok && read.pkg.project).toEqual(pkg.project)
  })

  it('keeps non-ASCII names intact', async () => {
    const { data, id } = PACKAGE_KIND_FIXTURES['board']!()
    const name = 'Noyer & érable, “café” 胡桃 🪵'
    const pkg = buildProjectPackage({ ...data, boards: data.boards.map(b => b.id === id ? { ...b, name } : b) }, { type: 'board', id }, FIXED_NOW)!
    const decoded = await decodeFragment(fragmentOf(await encodeLink('share', pkg, BASE)), SHARE_CONFIG)
    expect(decoded.ok && (decoded.value as { project: { board: { name: string } } }).project.board.name).toBe(name)
  })

  it('encodes a large, poorly compressible value without throwing', async () => {
    const text = Array.from(noise(400_000), byte => String.fromCharCode(97 + (byte % 26))).join('')
    await expect(v1Codec.encode(text)).resolves.toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('parses the intent and payload out of a fragment', () => {
    expect(parseFragment('#share=v1.abc')).toEqual({ intent: 'share', encoded: 'v1.abc' })
    expect(parseFragment('share=v1.a=b')).toEqual({ intent: 'share', encoded: 'v1.a=b' })
    expect(parseFragment('#share')).toBeNull()
    expect(parseFragment('#=v1.abc')).toBeNull()
  })
})

describe('decodeFragment errors', () => {
  it('reports a damaged link', async () => {
    const valid = fragmentOf(await encodeLink('share', { hello: 'world' }, BASE))
    const notJson = `#share=v1.${bytesToBase64Url(new Uint8Array(await new Response(new Blob(['not json']).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()))}`
    for (const hash of ['', '#share', '#share=nodot', '#share=x1.abc', '#share=v1.@@@@', '#share=v1.AAAA', valid.slice(0, valid.length - 6), notJson]) {
      expect(await decodeFragment(hash, SHARE_CONFIG)).toEqual({ ok: false, error: LINK_DAMAGED_ERROR })
    }
  })

  it('asks for a newer app on an unknown codec version', async () => {
    expect(await decodeFragment('#share=v2.abc', SHARE_CONFIG)).toEqual({ ok: false, error: LINK_NEWER_CODEC_ERROR })
  })

  it('refuses a fragment over the incoming length limit before decoding it', async () => {
    const valid = fragmentOf(await encodeLink('share', { hello: 'world' }, BASE))
    expect(await decodeFragment(valid, { ...SHARE_CONFIG, maxIncomingFragmentLength: valid.length - 1 })).toEqual({ ok: false, error: TOO_LARGE_ERROR })
    expect((await decodeFragment(valid, { ...SHARE_CONFIG, maxIncomingFragmentLength: valid.length })).ok).toBe(true)
  })

  it('cancels a small payload that inflates past the decoded-size cap', async () => {
    const bomb = fragmentOf(await encodeLink('share', 'a'.repeat(3_000_000), BASE))
    expect(bomb.length).toBeLessThan(SHARE_CONFIG.maxIncomingFragmentLength)
    expect(await decodeFragment(bomb, SHARE_CONFIG)).toEqual({ ok: false, error: TOO_LARGE_ERROR })
  })
})

describe('packageFileTooLarge', () => {
  it('allows a file at the limit and refuses one byte over', () => {
    expect(packageFileTooLarge(SHARE_CONFIG.maxPackageFileBytes)).toBe(false)
    expect(packageFileTooLarge(SHARE_CONFIG.maxPackageFileBytes + 1)).toBe(true)
  })
})
```

Run: `pnpm test tests/packageLink.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 2: Write the config and the error strings**

Create `src/packages/share/config.ts`:

```ts
export interface ShareConfig {
  /** Longest link offered; messaging apps and mail clients truncate longer ones. */
  maxLinkLength: number
  /** Longest link drawn as a QR code (version 40-L holds 2,953 bytes). */
  maxQrLinkLength: number
  /** Longest incoming fragment read; twice the outbound limit so a later raise does not break older readers. */
  maxIncomingFragmentLength: number
  /** Most bytes a link payload may inflate to. */
  maxDecodedBytes: number
  /** Largest package file read. */
  maxPackageFileBytes: number
}

export const SHARE_CONFIG: ShareConfig = {
  maxLinkLength: 8000,
  maxQrLinkLength: 2900,
  maxIncomingFragmentLength: 16000,
  maxDecodedBytes: 1024 * 1024,
  maxPackageFileBytes: 5 * 1024 * 1024,
}

export const TOO_LARGE_ERROR = 'This share link or file is too large to be a SawdustAtlas project.'

export function packageFileTooLarge(size: number, config: Pick<ShareConfig, 'maxPackageFileBytes'> = SHARE_CONFIG): boolean {
  return size > config.maxPackageFileBytes
}
```

Create `src/packages/link/errors.ts`:

```ts
export const LINK_DAMAGED_ERROR = 'This share link is damaged or incomplete. Ask for the file instead.'
export const LINK_NEWER_CODEC_ERROR = 'This link needs a newer version of SawdustAtlas.'
```

- [ ] **Step 3: Write base64url**

Create `src/packages/link/base64url.ts`:

```ts
// Spreading a whole payload into String.fromCharCode overflows the call stack past ~100 KB.
const CHUNK = 0x8000

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let start = 0; start < bytes.length; start += CHUNK) binary += String.fromCharCode(...bytes.subarray(start, start + CHUNK))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlToBytes(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  let binary: string
  try {
    binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  } catch {
    return null
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
```

- [ ] **Step 4: Write the codec contract and v1**

Create `src/packages/link/codec.ts`:

```ts
export type DecodeResult = { ok: true; value: unknown } | { ok: false; error: string }

export interface LinkCodec {
  /** The prefix before the first "." of a link payload, e.g. "v1". */
  readonly version: string
  encode(value: unknown): Promise<string>
  decode(payload: string, limits: { maxDecodedBytes: number }): Promise<DecodeResult>
}
```

Create `src/packages/link/codecs/v1.ts`:

```ts
import { TOO_LARGE_ERROR } from '../../share/config'
import { base64UrlToBytes, bytesToBase64Url } from '../base64url'
import type { LinkCodec } from '../codec'
import { LINK_DAMAGED_ERROR } from '../errors'

function streamOf(bytes: Uint8Array<ArrayBuffer>): ReadableStream<Uint8Array<ArrayBuffer>> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

// Reads chunk by chunk and cancels past the cap, so a tiny payload cannot inflate into memory exhaustion.
async function inflate(bytes: Uint8Array<ArrayBuffer>, maxBytes: number): Promise<Uint8Array<ArrayBuffer> | 'too-large' | 'damaged'> {
  const reader = streamOf(bytes).pipeThrough(new DecompressionStream('deflate-raw')).getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return 'too-large'
      }
      chunks.push(value)
    }
  } catch {
    return 'damaged'
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

/** Compact JSON, deflate-raw, base64url. */
export const v1Codec: LinkCodec = {
  version: 'v1',
  async encode(value) {
    const input = new TextEncoder().encode(JSON.stringify(value))
    const compressed = await new Response(streamOf(input).pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()
    return bytesToBase64Url(new Uint8Array(compressed))
  },
  async decode(payload, limits) {
    const bytes = base64UrlToBytes(payload)
    if (!bytes || bytes.length === 0) return { ok: false, error: LINK_DAMAGED_ERROR }
    const inflated = await inflate(bytes, limits.maxDecodedBytes)
    if (inflated === 'too-large') return { ok: false, error: TOO_LARGE_ERROR }
    if (inflated === 'damaged') return { ok: false, error: LINK_DAMAGED_ERROR }
    try {
      return { ok: true, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(inflated)) as unknown }
    } catch {
      return { ok: false, error: LINK_DAMAGED_ERROR }
    }
  },
}
```

If `pnpm typecheck` rejects a `Uint8Array` where a `BufferSource` is expected, the value was typed `Uint8Array<ArrayBufferLike>`; type it `Uint8Array<ArrayBuffer>` (every array made with `new Uint8Array(length)` or `TextEncoder.encode` is one). Do not add casts to `any`.

Create `src/packages/link/codecs/index.ts`:

```ts
import type { LinkCodec } from '../codec'
import { v1Codec } from './v1'

// Every codec ever shipped stays here so old links keep opening; new links use CURRENT_CODEC.
export const LINK_CODECS: readonly LinkCodec[] = [v1Codec]
export const CURRENT_CODEC: LinkCodec = v1Codec

export function findCodec(version: string): LinkCodec | undefined {
  return LINK_CODECS.find(codec => codec.version === version)
}
```

- [ ] **Step 5: Write link encoding and decoding**

Create `src/packages/link/link.ts`:

```ts
import type { ShareConfig } from '../share/config'
import { TOO_LARGE_ERROR } from '../share/config'
import type { DecodeResult, LinkCodec } from './codec'
import { CURRENT_CODEC, findCodec } from './codecs'
import { LINK_DAMAGED_ERROR, LINK_NEWER_CODEC_ERROR } from './errors'

export type LinkLimits = Pick<ShareConfig, 'maxIncomingFragmentLength' | 'maxDecodedBytes'>

export interface ParsedFragment {
  intent: string
  /** `<codec version>.<payload>` */
  encoded: string
}

/** Splits `#<intent>=<encoded>`; null when there is no intent name. */
export function parseFragment(hash: string): ParsedFragment | null {
  const body = hash.startsWith('#') ? hash.slice(1) : hash
  const equals = body.indexOf('=')
  return equals > 0 ? { intent: body.slice(0, equals), encoded: body.slice(equals + 1) } : null
}

/** `<baseUrl>#<intent>=<version>.<payload>`; the fragment never reaches a server. */
export async function encodeLink(intent: string, value: unknown, baseUrl: string, codec: LinkCodec = CURRENT_CODEC): Promise<string> {
  return `${baseUrl}#${intent}=${codec.version}.${await codec.encode(value)}`
}

export async function decodeValue(encoded: string, limits: LinkLimits): Promise<DecodeResult> {
  if (encoded.length > limits.maxIncomingFragmentLength) return { ok: false, error: TOO_LARGE_ERROR }
  const dot = encoded.indexOf('.')
  const version = dot > 0 ? encoded.slice(0, dot) : ''
  if (!/^v\d+$/.test(version)) return { ok: false, error: LINK_DAMAGED_ERROR }
  const codec = findCodec(version)
  if (!codec) return { ok: false, error: LINK_NEWER_CODEC_ERROR }
  return codec.decode(encoded.slice(dot + 1), limits)
}

export async function decodeFragment(hash: string, limits: LinkLimits): Promise<{ ok: true; intent: string; value: unknown } | { ok: false; error: string }> {
  if (hash.length > limits.maxIncomingFragmentLength) return { ok: false, error: TOO_LARGE_ERROR }
  const parsed = parseFragment(hash)
  if (!parsed) return { ok: false, error: LINK_DAMAGED_ERROR }
  const decoded = await decodeValue(parsed.encoded, limits)
  return decoded.ok ? { ok: true, intent: parsed.intent, value: decoded.value } : decoded
}
```

- [ ] **Step 6: Run the tests**

Run: `pnpm test tests/packageLink.test.ts`
Expected: PASS. If `'#share=v1.AAAA'` is not reported damaged, the inflate loop is not surfacing the stream error on close; it must return `'damaged'`.

Run: `pnpm typecheck && pnpm lint && pnpm test:coverage`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/packages/share/config.ts src/packages/link tests/packageLink.test.ts
git commit -m "feat(packages): share link codec v1 with incoming size limits"
```

### Task 6: Share targets (file, link, QR)

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (via `pnpm add`)
- Create: `src/packages/share/target.ts`, `src/packages/share/qr.ts`, `src/packages/share/targets/file.ts`, `src/packages/share/targets/link.ts`, `src/packages/share/targets/qr.ts`, `src/packages/share/targets/index.ts`
- Test: `tests/shareTargets.test.ts`

**Interfaces:**
- Consumes: `ProjectPackage` (PR A), `ShareConfig`, `SHARE_CONFIG` (Task 5)
- Produces: `ShareEnvironment`, `ShareContext`, `ShareIO`, `ShareDetail`, `ShareAvailability`, `ShareTarget`, `NO_LINK_REASON` (`share/target.ts`); `qrModules(text): boolean[][] | null`; `fileTarget`, `linkTarget`, `qrTarget`, `SHARE_TARGETS`

- [ ] **Step 1: Measure the bundle baseline, then add the QR dependency**

Run: `pnpm build 2>&1 | grep -E '\.js ' | sort -k2 -h | tail -5` and save the output in the task report as the baseline.

Run: `pnpm add -E qrcode-generator@2.0.4`
Expected: `package.json` gains `"qrcode-generator": "2.0.4"` under `dependencies` (exact, no caret). Confirm the license: `node -e "console.log(require('./node_modules/qrcode-generator/package.json').license)"` prints `MIT`.

Read `node_modules/qrcode-generator/dist/qrcode.d.ts` to confirm the import form. The code below assumes `import qrcode from 'qrcode-generator'` and `qrcode(typeNumber, errorCorrectionLevel)` returning an object with `addData`, `make`, `getModuleCount`, `isDark`. If the typings export it differently, adjust only the import line.

- [ ] **Step 2: Write the failing tests**

Create `tests/shareTargets.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildProjectPackage, describeProject, projectPackageFileName } from '../src/packages'
import type { ProjectPackage } from '../src/packages'
import { SHARE_CONFIG } from '../src/packages/share/config'
import { qrModules } from '../src/packages/share/qr'
import type { ShareContext, ShareEnvironment, ShareIO } from '../src/packages/share/target'
import { SHARE_TARGETS, fileTarget, linkTarget, qrTarget } from '../src/packages/share/targets'
import { FIXED_NOW } from './fixtures/context'
import { PACKAGE_KIND_FIXTURES } from './fixtures/packageKinds'

const TEST_CONFIG = { ...SHARE_CONFIG, maxLinkLength: 100, maxQrLinkLength: 60 }
const NO_SHARING: ShareEnvironment = { secureContext: false, webShare: false, webShareFiles: false, clipboard: false }
const ENVIRONMENTS: ShareEnvironment[] = [
  NO_SHARING,
  { secureContext: true, webShare: false, webShareFiles: false, clipboard: true },
  { secureContext: true, webShare: true, webShareFiles: false, clipboard: true },
  { secureContext: true, webShare: true, webShareFiles: true, clipboard: true },
]

function pkg(): ProjectPackage {
  const { data, id } = PACKAGE_KIND_FIXTURES['board']!()
  return buildProjectPackage(data, { type: 'board', id }, FIXED_NOW)!
}

function context(link: string | null, env: ShareEnvironment = NO_SHARING): ShareContext {
  const p = pkg()
  return { pkg: p, name: describeProject(p).name, fileName: projectPackageFileName(p), json: JSON.stringify(p, null, 2), link, config: TEST_CONFIG, env }
}

function fakeIO() {
  const calls: string[] = []
  const io: ShareIO = {
    shareFile: fileName => { calls.push(`shareFile:${fileName}`); return Promise.resolve() },
    shareUrl: url => { calls.push(`shareUrl:${url}`); return Promise.resolve() },
    copyText: text => { calls.push(`copyText:${text}`); return Promise.resolve() },
    download: fileName => { calls.push(`download:${fileName}`) },
  }
  return { io, calls }
}

const link = (length: number) => 'a'.repeat(length)

describe.each(SHARE_TARGETS.map(target => [target.id, target] as const))('share target %s', (_id, target) => {
  const contexts = [null, link(10), link(60), link(61), link(100), link(101)].flatMap(l => ENVIRONMENTS.map(env => context(l, env)))

  it('gives a reason whenever it is unavailable', () => {
    for (const ctx of contexts) {
      const availability = target.available(ctx)
      if (!availability.ok) expect(availability.reason.length).toBeGreaterThan(0)
    }
  })

  it('runs its action through exactly one browser call', async () => {
    for (const ctx of contexts) {
      if (!target.available(ctx).ok || target.action(ctx) === null) continue
      const { io, calls } = fakeIO()
      await expect(target.run(ctx, io)).resolves.toEqual(expect.any(String))
      expect(calls).toHaveLength(1)
    }
  })
})

describe('file target', () => {
  it('is always available and downloads unless the share sheet takes files', async () => {
    expect(fileTarget.available(context(null))).toEqual({ ok: true })
    expect(fileTarget.action(context(null))).toBe('Download file')
    const sheet = context(null, ENVIRONMENTS[3])
    expect(fileTarget.action(sheet)).toBe('Share file')
    const { io, calls } = fakeIO()
    await fileTarget.run(context(null), io)
    expect(calls).toEqual([`download:${context(null).fileName}`])
  })
})

describe('link target', () => {
  it('is available up to maxLinkLength and not one character more', () => {
    expect(linkTarget.available(context(link(99))).ok).toBe(true)
    expect(linkTarget.available(context(link(100))).ok).toBe(true)
    expect(linkTarget.available(context(link(101)))).toEqual({ ok: false, reason: 'This project is too big for a link. Share the file instead.' })
    expect(linkTarget.available(context(null)).ok).toBe(false)
  })

  it('offers share, then copy, then only the selectable text', async () => {
    expect(linkTarget.action(context(link(10), ENVIRONMENTS[2]))).toBe('Share link')
    expect(linkTarget.action(context(link(10), ENVIRONMENTS[1]))).toBe('Copy link')
    expect(linkTarget.action(context(link(10), NO_SHARING))).toBeNull()
    expect(linkTarget.detail(context(link(10)))).toEqual({ kind: 'text', label: 'Share link', value: link(10) })
    const { io, calls } = fakeIO()
    await expect(linkTarget.run(context(link(10), ENVIRONMENTS[1]), io)).resolves.toBe('Link copied.')
    expect(calls).toEqual([`copyText:${link(10)}`])
  })
})

describe('QR target', () => {
  it('is available up to maxQrLinkLength and not one character more', () => {
    expect(qrTarget.available(context(link(59))).ok).toBe(true)
    expect(qrTarget.available(context(link(60))).ok).toBe(true)
    expect(qrTarget.available(context(link(61)))).toEqual({ ok: false, reason: 'This project is too big for a QR code. Use the link or the file instead.' })
  })

  it('draws a square module grid', () => {
    const detail = qrTarget.detail(context(link(40)))
    if (!detail || detail.kind !== 'qr') throw new Error('expected a QR detail')
    expect(detail.modules.length).toBeGreaterThan(20)
    expect(detail.modules.every(row => row.length === detail.modules.length)).toBe(true)
  })
})

describe('qrModules', () => {
  it('fits the real QR limit in one code and refuses more than a code holds', () => {
    expect(qrModules('h'.repeat(SHARE_CONFIG.maxQrLinkLength))?.length).toBe(177)
    expect(qrModules('h'.repeat(3500))).toBeNull()
  })
})
```

Run: `pnpm test tests/shareTargets.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the target contract**

Create `src/packages/share/target.ts`:

```ts
import type { ProjectPackage } from '../envelope'
import type { ShareConfig } from './config'

/** What this browser offers, detected by the caller; this module never touches navigator. */
export interface ShareEnvironment {
  /** HTTPS or localhost; Web Share and the clipboard need it. */
  secureContext: boolean
  webShare: boolean
  /** The share sheet accepts this package's file. */
  webShareFiles: boolean
  clipboard: boolean
}

export interface ShareContext {
  pkg: ProjectPackage
  name: string
  fileName: string
  /** The package file's contents. */
  json: string
  /** The share link, or null when it could not be made. */
  link: string | null
  config: ShareConfig
  env: ShareEnvironment
}

/** The browser side of sharing, injected so targets stay pure and testable. */
export interface ShareIO {
  shareFile(fileName: string, json: string, title: string): Promise<void>
  shareUrl(url: string, title: string): Promise<void>
  copyText(text: string): Promise<void>
  download(fileName: string, json: string): void
}

export type ShareDetail =
  | { kind: 'text'; label: string; value: string }
  | { kind: 'qr'; label: string; modules: readonly (readonly boolean[])[] }

export type ShareAvailability = { ok: true } | { ok: false; reason: string }

export interface ShareTarget {
  readonly id: string
  readonly label: string
  available(ctx: ShareContext): ShareAvailability
  /** The button label, or null when the detail alone is the way to share. */
  action(ctx: ShareContext): string | null
  detail(ctx: ShareContext): ShareDetail | null
  /** Runs the action; resolves to a short status for screen readers. */
  run(ctx: ShareContext, io: ShareIO): Promise<string>
}

export const NO_LINK_REASON = 'A link could not be made for this project. Share the file instead.'
```

- [ ] **Step 4: Write the QR grid helper**

Create `src/packages/share/qr.ts`:

```ts
import qrcode from 'qrcode-generator'

// The dialog asks twice per render (available, then detail); one cached result keeps that cheap.
let last: { text: string; modules: boolean[][] | null } | undefined

/** The QR module grid (true = dark) at the lowest error correction, or null when the text does not fit one code. */
export function qrModules(text: string): boolean[][] | null {
  if (last?.text === text) return last.modules
  let modules: boolean[][] | null
  try {
    const qr = qrcode(0, 'L')
    qr.addData(text, 'Byte')
    qr.make()
    const size = qr.getModuleCount()
    modules = Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => qr.isDark(row, col)))
  } catch {
    modules = null
  }
  last = { text, modules }
  return modules
}
```

- [ ] **Step 5: Write the three targets and the registry**

Create `src/packages/share/targets/file.ts`:

```ts
import type { ShareTarget } from '../target'

export const fileTarget: ShareTarget = {
  id: 'file',
  label: 'File',
  available() {
    return { ok: true }
  },
  action(ctx) {
    return ctx.env.webShareFiles ? 'Share file' : 'Download file'
  },
  detail() {
    return null
  },
  async run(ctx, io) {
    if (ctx.env.webShareFiles) {
      await io.shareFile(ctx.fileName, ctx.json, ctx.name)
      return 'Opened the share sheet.'
    }
    io.download(ctx.fileName, ctx.json)
    return `Downloaded ${ctx.fileName}.`
  },
}
```

Create `src/packages/share/targets/link.ts`:

```ts
import { NO_LINK_REASON } from '../target'
import type { ShareTarget } from '../target'

export const linkTarget: ShareTarget = {
  id: 'link',
  label: 'Link',
  available(ctx) {
    if (ctx.link === null) return { ok: false, reason: NO_LINK_REASON }
    if (ctx.link.length > ctx.config.maxLinkLength) return { ok: false, reason: 'This project is too big for a link. Share the file instead.' }
    return { ok: true }
  },
  action(ctx) {
    if (ctx.env.webShare) return 'Share link'
    return ctx.env.clipboard ? 'Copy link' : null
  },
  detail(ctx) {
    return ctx.link === null ? null : { kind: 'text', label: 'Share link', value: ctx.link }
  },
  async run(ctx, io) {
    if (ctx.link === null) return ''
    if (ctx.env.webShare) {
      await io.shareUrl(ctx.link, ctx.name)
      return 'Opened the share sheet.'
    }
    await io.copyText(ctx.link)
    return 'Link copied.'
  },
}
```

Create `src/packages/share/targets/qr.ts`:

```ts
import { qrModules } from '../qr'
import { NO_LINK_REASON } from '../target'
import type { ShareTarget } from '../target'

export const qrTarget: ShareTarget = {
  id: 'qr',
  label: 'QR code',
  available(ctx) {
    if (ctx.link === null) return { ok: false, reason: NO_LINK_REASON }
    if (ctx.link.length > ctx.config.maxQrLinkLength || !qrModules(ctx.link)) return { ok: false, reason: 'This project is too big for a QR code. Use the link or the file instead.' }
    return { ok: true }
  },
  action() {
    return null
  },
  detail(ctx) {
    const modules = ctx.link === null ? null : qrModules(ctx.link)
    return modules ? { kind: 'qr', label: 'Scan to open this project', modules } : null
  },
  run() {
    return Promise.resolve('')
  },
}
```

Create `src/packages/share/targets/index.ts`:

```ts
import type { ShareTarget } from '../target'
import { fileTarget } from './file'
import { linkTarget } from './link'
import { qrTarget } from './qr'

export { fileTarget, linkTarget, qrTarget }

// The share dialog renders these in order; a new way to share (AI-003 hand-off, AI-004 attach) is one more entry.
export const SHARE_TARGETS: readonly ShareTarget[] = [fileTarget, linkTarget, qrTarget]
```

- [ ] **Step 6: Run the tests and the gate**

Run: `pnpm test tests/shareTargets.test.ts`
Expected: PASS.

Run: `pnpm typecheck && pnpm lint && pnpm test:coverage`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml src/packages/share tests/shareTargets.test.ts
git commit -m "feat(packages): share targets for file, link, and QR code"
```

### Task 7: Share dialog and Share buttons

**Files:**
- Create: `src/components/share/browserShareIO.ts`, `src/components/share/ShareDialog.tsx`, `src/components/benchDetect.ts`, `e2e/share.spec.ts`
- Delete: `src/projectPackageDownload.ts`
- Modify: `src/components/ConnectionNotice.tsx`, `src/App.tsx`, `src/components/BoardDesigner.tsx`, `src/components/composite/CompositeScreen.tsx`, `src/components/furniture/FurnitureDesigner.tsx`, `src/styles.css`, `playwright.config.ts:16`

**Interfaces:**
- Consumes: `SHARE_TARGETS`, `ShareContext`, `ShareIO`, `ShareEnvironment`, `ShareDetail`, `ShareTarget` (Task 6); `encodeLink` (Task 5); `SHARE_CONFIG`, `TOO_LARGE_ERROR`, `packageFileTooLarge` (Task 5); `describeProject`, `projectPackageFileName`, `buildProjectPackage`, `ProjectPackage`, `ProjectType` (PR A)
- Produces: `browserShareIO: ShareIO`, `detectShareEnvironment(fileName, json)`, `appBaseUrl()`, `detectBenchCapabilities()`, `ShareDialog({ pkg, onClose })`; a new `onShareProject: () => void` prop on `BoardDesigner`, `CompositeScreen`, and `FurnitureDesigner`

- [ ] **Step 1: Extract bench detection**

Create `src/components/benchDetect.ts`:

```ts
import { describeBenchCapabilities } from '../domain/benchCapabilities'
import type { BenchCapabilities } from '../domain/benchCapabilities'

export function detectBenchCapabilities(): BenchCapabilities {
  return describeBenchCapabilities({
    secureContext: window.isSecureContext,
    serviceWorker: 'serviceWorker' in navigator,
    wakeLock: 'wakeLock' in navigator,
    storageManager: typeof navigator.storage !== 'undefined',
  })
}
```

In `src/components/ConnectionNotice.tsx`, delete the local `detect` function, import `detectBenchCapabilities` from `'./benchDetect'`, replace each call to `detect()` with `detectBenchCapabilities()`, and remove the now-unused `describeBenchCapabilities` import (keep the `BenchCapabilities` type import if it is still used).

- [ ] **Step 2: Write the browser adapter**

Create `src/components/share/browserShareIO.ts`:

```ts
import type { ShareEnvironment, ShareIO } from '../../packages/share/target'

const JSON_TYPE = 'application/json'

function packageFile(fileName: string, json: string): File {
  return new File([json], fileName, { type: JSON_TYPE })
}

export const browserShareIO: ShareIO = {
  async shareFile(fileName, json, title) {
    await navigator.share({ files: [packageFile(fileName, json)], title })
  },
  async shareUrl(url, title) {
    await navigator.share({ url, title })
  },
  async copyText(text) {
    await navigator.clipboard.writeText(text)
  },
  download(fileName, json) {
    const url = URL.createObjectURL(new Blob([json], { type: JSON_TYPE }))
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  },
}

export function detectShareEnvironment(fileName: string, json: string): ShareEnvironment {
  const webShare = 'share' in navigator
  let webShareFiles = false
  try {
    webShareFiles = webShare && 'canShare' in navigator && navigator.canShare({ files: [packageFile(fileName, json)] })
  } catch {
    webShareFiles = false
  }
  return { secureContext: window.isSecureContext, webShare, webShareFiles, clipboard: 'clipboard' in navigator }
}

/** This app's address and base path, so a link opens the same app it came from. */
export function appBaseUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href
}
```

- [ ] **Step 3: Write the share dialog**

Create `src/components/share/ShareDialog.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { describeProject, projectPackageFileName } from '../../packages'
import type { ProjectPackage } from '../../packages'
import { encodeLink } from '../../packages/link/link'
import { SHARE_CONFIG } from '../../packages/share/config'
import type { ShareContext, ShareDetail, ShareTarget } from '../../packages/share/target'
import { SHARE_TARGETS } from '../../packages/share/targets'
import { detectBenchCapabilities } from '../benchDetect'
import { useModalDialog } from '../useModalDialog'
import { appBaseUrl, browserShareIO, detectShareEnvironment } from './browserShareIO'

// Renders whatever targets are registered; it has no per-target logic.
export function ShareDialog({ pkg, onClose }: { pkg: ProjectPackage; onClose: () => void }) {
  const dialogRef = useModalDialog<HTMLDivElement>(onClose)
  const name = describeProject(pkg).name
  const [ctx, setCtx] = useState<ShareContext | null>(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    let cancelled = false
    const fileName = projectPackageFileName(pkg)
    const json = JSON.stringify(pkg, null, 2)
    const base = { pkg, name: describeProject(pkg).name, fileName, json, config: SHARE_CONFIG, env: detectShareEnvironment(fileName, json) }
    encodeLink('share', pkg, appBaseUrl())
      .catch(() => null)
      .then(link => { if (!cancelled) setCtx({ ...base, link }) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [pkg])

  const run = async (target: ShareTarget, current: ShareContext) => {
    try {
      setStatus(await target.run(current, browserShareIO))
    } catch (error) {
      // Closing the share sheet rejects with AbortError; that is not a failure.
      setStatus(error instanceof DOMException && error.name === 'AbortError' ? '' : 'That did not work. Use the file instead.')
    }
  }

  return <div className="modal-scrim" role="presentation" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={dialogRef} tabIndex={-1} className="import-dialog share-dialog" role="dialog" aria-modal="true" aria-label="Share project">
      <header><strong>Share {name}</strong></header>
      {ctx === null
        ? <p role="status">Preparing…</p>
        : SHARE_TARGETS.map(target => {
          const availability = target.available(ctx)
          const action = availability.ok ? target.action(ctx) : null
          const detail = availability.ok ? target.detail(ctx) : null
          return <section key={target.id} className="share-target" aria-label={target.label}>
            <h3>{target.label}</h3>
            {availability.ok
              ? <>
                {detail && <ShareDetailView detail={detail} />}
                {action && <button type="button" className="button secondary" onClick={() => { void run(target, ctx) }}>{action}</button>}
              </>
              : <p className="share-unavailable">{availability.reason}</p>}
          </section>
        })}
      {detectBenchCapabilities().insecure && <p className="share-note">This address is not secure (no HTTPS), so the share sheet and the copy button are off. Opening SawdustAtlas over HTTPS turns them on.</p>}
      <p className="share-status" role="status" aria-live="polite">{status}</p>
      <footer><button type="button" className="button secondary" onClick={onClose}>Done</button></footer>
    </div>
  </div>
}

function ShareDetailView({ detail }: { detail: ShareDetail }) {
  if (detail.kind === 'text') {
    return <label className="share-link">{detail.label}<input readOnly value={detail.value} onFocus={event => event.currentTarget.select()} /></label>
  }
  const size = detail.modules.length
  // One path instead of a rect per module keeps a 177×177 code to a single element.
  const path = detail.modules.flatMap((row, y) => row.map((dark, x) => dark ? `M${x} ${y}h1v1h-1z` : '')).join('')
  return <svg className="share-qr" role="img" aria-label={detail.label} viewBox={`-4 -4 ${size + 8} ${size + 8}`} shapeRendering="crispEdges">
    <rect x={-4} y={-4} width={size + 8} height={size + 8} fill="#fff" />
    <path d={path} fill="#000" />
  </svg>
}
```

Add to `src/styles.css`, next to the existing `.import-dialog` rules:

```css
.share-target { display: grid; gap: 8px; margin: 12px 0; }
.share-target h3 { margin: 0; font-size: 0.95rem; }
.share-link { display: grid; gap: 4px; }
.share-link input { width: 100%; font-family: var(--font-mono, monospace); font-size: 0.8rem; }
.share-qr { width: 220px; max-width: 100%; height: auto; }
.share-unavailable, .share-note { margin: 0; opacity: 0.8; }
```

(If the stylesheet defines no `--font-mono`, the `monospace` fallback applies; do not add a new variable.)

- [ ] **Step 4: Wire the dialog, the Share buttons, and the file-size check into `App.tsx`**

- Delete `src/projectPackageDownload.ts` and its import in `App.tsx`.
- Add imports: `projectPackageFileName` and type `ProjectPackage` from `'./packages'`; `browserShareIO` from `'./components/share/browserShareIO'`; `TOO_LARGE_ERROR, packageFileTooLarge` from `'./packages/share/config'`.
- Next to the other lazy imports (around line 45):

```ts
const ShareDialog = lazy(() => import('./components/share/ShareDialog').then(module => ({ default: module.ShareDialog })))
```

- State, next to `projectImport`:

```ts
  // The package open in the share dialog, if any.
  const [sharing, setSharing] = useState<ProjectPackage | null>(null)
```

- Replace `exportProject` and add `shareProject`:

```ts
  const exportProject = (ref: { type: ProjectType; id: string }) => {
    const pkg = buildProjectPackage(data, ref, new Date().toISOString())
    if (pkg) browserShareIO.download(projectPackageFileName(pkg), JSON.stringify(pkg, null, 2))
  }
  const shareProject = (ref: { type: ProjectType; id: string }) => {
    const pkg = buildProjectPackage(data, ref, new Date().toISOString())
    if (pkg) setSharing(pkg)
  }
```

- First lines of `importProjectFile`, after `if (!file) return`:

```ts
    if (packageFileTooLarge(file.size)) { setProjectImport({ ok: false, error: TOO_LARGE_ERROR }); return }
```

- Pass `onShareProject` next to each `onExportProject`, with the same ref:
  - `BoardDesigner`: `onShareProject={() => shareProject({ type: 'board', id: (data.boards.find(p => p.id === activeBoard) ?? data.boards[0])?.id ?? '' })}`
  - `CompositeScreen`: `onShareProject={() => shareProject({ type: 'composite', id: composite.id })}`
  - `FurnitureDesigner`: `onShareProject={() => shareProject({ type: 'furniture', id: project.id })}`
- Next to `{projectImport && <ProjectImportDialog ... />}`:

```tsx
      {sharing && <Suspense fallback={null}><ShareDialog pkg={sharing} onClose={() => setSharing(null)} /></Suspense>}
```

- [ ] **Step 5: Add the Share buttons**

- `src/components/BoardDesigner.tsx`: add `Share2` to the lucide import; add `onShareProject: () => void` to `Props` and the destructured list; right after the "Export project" button add `<button className="button secondary" onClick={onShareProject} aria-label="Share project"><Share2/>Share</button>`.
- `src/components/composite/CompositeScreen.tsx`: add `Share2` to the lucide import; add `onShareProject: () => void` to `CompositeScreenProps` and the destructured list; after the "Export project" button add `<button type="button" className="backup-button" onClick={onShareProject} aria-label="Share project"><Share2 size={15} /> Share</button>`.
- `src/components/furniture/FurnitureDesigner.tsx`: add `Share2` to the lucide import; add `onShareProject: () => void` to the props type and the destructured list; after the "Export project" button add `<button type="button" className="button secondary" onClick={onShareProject} aria-label="Share project"><Share2 size={15} />Share</button>`.

- [ ] **Step 6: Write the e2e spec**

Create `e2e/share.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

// The share dialog offers the file, the link, and a QR code for a small project.
test.describe('share dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('sawdust-atlas:onboarded', '1')
      // Keep runs deterministic: no system share sheet, so the file target downloads.
      delete (Navigator.prototype as unknown as Record<string, unknown>)['share']
      delete (Navigator.prototype as unknown as Record<string, unknown>)['canShare']
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Cutting boards' }).click()
  })

  test('shares a board as a file, a link, and a QR code', async ({ page }) => {
    await page.getByRole('button', { name: /Walnut & maple daily board/ }).click()
    await page.getByRole('button', { name: 'Share project' }).click()
    const dialog = page.getByRole('dialog', { name: 'Share project' })
    await expect(dialog.getByRole('textbox', { name: 'Share link' })).toHaveValue(/^http:\/\/localhost:\d+\/#share=v1\.[A-Za-z0-9_-]+$/)
    await expect(dialog.getByRole('img', { name: 'Scan to open this project' })).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Download file' }).click()
    expect((await downloadPromise).suggestedFilename()).toBe('Walnut & maple daily board.sawdust-project.json')
    await expect(dialog.getByRole('status').last()).toContainText('Downloaded')

    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(dialog).toBeHidden()
  })
})
```

In `playwright.config.ts:16`, append `'**/share.spec.ts'` to `tabletSpecs`.

- [ ] **Step 7: Run everything and measure the bundle**

Run: `pnpm typecheck && pnpm lint && pnpm test:coverage`
Expected: PASS.

Run: `pnpm test:e2e e2e/share.spec.ts e2e/projectPackage.spec.ts e2e/furniturePackage.spec.ts e2e/connectionNotice.spec.ts`
Expected: PASS in `chromium` and, for the tablet-listed specs, `tablet`.

Run: `pnpm build 2>&1 | grep -E '\.js ' | sort -k2 -h | tail -6`
Expected: a separate `ShareDialog-*.js` chunk carrying `qrcode-generator`; the main `index-*.js` within a few KB of the Task 6 baseline. Put both sets of numbers in the task report and the PR body.

- [ ] **Step 8: Commit and open PR B**

```bash
git add src/components src/App.tsx src/styles.css e2e/share.spec.ts playwright.config.ts
git rm src/projectPackageDownload.ts
git commit -m "feat(share): share dialog with file, link, and QR code"
git push -u origin feat/ai-001-share-out
gh pr create --base develop --title "feat: AI-001 PR B, share dialog (file, link, QR)" --body "Implements Tasks 5-7 of docs/plans/2026-10-18-ai-001-project-packages-sharing.md: link codec v1 with incoming limits, share target registry, Share dialog on boards, composites, and furniture, and the package file-size limit. Bundle: <paste the numbers from Task 7 Step 7>."
```

---

# PR C: Share in (Tasks 8–9)

Branch: `feat/ai-001-share-in` from `develop` after PR B merges.

### Task 8: Open-project action, import preview, intents, and the fragment router

**Files:**
- Create: `src/packages/preview.ts`, `src/packages/link/intents.ts`, `src/packages/link/router.ts`, `tests/packagePreview.test.ts`, `tests/linkRouter.test.ts`
- Modify: `src/navigation.ts`, `tests/navigation.test.ts`, `src/packages/index.ts`

**Interfaces:**
- Consumes: `readProjectPackage`, `PackageReadResult`, `describeProject`, `PackageDescription`, `ProjectPackage` (PR A); `parseFragment`, `decodeValue`, `encodeLink`, `LinkLimits` (Task 5); `TOO_LARGE_ERROR`, `SHARE_CONFIG` (Task 5)
- Produces:
  - `NavAction` member `{ type: 'openProject'; kind: 'board' | 'composite' | 'furniture'; id: string }`
  - `PackagePreview extends PackageDescription { woodsAdded: string[]; woodsPresent: string[] }`, `previewProjectPackage(data, pkg)`
  - `IntentOutcome` (`{ intent: 'share'; read: PackageReadResult }`), `LinkIntent { name; resolve(value) }`, `shareIntent`, `LINK_INTENTS`
  - `FragmentRoute` (`none` | `ignored` | `error` | `open`), `routeFragment(hash, intents, limits)`

- [ ] **Step 1: Write the failing navigation test**

Append to `tests/navigation.test.ts` (add `initialNav` and `navigate` to its existing import from `'../src/navigation'` if they are not already imported):

```ts
describe('openProject', () => {
  const start = initialNav({ shops: [], boards: [] })

  it('opens a board on the boards screen', () => {
    expect(navigate(start, { type: 'openProject', kind: 'board', id: 'b' })).toMatchObject({ view: 'boards', boardsMode: 'board', activeBoard: 'b', boardBackTo: 'gallery' })
  })

  it('opens a composite on the boards screen', () => {
    expect(navigate(start, { type: 'openProject', kind: 'composite', id: 'c' })).toMatchObject({ view: 'boards', boardsMode: 'composite', activeComposite: 'c' })
  })

  it('opens a furniture project in its designer', () => {
    expect(navigate(start, { type: 'openProject', kind: 'furniture', id: 'f' })).toMatchObject({ view: 'furniture', furnitureMode: 'designer', activeFurniture: 'f', furnitureOpens: 1 })
  })
})
```

Run: `pnpm test tests/navigation.test.ts`
Expected: FAIL (TypeScript or runtime: unknown action `openProject`).

- [ ] **Step 2: Add the action**

In `src/navigation.ts`, add to the `NavAction` union:

```ts
  | { type: 'openProject'; kind: 'board' | 'composite' | 'furniture'; id: string }
```

Add to `navigate`'s switch:

```ts
    case 'openProject': return openProject(state, action)
```

Add below `navigate`:

```ts
// "Show this project" from outside a click (a share import), choosing the screen as well.
function openProject(state: NavState, action: Extract<NavAction, { type: 'openProject' }>): NavState {
  switch (action.kind) {
    case 'board': return { ...navigate(state, { type: 'openBoard', id: action.id }), view: 'boards' }
    case 'composite': return { ...navigate(state, { type: 'openComposite', id: action.id }), view: 'boards' }
    case 'furniture': return { ...navigate(state, { type: 'openFurniture', id: action.id }), view: 'furniture' }
  }
}
```

Run: `pnpm test tests/navigation.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing preview and router tests**

Create `tests/packagePreview.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildProjectPackage, previewProjectPackage } from '../src/packages'
import { FIXED_NOW } from './fixtures/context'
import { PACKAGE_KIND_FIXTURES } from './fixtures/packageKinds'

describe('previewProjectPackage', () => {
  it('describes the project and splits its woods into new and present', () => {
    const { data, id } = PACKAGE_KIND_FIXTURES['board']!()
    const pkg = buildProjectPackage(data, { type: 'board', id }, FIXED_NOW)!
    const [missing, ...present] = pkg.woods
    const preview = previewProjectPackage({ woods: data.woods.filter(w => w.id !== missing!.id) }, pkg)
    expect(preview).toMatchObject({ name: data.boards[0]!.name, label: 'Cutting board' })
    expect(preview.size).toMatch(/strip/)
    expect(preview.woodsAdded).toEqual([missing!.name])
    expect(preview.woodsPresent).toEqual(present.map(w => w.name))
  })
})
```

Create `tests/linkRouter.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildProjectPackage } from '../src/packages'
import { LINK_DAMAGED_ERROR, LINK_NEWER_CODEC_ERROR } from '../src/packages/link/errors'
import { LINK_INTENTS } from '../src/packages/link/intents'
import { encodeLink } from '../src/packages/link/link'
import { routeFragment } from '../src/packages/link/router'
import { SHARE_CONFIG, TOO_LARGE_ERROR } from '../src/packages/share/config'
import { FIXED_NOW } from './fixtures/context'
import { PACKAGE_KIND_FIXTURES } from './fixtures/packageKinds'

const BASE = 'https://atlas.example/'
const route = (hash: string) => routeFragment(hash, LINK_INTENTS, SHARE_CONFIG)

describe('routeFragment', () => {
  it('does nothing without a fragment', async () => {
    expect(await route('')).toEqual({ kind: 'none' })
    expect(await route('#')).toEqual({ kind: 'none' })
  })

  it('ignores fragments that are not a registered intent, without decoding them', async () => {
    expect(await route('#section-2')).toEqual({ kind: 'ignored' })
    expect(await route('#other=v1.AAAA')).toEqual({ kind: 'ignored' })
    expect(await route(`#other=${'a'.repeat(20_000)}`)).toEqual({ kind: 'ignored' })
  })

  it('opens a shared package', async () => {
    const { data, id } = PACKAGE_KIND_FIXTURES['board']!()
    const pkg = buildProjectPackage(data, { type: 'board', id }, FIXED_NOW)!
    const result = await route((await encodeLink('share', pkg, BASE)).slice(BASE.length))
    if (result.kind !== 'open') throw new Error(`expected open, got ${result.kind}`)
    expect(result.outcome.intent).toBe('share')
    expect(result.outcome.read.ok && result.outcome.read.pkg.project).toEqual(pkg.project)
  })

  it('opens a link whose value is not a package, leaving the read error to the caller', async () => {
    const result = await route((await encodeLink('share', { hello: 1 }, BASE)).slice(BASE.length))
    if (result.kind !== 'open') throw new Error(`expected open, got ${result.kind}`)
    expect(result.outcome.read).toEqual({ ok: false, error: 'This file is not a SawdustAtlas project package.' })
  })

  it('reports damaged, newer, and oversized share links', async () => {
    expect(await route('#share=v1.@@@@')).toEqual({ kind: 'error', error: LINK_DAMAGED_ERROR })
    expect(await route('#share=v1.AAAA')).toEqual({ kind: 'error', error: LINK_DAMAGED_ERROR })
    expect(await route('#share=v2.AAAA')).toEqual({ kind: 'error', error: LINK_NEWER_CODEC_ERROR })
    expect(await route(`#share=v1.${'a'.repeat(SHARE_CONFIG.maxIncomingFragmentLength)}`)).toEqual({ kind: 'error', error: TOO_LARGE_ERROR })
  })
})
```

Run: `pnpm test tests/packagePreview.test.ts tests/linkRouter.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 4: Write the preview**

Create `src/packages/preview.ts`:

```ts
import type { AtlasData } from '../types'
import { describeProject } from './envelope'
import type { ProjectPackage } from './envelope'
import type { PackageDescription } from './kind'

export interface PackagePreview extends PackageDescription {
  /** Names of species the import would add to the library. */
  woodsAdded: string[]
  /** Names of species already in the library; the local versions are kept. */
  woodsPresent: string[]
}

export function previewProjectPackage(data: Pick<AtlasData, 'woods'>, pkg: ProjectPackage): PackagePreview {
  const local = new Set(data.woods.map(wood => wood.id))
  return {
    ...describeProject(pkg),
    woodsAdded: pkg.woods.filter(wood => !local.has(wood.id)).map(wood => wood.name),
    woodsPresent: pkg.woods.filter(wood => local.has(wood.id)).map(wood => wood.name),
  }
}
```

Add to `src/packages/index.ts`:

```ts
export { previewProjectPackage } from './preview'
export type { PackagePreview } from './preview'
```

- [ ] **Step 5: Write the intents registry and the router**

Create `src/packages/link/intents.ts`:

```ts
import { readProjectPackage } from '../envelope'
import type { PackageReadResult } from '../envelope'

/** What a decoded link asks the app to do; one member per registered intent. */
export type IntentOutcome = { intent: 'share'; read: PackageReadResult }

export interface LinkIntent {
  /** The fragment name before "=", e.g. "share". */
  readonly name: string
  resolve(value: unknown): IntentOutcome
}

export const shareIntent: LinkIntent = {
  name: 'share',
  resolve(value) {
    return { intent: 'share', read: readProjectPackage(value) }
  },
}

// One entry per fragment name; AI-005's "template" intent is one more entry and one more IntentOutcome member.
export const LINK_INTENTS: readonly LinkIntent[] = [shareIntent]
```

Create `src/packages/link/router.ts`:

```ts
import { TOO_LARGE_ERROR } from '../share/config'
import type { IntentOutcome, LinkIntent } from './intents'
import { decodeValue, parseFragment } from './link'
import type { LinkLimits } from './link'

export type FragmentRoute =
  | { kind: 'none' }
  | { kind: 'ignored' }
  | { kind: 'error'; error: string }
  | { kind: 'open'; outcome: IntentOutcome }

// The intent is checked before anything is decoded, so an unrelated fragment costs nothing.
export async function routeFragment(hash: string, intents: readonly LinkIntent[], limits: LinkLimits): Promise<FragmentRoute> {
  if (hash === '' || hash === '#') return { kind: 'none' }
  const parsed = parseFragment(hash)
  const intent = parsed ? intents.find(entry => entry.name === parsed.intent) : undefined
  if (!parsed || !intent) return { kind: 'ignored' }
  if (hash.length > limits.maxIncomingFragmentLength) return { kind: 'error', error: TOO_LARGE_ERROR }
  const decoded = await decodeValue(parsed.encoded, limits)
  return decoded.ok ? { kind: 'open', outcome: intent.resolve(decoded.value) } : { kind: 'error', error: decoded.error }
}
```

- [ ] **Step 6: Run the tests and the gate**

Run: `pnpm test tests/packagePreview.test.ts tests/linkRouter.test.ts tests/navigation.test.ts`
Expected: PASS.

Run: `pnpm typecheck && pnpm lint && pnpm test:coverage`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/navigation.ts src/packages tests/navigation.test.ts tests/packagePreview.test.ts tests/linkRouter.test.ts
git commit -m "feat(share): open-project action, import preview, and link intent router"
```

### Task 9: Opening a share link

**Files:**
- Create: `src/useLinkIntent.ts`, `src/components/share/ShareImportDialog.tsx`, `e2e/shareLink.spec.ts`
- Modify: `src/App.tsx`, `playwright.config.ts:16`, `docs/plans/AI_ASSISTANT_ROADMAP.md`, `docs/plans/PRODUCT_PLAN.md`, `docs/plans/COMPLETED.md`

**Interfaces:**
- Consumes: `routeFragment`, `FragmentRoute`, `LINK_INTENTS` (Task 8); `SHARE_CONFIG` (Task 5); `previewProjectPackage`, `PackagePreview`, `mergeProjectPackage`, `ProjectPackage` (PR A, Task 8); the `openProject` nav action (Task 8)
- Produces: `useLinkIntent(onRoute)`, `clearFragment()`, `LinkRoute`; `ShareImportDialog({ state, onImport, onClose })`, `ShareImportState`

- [ ] **Step 1: Write the e2e spec first**

Create `e2e/shareLink.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

// Opening a share link previews the project, imports it on request, and leaves Back, Forward, and Undo working.
test.describe('share link', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (!window.sessionStorage.getItem('seeded')) {
        window.localStorage.clear()
        window.localStorage.setItem('sawdust-atlas:onboarded', '1')
        window.sessionStorage.setItem('seeded', '1')
      }
    })
  })

  async function boardLink(page: Page): Promise<string> {
    await page.goto('/')
    await page.getByRole('button', { name: 'Cutting boards' }).click()
    await page.getByRole('button', { name: /Walnut & maple daily board/ }).click()
    await page.getByRole('button', { name: 'Share project' }).click()
    const link = await page.getByRole('dialog', { name: 'Share project' }).getByRole('textbox', { name: 'Share link' }).inputValue()
    await page.getByRole('dialog', { name: 'Share project' }).getByRole('button', { name: 'Done' }).click()
    return link
  }

  test('previews, imports, and undoes a shared board', async ({ page }) => {
    const link = await boardLink(page)
    // A hash-only change does not reload; leave the app first so the link loads it fresh.
    await page.goto('about:blank')
    await page.goto(link)

    const dialog = page.getByRole('dialog', { name: 'Import shared project' })
    await expect(dialog).toContainText('Walnut & maple daily board')
    await expect(dialog).toContainText('Cutting board')
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('')
    // Clearing the fragment must keep the screen stored in history.state, or Back stops working.
    expect(await page.evaluate(() => (window.history.state as { view?: string } | null)?.view)).toBe('home')

    await dialog.getByRole('button', { name: 'Import' }).click()
    await expect(page.locator('.board-intro h2')).toHaveText('Walnut & maple daily board (imported)')

    await page.goBack()
    await expect(page.locator('.breadcrumb strong')).toHaveText('Home')
    await page.goForward()
    await expect(page.locator('.board-intro h2')).toHaveText('Walnut & maple daily board (imported)')

    await page.getByRole('button', { name: 'Undo' }).click()
    await page.getByRole('button', { name: 'Back to boards' }).click()
    await expect(page.getByRole('button', { name: /Walnut & maple daily board \(imported\)/ })).toHaveCount(0)
  })

  test('cancel imports nothing', async ({ page }) => {
    const link = await boardLink(page)
    await page.goto('about:blank')
    await page.goto(link)
    await page.getByRole('dialog', { name: 'Import shared project' }).getByRole('button', { name: 'Cancel' }).click()
    await page.getByRole('button', { name: 'Cutting boards' }).click()
    await expect(page.getByRole('button', { name: /Walnut & maple daily board \(imported\)/ })).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('')
  })

  test('a damaged link shows the error and changes nothing', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Cutting boards' }).click()
    const before = await page.locator('.gallery-card').count()
    await page.goto('about:blank')
    await page.goto('/#share=v1.AAAA')

    const dialog = page.getByRole('dialog', { name: 'Shared project could not open' })
    await expect(dialog).toContainText('This share link is damaged or incomplete. Ask for the file instead.')
    await dialog.getByRole('button', { name: 'Close' }).click()
    await page.getByRole('button', { name: 'Cutting boards' }).click()
    await expect(page.locator('.gallery-card')).toHaveCount(before)
  })
})
```

In `playwright.config.ts:16`, append `'**/shareLink.spec.ts'` to `tabletSpecs`.

Run: `pnpm test:e2e e2e/shareLink.spec.ts --project=chromium`
Expected: FAIL, no import dialog appears.

- [ ] **Step 2: Write the hook**

Create `src/useLinkIntent.ts`:

```ts
import { useEffect, useRef } from 'react'
import { LINK_INTENTS } from './packages/link/intents'
import { routeFragment } from './packages/link/router'
import type { FragmentRoute } from './packages/link/router'
import { SHARE_CONFIG } from './packages/share/config'

export type LinkRoute = Extract<FragmentRoute, { kind: 'open' | 'error' }>

// Keeps history.state: useNavigationHistory stores the screen there, and Back depends on it.
export function clearFragment(): void {
  const { pathname, search } = window.location
  window.history.replaceState(window.history.state, '', pathname + search)
}

/** Reads the link fragment once on load, clears it, and hands an open or error route to the app. */
export function useLinkIntent(onRoute: (route: LinkRoute) => void): void {
  const handler = useRef(onRoute)
  useEffect(() => { handler.current = onRoute })
  useEffect(() => {
    const hash = window.location.hash
    if (!hash) return
    let cancelled = false
    void routeFragment(hash, LINK_INTENTS, SHARE_CONFIG).then(route => {
      if (route.kind !== 'none') clearFragment()
      if (!cancelled && (route.kind === 'open' || route.kind === 'error')) handler.current(route)
    })
    return () => { cancelled = true }
  }, [])
}
```

- [ ] **Step 3: Write the import dialog**

Create `src/components/share/ShareImportDialog.tsx`:

```tsx
import type { PackagePreview, ProjectPackage } from '../../packages'
import { useModalDialog } from '../useModalDialog'

export type ShareImportState =
  | { kind: 'preview'; pkg: ProjectPackage; preview: PackagePreview }
  | { kind: 'error'; error: string }

export function ShareImportDialog({ state, onImport, onClose }: { state: ShareImportState; onImport: () => void; onClose: () => void }) {
  const dialogRef = useModalDialog<HTMLDivElement>(onClose)
  const preview = state.kind === 'preview' ? state.preview : null
  return <div className="modal-scrim" role="presentation" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={dialogRef} tabIndex={-1} className="import-dialog" role="dialog" aria-modal="true" aria-label={preview ? 'Import shared project' : 'Shared project could not open'}>
      <header><strong>{preview ? 'Open a shared project' : "Couldn't open that link"}</strong></header>
      {preview
        ? <>
          <p className="import-counts"><b>{preview.name}</b> · {preview.label} · {preview.size}</p>
          <p className="import-counts">
            Woods: {preview.woodsAdded.length > 0 ? `${preview.woodsAdded.join(', ')} will be added to your library` : 'nothing new for your library'}
            {preview.woodsPresent.length > 0 ? `; ${preview.woodsPresent.join(', ')} already there (your versions are kept)` : ''}.
          </p>
          <p className="import-counts">Importing adds this project to this browser. Nothing you already have changes, and Undo takes it back out.</p>
        </>
        : state.kind === 'error' && <ul className="import-errors"><li>{state.error}</li></ul>}
      <footer>
        {preview
          ? <><button type="button" className="button" onClick={onImport}>Import</button><button type="button" className="button secondary" onClick={onClose}>Cancel</button></>
          : <button type="button" className="button secondary" onClick={onClose}>Close</button>}
      </footer>
    </div>
  </div>
}
```

- [ ] **Step 4: Wire it into `App.tsx`**

- Imports: `previewProjectPackage` (and type `ProjectPackage` if not already imported) from `'./packages'`; `useLinkIntent` from `'./useLinkIntent'`; `ShareImportDialog` and type `ShareImportState` from `'./components/share/ShareImportDialog'`.
- State, next to `sharing`:

```ts
  // An incoming share link's preview or error, shown until the user imports or closes it.
  const [shareImport, setShareImport] = useState<ShareImportState | null>(null)
```

- After `commitCreated` is defined (the hook needs `dataRef`):

```ts
  useLinkIntent(route => {
    if (route.kind === 'error') { setShareImport({ kind: 'error', error: route.error }); return }
    const { read } = route.outcome
    setShareImport(read.ok ? { kind: 'preview', pkg: read.pkg, preview: previewProjectPackage(dataRef.current, read.pkg) } : { kind: 'error', error: read.error })
  })
  // Merges through commitData so Undo removes it, then opens it the way a click would.
  const importShared = (pkg: ProjectPackage) => {
    const merged = mergeProjectPackage(dataRef.current, pkg, createId)
    commitData(() => merged.data)
    dispatch({ type: 'openProject', kind: pkg.project.type, id: merged.summary.projectId })
    setShareImport(null)
  }
```

- Next to the share dialog render:

```tsx
      {shareImport && <ShareImportDialog state={shareImport} onImport={() => { if (shareImport.kind === 'preview') importShared(shareImport.pkg) }} onClose={() => setShareImport(null)} />}
```

- [ ] **Step 5: Run everything**

Run: `pnpm typecheck && pnpm lint && pnpm test:coverage`
Expected: PASS.

Run: `pnpm test:e2e`
Expected: PASS for the full suite in both projects. `furnitureViews.spec.ts:290` (3D drag) is a known flake; rerun it alone once before treating it as a failure.

Run: `pnpm test:e2e:prod`
Expected: PASS.

- [ ] **Step 6: Mark AI-001 complete in the docs**

- `docs/plans/AI_ASSISTANT_ROADMAP.md`: AI-001 row status `🟢 Complete (#<PR A>, #<PR B>, #<PR C>)`, plan cell `[plan](2026-10-18-ai-001-project-packages-sharing.md)` (the plan PR already set the link; keep it).
- `docs/plans/PRODUCT_PLAN.md`: delete the AI-001 row from the AI Design Assistant table and set AI-002's priority to `Now`.
- `docs/plans/COMPLETED.md`: add to the AI Design Assistant table:

```markdown
| AI-001 | Project packages and sharing | Board, composite, and furniture each export and import as one package through a `PACKAGE_KINDS` registry with newer-version refusal; a Share dialog offers the file, a `#share=v1.` link, and a QR code; opening a link previews the project and imports it through `commitData`. |
```

- [ ] **Step 7: Commit and open PR C**

```bash
git add src/useLinkIntent.ts src/components/share/ShareImportDialog.tsx src/App.tsx e2e/shareLink.spec.ts playwright.config.ts docs/plans
git commit -m "feat(share): open share links with an import preview"
git push -u origin feat/ai-001-share-in
gh pr create --base develop --title "feat: AI-001 PR C, open share links" --body "Implements Tasks 8-9 of docs/plans/2026-10-18-ai-001-project-packages-sharing.md: openProject navigation action, link intent registry and fragment router, import preview dialog, and the roadmap update marking AI-001 complete."
```

---

## Parked (not in this plan)

- `e2e/backButton.spec.ts` is not in `tabletSpecs` (from AI-000).
- Backups with furniture species missing from the library get no placeholder wood (logged in `TODO.md` by Task 3).
- The open actions are inconsistent: `openShop` sets the view, and the others need `goTo`. `openProject` (Task 8) is the consistent entry point; moving existing callers onto it is a separate cleanup.
