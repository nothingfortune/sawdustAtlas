# Use SawdustAtlas on a tablet

Once SawdustAtlas is [installed and running](install.md) on a computer, you can open it on a tablet or another device. The two must be on the **same private Wi-Fi network**, and the host computer must stay awake with Docker Desktop running.

Pick the option that fits you. The first is the simplest. The third gives you a secure `https://` address and is the best long-term setup.

---

## Option 1 — Open the computer's network address (simplest)

On the tablet, open a browser and go to `http://<computer-ip>:8080`, replacing `<computer-ip>` with the host computer's private network address.

To find that address on the host computer:

- **On Windows:** open PowerShell and run `ipconfig`. Under your active Wi-Fi or Ethernet connection, find **IPv4 Address** — usually something like `192.168.1.25`.
- **On a Mac:** open Terminal and run `ipconfig getifaddr en0` for Wi-Fi (try `en1` if that is blank). You will get something like `192.168.1.25`.

In that example, the tablet would open **http://192.168.1.25:8080**.

If Windows asks about firewall access the first time, allow access on **private networks only**.

---

## Option 2 — Add it to the tablet's home screen

After opening SawdustAtlas on the tablet using Option 1, your browser can add it to the home screen so it opens like an app. Full offline use and caching require a secure `https://` connection (see Option 3); plain Wi-Fi still works while the host computer is reachable.

---

## Option 3 — Secure HTTPS with Tailscale (best long-term)

Tailscale gives the tablet a private, browser-trusted `https://` address without exposing SawdustAtlas to the public internet.

1. Install **Tailscale** on both the host computer and the tablet.
2. Sign both into the **same private tailnet**.
3. Enable HTTPS certificates for the tailnet.
4. With SawdustAtlas running, on the host computer run:

```text
tailscale serve --bg http://127.0.0.1:8080
tailscale serve status
```

Open the `https://...ts.net` address that Tailscale prints, on the tablet. This keeps SawdustAtlas private to your authorized devices and supplies a trusted certificate. To remove it later, run `tailscale serve reset`.

> Caddy or mkcert can also provide LAN HTTPS, but their local certificate authority must be installed and trusted on every tablet. That suits a LAN-only appliance, but it is more upkeep than Tailscale for a single-user setup.

---

## For developers — direct development server

If you have the source code and want tablet access to a live dev build, keep the computer and tablet on the same trusted Wi-Fi and run:

```bash
pnpm dev:lan
```

Vite prints a `Network` address such as `http://192.168.1.25:5173`. Open that on the tablet, leave the terminal running, and keep the computer awake. For a production-style local server, use `pnpm serve:lan` and open the printed address on port `4173`. See [Build from source](build-from-source.md) for more.
