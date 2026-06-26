import type { CompositeBoard, WoodSpecies } from '../../types'
import { assembledSize, compositeCutPlan, materialBySpecies } from '../../domain/compositeBoard'
import { buildRegistry } from '../../domain/compositeAssembly'

export function CompositeSummary({ board, boards, woods }: { board: CompositeBoard; boards: CompositeBoard[]; woods: WoodSpecies[] }) {
  const registry = buildRegistry(boards)
  const size = assembledSize(board, registry)
  const material = materialBySpecies(board, registry)
  const plan = compositeCutPlan(board, registry)
  const nameFor = (id: string) => woods.find(w => w.id === id)?.name ?? id

  return (
    <div className="composite-summary">
      <section>
        <h3>Finished size</h3>
        <p>{Math.round(size.lengthMm)} × {Math.round(size.widthMm)} × {Math.round(size.thicknessMm)} mm</p>
      </section>
      <section>
        <h3>Material</h3>
        {material.length === 0 ? <p className="hint">Place pieces to see material.</p> : (
          <table><tbody>
            {material.map(m => <tr key={m.speciesId}><td>{nameFor(m.speciesId)}</td><td>{m.boardFeet.toFixed(2)} bf</td></tr>)}
          </tbody></table>
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
