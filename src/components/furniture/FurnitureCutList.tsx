import type { FurniturePartsList, PartDims, PartsListLine } from '../../domain/furniture/types'
import { convertMetricText, formatDimensions, formatLength, formatNumber } from '../../domain/lengthUnits'
import type { LengthUnit } from '../../domain/lengthUnits'
import { useUnitSystem } from '../unitSystem'

const money = (value: number) => `$${value.toFixed(2)}`
const sizeText = (size: PartDims, lengthUnit: LengthUnit) => formatDimensions([size.length, size.width, size.thickness], lengthUnit)

function LineRow({ line, lengthUnit }: { line: PartsListLine; lengthUnit: LengthUnit }) {
  return <tr>
    <td className="num">{line.quantity}</td>
    <td>{line.labels.join(', ')}</td>
    <th scope="row">{line.name}</th>
    <td>{line.materialName}</td>
    <td className="num">{sizeText(line.modeled, lengthUnit)}</td>
    <td>{line.allowances.length === 0
      ? <span className="cut-list-none">None</span>
      : <ul className="cut-list-allowances">{line.allowances.map((allowance, index) => <li key={index}>
        <b>+{formatLength(allowance.amount, lengthUnit)}</b> {allowance.dimension}: {allowance.reason}
      </li>)}</ul>}
    </td>
    <td className="num">{sizeText(line.cut, lengthUnit)}</td>
    <td className="num">{line.rough
      ? <>{sizeText(line.rough, lengthUnit)}{line.panel && <small>Glued panel of {line.panel.boards} boards, {formatLength(line.panel.boardWidth, lengthUnit)} each</small>}</>
      : <span className="cut-list-none">Sheet</span>}
    </td>
    <td className="num">{line.kind === 'solid' ? formatNumber(line.boardFeet) : '—'}</td>
  </tr>
}

/** The reconciled parts list as tables: parts, material totals, hardware, cost, and the
 *  assumptions behind them. Lengths follow the display unit; the domain stays in mm. */
export function FurnitureCutList({ list }: { list: FurniturePartsList }) {
  const { lengthUnit } = useUnitSystem()
  const empty = list.lines.length === 0 && list.hardware.length === 0
  if (empty) return <p className="furniture-empty">No parts to list yet. Add a solid or sheet part to build the cut list.</p>
  return <div className="cut-list">
    {list.lines.length > 0 && <div className="cut-list-scroll">
      <table className="cut-list-table">
        <caption>Parts</caption>
        <thead><tr>
          <th scope="col">Qty</th><th scope="col">Marks</th><th scope="col">Part</th><th scope="col">Material</th>
          <th scope="col">Modeled L × W × T</th><th scope="col">Allowances</th><th scope="col">Cut L × W × T</th><th scope="col">Rough L × W × T</th><th scope="col">Board feet</th>
        </tr></thead>
        <tbody>{list.lines.map(line => <LineRow key={line.key} line={line} lengthUnit={lengthUnit} />)}</tbody>
      </table>
    </div>}
    <div className="cut-list-totals">
      {list.species.length > 0 && <table className="cut-list-table compact">
        <caption>Lumber by species</caption>
        <thead><tr><th scope="col">Species</th><th scope="col">Board feet</th><th scope="col">Cost</th></tr></thead>
        <tbody>{list.species.map(entry => <tr key={entry.speciesId}>
          <th scope="row">{entry.name}</th><td className="num">{formatNumber(entry.boardFeet)} bf</td><td className="num">{money(entry.cost)}</td>
        </tr>)}</tbody>
      </table>}
      {list.sheets.length > 0 && <table className="cut-list-table compact">
        <caption>Sheet goods (estimate)</caption>
        <thead><tr><th scope="col">Material</th><th scope="col">Sheets (estimate)</th><th scope="col">Cost</th></tr></thead>
        <tbody>{list.sheets.map(entry => <tr key={entry.sheetMaterialId}>
          <th scope="row">{entry.name}</th><td className="num">{entry.sheets} {entry.sheets === 1 ? 'sheet' : 'sheets'} (estimate)</td><td className="num">{money(entry.cost)}</td>
        </tr>)}</tbody>
      </table>}
      {list.hardware.length > 0 && <table className="cut-list-table compact">
        <caption>Hardware</caption>
        <thead><tr><th scope="col">Item</th><th scope="col">Quantity</th></tr></thead>
        <tbody>{list.hardware.map(line => <tr key={line.key}><th scope="row">{line.name}</th><td className="num">{line.quantity}</td></tr>)}</tbody>
      </table>}
    </div>
    <p className="cut-list-total"><span>Total material cost</span><b>{money(list.totalCost)}</b></p>
    {list.assumptions.length > 0 && <section className="cut-list-assumptions" aria-label="Cut list assumptions">
      <h4>Assumptions</h4>
      <ul>{list.assumptions.map(note => <li key={note}>{convertMetricText(note, lengthUnit)}</li>)}</ul>
    </section>}
  </div>
}
