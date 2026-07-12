import { memo } from 'react'
import type { BoardProject, WoodSpecies } from '../../types'
import type { EndGrainMetrics, EndGrainTemplate } from '../../domain/boardGeometry'
import { formatDimensions, formatLength } from '../../domain/lengthUnits'
import { useUnitSystem } from '../unitSystem'
import { ScaledBoardFrame } from './ScaledBoardFrame'
import { LongGrainFace } from './LongGrainFace'
import { AssembledBoard } from './AssembledBoard'
import { FaceShiftWedge } from './FaceShiftWedge'
import { CrosscutOverlay } from './CrosscutOverlay'

// Memoized: this "how it's built" step tower renders several full ScaledBoardFrame /
// AssembledBoard SVG subtrees. Its props come from the memoized `derived` pipeline and
// are stable across the editor's frequent unrelated re-renders (panel toggles, studio
// state, pending-pattern preview), so shallow-prop memo skips the heavy redraw there.
export const HowItsBuilt = memo(function HowItsBuilt({ project, woods, metrics, template, pxPerMm, edgeWidth }: { project: BoardProject; woods: WoodSpecies[]; metrics: EndGrainMetrics; template: EndGrainTemplate; pxPerMm: number; edgeWidth: number }) {
  const { lengthUnit } = useUnitSystem()
  if (project.construction === 'edge') {
    return <section className="how-its-built">
      <header><span className="eyebrow">HOW IT'S BUILT</span></header>
      <div className="build-step">
        <div className="step-heading"><span>1</span><div><h3>Glue-up order</h3><p>Glue strips edge to edge in this order · grain runs along the length</p></div></div>
        <ScaledBoardFrame woods={woods} lengthMm={Math.max(project.length, 1)} widthMm={Math.max(edgeWidth, 1)} pxPerMm={pxPerMm} rulers={['top']} ariaLabel="Edge-grain glue-up order">
          <LongGrainFace strips={project.strips} lengthMm={Math.max(project.length, 1)}/>
        </ScaledBoardFrame>
      </div>
    </section>
  }

  const source = Math.max(project.endGrain.sourceLength, 1)
  const panel = Math.max(metrics.panelWidth, 1)
  const angled = project.strips.some(strip => strip.trailingAngle !== 0)
  return <section className="how-its-built">
    <header><span className="eyebrow">HOW IT'S BUILT</span></header>

    <div className="build-step">
      <div className="step-heading"><span>1</span><div><h3>First glue-up</h3><p>Long boards stacked across the panel · {formatDimensions([project.endGrain.sourceLength, metrics.panelWidth, project.endGrain.stockThickness], lengthUnit)}</p></div></div>
      <ScaledBoardFrame woods={woods} lengthMm={source} widthMm={panel} pxPerMm={pxPerMm} rulers={['top', 'left']} ariaLabel="First glue-up panel">
        <LongGrainFace strips={project.strips} lengthMm={source}/>
      </ScaledBoardFrame>
      {angled && Math.abs(metrics.faceShift) > 0.1 && <FaceShiftWedge leftFaceWidth={template.leftFaceWidth} rightFaceWidth={template.rightFaceWidth} finishedWidth={template.finishedWidth} stockThickness={project.endGrain.stockThickness}/>}
    </div>

    <div className="build-step">
      <div className="step-heading"><span>2</span><div><h3>Crosscut plan</h3><p>{metrics.sliceCount} slices cut across the grain at {formatLength(project.endGrain.sliceThickness, lengthUnit)} · {formatLength(project.endGrain.kerf, lengthUnit)} kerf</p></div></div>
      <ScaledBoardFrame woods={woods} lengthMm={source} widthMm={panel} pxPerMm={pxPerMm} rulers={['top', 'left']} ariaLabel="Crosscut plan">
        <LongGrainFace strips={project.strips} lengthMm={source}/>
        <CrosscutOverlay project={project} metrics={metrics} heightMm={panel} pxPerMm={pxPerMm}/>
      </ScaledBoardFrame>
    </div>

    <div className="build-step">
      <div className="step-heading"><span>3</span><div><h3>After the 90° turn</h3><p>Slices stood on end and re-glued · edit orientation in the finished view above</p></div></div>
      <ScaledBoardFrame woods={woods} lengthMm={Math.max(metrics.finalLength, 1)} widthMm={panel} pxPerMm={pxPerMm} rulers={['top']} ariaLabel="Board after the turn">
        <AssembledBoard project={project} template={template} sliceCount={metrics.sliceCount} pxPerMm={pxPerMm}/>
      </ScaledBoardFrame>
    </div>
  </section>
})
