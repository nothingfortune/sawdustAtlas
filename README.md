# SawdustAtlas

A local-first design workspace for woodworking. The first two tools are a scaled
workshop planner and an edge- and end-grain cutting board designer.

---

## Install it

Want to run SawdustAtlas on your own computer? You do not need to be technical,
and you do not need to download any source code.

**→ Follow the [Install and run guide](docs/howTo/install.md) (Windows or Mac).**

In short: install the free **Docker Desktop**, paste one command, and open **http://localhost:8080** in your browser. The guide walks through every step.

## Use it

- **[Start Here](START_HERE.md)** — plain-language guide to designing a cutting board and planning a workshop.
- **[Use it on a tablet](docs/howTo/use-on-a-tablet.md)** — open SawdustAtlas
  from a tablet or another device on your network.

## Having trouble?

The page at `http://localhost:8080` won't open, or something else is off? Almost every first-time issue has the same simple cause and fix.

**→ See [Troubleshooting](docs/howTo/troubleshooting.md).**

## More guides

All step-by-step guides live in **[docs/howTo](docs/howTo/)**. For the full
feature inventory, milestones, and roadmap, see the
[product plan](docs/PRODUCT_PLAN.md).

---

## CI and Docker Hub releases

GitHub Actions runs linting, tests, the production build, and a Docker image
build on pull requests. Pushes to `main` and tags beginning with `v` also publish
the image to Docker Hub as:

```text
headlock0253/sawdust-atlas
```

The public Docker Hub page is
[headlock0253/sawdust-atlas](https://hub.docker.com/r/headlock0253/sawdust-atlas).
You do not need a Docker Hub account to download the public image.

Add these repository secrets in GitHub before relying on the publish step:

- `DOCKERHUB_USERNAME`: the Docker Hub account or organization that owns the
  repository.
- `DOCKERHUB_TOKEN`: a Docker Hub access token with permission to push
  `sawdust-atlas`.

The default branch is tagged `latest`, version tags such as `v0.1.0` keep their
tag name, and every published build also receives a `sha-...` tag. Published
images include SBOM and provenance attestations, and CI runs Docker Scout
vulnerability and recommendation checks as advisory output. GitHub Actions are
pinned to full commit SHAs, with Dependabot checking action, npm, and Docker
updates weekly.

In Docker Hub, enable immutable tags for release tags after creating the
repository: open the repository, go to **Settings > General > Tag mutability
settings**, choose **Specific tags are immutable**, and use a pattern for version
tags such as `^v.*`. Keep `latest` mutable so the default branch can continue to
update it.

## For developers

Build SawdustAtlas from this repository — dev server, local container build, and
type-safety policy — in **[Build from source](docs/howTo/build-from-source.md)**.

Quick start:

```bash
pnpm install
pnpm dev
```

## Current features

- Millimeter-first dimensions throughout
- Scaled workshop floor plans with top and measured angled views, draggable
  catalog and custom objects, editable heights, rotation, color, general
  clearance, and directional infeed/outfeed zones
- Edge-grain cutting board patterns with six wood species, editable strip widths,
  pattern helpers, board-foot usage, and material estimates
- End-grain workflow showing the first glue-up, kerf-aware crosscut plan, and the
  board after its 90-degree turn
- Per-strip trailing angles, independent slice rotation and flipping, angle-aware
  dimensions, and species-level stock and waste totals
- Generated rough-stock list, machine cuts, saw-pass counts, and ordered build
  sequence
- Browser autosave plus JSON import and export
- Domain models separated from the UI so additional woodworking designers and
  storage adapters can be added cleanly

## Accuracy policy

- Geometry is stored and calculated in millimeters at full JavaScript
  floating-point precision. Rounding happens only for display.
- End-grain calculations conserve material volume across rip-angle wedges, end
  trim, blade kerf, crosscut offcut, and final side squaring.
- Invalid self-crossing strip geometry is reported instead of silently producing
  a result.
- `pnpm test` covers exact and near-boundary slice fits, angled panels, species
  totals, and volume conservation.
- Estimates assume straight rectangular stock, a constant measured kerf, and no
  defects. Final surfacing loss, wood movement, checking, and defect avoidance
  require user allowances and are not presented as exact quantities.

## Data and privacy

Projects currently live in each browser's local storage. The computer and tablet
therefore have separate project copies. Use JSON export/import to move projects
between them, and export a backup before clearing browser data.
