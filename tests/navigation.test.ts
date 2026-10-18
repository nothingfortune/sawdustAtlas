import { describe, expect, it } from 'vitest'
import { initialNav, navigate, toHistoryState } from '../src/navigation'
import type { NavState } from '../src/navigation'

const start = (): NavState => initialNav({ shops: [{ id: 's1' }, { id: 's2' }], boards: [{ id: 'b1' }, { id: 'b2' }] } as never)

describe('initialNav', () => {
  it('opens home with the first shop and board selected', () => {
    expect(start()).toEqual({
      view: 'home', activeShop: 's1', activeBoard: 'b1', activeComposite: '', boardsMode: 'gallery', boardBackTo: 'gallery',
      activeFurniture: '', furnitureMode: 'gallery', furnitureFocus: undefined, furnitureOpens: 0,
    })
  })
})

describe('navigate', () => {
  it('openBoard selects and opens without changing view; boardBack returns to where it came from', () => {
    const opened = navigate(start(), { type: 'openBoard', id: 'b2' })
    expect(opened).toMatchObject({ view: 'home', activeBoard: 'b2', boardsMode: 'board', boardBackTo: 'gallery' })
    const fromPanel = navigate(navigate(start(), { type: 'openComposite', id: 'c1' }), { type: 'editPanelBoard', id: 'b2' })
    expect(fromPanel).toMatchObject({ activeComposite: 'c1', activeBoard: 'b2', boardsMode: 'board', boardBackTo: 'composite' })
    expect(navigate(fromPanel, { type: 'boardBack' }).boardsMode).toBe('composite')
    expect(navigate(fromPanel, { type: 'compositeBack' }).boardsMode).toBe('gallery')
  })

  it('browseBoards and browseFurniture reset to the galleries', () => {
    const deep = navigate(navigate(start(), { type: 'openBoard', id: 'b2' }), { type: 'openFurniture', id: 'f1' })
    expect(navigate(deep, { type: 'browseBoards' })).toMatchObject({ view: 'boards', boardsMode: 'gallery' })
    expect(navigate(deep, { type: 'browseFurniture' })).toMatchObject({ view: 'furniture', furnitureMode: 'gallery' })
  })

  it('openFurniture sets focus and counts opens so the designer remounts', () => {
    const once = navigate(start(), { type: 'openFurniture', id: 'f1', focusId: 'leg' })
    expect(once).toMatchObject({ activeFurniture: 'f1', furnitureFocus: 'leg', furnitureOpens: 1, furnitureMode: 'designer' })
    expect(navigate(once, { type: 'openFurniture', id: 'f1' })).toMatchObject({ furnitureFocus: undefined, furnitureOpens: 2 })
    expect(navigate(once, { type: 'furnitureBack' }).furnitureMode).toBe('gallery')
  })

  it('openShop selects and shows the shop; goTo only changes view', () => {
    expect(navigate(start(), { type: 'openShop', id: 's2' })).toMatchObject({ view: 'shop', activeShop: 's2' })
    expect(navigate(start(), { type: 'goTo', view: 'woods' })).toEqual({ ...start(), view: 'woods' })
  })

  it('projectRemoved falls back only when the open project was removed', () => {
    expect(navigate(start(), { type: 'projectRemoved', kind: 'board', id: 'b1', remainingIds: ['b2'] }).activeBoard).toBe('b2')
    expect(navigate(start(), { type: 'projectRemoved', kind: 'board', id: 'b2', remainingIds: ['b1'] }).activeBoard).toBe('b1')
    expect(navigate(start(), { type: 'projectRemoved', kind: 'shop', id: 's1', remainingIds: [] }).activeShop).toBe('')
    const designing = navigate(start(), { type: 'openFurniture', id: 'f1' })
    expect(navigate(designing, { type: 'projectRemoved', kind: 'furniture', id: 'f1', remainingIds: [] })).toMatchObject({ activeFurniture: '', furnitureMode: 'gallery' })
    expect(navigate(designing, { type: 'projectRemoved', kind: 'furniture', id: 'f2', remainingIds: ['f1'] })).toBe(designing)
  })

  it('restoreSelection restores shop and board only (undo); backupImported also goes home', () => {
    const moved = navigate(navigate(start(), { type: 'openFurniture', id: 'f1' }), { type: 'goTo', view: 'furniture' })
    expect(navigate(moved, { type: 'restoreSelection', activeShop: 's2', activeBoard: 'b2' })).toEqual({ ...moved, activeShop: 's2', activeBoard: 'b2' })
    expect(navigate(moved, { type: 'backupImported', activeShop: 's9', activeBoard: 'b9' })).toMatchObject({
      view: 'home', activeShop: 's9', activeBoard: 'b9', activeFurniture: '', furnitureMode: 'gallery',
    })
  })

  it('round-trips through browser history state', () => {
    const deep = navigate(navigate(navigate(start(), { type: 'goTo', view: 'boards' }), { type: 'openComposite', id: 'c1' }), { type: 'editPanelBoard', id: 'b2' })
    const saved = toHistoryState(deep)
    expect(saved).toEqual({ view: 'boards', boardsMode: 'board', activeBoard: 'b2', activeComposite: 'c1', furnitureMode: 'gallery', activeFurniture: '' })
    const restored = navigate(start(), { type: 'restoreFromHistory', state: saved })
    expect(toHistoryState(restored)).toEqual(saved)
  })

  it('restoreFromHistory with no state returns to home galleries and keeps selections', () => {
    const opened = navigate(start(), { type: 'openBoard', id: 'b2' })
    expect(navigate(opened, { type: 'restoreFromHistory', state: null })).toMatchObject({ view: 'home', boardsMode: 'gallery', furnitureMode: 'gallery', activeBoard: 'b2' })
  })
})
