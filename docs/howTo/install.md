# Install and run SawdustAtlas

This guide is for a first-time setup on a Windows or Mac computer. You do not need to be technical, and you do not need to download any source code. Take it one step at a time — the whole thing takes about ten minutes, most of which is waiting for a download.

When you are done, SawdustAtlas will open in your web browser at **http://localhost:8080**.

---

## What you are about to do, in plain words

SawdustAtlas comes as a ready-to-run package on a free website called Docker Hub. A free program called **Docker Desktop** downloads that package and runs it on your computer for you. You will:

1. Install Docker Desktop.
2. Paste **one command** to download and start SawdustAtlas.
3. Open SawdustAtlas in your browser.

That command only needs to be done once. After that, SawdustAtlas starts on its own whenever your computer is on.

---

## Step 1 — Install Docker Desktop

1. Go to **https://www.docker.com/products/docker-desktop/**.
2. Download the version for your computer. On a Mac, choose **Apple Silicon** for a newer Mac (M1/M2/M3/M4 and later) or **Intel** for an older Mac — if you are unsure, click the Apple menu &rarr; **About This Mac** to see your chip. SawdustAtlas runs on both, as well as on Windows.
3. Open the downloaded file and follow the installer like any other program.
4. Start **Docker Desktop**. The first time, it may ask you to accept an agreement and may take a minute to start.
5. **Wait until Docker Desktop says it is running** (you will see a green "running" indicator). Do not continue until it does.

> You only ever install Docker Desktop once.

---

## Step 2 — Open a place to type a command

You need a window where you can paste a command. It has a different name on each system, but it works the same way.

- **On Windows:** open the Start menu, type `PowerShell`, and open **Windows PowerShell**.
- **On a Mac:** open **Terminal** (find it with Spotlight — press `Cmd` and the space bar, then type `Terminal`).

A window with a blinking cursor will appear. This is where the following command goes.

---

## Step 3 — Download and start SawdustAtlas

Copy the line below exactly, paste it into the window from Step 2, and press **Enter**.

```text
docker run --name sawdust-atlas -d --restart unless-stopped -p 8080:80 headlock0253/sawdust-atlas:latest
```

> [!NOTE]
> This is **one single command**, even if it wraps onto two or three lines on your screen — select and copy the whole thing. After you paste it, if your cursor does not come back on its own, press **Enter** once.

The first time, Docker downloads SawdustAtlas. This can take a few minutes depending on your internet — that is normal. When it finishes and you get your cursor back, SawdustAtlas is running.

> [!IMPORTANT]
> **Use the command above. Do not start SawdustAtlas by clicking the Run (play) button inside Docker Desktop. Please just follow the instructions **
> The `-p 8080:80` piece of this command is what lets your browser reach SawdustAtlas. The Run button leaves that piece out, so the app will look like it is running but the page will never open. If that has already happened, see [Troubleshooting](troubleshooting.md).

---

## Step 4 — Open SawdustAtlas

On the same computer, open your web browser and go to:

**http://localhost:8080**

That's it. You may want to bookmark this for later use. The address will not change. The Docker App is required to be running to use it.

To use SawdustAtlas from a tablet or another device on your home network, see [Use SawdustAtlas on a tablet](use-on-a-tablet.md).

---

## Everyday use — stop, start, and check

You do not need to repeat the install. SawdustAtlas restarts with your computer. But if you ever want to check on it or turn it off, use these in the same kind of window from Step 2.

**Check whether it is running:**

```text
docker ps --filter "name=sawdust-atlas"
```

**Stop it:**

```text
docker stop sawdust-atlas
```

**Start it again later:**

```text
docker start sawdust-atlas
```

---

## Update to the newest version

When a new version is published, run these three commands **one at a time**. Paste one, press **Enter**, wait until your cursor comes back, then do the next. Doing them one at a time makes it obvious if a step needs a moment — do not paste all three at once.

**1. Download the newest version:**

```text
docker pull headlock0253/sawdust-atlas:latest
```

**2. Remove the old copy** (your projects are safe — they live in your browser, not in this package):

```text
docker rm -f sawdust-atlas
```

**3. Start the newest version:**

```text
docker run --name sawdust-atlas -d --restart unless-stopped -p 8080:80 headlock0253/sawdust-atlas:latest
```

Your saved projects live in your browser, not in the package, so updating does not erase them. Even so, it is wise to use **Export backup** inside SawdustAtlas now and then. See [Start Here](../../START_HERE.md) for how backups work.

---

## Something not working?

Almost every first-time problem is the same one, and it has a simple fix. See **[Troubleshooting](troubleshooting.md)**.
