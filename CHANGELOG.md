# Changelog

All notable changes to SawdustAtlas are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). SawdustAtlas
does not yet use semantic version numbers, so entries are grouped by date instead.

## [Unreleased]

### Changed

- The container now runs as an unprivileged nginx user and listens on port 8080 instead of 80.
  Any `docker run ... -p 8080:80 ...` command becomes `-p 8080:8080` — see the
  [Install guide](docs/howTo/install.md) for the current command.
- Workshop-planner item and zone drags now commit once when you release, instead of on every
  pointer move, for smoother dragging and a single undo step per drag.

### Fixed

- Imperial measurement input no longer drops a leading minus sign, so negative offsets and
  angles work correctly with Preston's Button (imperial display) on.
- Composite board thickness and price calculations now use the correct wafer and crosscut math.
- The offline app cache (service worker) no longer traps the app on a stale version; reloads
  while offline are more reliable.
- Saved data or an imported backup that is corrupt or was hand-edited is now recovered instead
  of failing to load.

### Added

- Keyboard support for reordering and editing end-grain slices, without a mouse or touchscreen.

## [2026-07-10]

### Added

- Multi-panel composite boards, the standalone geometry calculator (including a compound-angle
  mode), pricing and material-cost estimates, and accompanying accessibility and infrastructure
  updates.
