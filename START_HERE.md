# Start Here

SawdustAtlas helps you plan a workshop and design cutting boards and furniture. You use it in a web browser, but your projects stay on your device unless you export a backup.

## Open SawdustAtlas

Ask the person who set it up for your SawdustAtlas address and save that page as a bookmark.

- On the computer running SawdustAtlas, the address is usually `http://localhost:8080`.
- On a tablet or another computer, use the private network address provided during setup.
- The computer running SawdustAtlas must be awake, and Docker Desktop must be running.

If SawdustAtlas has not been set up yet, the [Install and run guide](docs/howTo/install.md) explains how to download and run the public Docker image from [Docker Hub](https://hub.docker.com/r/headlock0253/sawdust-atlas) on Windows or Mac. You do not need to download the source code for everyday use.

## Your First Project

From the Home page, choose one of these:

- **Lay out a workshop** to place machines, benches, storage, doors, and work clearances.
- **Design a cutting board** to choose woods, dimensions, strip layouts, and end-grain patterns.
- **Design furniture** to start from a template and shape it with parameters.

Your changes save automatically in the browser. The **Saved in this browser** message at the top confirms this.

## Design a Cutting Board

1. Select **Cutting boards** in the left menu.
2. Select **New design**.
3. Choose **Edge grain** or **End grain**.
4. Enter the board dimensions.
5. Add wood strips and adjust their widths.
6. For an end-grain board, choose a pattern or adjust individual slices.
7. Review the finished size, rough stock, material estimate, waste, and build plan.
8. Use **Print build sheet** to take the plan to the bench. The build steps list each setup with its tolerance, so you can check a fence or stop before cutting.

Pattern buttons create an editable starting point. You can still change every strip afterward.

### Combine Boards into a Composite

Some pieces — a large table top or a cutting board built from several panels — are bigger than one board can hold. Open a finished board and choose **Make composite** to start joining panels into one larger piece. Every panel in a composite shares the same construction (edge grain or end grain).

### Design Furniture

1. Select **Furniture** in the left menu.
2. Select **New project**, then choose a template: table, desk, workbench, bookcase, base cabinet, or wall cabinet.
3. Open the **Parameters** tab and change the named values (overall width, depth, height, and so on). Parts that depend on a parameter follow it.
4. Select a part to edit its size, position, wood, and grain direction, or add your own parts and group them in the **Assemblies** tab.
5. Add joints between parts in the **Joints** tab. Joinery adds the extra length a tenon or similar joint needs to the cut list; it never changes the size you modeled.
6. Check the warnings, then open the **Cut list** and **Build steps** tabs at the bottom, or print them. The design area switches between drawings and a 3D view; the 3D view needs WebGL, and the drawings work without it.

Furniture saves in the browser and is included in **Export backup**, like every other project.

### Add Your Own Wood

In the **Wood library**:

1. Select the **+** button beside the Wood library heading.
2. Enter the wood name.
3. Choose its main color and grain color.
4. Enter its price per board foot.
5. Select the colored **+** beside that wood to add it to the board.

A wood cannot be deleted while a cutting board is using it. Remove or change those strips first.

## Plan a Workshop

1. Select **Workshop layout** in the left menu.
2. Select **New plan**.
3. Enter the room size in millimeters.
4. Add machines, benches, storage, doors, or custom objects.
5. Drag items into place and set their size, rotation, and working clearance.
6. Check both the top and angled views before relying on the layout.

## Work Out a Cut Away From a Board

Select **Geometry** in the left menu for a standalone calculator you can use for any cut, not just one already in a board — including a **Compound angle** mode for angled legs and other compound cuts.

## Undo, Warnings, and Units

Every edit can be undone and redone with the **Undo** and **Redo** buttons in the top bar. The warning list shows everything that needs attention; choosing a row takes you to the input that fixes it. **Preston's Button** switches displayed measurements between millimeters and inches. Stored values stay metric, and imperial entry snaps to the nearest half inch.

## Back Up Your Work

Projects are stored separately in each browser. A project made on a tablet will not automatically appear on the computer.

Use **Export backup** regularly. It downloads one backup file containing your workshops, cutting boards, furniture, and custom woods.

To move just one board or composite, open it and choose **Export project**. On the other device, open **Cutting boards** and choose **Import project**. The file adds the project (and any woods it needs) without replacing anything already there, and Undo removes it again.

To restore or move your projects:

1. Open SawdustAtlas on the destination device.
2. Select **Import backup**.
3. Choose the exported SawdustAtlas file.

Importing a backup replaces the projects currently stored in that browser. Export the current work first if you may need it later.

## If Something Is Wrong

For setup problems, see the full [Troubleshooting guide](docs/howTo/troubleshooting.md). Quick checks:

- **The page will not open:** Make sure the host computer is awake and Docker Desktop is running, then refresh the page. If it still will not open, the [Troubleshooting guide](docs/howTo/troubleshooting.md) covers the most common cause.
- **A tablet cannot connect:** Confirm the tablet and host computer are on the same private network.
- **Projects seem to be missing:** Check whether you opened SawdustAtlas in a different browser or on a different device.
- **The layout looks stale:** Refresh the page. Your locally saved projects should return.
- **You are about to clear browser data:** Export a backup first.

## Before Building

SawdustAtlas is a planning tool, not a substitute for checking the actual material and machines.

- Measure your real blade kerf and stock.
- Confirm every cut and angle before machining.
- Allow for defects, wood movement, flattening, and final sanding.
- Follow the safety instructions for your tools.
