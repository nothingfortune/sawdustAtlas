export type View = 'home' | 'shop' | 'boards'

export interface ShopItem {
  id: string
  name: string
  kind: 'machine' | 'bench' | 'storage' | 'door'
  x: number
  y: number
  width: number
  depth: number
  rotation: number
  clearance: number
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
}

export interface BoardProject {
  id: string
  name: string
  length: number
  thickness: number
  construction: 'edge' | 'end'
  endGrain: EndGrainSettings
  strips: BoardStrip[]
  updatedAt: string
}

export interface AtlasData {
  shops: ShopProject[]
  boards: BoardProject[]
}
