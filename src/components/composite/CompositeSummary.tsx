import type { BoardProject, CompositeBoard, WoodSpecies } from '../../types'
import { assembledSize, materialBySpecies, stockBySpecies, compositeCutPlan } from '../../domain/compositeBoard'

export function CompositeSummary({ composite, boards, woods }: { composite: CompositeBoard; boards: BoardProject[]; woods: WoodSpecies[] }) {
  const size = assembledSize(composite, boards)
  const finished = materialBySpecies(composite, boards)
  const stock = stockBySpecies(composite, boards)
  const plan = compositeCutPlan(composite, boards)
  const nameFor = (id: string) => woods.find(w => w.id === id)?.name ?? id
  const ids = [...new Set([...finished.map(f => f.speciesId), ...stock.map(s => s.speciesId)])].sort((a, b) => a.localeCompare(b))
  const finishedBf = (id: string) => finished.find(f => f.speciesId === id)?.boardFeet ?? 0
  const stockBf = (id: string) => stock.find(s => s.speciesId === id)?.boardFeet ?? 0

  return (
    <div className="composite-summary">
      <section>
        <h3>Finished size</h3>
        <p>{Math.round(size.lengthMm)} × {Math.round(size.widthMm)} × {Math.round(size.thicknessMm)} mm</p>
      </section>
      <section>
        <h3>Material</h3>
        {ids.length === 0 ? <p className="hint">Place pieces to see material.</p> : (
          <table>
            <thead><tr><th>Species</th><th>Finished</th><th>Stock (incl. kerf)</th></tr></thead>
            <tbody>
              {ids.map(id => (
                <tr key={id}><td>{nameFor(id)}</td><td>{finishedBf(id).toFixed(2)} bf</td><td>{stockBf(id).toFixed(2)} bf</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section>
        <h3>Cut plan</h3>
        {plan.stages.map(stage => (
          <div key={stage.boardId} className="cut-stage">
            <h4>{stage.boardName}</h4>
            <ol>{stage.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          </div>
        ))}
      </section>
    </div>
  )
}
