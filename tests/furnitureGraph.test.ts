import { describe, expect, it } from 'vitest'
import { stronglyConnectedComponents } from '../src/domain/furniture/graph'

const components = (edges: Record<string, string[]>, nodes = Object.keys(edges)) => stronglyConnectedComponents(nodes, node => edges[node] ?? [])

describe('stronglyConnectedComponents', () => {
  it('returns nothing for no nodes', () => {
    expect(components({})).toEqual([])
  })

  it('puts every dependency before its dependents', () => {
    const order = components({ c: ['b'], b: ['a'], a: [] }).flat()
    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('is independent of node order for valid orderings', () => {
    const edges = { d: ['b', 'c'], b: ['a'], c: ['a'], a: [] }
    for (const nodes of [['d', 'c', 'b', 'a'], ['a', 'b', 'c', 'd'], ['b', 'd', 'a', 'c']]) {
      const order = components(edges, nodes).flat()
      for (const [node, deps] of Object.entries(edges)) for (const dep of deps) expect(order.indexOf(dep)).toBeLessThan(order.indexOf(node))
    }
  })

  it('groups a cycle into one component and keeps its tail apart', () => {
    const result = components({ a: ['b'], b: ['c'], c: ['a'], d: ['a'] })
    expect(result).toEqual([['a', 'b', 'c'], ['d']])
  })

  it('separates two cycles joined by an edge', () => {
    const result = components({ a: ['b'], b: ['a'], c: ['d', 'a'], d: ['c'] })
    expect(result.map(group => [...group].sort())).toEqual([['a', 'b'], ['c', 'd']])
  })

  it('reports a self loop as a one-member component the caller can detect', () => {
    expect(components({ a: ['a'] })).toEqual([['a']])
  })
})
