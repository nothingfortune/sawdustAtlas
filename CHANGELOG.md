# Changelog

All notable changes to SawdustAtlas are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). SawdustAtlas
does not yet use semantic version numbers, so entries are grouped by date instead.

## [Unreleased]

### Added

- Furniture modeler: start from one of six templates (table, desk, workbench, bookcase, base cabinet, wall cabinet), drive parts from named parameters, add joinery with reported cut allowances, and read the parts list, cut list, build steps, drawings, and a 3D view. Furniture is stored with the rest of your workspace, included in backups, and loaded on demand.
- Build steps for cutting boards and composites, derived from the design, with setup tolerances (shown in your chosen units) and a preview inside the board designer.
- Per-project export and import files for moving one board or composite between devices without replacing the rest of the workspace.
- App-wide warning center that links each problem, including composite and furniture issues, to the input that fixes it.
- A notice that explains the limits of using the app over plain HTTP (no service worker, no wake lock) and links the tablet guide.
- Fonts are bundled with the app, so nothing is fetched from a third-party host.
- Static-host configuration (`public/_headers`, `public/_redirects`) mirroring the nginx security headers.
- Keyboard support for reordering and editing end-grain slices, without a mouse or touchscreen.

### Changed

- Imperial entry (Preston's Button) now snaps to the nearest 1/16 inch instead of 1/2 inch, so 5/8 and 3/4 inch stock can be entered exactly.

- The container now runs as an unprivileged nginx user and listens on port 8080 instead of 80.
  Any `docker run ... -p 8080:80 ...` command becomes `-p 8080:8080` — see the
  [Install guide](docs/howTo/install.md) for the current command.
- Workshop-planner item and zone drags now commit once when you release, instead of on every
  pointer move, for smoother dragging and a single undo step per drag.
- The service worker now precaches every built asset (lazy chunks and fonts included) and names its cache per build, so the app opens offline after the first visit and old caches are pruned.
- `pnpm container` rebuilds the local preview from WSL as well, and each checkout stamps the build badge with its own branch and commit.

### Fixed

- Imperial measurement input no longer drops a leading minus sign, so negative offsets and
  angles work correctly with Preston's Button (imperial display) on.
- Composite board thickness and price calculations now use the correct wafer and crosscut math.
- The offline app cache (service worker) no longer traps the app on a stale version; reloads
  while offline are more reliable.
- Furniture length fields and template parameters now snap to 1/16 inch in imperial, like every other length input, so the stored size matches what is shown.
- New furniture from a template uses a wood that exists in your library when the template's default species (walnut, maple, cherry, white oak) is missing.
- Cancelling a no-go-zone drag in the workshop planner (an interrupted touch) now discards the zone instead of creating it.
- The starter workshop no longer warns about overlapping blocked zones on first load, and warning counts read correctly for a single object.
- Imperial tolerances in build steps no longer round to "± 0 in".
- Controls whose accessible name left out their visible label (brand, Preston's Button, Make composite, Tap to enlarge) now include it, so voice control can reach them.
- An empty composite no longer quotes a price for a 0 × 0 × 0 board.
- The designer toolbar and top bar no longer clip or wrap in imperial at laptop widths.
- Saved data or an imported backup that is corrupt or was hand-edited no longer fails to load;
  the unreadable payload is preserved for recovery (under the `sawdust-atlas:corrupt` key) and
  the app starts fresh.

## [2026-07-10]

### Added

- Multi-panel composite boards, the standalone geometry calculator (including a compound-angle
  mode), pricing and material-cost estimates, and accompanying accessibility and infrastructure
  updates.
