import type { PriceBreakdown } from '../../types'
import { formatNumber } from '../../domain/lengthUnits'

const TIER_LABEL: Record<PriceBreakdown['tier'], string> = { simple: 'Simple', standard: 'Standard', complex: 'Complex' }
const money = (value: number) => `$${value.toFixed(2)}`

// Shared, presentational price breakdown used by the single-board designer and the
// composite summary. The "Minimum" row appears only when the floor is binding.
export function PriceBreakdownCard({ price, roughBoardFeet, construction }: { price: PriceBreakdown; roughBoardFeet: number; construction: 'edge' | 'end' }) {
  return <section className="price-breakdown" aria-label="Price breakdown">
    <h4>Price breakdown</h4>
    <dl>
      <div><dt>Material ({formatNumber(roughBoardFeet)} bf)</dt><dd>{money(price.materialCost)}</dd></div>
      <div><dt>Markup ({price.markupPercent}%)</dt><dd>+ {money(price.materialMarkup)}</dd></div>
      <div><dt>Labor — {TIER_LABEL[price.tier]}, {formatNumber(price.laborHours)} hr</dt><dd>+ {money(price.labor)}</dd></div>
      <div><dt>Consumables</dt><dd>+ {money(price.consumables)}</dd></div>
      <div className="price-subtotal"><dt>Subtotal</dt><dd>{money(price.subtotal)}</dd></div>
      {price.floorAdjustment > 0 && (
        <div className="price-floor"><dt>Minimum ({construction === 'end' ? 'end grain' : 'edge grain'})</dt><dd>+ {money(price.floorAdjustment)}</dd></div>
      )}
      <div className="price-total"><dt>Price</dt><dd>{money(price.total)}</dd></div>
    </dl>
  </section>
}
