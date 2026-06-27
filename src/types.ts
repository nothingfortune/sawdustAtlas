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
  /** Per-slice running-bond offset as a fraction of one cell (the average strip width); resolved to mm against the live strips and wrapped within the slice at render. */
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
  composites: CompositeBoard[]
}
