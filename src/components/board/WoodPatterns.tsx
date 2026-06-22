import type { WoodSpecies } from '../../types'

// SVG fill patterns per species, in millimetre user units so they scale with the
// board. Two motifs: `long-<id>` = long-grain face (streaks along the length),
// `end-<id>` = end-grain face (growth rings + pores). Render once inside an SVG.
export function WoodPatterns({ woods }: { woods: readonly WoodSpecies[] }) {
  return <defs>
    {woods.map(wood => <pattern id={`long-${wood.id}`} key={`long-${wood.id}`} width="26" height="15" patternUnits="userSpaceOnUse">
      <rect width="26" height="15" fill={wood.color}/>
      <path d="M0 5 H26 M0 10 H26" stroke={wood.accent} strokeWidth="0.5" opacity="0.32"/>
      <path d="M0 2.5 Q13 3.6 26 2.5 M0 12.5 Q13 11.4 26 12.5" fill="none" stroke={wood.accent} strokeWidth="0.4" opacity="0.22"/>
    </pattern>)}
    {woods.map(wood => <pattern id={`end-${wood.id}`} key={`end-${wood.id}`} width="18" height="18" patternUnits="userSpaceOnUse">
      <rect width="18" height="18" fill={wood.color}/>
      <ellipse cx="5" cy="7" rx="4" ry="6" fill="none" stroke={wood.accent} strokeWidth="1.2" opacity=".7"/>
      <path d="M11 0c-4 5-4 13 0 18M15 0c-3 6-3 12 0 18" fill="none" stroke={wood.accent} strokeWidth=".8" opacity=".55"/>
    </pattern>)}
  </defs>
}
