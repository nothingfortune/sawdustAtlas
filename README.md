# SawdustAtlas

A local-first design workspace for woodworking. The first two tools are a scaled workshop planner and an edge- and end-grain cutting board designer.

**New to SawdustAtlas?** Start with the plain-language [START HERE guide](START_HERE.md).

**New to SawdustAtlas?** Start with the plain-language [START HERE guide](START_HERE.md).

See [the product plan](docs/PRODUCT_PLAN.md) for the complete feature inventory, milestones, accuracy requirements, and ordered backlog.

## Run locally

```bash
pnpm install
pnpm dev
```

Create a production build with `pnpm build`.

## CI and Docker Hub releases

GitHub Actions runs linting, tests, the production build, and a Docker image build on pull requests. Pushes to `main` and tags beginning with `v` also publish the image to Docker Hub as:

```text
<DOCKERHUB_USERNAME>/sawdust-atlas
```

Add these repository secrets in GitHub before relying on the publish step:

- `DOCKERHUB_USERNAME`: the Docker Hub account or organization that owns the repository.
- `DOCKERHUB_TOKEN`: a Docker Hub access token with permission to push `sawdust-atlas`.

The default branch is tagged `latest`, version tags such as `v0.1.0` keep their tag name, and every published build also receives a `sha-...` tag. Published images include SBOM and provenance attestations, and CI runs Docker Scout vulnerability and recommendation checks as advisory output. GitHub Actions are pinned to full commit SHAs, with Dependabot checking action, npm, and Docker updates weekly.

In Docker Hub, enable immutable tags for release tags after creating the repository: open the repository, go to **Settings > General > Tag mutability settings**, choose **Specific tags are immutable**, and use a pattern for version tags such as `^v.*`. Keep `latest` mutable so the default branch can continue to update it.

## Use it from a tablet

### Docker (recommended for everyday use)

Docker builds SawdustAtlas from the files in this repository. You need to download those files before running the Docker command.

#### First-time setup on Windows

1. Install and open [Docker Desktop](https://www.docker.com/products/docker-desktop/). Wait until it says Docker is running.
2. Get the SawdustAtlas code using Option A or Option B.

#### Option A: GitHub Desktop

1. Install [GitHub Desktop](https://desktop.github.com/).
2. Choose **File > Clone repository > URL**.
3. Enter `https://github.com/nothingfortune/sawdustAtlas.git`.
4. Choose where the folder should be saved, then select **Clone**.
5. Continue with **Build and start SawdustAtlas** below.

#### Option B: Download a ZIP file

1. Open the [SawdustAtlas GitHub page](https://github.com/nothingfortune/sawdustAtlas).
2. Select **Code**, then **Download ZIP**.
3. Open the Downloads folder, right-click the ZIP file, and select **Extract All**.
4. Open the extracted folder that contains `compose.yaml`.
5. Continue with **Build and start SawdustAtlas** below.

#### Build and start SawdustAtlas

1. Open the downloaded or cloned `sawdustAtlas` folder in File Explorer.
2. Confirm the folder contains `compose.yaml` and `Dockerfile`.
3. Click the File Explorer address bar, type `powershell`, and press Enter. This opens PowerShell in the correct folder.
4. Run:

```powershell
docker compose up -d --build
```

Docker copies the source files into a temporary build container, builds the app, and starts SawdustAtlas. You do not need to copy files into Docker yourself.

The first build may take several minutes. Check it with:

```powershell
docker compose ps
```

A working container reports `Up` and then `healthy`. If the browser cannot connect yet, wait a few seconds and refresh.

Open [http://localhost:8080](http://localhost:8080) on the same computer. On a tablet, open `http://<computer-ip>:8080`, replacing `<computer-ip>` with the host computer's private network address. The computer and tablet must be on the same trusted network.

To find the computer's address, run `ipconfig` in PowerShell. Look under the active Wi-Fi or Ethernet connection for **IPv4 Address**, usually something like `192.168.1.25`. In that example, the tablet address would be `http://192.168.1.25:8080`.

The container restarts with Docker Desktop. Update it after code changes with the same command, inspect it with `docker compose ps`, and stop it with `docker compose down`. A healthy deployment reports `Up ... (healthy)`.

If the service becomes unhealthy, recreate it with `docker compose down` followed by `docker compose up -d --build`. Project data currently belongs to each browser's local storage, not the container, so container recreation does not erase it. Keep periodic JSON exports until shared LAN persistence and automated backups are implemented.

### Direct development server

Keep the computer and tablet on the same trusted Wi-Fi network, then run:

```bash
pnpm dev:lan
```

Vite will print a `Network` address such as `http://192.168.1.25:5173`. Open that address on the tablet. Leave the terminal running and keep the computer awake while using the app. If Windows asks about firewall access, allow access on private networks only.

For a production-style local server, use `pnpm serve:lan` and open the printed address on port `4173`.

The manifest allows the site to be added to the tablet's home screen. Full offline installation and service-worker caching require a secure HTTPS context; plain LAN HTTP still works while the computer is reachable. A private option such as Tailscale Serve can provide trusted HTTPS without exposing the app publicly.

### Trusted HTTPS with Tailscale

For the simplest tablet-safe HTTPS setup, install Tailscale on this computer and the tablet, sign both into the same private tailnet, and enable HTTPS certificates for the tailnet. With the Docker app running, expose it using:

```powershell
tailscale serve --bg http://127.0.0.1:8080
tailscale serve status
```

Open the `https://...ts.net` address printed by Tailscale on the tablet. This keeps the app private to authorized tailnet devices and supplies a browser-trusted certificate. Remove the proxy later with `tailscale serve reset`.

Caddy or mkcert can also provide LAN HTTPS, but their local certificate authority must be installed and trusted on every tablet. That is useful for a LAN-only appliance, but it is more maintenance than Tailscale for the current single-user setup.

## Current features

- Millimeter-first dimensions throughout
- Scaled workshop floor plans with top and measured angled views, draggable catalog and custom objects, editable heights, rotation, color, general clearance, and directional infeed/outfeed zones
- Edge-grain cutting board patterns with six wood species, editable strip widths, pattern helpers, board-foot usage, and material estimates
- End-grain workflow showing the first glue-up, kerf-aware crosscut plan, and the board after its 90-degree turn
- Per-strip trailing angles, independent slice rotation and flipping, angle-aware dimensions, and species-level stock and waste totals
- Generated rough-stock list, machine cuts, saw-pass counts, and ordered build sequence
- Browser autosave plus JSON import and export
- Domain models separated from the UI so additional woodworking designers and storage adapters can be added cleanly

## Type safety

Every TypeScript target extends `tsconfig.base.json`. The shared policy enables strict mode plus unchecked-index, exact-optional-property, implicit-return, fallthrough, override, unused-code, and index-signature checks. `pnpm build` type-checks both the application and Vite configuration before producing assets.

## Accuracy policy

- Geometry is stored and calculated in millimeters at full JavaScript floating-point precision. Rounding happens only for display.
- End-grain calculations conserve material volume across rip-angle wedges, end trim, blade kerf, crosscut offcut, and final side squaring.
- Invalid self-crossing strip geometry is reported instead of silently producing a result.
- `pnpm test` covers exact and near-boundary slice fits, angled panels, species totals, and volume conservation.
- Estimates assume straight rectangular stock, a constant measured kerf, and no defects. Final surfacing loss, wood movement, checking, and defect avoidance require user allowances and are not presented as exact quantities.

## Data and privacy

Projects currently live in each browser's local storage. The computer and tablet therefore have separate project copies. Use JSON export/import to move projects between them, and export a backup before clearing browser data.
