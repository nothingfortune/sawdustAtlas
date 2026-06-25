# Brick Pattern Correction

Research date: 2026-06-23

## Why the current preset is wrong

The current SawdustAtlas `brick` preset is a single-panel running-bond approximation: it makes alternating strips, crosscuts that one blank, and offsets every other slice by a fixed amount. That can draw a staggered end-grain rhythm, but it is not the same build as a brick-and-mortar cutting board.

The referenced builds use a multi-stage process:

- Build a brick-course panel from wide brick stock separated by thin mortar strips.
- Build or prepare a second mortar blank for thin separator strips.
- Crosscut the brick-course panel into equal strips.
- Put those strips on edge so the visible face is end grain.
- Rotate every second strip or otherwise offset alternate courses to create the running brick bond.
- Insert thin mortar strips between the brick-course strips during the final glue-up.
- Flatten the end-grain board with a router sled or other end-grain-safe method, not a planer.

That means the true pattern is not just a row transform. It requires multiple source blanks and final assembly parts from different sources.

## Sources synthesized

- Instructables, "Brick and Mortar" Cutting Board: referenced as a brick-and-mortar style build with visible brick units separated by contrasting mortar.
- Instructables, "How to Make a Brick Pattern Cutting Board": referenced as another step-by-step brick-pattern cutting board build.
- DIY Montreal, "Brick Pattern End Grain Cutting Board": describes a maple/walnut version with two initial panels, thin walnut strips, even crosscut strips, alternate 180-degree rotation, inserted walnut strips between rows, and router-sled flattening.

These are construction references only. SawdustAtlas should generate original parameterized recipes, diagrams, and cut lists rather than copying plan dimensions, text, or images.

## Correct SawdustAtlas model

This is a good candidate for a broader SawdustAtlas concept: **composable board assemblies**.

Instead of treating every design as one source panel that becomes one stack of slices, the domain should allow a board to be made from reusable intermediate pieces:

- `source panel`: a long-grain glue-up or solid blank before it is crosscut/ripped.
- `wafer`: an end-grain slice cut from a source panel.
- `separator`: a thin strip or wafer inserted between larger wafers/courses.
- `course`: a repeated row/column unit in the final board.
- `assembly`: the final glue-up that combines wafers, separators, offsets, rotations, and trims.

The brick pattern can then become the first real use case for combining parts from multiple boards/blanks:

- Brick-course wafers come from the brick-course source panel.
- Mortar separators come from the mortar blank.
- The final board alternates those pieces according to a parameterized assembly recipe.

That same model later supports basket weave, border/frame glue-ups, mixed-width end-grain mosaics, and user-created "make this wafer, then reuse it over here" workflows.

### Materials

Use wood roles instead of hard-coded species:

- `brick`: the main brick field, typically the lighter or larger visual species.
- `mortar`: the thin separator species, usually darker.

Optional future role:

- `accent`: for boards that use a separate perimeter, border, or alternate brick color.

### Parameters

All values are stored in millimeters:

- Finished board length, width, and thickness.
- Brick course height.
- Mortar thickness between courses.
- Mortar thickness between brick strips in final glue-up.
- Crosscut strip width.
- Kerf.
- End trim allowance.
- Flattening/surfacing allowance.
- Optional half-brick starter/end course toggle.

Recommended defaults for a first editable recipe:

- Brick course height: `38 mm`.
- Mortar thickness: `6 mm`.
- Crosscut strip width: equal to finished board thickness before flattening allowance.
- Offset: half of `(brick course height + mortar thickness)`.

The offset must be derived from the actual course pitch. Do not hard-code `20 mm`.

## Required build sequence

### 1. Brick-course glue-up

Create a long-grain panel with repeating courses:

```text
brick course
mortar strip
brick course
mortar strip
brick course
...
```

If the design needs a clean stagger at the board edge, allow half-height brick courses at the top or bottom of the panel. This matches the practical reason DIY Montreal notes for using a half-size final maple piece: it preserves the offset pattern after alternate strips are turned.

### 2. Mortar-strip blank

Create a second blank from the mortar species. This blank supplies the thin separator strips inserted between brick-course strips in the final glue-up.

SawdustAtlas should model this as a separate source panel, not as part of the first glue-up.

