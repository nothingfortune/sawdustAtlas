export type View = 'home' | 'shop' | 'boards' | 'woods' | 'allowances'

export type ShopItemKind = 'machine' | 'bench' | 'storage' | 'dust' | 'utility' | 'door' | 'custom'
export type FeedDirection = 0 | 90 | 180 | 270

export interface ShopItem {
  id: string
  name: string
  kind: ShopItemKind
  x: number
  y: number
  width: number
  depth: number
  height: number
  rotation: number
  clearance: number
  feedDirection: FeedDirection | null
  infeedClearance: number
  outfeedClearance: number
  sideClearance: number
  color: string
}

export interface ShopBlockedZone {
  id: string
  name: string
  x: number
  y: number
  width: number
  depth: number
}

export interface ShopProject {
  id: string
  name: string
  width: number
  depth: number
  gridSize: number
  blockedZones: ShopBlockedZone[]
  items: ShopItem[]
  updatedAt: string
}

export interface WoodSpecies {
  id: string
  name: string
  color: string
  accent: string
  pricePerBoardFoot: number
}

export interface BoardStrip {
  id: string
  speciesId: string
  width: number
  trailingAngle: number
}

export interface CompositeCut {
  axis: 'x' | 'y'        // X = crosscut (end-grain wafers); Y = rip (long-grain strips)
  stripWidthMm: number   // slice thickness
  kerfMm: number
  count: number
}

export interface CompositePanel {
  id: string
  boardId: string        // source board sliced into wafers
  cut: CompositeCut
}

// A wafer placed in a row.
export interface AssemblyCell {
  panelId: string
  pieceIndex: number
  rotate: 0 | 90 | 180 | 270
  flip: boolean
}

export interface CompositeRow {
  id: string
  wafers: AssemblyCell[]
}

export interface CompositeBoard {
  id: string
  name: string
  construction: 'edge' | 'end'   // one construction per composite — never mixed
  panels: CompositePanel[]
  rows: CompositeRow[]           // ordered top→bottom
  updatedAt: string
}

export interface EndGrainSettings {
  sourceLength: number
  stockThickness: number
  sliceThickness: number
  kerf: number
  trimAllowance: number
  rowFlips: boolean[]
  rowRotations: boolean[]
  /** Per-slice vertical offset in mm for running-bond/brick patterns; wraps within the slice. */
  rowOffsets?: number[]
  /** Physical slice identity order after crosscutting; used so identical wafers can still be reordered visibly. */
  rowOrder?: number[]
}

export interface BuildAllowances {
  jointing: number
  planing: number
  routerTable: number
  ripAllowance: number
  lengthTrim: number
  widthTrim: number
}

export interface PricingSettings {
  /** Markup added on top of material cost (which already includes waste). */
  materialMarkupPercent: number
  laborRatePerHour: number
  /** Estimated build hours per complexity tier; × laborRatePerHour = labor cost. */
  tierHours: { simple: number; standard: number; complex: number }
  /** Flat consumables fee (glue/finish/abrasives) regardless of size. */
  consumablesBase: number
  /** Additional consumables per rough board-foot. */
  consumablesPerBoardFoot: number
  /** Minimum sell price per construction, applied to the grand total. */
  floor: { edge: number; end: number }
}

export type ComplexityTier = 'simple' | 'standard' | 'complex'

export interface PriceBreakdown {
  tier: ComplexityTier
  laborHours: number
  materialCost: number
  materialMarkup: number
  labor: number
  consumables: number
  subtotal: number
  floor: number
  /** max(0, floor − subtotal); > 0 only when the minimum is binding. */
  floorAdjustment: number
  total: number
}

export interface BoardProject {
  id: string
  name: string
  length: number
  thickness: number
  construction: 'edge' | 'end'
  endGrain: EndGrainSettings
  allowances: BuildAllowances
  strips: BoardStrip[]
  updatedAt: string
}

export interface AtlasData {
  schemaVersion: number
  shops: ShopProject[]
  boards: BoardProject[]
  woods: WoodSpecies[]
  /** Shop-wide milling allowances (machine setup) applied to every board. */
  allowances: BuildAllowances
  /** Shop-wide pricing knobs (markup, labor, consumables, floor). */
  pricing: PricingSettings
  composites: CompositeBoard[]
}
