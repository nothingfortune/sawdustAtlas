import type { BoardProject, PriceBreakdown } from '../../types'
import type { BuildDimensions } from '../../domain/boardAllowances'
import type { CuttingBoardPlan } from '../../domain/boardCutPlan'
import type { StockRequirements } from '../../domain/boardStock'
import type { AngleSetup } from '../../domain/boardAngle'
import type { BenchSetup } from '../../domain/boardBench'
import { convertMetricText, formatDimensions, formatLength, formatNumber } from '../../domain/lengthUnits'
import { useUnitSystem } from '../unitSystem'

export function BuildSummary({ build }: { build: BuildDimensions }) {
  const { lengthUnit } = useUnitSystem()
  const rows: Array<{ label: string; finished: number; rough: number; note?: string }> = [
    { label: 'Length', finished: build.length.finished, rough: build.length.rough },
    { label: 'Width', finished: build.width.finished, rough: build.width.rough },
    { label: 'Thickness', finished: build.thickness.finished, rough: build.thickness.rough, note: `joint ${formatLength(build.thickness.jointing, lengthUnit)} · plane ${formatLength(build.thickness.planing, lengthUnit)} · router ${formatLength(build.thickness.routerTable, lengthUnit)}` },
  ]
  return <div className="build-summary">
    <div className="build-summary-head"><span className="eyebrow">ROUGH STOCK</span><span className="eyebrow">FINISHED</span></div>
    {rows.map(row => <div className="build-summary-row" key={row.label}>
      <span>{row.label}{row.note && <small>{row.note}</small>}</span>
      <b>{formatLength(row.rough, lengthUnit)}</b>
      <b className="finished">{formatLength(row.finished, lengthUnit)}</b>
    </div>)}
    <div className="build-summary-row total"><span>Removed milling stock</span><b>{formatNumber(build.removedBoardFeet)} bf</b><b className="finished">{formatNumber(build.finishedBoardFeet)} bf part</b></div>
  </div>
}

// Print-only banner leading the build sheet: name, construction, date, and the
// headline numbers. Hidden on screen (the live .board-intro covers that there).
export function BuildSheetHeader({ project, build, boardFeet, estimatedCost, price }: { project: BoardProject; build: BuildDimensions; boardFeet: number; estimatedCost: number; price: PriceBreakdown }) {
  const { lengthUnit } = useUnitSystem()
  return <header className="print-only print-sheet-header">
    <div>
      <span className="eyebrow">SAWDUSTATLAS · CUTTING BOARD BUILD SHEET</span>
      <h1>{project.name}</h1>
      <p>{project.construction === 'end' ? 'End-grain construction' : 'Edge-grain construction'} · generated {new Date().toLocaleDateString()}</p>
    </div>
    <dl className="print-sheet-facts">
      <div><dt>Finished size</dt><dd>{formatDimensions([build.length.finished, build.width.finished, build.thickness.finished], lengthUnit)}</dd></div>
      <div><dt>Rough stock</dt><dd>{formatNumber(boardFeet)} bf</dd></div>
      <div><dt>Material estimate</dt><dd>${estimatedCost.toFixed(2)}</dd></div>
      <div><dt>Price</dt><dd>${price.total.toFixed(2)}</dd></div>
    </dl>
  </header>
}

// Print-only footer spelling out the allowances and basis behind every number
// on the sheet, so a printed plan is self-explanatory at the bench.
export function BuildAssumptions({ project }: { project: BoardProject }) {
  const { lengthUnit } = useUnitSystem()
  const a = project.allowances
  const rows: Array<[string, string]> = [
    ['Units', lengthUnit === 'imperial' ? 'Displayed dimensions are inches rounded to the nearest 1/32; stored calculations remain metric.' : 'All dimensions in millimeters; values are rounded only for display.'],
    ['Milling — thickness', `Jointing ${formatLength(a.jointing, lengthUnit)} + planing ${formatLength(a.planing, lengthUnit)} + router table ${formatLength(a.routerTable, lengthUnit)} removed reaching the finished faces.`],
    ['Milling — width', `${formatLength(a.ripAllowance, lengthUnit)} ripped per strip; ${formatLength(a.widthTrim, lengthUnit)} trimmed squaring the edges.`],
    ['Milling — length', `${formatLength(a.lengthTrim, lengthUnit)} trimmed squaring the ends.`],
  ]
  if (project.construction === 'end') {
    const e = project.endGrain
    rows.push(
      ['First glue-up', `${formatLength(e.sourceLength, lengthUnit)} long × ${formatLength(e.stockThickness, lengthUnit)} thick stock.`],
      ['Crosscut', `${formatLength(e.sliceThickness, lengthUnit)} slices · ${formatLength(e.kerf, lengthUnit)} blade kerf · ${formatLength(e.trimAllowance, lengthUnit)} total end trim.`],
    )
  }
  rows.push(['Pricing', 'Price = material (rough board-feet × price per board foot, including milling waste) + markup + labor by complexity tier + consumables, raised to the configured per-construction minimum. Estimates exclude defects, wood movement, and final surfacing.'])
  return <section className="print-only build-assumptions">
    <h4>Assumptions</h4>
    <dl>{rows.map(([term, detail]) => <div key={term}><dt>{term}</dt><dd>{detail}</dd></div>)}</dl>
  </section>
}