### 3. Crosscut brick-course strips

Crosscut the brick-course panel into equal strips. These become the brick rows/columns in the final board.

The cut plan must include:

- Number of brick-course strips.
- Kerf waste.
- End trim waste.
- Offcut.
- Direction note: keep the strips square and ordered.

### 4. Cut mortar separator strips

Cut thin mortar strips from the mortar blank. These are placed between brick-course strips in the final glue-up.

The cut plan must include:

- Number of separators: usually `brickStripCount - 1`, plus optional outer borders if enabled.
- Separator width.
- Source blank dimensions.
- Kerf and surfacing waste.

### 5. Final end-grain glue-up

Turn brick-course strips on edge so the visible face is end grain.

For a running brick pattern:

- Alternate brick-course strips are shifted by half a course pitch, or rotated 180 degrees when the source panel has a half-course edge.
- Insert one mortar separator strip between each brick-course strip.
- Keep one reference edge aligned unless the recipe intentionally centers the pattern and trims both sides.

This final assembly is a composite of brick-course strips and mortar separator strips. The current single-panel `rowOffsets` model cannot represent the inserted separator strips.

### 6. Flatten, square, and finish

The build sheet should warn that end grain should not be planed. The generated instructions should prefer a router flattening sled, drum sander, CNC surfacing pass, or careful sanding workflow.

## Implementation plan

### Immediate correction

> **Status (2026-06-24): done.** The preset is named **Running bond** and its
> offset now derives from the preset strip width (`PRESET_STRIP_WIDTH / 2`, with
> third-bond/stepped-wave derived likewise) in `src/domain/boardPatterns.ts` —
> no hard-coded `20 mm`. True brick-and-mortar (separate mortar course strips)
> still depends on composite source panels (BOARD-008); see "Proper correction".

Rename or describe the current `brick` preset as `Running bond` or `Brick bond approximation` until composite source panels exist. It may keep a staggered visual, but it must not claim to produce a true brick-and-mortar build plan.

Also fix the current offset math:

- Offset should use `coursePitch / 2`.
- `coursePitch = brickCourseHeight + mortarCourseThickness`.
- The preset should generate visible mortar course strips if it remains available.

### Proper correction

Add a composable assembly model:

```ts
interface SourcePanelRecipe {
  id: string
  name: string
  strips: BoardStrip[]
  lengthMm: number
  thicknessMm: number
}

interface AssemblyPart {
  sourcePanelId: string
  sourcePieceIndex: number
  kind: 'wafer' | 'separator' | 'border'
  rotate?: 0 | 180
  flip?: boolean
  offsetMm?: number
}

interface CompositeBoardRecipe {
  sourcePanels: SourcePanelRecipe[]
  finalAssembly: AssemblyPart[]
  parameters: Record<string, number | string | boolean>
}
```

For brick:

- Source panel A: repeating brick course plus horizontal mortar strips.
- Source panel B: mortar separator blank.
- Final assembly: alternate brick-course strip, mortar separator strip, brick-course strip, mortar separator strip.
- Alternate brick-course strips carry a half-course offset or 180-degree rotation rule.

The existing `BoardProject` can keep its simple single-panel fields for normal edge-grain and basic end-grain boards, but true brick should be represented as a composite recipe once `BOARD-008` lands. Avoid squeezing this into `rowOffsets`; that would keep producing a believable picture with an unbuildable plan.

### UI requirements

- Pattern preview should show current vs proposed, but the accepted recipe must update the generated build steps too.
- Build steps must show both source panels before the final glue-up.
- Cut plan must distinguish brick-course crosscuts from mortar separator cuts.
- If the user applies a true brick recipe before `BOARD-008` exists, show a clear "requires multi-panel workflow" message instead of drawing a misleading board.

## Acceptance criteria

- The app no longer labels a single-panel fixed-offset recipe as a true brick-and-mortar board.
- A true brick recipe has at least two source panels in the domain model.
- The final assembly can insert separator strips between brick-course strips.
- Mortar thickness is parameterized and included in final size, waste, and material estimate.
- Half-course offset is derived from dimensions, not hard-coded.
- The printable build sheet includes a no-planer warning for end-grain flattening.
- Tests cover source-panel generation, final assembly ordering, material conservation, and migration from old `brick` preset data.
