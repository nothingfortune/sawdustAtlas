# AI-001 Project Packages and Sharing — Design

Date: 2026-10-18. Status: draft for review.
Roadmap: [AI assistant roadmap](../plans/AI_ASSISTANT_ROADMAP.md), the second of six sub-projects. Builds on [AI-000](2026-10-18-ai-000-foundation-refactor-design.md).

## Purpose

Every design type (board, composite, furniture) can leave the app as one self-contained package and
come back in safely. Two ways out: a file (always) and a share link with an optional QR code (when
the project is small enough). Sharing covers both the user's own devices and other people.

The package is the foundation for the rest of the roadmap: the MCP server (AI-003) edits package
files, the in-app assistant (AI-004) imports AI output through the same read path, and user
templates (AI-005) are stored as packages.

## Decisions taken in brainstorming

| Question | Decision |
| --- | --- |
| What does "share" mean without a backend? | Both: a file always, plus a link and QR code when the project fits. |
| Who is it for? | The user's own devices and other people. |
| Where does a share link point? | The app origin the sender is running. The design travels inside the link; nothing is uploaded. Recipients who cannot reach that origin use the file. |

## Current state

`src/projectPackage.ts` already packages boards and composites:

- `buildProjectPackage` carries the project plus only the wood species it uses.
- `readProjectPackage` validates the envelope and runs the contents through `normalizeData`.
- `mergeProjectPackage` never replaces existing work: an id clash on the project or any carried
  board turns the whole import into an "(imported)" copy with every reference remapped.
- `src/projectPackageDownload.ts` holds the DOM-only download.
- `App.tsx` wires export (board designer and composite screen) and file import through
  `commitData`, so Undo removes an import.

Two gaps besides furniture:

- `readProjectPackage` ignores `migrate`'s `tooNew` flag, so a package from a newer app is coerced
  into the current schema instead of refused.
- No share link, Web Share, clipboard, or QR support exists anywhere.

Structurally, `projectPackage.ts` branches on `'board' | 'composite'` inside every function, so each
new project type means editing all of them. AI-001 replaces that with the extension points below
before adding furniture.

## Architecture: extension points

Requirement from review: the code must be configurable and expandable, with no monoliths, so later
features (AI-002 to AI-005, and new design types) plug in without a rebuild. Each concern is a
small module behind an interface, and each list of variants is a registry. Adding a variant means
adding one module and one registry entry; nothing else is edited.

| Extension point | Interface | Registered now | Expected later |
| --- | --- | --- | --- |
| Package kinds | `PackageKind` | board, composite, furniture | shop layout, user template (AI-005), new designers |
| Share targets | `ShareTarget` | file, link, QR code | MCP hand-off (AI-003), assistant attach (AI-004) |
| Link codecs | `LinkCodec`, selected by a version prefix | `v1` (deflate-raw + base64url) | a denser encoding, without breaking old links |
| Incoming-link intents | `LinkIntent`, keyed by fragment name | `share` | `template` (AI-005), others |
| Limits | one `SHARE_CONFIG` object | link and QR length limits | tuned per target |

### Package kinds

```ts
interface PackageKind<P> {
  type: string                                        // 'board' | 'composite' | 'furniture' | ...
  build(data: AtlasData, id: string): P | null        // the kind's payload for one project
  read(raw: Record<string, unknown>, ctx: ReadContext): { ok: true; payload: P } | { ok: false; error: string }
  merge(data: AtlasData, payload: P, ctx: MergeContext): { data: AtlasData; summary: KindMergeSummary }
  usedWoodIds(payload: P): ReadonlySet<string>
  describe(payload: P): { name: string; size: string } // for file names, previews, and messages
}
```

- The envelope (`kind`, `packageVersion`, `schemaVersion`, `exportedAt`, `woods`, `project`) is
  read and written once, in `envelope.ts`. It looks up `project.type` in the registry and delegates.
  An unregistered type gives the existing "unknown kind of project" error.
