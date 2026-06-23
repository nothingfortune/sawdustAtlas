# SawdustAtlas

A local-first design workspace for woodworking. The first two tools are a scaled workshop planner and an edge- and end-grain cutting board designer.

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
headlock0253/sawdust-atlas
```

Add these repository secrets in GitHub before relying on the publish step:

- `DOCKERHUB_USERNAME`: the Docker Hub account or organization that owns the repository.
- `DOCKERHUB_TOKEN`: a Docker Hub access token with permission to push `sawdust-atlas`.

The default branch is tagged `latest`, version tags such as `v0.1.0` keep their tag name, and every published build also receives a `sha-...` tag. Published images include SBOM and provenance attestations, and CI runs Docker Scout vulnerability and recommendation checks as advisory output. GitHub Actions are pinned to full commit SHAs, with Dependabot checking action, npm, and Docker updates weekly.

In Docker Hub, enable immutable tags for release tags after creating the repository: open the repository, go to **Settings > General > Tag mutability settings**, choose **Specific tags are immutable**, and use a pattern for version tags such as `^v.*`. Keep `latest` mutable so the default branch can continue to update it.

## Use it from a tablet

### Docker (recommended for everyday use)

Docker Desktop is a program that can run apps in small, self-contained packages called containers. For SawdustAtlas, that means you do not need to install Node, pnpm, nginx, or download the source code. Docker downloads the ready-to-run SawdustAtlas package from Docker Hub and starts it on your computer.

The public Docker Hub page is [headlock0253/sawdust-atlas](https://hub.docker.com/r/headlock0253/sawdust-atlas). You do not need a Docker Hub account to download the public image.

#### First-time setup

1. Install and open [Docker Desktop](https://www.docker.com/products/docker-desktop/). Wait until it says Docker is running.
2. Open a command window:
   - On Windows, open PowerShell from the Start menu.
   - On macOS, open Terminal from Applications or Spotlight.
3. Copy and paste this command, then press Enter:

```powershell
docker run --name sawdust-atlas -d --restart unless-stopped -p 8080:80 headlock0253/sawdust-atlas:latest
```

Docker downloads SawdustAtlas the first time you run this command. After that, it starts much faster. The command also tells Docker to keep SawdustAtlas available at port `8080`, which is the number used in the browser address below.

> [!IMPORTANT]
> **Use the command above. Do not start SawdustAtlas with the Run (play) button in Docker Desktop.**
> The `-p 8080:80` part of the command is what makes the app reachable in your browser. The Run button skips this by default, so the app will look like it is running but the page will never open. If that has already happened to you, see [If http://localhost:8080 will not open](#if-httplocalhost8080-will-not-open).

Open [http://localhost:8080](http://localhost:8080) on the same computer. On a tablet, open `http://<computer-ip>:8080`, replacing `<computer-ip>` with the host computer's private network address. The computer and tablet must be on the same trusted network.

To find the computer's address, run `ipconfig` in PowerShell. Look under the active Wi-Fi or Ethernet connection for **IPv4 Address**, usually something like `192.168.1.25`. In that example, the tablet address would be `http://192.168.1.25:8080`.

#### Check, stop, and start

Check whether SawdustAtlas is running:

```powershell
docker ps --filter "name=sawdust-atlas"
```

Stop it:

```powershell
docker stop sawdust-atlas
```

Start it again later:

```powershell
docker start sawdust-atlas
```

#### If http://localhost:8080 will not open

This is the most common problem, and it is almost always the same cause: the app
was started without the part of the command that connects it to your browser.

**Why it happens, in plain terms:** SawdustAtlas runs inside a small sealed
package called a container — think of it as a locked room that Docker builds
inside your computer. The app works on a door *inside that room*, numbered `80`.
A locked room with no opening to the hallway is useless: nothing can reach it.
The `-p 8080:80` part of the start command is what cuts an opening — it connects
port `8080` on your computer to door `80` inside the room. `http://localhost:8080`
is you walking up to that opening. Start the app **without** `-p 8080:80` (which
is exactly what the Run button in Docker Desktop does) and the room is built and
the app inside runs happily, but there is no opening, so your browser knocks and
nobody answers.

> [!WARNING]
> "Running" or "healthy" in Docker Desktop only means the app is alive **inside**
> the room. It does **not** mean you can reach it. The one thing that tells you
> whether you can reach it is the PORTS column described below.

**Step 1 — check whether the opening exists.** Run:

```powershell
docker ps --filter "name=sawdust-atlas"
```

Look at the **PORTS** column in the result:

| What you see in PORTS | What it means | What to do |
| --- | --- | --- |
| `0.0.0.0:8080->80/tcp` | The opening exists. | The address should work — refresh `http://localhost:8080`. |
| `80/tcp` (no `->` arrow) | No opening. This is the problem. | Do Step 2. |

**Step 2 — start it again, the right way.** Copy and paste these two lines:

```powershell
docker rm -f sawdust-atlas
docker run --name sawdust-atlas -d --restart unless-stopped -p 8080:80 headlock0253/sawdust-atlas:latest
```

The first line removes the broken container. The second starts a fresh one
**with** the `-p 8080:80` opening. Then open
[http://localhost:8080](http://localhost:8080) again.

If it still does not open, confirm Docker Desktop says Docker is running, and
that you typed `8080` (not `80`) in the browser address.

#### Update SawdustAtlas

To download the newest published version:

```powershell
docker pull headlock0253/sawdust-atlas:latest
docker stop sawdust-atlas
docker rm sawdust-atlas
docker run --name sawdust-atlas -d --restart unless-stopped -p 8080:80 headlock0253/sawdust-atlas:latest
```

Project data currently belongs to each browser's local storage, not the container, so updating or recreating the container does not erase it. Keep periodic JSON exports until shared LAN persistence and automated backups are implemented.

If Docker says the name `sawdust-atlas` is already in use, an old container is still present. Run `docker rm sawdust-atlas`, then run the `docker run ...` command again.

#### Build from source instead

The Docker Hub image is the easiest path for regular use. Developers who want to build SawdustAtlas from the files in this repository can clone or download the repository and run:

```powershell
docker compose up -d --build
```

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
