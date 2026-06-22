export type View = 'home' | 'shop' | 'boards'

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

export interface ShopProject {
  id: string
  name: string
  width: number
  depth: number
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
}

export interface BuildAllowances {
  jointing: number
  planing: number
  drumSanding: number
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
  shops: ShopProject[]
  boards: BoardProject[]
  woods: WoodSpecies[]
}
