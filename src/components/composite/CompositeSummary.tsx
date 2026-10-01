import type { BoardProject, CompositeBoard, PricingSettings, WoodSpecies } from '../../types'
import { assembledSize, compositeCutPlan, materialBySpecies, stockBySpecies } from '../../domain/compositeBoard'
import { formatDimensions, formatNumber } from '../../domain/lengthUnits'
import { calculatePrice, classifyComposite, materialCost } from '../../domain/pricing'
import { PriceBreakdownCard } from '../board/PriceBreakdownCard'
import { useUnitSystem } from '../unitSystem'

export interface CompositeSummaryProps {
  composite: CompositeBoard
  boards: BoardProject[]
  woods: WoodSpecies[]
  pricing: PricingSettings
}

export function CompositeSummary({ composite, boards, woods, pricing }: CompositeSummaryProps) {
  const { lengthUnit } = useUnitSystem()
  const size = assembledSize(composite, boards)
  const finished = materialBySpecies(composite, boards)
  const stock = stockBySpecies(composite, boards)
  const cutPlan = compositeCutPlan(composite, boards)
  const woodById = new Map(woods.map(w => [w.id, w]))
  const stockMap = new Map(stock.map(s => [s.speciesId, s.boardFeet]))
  const estimatedCost = stock.reduce((sum, s) => sum + materialCost(s.boardFeet, woodById.get(s.speciesId)?.pricePerBoardFoot ?? 0), 0)
  const totalBoardFeet = stock.reduce((sum, s) => sum + s.boardFeet, 0)
  const price = calculatePrice({ materialCost: estimatedCost, roughBoardFeet: totalBoardFeet, construction: composite.construction, tier: classifyComposite(), pricing })

  return (
    <section className="composite-summary" aria-label="Build summary">
      <h3>Build sheet</h3>
      <dl className="summary-stats">
        <div><dt>Finished size</dt><dd>{formatDimensions([size.lengthMm, size.widthMm, size.thicknessMm], lengthUnit)}</dd></div>
        <div><dt>Material estimate</dt><dd>${estimatedCost.toFixed(2)}</dd></div>
        <div><dt>Price</dt><dd>${price.total.toFixed(2)}</dd></div>
      </dl>

      <PriceBreakdownCard price={price} roughBoardFeet={totalBoardFeet} construction={composite.construction}/>

      <h4>Material by species</h4>
      <div className="plan-table">
        <div className="plan-table-head"><span>Species</span><span>Finished</span><span>Stock + waste</span></div>
        {finished.map(f => {
          const wood = woodById.get(f.speciesId)
          return (
            <div key={f.speciesId}>
              <span>{wood?.name ?? f.speciesId}</span>
              <span>{formatNumber(f.boardFeet)} bf</span>
              <span>{formatNumber(stockMap.get(f.speciesId) ?? f.boardFeet)} bf</span>
            </div>
          )
        })}
        {finished.length === 0 && <div className="muted small">No wafers placed yet.</div>}
      </div>

      <h4>Cut plan</h4>
      {cutPlan.stages.map(stage => (
        <div key={stage.boardId} className="cut-stage">
          <ol>{stage.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
        </div>
      ))}
    </section>
  )
}
