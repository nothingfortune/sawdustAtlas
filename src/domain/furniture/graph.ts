// Dependency ordering shared by parameters and relationships.

/** Tarjan's strongly connected components. A component is either a single node or a
 *  cycle, and components come out with every dependency before its dependents. Members
 *  keep discovery order, so the result is deterministic for a given node order. */
export function stronglyConnectedComponents<T>(nodes: readonly T[], dependenciesOf: (node: T) => readonly T[]): T[][] {
  const groups: T[][] = []
  const index = new Map<T, number>()
  const low = new Map<T, number>()
  const stack: T[] = []
  const onStack = new Set<T>()
  let counter = 0

  const visit = (node: T) => {
    index.set(node, counter)
    low.set(node, counter)
    counter += 1
    stack.push(node)
    onStack.add(node)
    for (const next of dependenciesOf(node)) {
      if (!index.has(next)) {
        visit(next)
        low.set(node, Math.min(low.get(node)!, low.get(next)!))
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node)!, index.get(next)!))
      }
    }
    if (low.get(node) === index.get(node)) {
      const group: T[] = []
      let member: T
      do {
        member = stack.pop()!
        onStack.delete(member)
        group.push(member)
      } while (member !== node)
      groups.push(group.reverse())
    }
  }
  for (const node of nodes) if (!index.has(node)) visit(node)
  return groups
}