export function CutPlanView({ plan }: { plan: CuttingBoardPlan }) {
  const { lengthUnit } = useUnitSystem()
  return <div className="cut-plan-sheet">
    <div className="cut-plan-title"><div><span className="eyebrow">BUILD PLAN</span><h3>Stock, cuts, and sequence</h3></div><div><b>{formatNumber(plan.summary.roughBoardFeet)} bf</b><span>rough stock</span></div><div><b>{plan.summary.ripPasses + plan.summary.crosscutPasses}</b><span>planned saw passes</span></div></div>
    {plan.warnings.length > 0 && <div className="cut-plan-warnings">{plan.warnings.map(warning => <span key={warning}>{convertMetricText(warning, lengthUnit)}</span>)}</div>}
    <div className="cut-plan-columns">
      <section><h4>Stock list</h4><div className="plan-table"><div className="plan-table-head"><span>Qty / species</span><span>Rough dimensions</span><span>BF</span></div>{plan.stock.map(row => <div key={row.id}><span><b>{row.quantity}×</b> {row.speciesName}{row.trailingAngle !== 0 && <small>{formatNumber(row.trailingAngle)}° trailing angle</small>}</span><span>{formatDimensions([row.length, row.width, row.thickness], lengthUnit)}</span><span>{formatNumber(row.boardFeet)}</span></div>)}</div></section>
      <section><h4>Machine cuts</h4><div className="plan-table cuts"><div className="plan-table-head"><span>Operation</span><span>Target</span><span>Passes</span></div>{plan.cuts.map(cut => <div key={cut.id}><span><b>{cut.label}</b><small>{convertMetricText(cut.note, lengthUnit)}</small></span><span>{cut.targetWidth !== undefined ? formatLength(cut.targetWidth, lengthUnit) : '—'}{cut.trailingAngle !== undefined && cut.trailingAngle !== 0 && <small>{formatNumber(cut.trailingAngle)}°</small>}</span><span>{cut.passes}</span></div>)}</div></section>
    </div>
    <section className="build-sequence"><h4>Build sequence</h4><ol>{plan.steps.map(step => <li key={step.id}><span>{step.order}</span><div><b>{step.title}</b><p>{convertMetricText(step.instruction, lengthUnit)}</p></div></li>)}</ol></section>
  </div>
}

// BOARD-025: the at-a-glance bench reference — rip fence widths, saw angles, and the
// crosscut stop/counts a maker dials in at the saw. Sits high; the detailed cards follow.
export function BenchSetupCard({ bench }: { bench: BenchSetup }) {
  const { lengthUnit } = useUnitSystem()
  const a = bench.assumptions
  return <section className="bench-card">
    <h3>Bench setup</h3>
    <div className="bench-grid">
      <div className="bench-block">
        <span className="eyebrow">RIP FENCE</span>
        {bench.ripGroups.map(group => <div key={`${group.speciesId}-${group.finishedWidthMm}-${group.trailingAngle}-${group.roughRipWidthMm}`} className="bench-line">
          <b>{formatLength(group.roughRipWidthMm, lengthUnit)}</b><small>×{group.count} {group.speciesName}</small>
        </div>)}
      </div>
      {bench.angles.length > 0 && <div className="bench-block">
        <span className="eyebrow">SAW ANGLE</span>
        {bench.angles.map(angle => <div key={angle.trailingAngleDeg} className="bench-line">
          <b>{formatNumber(angle.sawAngleDeg)}°</b><small>×{angle.count}</small>
        </div>)}
      </div>}
      {bench.crosscut && <div className="bench-block">
        <span className="eyebrow">CROSSCUT</span>
        <div className="bench-line"><b>{formatLength(bench.crosscut.stopBlockMm, lengthUnit)}</b><small>stop block</small></div>
        <div className="bench-line"><b>{bench.crosscut.slices}</b><small>slices · {bench.crosscut.passes} passes</small></div>
      </div>}
    </div>
    <p className="bench-assumptions">Allowances: rip {formatLength(a.ripAllowanceMm, lengthUnit)} · width trim {formatLength(a.widthTrimMm, lengthUnit)} · length trim {formatLength(a.lengthTrimMm, lengthUnit)}{a.construction === 'end' ? ` · kerf ${formatLength(a.kerfMm, lengthUnit)}` : ''}.</p>
  </section>
}

