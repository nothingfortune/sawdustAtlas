# Sawdust Atlas

A local-first design workspace for woodworking. The first two tools are a scaled workshop planner and an edge- and end-grain cutting board designer.

See [the product plan](docs/PRODUCT_PLAN.md) for the complete feature inventory, milestones, accuracy requirements, and ordered backlog.

## Run locally

```bash
pnpm install
pnpm dev
```

Create a production build with `pnpm build`.

## Use it from a tablet

### Docker (recommended for everyday use)

Install Docker Desktop, then run this once from the project directory:

```bash
docker compose up -d --build
```

Open `http://<computer-ip>:8080` on the tablet. On this computer's current network that would be `http://10.0.0.36:8080`. The address can change when the router assigns a new lease; reserving the computer's address in the router keeps the bookmark stable.

The container restarts with Docker Desktop. Update it after code changes with the same command, inspect it with `docker compose ps`, and stop it with `docker compose down`.

### Direct development server

Keep the computer and tablet on the same trusted Wi-Fi network, then run:

```bash
pnpm dev:lan
```

Vite will print a `Network` address such as `http://192.168.1.25:5173`. Open that address on the tablet. Leave the terminal running and keep the computer awake while using the app. If Windows asks about firewall access, allow access on private networks only.

For a production-style local server, use `pnpm serve:lan` and open the printed address on port `4173`.

The manifest allows the site to be added to the tablet's home screen. Full offline installation and service-worker caching require a secure HTTPS context; plain LAN HTTP still works while the computer is reachable. A private option such as Tailscale Serve can provide trusted HTTPS without exposing the app publicly.

## Current features

- Millimeter-first dimensions throughout
- Scaled workshop floor plans with draggable machines, benches, storage, doors, rotation, and working-clearance zones
- Edge-grain cutting board patterns with six wood species, editable strip widths, pattern helpers, board-foot usage, and material estimates
- End-grain workflow showing the first glue-up, kerf-aware crosscut plan, and the board after its 90-degree turn
- Per-strip trailing angles, independent slice rotation and flipping, angle-aware dimensions, and species-level stock and waste totals
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

Notion sync is intentionally deferred until an authenticated backend or OAuth flow is added. The future integration should map project metadata and reference images without making Notion the source of truth for design geometry.
