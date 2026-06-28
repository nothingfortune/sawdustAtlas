# Composite wafer model (locked)

Captures the agreed semantics for how a composite slices and renders wafers from
a donor board, after the 2026-06-26 design pass. Supersedes the earlier
"X = end-grain / Y = long-grain" wafer model in `compositeBoard.ts`.

## Principles

1. **One construction per composite, never mixed.** A composite is edge grain OR
   end grain, inferred from its donor boards. All donors must share that grain
   (the parts-bag add-guard stays). A composite never mixes edge- and end-grain
   donors.

2. **The cut axis changes orientation, not grain.** Crosscut and rip both yield
   wafers of the composite's grain. Rip is simply the crosscut slice taken across
   the other axis of the donor face (a 90° reorientation of the donor's pattern).
   There is no "rip = long grain" special case.

3. **A wafer mirrors the donor board's real face.** Each wafer renders a faithful
   slice of the donor's actual face — for an edge-grain donor the long-grain strip
   face (`LongGrainFace`), for an end-grain donor the assembled end-grain template
   (`AssembledBoard`) — not a simplified strip approximation. A chevron donor
   produces chevron wafers.

4. **Count is capped by the donor.** You cannot slice more wafers than the board
   yields: `count ≤ floor((donorDimAlongCut + kerf) / (slice + kerf))`, where the
   donor dimension is the board length for a crosscut and the board width for a
   rip.

## Geometry

`boardFaceSize(board)` → `{ lengthMm, widthMm }`:
- edge: `lengthMm = board.length`, `widthMm = Σ strip widths`.
- end: `lengthMm = finalLength`, `widthMm = panelWidth` (from `calculateEndGrainMetrics`).

A panel slices the donor face into `count` bands of `slice` width along the cut
axis (kerf between bands):
- **crosscut (X):** band `b` covers face-x `[b·(slice+kerf), +slice]`, full
  height. Wafer footprint = `slice × widthMm`.
- **rip (Y):** band `b` covers face-y `[b·(slice+kerf), +slice]`, full width.
  Wafer footprint = `lengthMm × slice`.

Wafer thickness = donor thickness. `bySpecies` per wafer = the donor face's
species split, scaled by the band's area fraction × thickness (approximate for
end-grain donors).

## Rendering

`WaferFace` receives the donor board, the wafer's slice window, and the cell
transform. It renders the donor's real face (`LongGrainFace` / `AssembledBoard`)
inside a clip = the slice window, scaled to the footprint, then applies the
per-wafer rotate/flip about the footprint centre. `AssembledBoard` and `SliceFace`
move from `BoardDesigner.tsx` into a shared `components/board/` module so both the
designer and the composite renderer use one implementation.

## Downstream (unchanged contracts)

`croppedLayout`, `deskLayout`, `assembledSize`, `materialBySpecies`,
`stockBySpecies`, and the row/wafer ops consume `Piece` footprint + `bySpecies`
generically and need no semantic change — only the values they read shift to the
new face-slice geometry.
