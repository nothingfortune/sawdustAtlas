import type { AtlasData, View } from './types'

export type BoardsMode = 'gallery' | 'board' | 'composite'
export type FurnitureMode = 'gallery' | 'designer'

export interface NavState {
  view: View
  activeShop: string
  activeBoard: string
  activeComposite: string
  boardsMode: BoardsMode
  boardBackTo: 'gallery' | 'composite'
  activeFurniture: string
  furnitureMode: FurnitureMode
  /** Part to select when the designer opens from a warning. */
  furnitureFocus: string | undefined
  /** Counts opens so the designer remounts (and re-selects its focus) each time. */
  furnitureOpens: number
}

export type NavAction =
  | { type: 'goTo'; view: View }
  | { type: 'browseBoards' }
  | { type: 'browseFurniture' }
  | { type: 'openShop'; id: string }
  | { type: 'selectShop'; id: string }
  | { type: 'selectBoard'; id: string }
  | { type: 'openBoard'; id: string }
  | { type: 'editPanelBoard'; id: string }
  | { type: 'openComposite'; id: string }
  | { type: 'boardBack' }
  | { type: 'compositeBack' }
  | { type: 'openFurniture'; id: string; focusId?: string | undefined }
  | { type: 'furnitureBack' }
  | { type: 'projectRemoved'; kind: 'shop' | 'board' | 'furniture'; id: string; remainingIds: readonly string[] }
  | { type: 'restoreSelection'; activeShop: string; activeBoard: string }
  | { type: 'backupImported'; activeShop: string; activeBoard: string }
  | { type: 'restoreFromHistory'; state: unknown }

/** The fields mirrored into browser history; this shape must not change (Back depends on it). */
export interface HistoryNavState {
  view: View
  boardsMode: BoardsMode
  activeBoard: string
  activeComposite: string
  furnitureMode: FurnitureMode
  activeFurniture: string
}

export function initialNav(data: Pick<AtlasData, 'shops' | 'boards'>): NavState {
  return {
    view: 'home', activeShop: data.shops[0]?.id ?? '', activeBoard: data.boards[0]?.id ?? '', activeComposite: '',
    boardsMode: 'gallery', boardBackTo: 'gallery', activeFurniture: '', furnitureMode: 'gallery', furnitureFocus: undefined, furnitureOpens: 0,
  }
}

export function toHistoryState(nav: NavState): HistoryNavState {
  return { view: nav.view, boardsMode: nav.boardsMode, activeBoard: nav.activeBoard, activeComposite: nav.activeComposite, furnitureMode: nav.furnitureMode, activeFurniture: nav.activeFurniture }
}

export function navigate(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case 'goTo': return { ...state, view: action.view }
    case 'browseBoards': return { ...state, view: 'boards', boardsMode: 'gallery' }
    case 'browseFurniture': return { ...state, view: 'furniture', furnitureMode: 'gallery' }
    case 'openShop': return { ...state, activeShop: action.id, view: 'shop' }
    case 'selectShop': return { ...state, activeShop: action.id }
    case 'selectBoard': return { ...state, activeBoard: action.id }
    case 'openBoard': return { ...state, activeBoard: action.id, boardBackTo: 'gallery', boardsMode: 'board' }
    case 'editPanelBoard': return { ...state, activeBoard: action.id, boardBackTo: 'composite', boardsMode: 'board' }
    case 'openComposite': return { ...state, activeComposite: action.id, boardsMode: 'composite' }
    case 'boardBack': return { ...state, boardsMode: state.boardBackTo }
    case 'compositeBack': return { ...state, boardsMode: 'gallery' }
    case 'openFurniture': return { ...state, activeFurniture: action.id, furnitureFocus: action.focusId, furnitureOpens: state.furnitureOpens + 1, furnitureMode: 'designer' }
    case 'furnitureBack': return { ...state, furnitureMode: 'gallery' }
    case 'projectRemoved': return removed(state, action)
    case 'restoreSelection': return { ...state, activeShop: action.activeShop, activeBoard: action.activeBoard }
    case 'backupImported': return { ...state, activeShop: action.activeShop, activeBoard: action.activeBoard, activeFurniture: '', furnitureMode: 'gallery', view: 'home' }
    case 'restoreFromHistory': return fromHistory(state, action.state)
  }
}

function removed(state: NavState, action: Extract<NavAction, { type: 'projectRemoved' }>): NavState {
  const fallback = action.remainingIds[0] ?? ''
  if (action.kind === 'shop') return state.activeShop === action.id ? { ...state, activeShop: fallback } : state
  if (action.kind === 'board') return state.activeBoard === action.id ? { ...state, activeBoard: fallback } : state
  return state.activeFurniture === action.id ? { ...state, activeFurniture: '', furnitureMode: 'gallery' } : state
}

// Mirrors the previous popstate handler: missing modes reset, missing ids keep the current selection.
function fromHistory(state: NavState, raw: unknown): NavState {
  const saved = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<HistoryNavState>
  return {
    ...state,
    view: saved.view ?? 'home',
    boardsMode: saved.boardsMode ?? 'gallery',
    activeBoard: typeof saved.activeBoard === 'string' ? saved.activeBoard : state.activeBoard,
    activeComposite: typeof saved.activeComposite === 'string' ? saved.activeComposite : state.activeComposite,
    furnitureMode: saved.furnitureMode ?? 'gallery',
    activeFurniture: typeof saved.activeFurniture === 'string' ? saved.activeFurniture : state.activeFurniture,
  }
}