// BOARD-023: a bench/shopping reference — what to rip each strip to, how much stock to
// buy per species (with the running total), and the assumptions behind the numbers.
export function StockRequirementsCard({ stock }: { stock: StockRequirements }) {
  const { lengthUnit } = useUnitSystem()
  const a = stock.assumptions
  return <section className="stock-card">
    <h3>Rip &amp; stock list</h3>
    <div className="stock-cols">
      <div>
        <span className="eyebrow">RIP EACH STRIP TO</span>
        {stock.ripGroups.map(group => <div key={`${group.speciesId}-${group.finishedWidthMm}-${group.trailingAngle}-${group.roughRipWidthMm}`} className="stock-rip-row">
          <i style={{ background: group.color }}/>
          <b>{formatLength(group.roughRipWidthMm, lengthUnit)}</b>
          <span>× {group.count} · {group.speciesName}{group.trailingAngle ? ` · ${formatNumber(group.trailingAngle)}°` : ''} <small>(finished {formatLength(group.finishedWidthMm, lengthUnit)})</small></span>
        </div>)}
      </div>
      <div>
        <span className="eyebrow">BUY (BOARD FEET)</span>
        {stock.species.map(species => <div key={species.speciesId} className="stock-buy-row">
          <i style={{ background: species.color }}/><span>{species.name}</span>
          <b>{formatNumber(species.purchasedBoardFeet)} bf</b>
          <small>{formatNumber(species.finishedBoardFeet)} used · {formatNumber(species.wasteBoardFeet)} waste</small>
        </div>)}
        <div className="stock-buy-total"><span>Total purchased</span><b>{formatNumber(stock.totalPurchasedBoardFeet)} bf</b></div>
      </div>
    </div>
    <p className="stock-assumptions">Assumes rip allowance {formatLength(a.ripAllowanceMm, lengthUnit)} · width trim {formatLength(a.widthTrimMm, lengthUnit)} · length trim {formatLength(a.lengthTrimMm, lengthUnit)} · surfacing {formatLength(a.surfacingMm, lengthUnit)}{a.construction === 'end' ? ` · kerf ${formatLength(a.kerfMm, lengthUnit)} · slice ${formatLength(a.sliceThicknessMm ?? 0, lengthUnit)}` : ''}.</p>
  </section>
}

// BOARD-024: the shop-setup numbers a trailing angle implies — what to set the saw to,
// the extra rip width, the face offset, and the wedge of waste — one row per distinct angle.
export function AngleSetupCard({ rows, thicknessMm, lengthMm }: { rows: { angle: number, count: number, setup: AngleSetup }[], thicknessMm: number, lengthMm: number }) {
  const { lengthUnit } = useUnitSystem()
  return <section className="stock-card angle-card">
    <h3>Angle &amp; setup</h3>
    <div className="angle-rows">
      <div className="angle-head"><span>Saw angle</span><span>+ Width</span><span>Offset</span><span>Wedge waste</span></div>
      {rows.map(row => <div key={row.angle} className="angle-row">
        <b>{formatNumber(row.setup.sawAngleDeg)}°</b>
        <span>{formatLength(row.setup.effectiveWidthGainMm, lengthUnit)}</span>
        <span>{formatLength(Math.abs(row.setup.angleOffsetMm), lengthUnit)}</span>
        <span>{formatNumber(row.setup.wedgeBoardFeet)} bf <small>×{row.count}</small></span>
      </div>)}
    </div>
    <p className="stock-assumptions">Across {formatLength(thicknessMm, lengthUnit)} stock over {formatLength(lengthMm, lengthUnit)} length. Offset = thickness × tan(angle); wedge is the triangular trim per strip.</p>
  </section>
}