- Shared behavior lives in helpers every kind reuses, not copied into each kind: wood merging,
  "(imported)" copy-on-clash with id remapping, and the newer-schema refusal.
- The public functions (`buildProjectPackage`, `readProjectPackage`, `mergeProjectPackage`,
  `projectPackageFileName`) keep their names and become thin facades over the registry, so callers
  and existing tests do not change.
- The envelope ignores top-level fields it does not know. Later sub-projects can add optional
  envelope fields (AI-005's design source, for example) without a `packageVersion` bump.

### Share targets

```ts
interface ShareTarget {
  id: string
  label: string
  available(ctx: ShareContext): { ok: true } | { ok: false; reason: string } // size, secure context, browser support
  run(ctx: ShareContext): Promise<void>
}
```

`ShareContext` carries the package, its encoded link (if any), and the bench capabilities. The share
dialog renders whatever targets are registered and available, and shows each unavailable one's
reason. It has no per-target logic of its own.

### Link codecs and intents

- A link is `#<intent>=<codec version>.<payload>`, for example `#share=v1.<payload>`. Decoding reads
  the version prefix and picks the codec; an unknown version gives "This link needs a newer
  version of SawdustAtlas." So the encoding can change later without breaking links already sent.
- On load, a small router reads the fragment, finds the registered `LinkIntent` for its name, and
  hands it the decoded value. `share` opens the import preview. Unknown intents are ignored and
  cleared.

### Rules for these modules

- Pure logic (envelope, kinds, codecs, limits, the router's parsing) lives in `src/packages/` and is
  framework-free and unit-tested. DOM work (share sheet, clipboard, QR rendering, `location.hash`)
  lives in thin adapters beside the components.
- One module per kind, target, and codec, each small enough to read in one sitting.
- Registries are plain exported arrays assembled in one `index.ts` per folder. That keeps them
  explicit, typed, and tree-shakable, with no runtime plug-in loading.
- AI-002's operations layer follows the same pattern (one module per domain, one registry), so the
  roadmap shares one convention.

## Design

### 1. Package kinds for board, composite, and furniture

Move the existing board and composite logic into `kinds/board.ts` and `kinds/composite.ts` behind
`PackageKind`, with no behavior change; the existing `projectPackage.test.ts` must pass with only
its import path changed.
Then add `kinds/furniture.ts`, whose payload is `{ type: 'furniture'; furniture: FurnitureProject }`:

- **Woods.** `woods` carries the species used by the furniture's solid parts (`part.speciesId`).
  This is load-bearing: `normalizeFurnitureProject` replaces an unknown `speciesId` with the
  fallback species, so a package without its woods would silently change the wood.
- **Sheet materials** already live inside `FurnitureProject.sheetMaterials`; nothing extra to carry.
- **Read** runs `migrate`, then the per-domain normalizers from AI-000's `src/normalize/` (woods,
  then `normalizeFurnitureProject`) directly, instead of wrapping one project in a fake workspace
  for `normalizeData`. Board and composite kinds move to the same approach. Woods are then trimmed
  to those used.
- **Merge.** Part, parameter, relationship, and joint ids are scoped to their project, so only the
  project id can clash. A clash imports a copy with a fresh id and the "(imported)" suffix.
  Allowances follow the local shop-wide setup, as they do for boards.
- **`packageVersion` stays 1.** An older app reading a furniture package already fails cleanly
  with "The project package holds an unknown kind of project."
- **UI.** The furniture designer gets the same "Export project" action as the board designer.
  File import already lives in one place and accepts the new type; its success message names the
  imported furniture project.
- File names, previews, and messages come from each kind's `describe`, so no caller special-cases
  furniture.

### 2. Newer-schema refusal

The envelope reader (one shared check, not one per kind) refuses any package whose `schemaVersion`
is newer than `LATEST_SCHEMA_VERSION`, for every project type, with: "This project was made with a newer version
of SawdustAtlas. Update this app to open it." Nothing is merged. This also covers share links,
which use the same read path.

This is deliberately stricter than full-backup import, which imports a newer backup with a warning
that unknown fields were ignored. A backup restore is the user's own data and can be undone with
"Restore previous"; a package is often someone else's design, and silently dropping fields it
depends on could change its geometry without anyone noticing.

### 3. Share link

Pure modules in `src/packages/link/`:

- `codecs/v1.ts`, the first `LinkCodec`: compact JSON, compressed with
  `CompressionStream('deflate-raw')`, encoded as base64url.
- `link.ts`: `encodeLink(intent, value, baseUrl)` returns `<baseUrl>#<intent>=v1.<payload>` using
  the current codec; `decodeFragment(hash)` returns `{ intent, value }` or a plain-language error
  (no intent, unknown codec version, bad base64url, failed decompression, or invalid JSON).
  `baseUrl` is the app's origin plus its base path. A decoded `share` value goes to
  `readProjectPackage` exactly like a parsed file.

Why the fragment: the text after `#` is never sent to the server, so the design stays on the two
devices. `CompressionStream` and `DecompressionStream` are built into current browsers and Node, so
this needs no dependency and is unit-testable.

**Size limits** live in one `SHARE_CONFIG` object (`src/packages/share/config.ts`) that targets
read through `ShareContext`, so a limit changes in one place and tests can pass their own:

| Setting | Value | Reason |
| --- | --- | --- |
| `maxLinkLength` | 8,000 characters | Conservative ceiling for messaging apps and email clients that truncate long URLs. |
| `maxQrLinkLength` | 2,900 characters | Fits a single QR code at the lowest error-correction level (version 40-L holds 2,953 bytes). |

Over `maxLinkLength`, the link target reports itself unavailable and the dialog explains that the project is too big for a link and offers
only the file.

### 4. Share dialog

Every place with "Export project" gains a "Share" action that opens one dialog. The dialog lists
the registered share targets (section "Share targets" above); the three registered now are:

- **File** (`targets/file.ts`). When `navigator.canShare({ files })` is true, "Share file" opens the system share sheet
  with the package file attached. Otherwise "Download file" uses the existing download.
- **Link** (`targets/link.ts`, when it fits). "Share link" uses `navigator.share({ url })` when available, else
  "Copy link" uses the clipboard. Where neither is available, the link is shown in a read-only,
  select-all text field.
- **QR code** (`targets/qr.ts`, when it fits), rendered as inline SVG.

Web Share and the clipboard require a secure context, and a LAN Docker instance usually serves
plain http. The dialog reuses `describeBenchCapabilities` (`src/domain/benchCapabilities.ts`) to
detect this and shows the download and selectable-link fallbacks with a one-line note that HTTPS
unlocks the share sheet.

**Dependency.** QR encoding uses one small, dependency-free library pinned to an exact version
(candidate: `qrcode-generator`). It is bundled, so it works offline. The implementation plan
confirms the choice, its license, and its bundle cost.

Each target's `available` check is pure and unit-tested; its `run` is the thin DOM adapter.

### 5. Opening a share link

On startup a `useLinkIntent` hook reads `location.hash`, decodes it with `decodeFragment`, and
dispatches to the registered intent. The `share` intent:

1. Passes the decoded value to `readProjectPackage`.
2. Shows an import preview from the kind's `describe` (name, type, size) and which woods
   would be added versus already present.
3. On **Import**, merges with `mergeProjectPackage` through `commitData` (Undo removes it) and opens the
   imported project. **Cancel** changes nothing.
4. Either way, the hook clears the fragment with `history.replaceState` so a reload does not ask again.

A failed decode or read shows the error in the same dialog with a single "Close", and the workspace
is untouched. The link is handled after the workspace loads, so the preview can say which woods
already exist.

## Error handling

| Case | Behavior |
| --- | --- |
| Truncated, corrupted, or tampered link | "This share link is damaged or incomplete. Ask for the file instead." Nothing changes. |
| Valid JSON that is not a package | The existing "not a SawdustAtlas project package" error. |
| Package from a newer schema | Refused (section 2). |
| Unknown project type | The existing "unknown kind of project" error. |
| Unknown link codec version | "This link needs a newer version of SawdustAtlas." |
| Unknown link intent | Ignored; the fragment is cleared. |
| Id clash with local work | Imported as an "(imported)" copy; the summary says so. |
| Project too big for a link | Dialog offers the file only and says why. |
| No secure context | Download and selectable link only, with the HTTPS note. |

## Code layout

```
src/packages/
  index.ts              public API: buildProjectPackage, readProjectPackage, mergeProjectPackage,
                        projectPackageFileName (facades over the registry)
  envelope.ts           envelope read/write, newer-schema refusal, kind lookup
  kind.ts               PackageKind, ReadContext, MergeContext types
  shared.ts             wood merging, copy-on-clash id remapping
  kinds/
    index.ts            PACKAGE_KINDS registry
    board.ts  composite.ts  furniture.ts
  link/
    link.ts             encodeLink, decodeFragment
    intents.ts          LinkIntent type and LINK_INTENTS registry (share)
    codecs/
      index.ts          LINK_CODECS registry
      v1.ts
  share/
    config.ts           SHARE_CONFIG
    target.ts           ShareTarget, ShareContext types
    targets/
      index.ts          SHARE_TARGETS registry
      file.ts  link.ts  qr.ts
```

| File | Change |
| --- | --- |
| `src/projectPackage.ts` | Replaced by `src/packages/`. Callers import from `src/packages`. |
| `src/projectPackageDownload.ts` | Folded into `share/targets/file.ts`. |
| `src/components/ShareDialog.tsx` (new) | Renders registered targets; no per-target logic. |
| `src/components/ShareImportDialog.tsx` (new) | Preview and confirm for an incoming `share` link. |
| `src/useLinkIntent.ts` (new) | Reads and clears `location.hash`, dispatches to the intent registry. |
| `src/App.tsx` | Furniture export, Share action wiring, mounts `useLinkIntent`. |
| `src/components/furniture/FurnitureDesigner.tsx` | "Export project" and "Share" actions. |
| `src/components/BoardDesigner.tsx`, `src/components/composite/CompositeScreen.tsx` | "Share" action next to "Export project". |
| `vite.config.ts` | Coverage include: replace `src/projectPackage.ts` with `src/packages/**`, excluding the DOM `run` adapters. |

## Testing

**Unit (Vitest):**

- **Kind contract suite.** One parameterized suite runs against every entry in `PACKAGE_KINDS`:
  build/read/merge round trip, woods trimmed to those used, id clash imports as a suffixed copy,
  and `describe` returns a non-empty name. A kind added later is covered by registering a fixture,
  with no new test code.
- **Target contract suite.** Every entry in `SHARE_TARGETS` reports a reason whenever it is
  unavailable.
- Existing `projectPackage.test.ts` passes against the facades with only its import path changed
  (proves the refactor).
- Furniture specifics: parts, parameters, relationships, joints, subassemblies, and sheet materials
  survive a round trip; a package's species survive import with no fallback substitution.
- Newer-schema packages are refused for every kind.
- Link round trip for each kind, including non-ASCII names.
- Decode errors: no intent, unknown codec version, bad base64url, truncated payload, valid
  compression of non-JSON.
- Link and QR availability at, just under, and just over both `SHARE_CONFIG` limits, using a test
  config.

**E2E (Playwright, desktop and tablet projects):**

- Export a furniture project file, delete the project, import the file, and see it restored.
- Open a share link for a board: preview shows, Import adds it, Undo removes it, and the fragment is
  cleared.
- Opening a damaged share link shows the error and leaves the workspace unchanged.

## Out of scope

- Hosting a public instance, or links that work for recipients who cannot reach the sender's origin.
- Multi-project bundles, and packaging shop layouts.
- Shortened links or any server-side storage.
- User templates (AI-005), which will reuse this package format.
