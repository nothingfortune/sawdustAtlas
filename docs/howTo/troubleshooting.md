# Troubleshooting

Start with the first section — it is the cause of almost every "it won't open" report.

---

## The page at http://localhost:8080 will not open

Nine times out of ten, this means SawdustAtlas was started **without the part of the command that connects it to your browser**. The good news: the fix is two lines.

### Why this happens, in plain words

SawdustAtlas runs inside a small sealed package called a *container* — picture a **locked room** that Docker builds inside your computer. The app works fine on a door *inside that room*, numbered `80`. But a locked room with no opening to the hallway is useless: nothing outside can reach it.

The `-p 8080:80` piece of the start command is what **cuts an opening in the door** — it connects the number `8080` on your computer to door `80` inside the room. Typing **http://localhost:8080** in your browser is you walking up to that opening.

If SawdustAtlas was started **without** `-p 8080:80` — which is exactly what the **Run (play) button in Docker Desktop** does — the room gets built and the app inside runs happily, but there is no opening. Your browser knocks and nobody answers.

> [!WARNING]
> Docker Desktop may say SawdustAtlas is **"running"** or **"healthy."** That only means the app is alive **inside** the room. It does **not** mean you can reach it. The one thing that tells you whether you can reach it is the **PORTS** column, below.

### Step 1 — Check whether the opening exists

In PowerShell (Windows) or Terminal (Mac), run:

```text
docker ps --filter "name=sawdust-atlas"
```

Look at the **PORTS** column in the result:

| What you see under PORTS | What it means | What to do |
| --- | --- | --- |
| `0.0.0.0:8080->80/tcp` | The opening exists. | Refresh **http://localhost:8080** — it should work. |
| `80/tcp` with no `->` arrow | No opening. **This is the problem.** | Do Step 2. |
| Nothing listed at all | The container is not running. | Do Step 2. |

### Step 2 — Start it again, the right way

Run these two commands **one at a time** — paste the first, press **Enter**, wait for your cursor to return, then do the second.

**1. Remove the broken copy:**

```text
docker rm -f sawdust-atlas
```

**2. Start a fresh one with the `-p 8080:80` opening:**

```text
docker run --name sawdust-atlas -d --restart unless-stopped -p 8080:80 headlock0253/sawdust-atlas:latest
```

Now open **http://localhost:8080** again.

### Still not opening?

- Confirm **Docker Desktop is open and says it is running.**
- Confirm you typed **`8080`**, not `80`, in the browser address.
- Make sure nothing else on your computer is already using `8080`. If you suspect it is, you can use a different number on your side — for example `-p 9090:80`, and then open **http://localhost:9090**. Only the number to the **left** of the colon changes; the `80` on the right must stay.

---

## "The name sawdust-atlas is already in use"

An older copy is still there. Run these two commands **one at a time**:

**1. Remove the old copy:**

```text
docker rm -f sawdust-atlas
```

**2. Start it again:**

```text
docker run --name sawdust-atlas -d --restart unless-stopped -p 8080:80 headlock0253/sawdust-atlas:latest
```

---

## "no matching manifest for ... arm64" (or "amd64") when downloading

This means the copy of SawdustAtlas you tried to download did not have a build for your computer's processor. SawdustAtlas is now published for both **Intel/AMD (amd64)** and **Apple Silicon / ARM (arm64)**, so a fresh download works on any machine. If you saw this error, download the newest copy again by running these three commands **one at a time**:

**1. Remove the copy that would not run:**

```text
docker rm -f sawdust-atlas
```

**2. Download a fresh copy for your processor:**

```text
docker pull headlock0253/sawdust-atlas:latest
```

**3. Start it:**

```text
docker run --name sawdust-atlas -d --restart unless-stopped -p 8080:80 headlock0253/sawdust-atlas:latest
```

If you ever need to force a specific build, add `--platform linux/amd64` to the `docker run` line.

---

## A tablet or another device cannot connect

- The tablet and the host computer must be on the **same private Wi-Fi network**.
- The host computer must be **awake**, and **Docker Desktop must be running**.
- Use the host computer's network address, not `localhost`. See [Use SawdustAtlas on a tablet](use-on-a-tablet.md) for how to find it.

---

## My projects seem to be missing

Projects are saved **in the browser you created them in**, on that one device. They do not automatically appear in a different browser or on a different device.

- Check whether you opened SawdustAtlas in a different browser or on another device.
- To move projects between devices, use **Export backup** on one and **Import backup** on the other. See [Start Here](../../START_HERE.md).

---

## The layout or page looks stale

Refresh the page. Your locally saved projects should return.

---

## Before you clear browser data

Your SawdustAtlas projects live in the browser. **Export a backup first**, or you will lose them.
