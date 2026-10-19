# AI Design Assistant Roadmap

Companion to [PRODUCT_PLAN.md](PRODUCT_PLAN.md). This is the index for the AI design assistant
work: letting Claude (or another AI client) draft and edit cutting boards, composites, and
furniture for the user, and bring designs found online into the app as templates.

Started: 2026-10-18.

## Goal

Make design faster to iterate on. A user can describe a board or a piece of furniture and get a
first draft, then refine it conversationally ("make the aprons 3/4 in", "add a walnut border
strip"). The audience is both newcomers drafting a first design and experienced users skipping
tedious edits. The app must remain fully usable with no AI, no API key, and no network.

## Sub-projects

AI-000 is the foundation the others build on. Each sub-project builds on the ones above it and gets its own design spec and implementation plan
(specs in [`docs/specs/`](../specs/), plans in this folder, dated `YYYY-MM-DD-<topic>`). Work them
in order; a later spec may not start implementation until the earlier ones are merged.

| Order | ID | Sub-project | Depends on | Status | Spec | Plan |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | AI-000 | Foundation refactor | — | ⚪ Plan in review | [spec](../specs/2026-10-18-ai-000-foundation-refactor-design.md) | [plan](2026-10-18-ai-000-foundation-refactor.md) |
| 1 | AI-001 | Project packages and sharing | AI-000 | ⚪ Spec approved | [spec](../specs/2026-10-18-ai-001-project-packages-sharing-design.md) | — |
| 2 | AI-002 | Design operations layer | AI-001 | ⚪ Planned | — | — |
| 3 | AI-003 | MCP server | AI-001, AI-002 | ⚪ Planned | — | — |
| 4 | AI-004 | In-app assistant | AI-002 (AI-003 proves the tools) | ⚪ Planned | — | — |
| 5 | AI-005 | User templates and design import | AI-001 to AI-004 | ⚪ Planned | — | — |

### AI-000 Foundation refactor

Behavior-preserving refactor so the later sub-projects build on clean seams instead of `App.tsx`.
Every unit, golden, and e2e test stays green throughout.

- **Workspace actions.** Every workspace change now written inline in `App.tsx` (create, update,
  delete, duplicate for shops, boards, composites, furniture, woods; make composite; create a
  panel board) and the board strip edits in `BoardDesigner.tsx` become pure, unit-tested domain
  functions, one module per collection. The UI keeps calling them through `commitData`. AI-002's
  operations build on these.
- **Navigation.** The loose screen state in `App.tsx` (view, active project ids, gallery or
  designer modes, back targets) becomes one navigation reducer with named actions, so a share link
  or the assistant can open a project the same way a click does.
- **Normalizer split.** `storage.ts` keeps localStorage IO; the per-domain normalizers move into
  one module per domain with shared coercers (`finiteNumber`, `signedFinite`, and the rest) in one
  place. `normalizeData` stays the single funnel and composes them, and AI-001's package kinds call
  the per-domain normalizers directly.

### AI-001 Project packages and sharing

One package format for every design type: board, composite, and furniture. `projectPackage.ts`
already exports and imports boards and composites; furniture is missing. Add it, and define what
"share" means in a backend-free app. The package is the unit the MCP server edits, the assistant
imports through, and a template is stored as.

### AI-002 Design operations layer

A pure, framework-free set of typed design operations (add or update a strip, add a composite row,
add a part, set a parameter, add a relationship or joint, and so on) plus read operations (summary,
metrics, validation issues). Every operation is serializable and described by a schema, so the same
set can be exposed as AI tools. Each returns the new project and its validation issues.

Current state differs by domain: composite edits already live in `compositeAssembly.ts` and
furniture edits partly in `furniture/editing.ts`, but board strip edits are written inline in
`BoardDesigner.tsx`. For boards this is an extraction job, and the UI should move onto the same
operations.

### AI-003 MCP server

A local MCP server that exposes the AI-002 operations as tools over package files, for Claude
Desktop, Claude Code, and other MCP clients. It is the cheapest way to prove the AI can draft good
boards and furniture before any in-app UI exists. Open decision for its spec: how a Node process
consumes the domain code (a fourth TS project reference or a separate workspace package).

### AI-004 In-app assistant

A chat panel inside the app that calls the Claude API directly from the browser with a key the user
provides, using the same tools as AI-003. AI changes are shown as a reviewable change the user
accepts or rejects. Open decisions for its spec: key storage, offline behavior, cost visibility, and
how to show the change.

### AI-005 User templates and design import

Templates become data instead of code-only: "save as template" for furniture, boards, and
composites, stored in `AtlasData`. Furniture already has a template gallery
(`furniture/templates/`); boards have starter projects and patterns but no template concept yet, so
the spec must define what a board template is. Importing a design found online (a web page, PDF, or
cut list) is the AI reading the source and building it with the AI-002 operations, then saving the
result as a template with its source recorded.

## Rules every sub-project inherits

- **Built to extend, no monoliths.** Each concern is a small module behind an interface, and each
  set of variants (package kinds, share targets, operations, tools) is an explicit registry. A new
  design type or feature is one new module plus one registry entry, never edits across every
  switch. Shared behavior goes in helpers, not copies. Contract test suites run against every
  registry entry so new entries get tested automatically. AI-001 sets the pattern; later specs
  follow it.
- **No raw writes.** The AI never writes `AtlasData` directly. Every AI change goes through the
  AI-002 operations, then `commitData`, then `normalizeData`. Undo removes an AI change.
- **Domain stays pure.** The operations layer lives under `src/domain/**`: no React, no DOM, so the
  MCP server can import it. It is unit-tested and covered by the domain coverage gate.
- **Schema changes migrate.** Any new stored field (for example user templates) gets a new named
  step in `src/domain/migrations.ts`; old steps are never edited.
- **AI is additive.** No key, no network, or a failed request leaves every existing workflow intact.
- **Assumptions are labeled.** Values the AI invents rather than takes from the user or the source
  (joint sizes, offsets, strip widths) surface as assumptions, matching the instruction generators.
- **Millimeters, full precision.** The AI may accept imperial input through the existing
  `lengthUnits.ts` and expression grammar, but stored values stay in mm, unrounded.
