# SawdustAtlas

A local-first design workspace for woodworking. The first two tools are a scaled workshop planner and an edge- and end-grain cutting board designer.

---

## Install it

Want to run SawdustAtlas on your own computer? You do not need to be technical, and you do not need to download any source code.

**→ Follow the [Install and run guide](docs/howTo/install.md) (Windows or Mac).**

In short: install the free **Docker Desktop**, paste one command, and open **http://localhost:8080** in your browser. The guide walks through every step.

## Use it

- **[Start Here](START_HERE.md)** — plain-language guide to designing a cutting board and planning a workshop.
- **[Use it on a tablet](docs/howTo/use-on-a-tablet.md)** — open SawdustAtlas from a tablet or another device on your network.

## Having trouble?

The page at `http://localhost:8080` won't open, or something else is off? Almost every first-time issue has the same simple cause and fix.

**→ See [Troubleshooting](docs/howTo/troubleshooting.md).**

## More guides

All step-by-step guides live in **[docs/howTo](docs/howTo/)**. For the full feature inventory, milestones, and roadmap, see the [product plan](docs/plans/PRODUCT_PLAN.md).

---

## CI and Docker Hub releases

GitHub Actions uses two long-lived branches:

- `develop`: integration branch for day-to-day work. Pull requests and pushes run linting, tests, the production build, and a local Docker image build/scan. Nothing is pushed to Docker Hub from this branch.
- `main`: release branch. Pull requests run the same checks, and pushes to `main` publish the image to Docker Hub.

Docker Hub publishes only from `main` as:

```text
headlock0253/sawdust-atlas
```

The public Docker Hub page is [headlock0253/sawdust-atlas](https://hub.docker.com/r/headlock0253/sawdust-atlas). You do not need a Docker Hub account to download the public image.

Add these repository secrets in GitHub before relying on the publish step:

- `DOCKERHUB_USERNAME`: the Docker Hub account or organization that owns the repository.
- `DOCKERHUB_TOKEN`: a Docker Hub access token with permission to push `sawdust-atlas`.

The `main` branch is tagged `latest` and `main`, and every published build also receives a `sha-...` tag. Published images include SBOM and provenance attestations, and CI runs Docker Scout vulnerability and recommendation checks as advisory output. GitHub Actions are pinned to full commit SHAs, with Dependabot checking action, npm, and Docker updates weekly.

In Docker Hub, keep `latest` and `main` mutable so the release branch can continue to update them. If you later add versioned release tags such as `v0.1.0`, enable immutable tags for those version tags after creating the repository: open the repository, go to **Settings > General > Tag mutability settings**, choose **Specific tags are immutable**, and use a pattern such as `^v.*`.

Recommended GitHub repository settings:

- Make `develop` the default branch for day-to-day pull requests.
- Protect `develop` and require the `Validate` and `Docker verify` checks before merge.
- Protect `main`, require pull requests, require the `Validate` check, and restrict who can push directly.
- Create a GitHub environment named `production`; add required reviewers there if Docker Hub releases should need a manual approval.
- Keep `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` as repository secrets, not environment variables committed to the repo.

## For developers

Build SawdustAtlas from this repository — dev server, local container build, and type-safety policy — in **[Build from source](docs/howTo/build-from-source.md)**.

Quick start:

```bash
pnpm install   # also wires the repo's git hooks (see below)
pnpm dev
```

### Local preview container & dev hooks

`pnpm container` builds and (re)starts the Docker preview at **http://localhost:8080**,
stamping the in-app build badge with the current git branch / build number / commit
(e.g. `develop · build 169 · e31445b · container`).

`pnpm install` runs a `prepare` step that points `core.hooksPath` at the committed
`.githooks/`, so a fresh clone is set up automatically — no per-machine steps. From then
on a `git pull`/`git merge` that lands on `develop` rebuilds the preview in the background.
`.githooks/commit-msg` delegates to your global `~/.githooks/commit-msg` if you have one.
(After a `gh pr merge`, which advances `develop` without a local merge, run `pnpm container`.)

## Current features

- Millimeter-first dimensions throughout
- Scaled workshop floor plans with top and measured angled views, draggable catalog and custom objects, editable heights, rotation, color, general clearance, and directional infeed/outfeed zones
- Edge-grain cutting board patterns with six wood species, editable strip widths, pattern helpers, board-foot usage, and material estimates
- End-grain workflow showing the first glue-up, kerf-aware crosscut plan, and the board after its 90-degree turn
- Per-strip trailing angles, independent slice rotation and flipping, angle-aware dimensions, and species-level stock and waste totals
- Generated rough-stock list, machine cuts, saw-pass counts, and ordered build sequence
- Browser autosave plus JSON import and export
- Installable, offline-capable PWA (web app manifest plus a service worker that caches the app shell)
- Domain models separated from the UI so additional woodworking designers and storage adapters can be added cleanly

## Accuracy policy

- Geometry is stored and calculated in millimeters at full JavaScript floating-point precision. Rounding happens only for display.
- End-grain calculations conserve material volume across rip-angle wedges, end trim, blade kerf, crosscut offcut, and final side squaring.
- Invalid self-crossing strip geometry is reported instead of silently producing a result.
- `pnpm test` covers exact and near-boundary slice fits, angled panels, species totals, and volume conservation.
- Estimates assume straight rectangular stock, a constant measured kerf, and no defects. Final surfacing loss, wood movement, checking, and defect avoidance require user allowances and are not presented as exact quantities.

## Data and privacy

Projects currently live in each browser's local storage. The computer and tablet therefore have separate project copies. Use JSON export/import to move projects between them, and export a backup before clearing browser data.
