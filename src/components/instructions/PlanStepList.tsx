import { AlertTriangle, ChevronRight, OctagonAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { generateBoardInstructionPlan } from '../../domain/instructions/boardInstructions'
import type { InstructionPlan, InstructionStep, SetupValue } from '../../domain/instructions/types'
import type { LengthUnit } from '../../domain/lengthUnits'
import type { BoardProject, WoodSpecies } from '../../types'
import { useUnitSystem } from '../unitSystem'
import { formatQuantity, formatTolerance } from './planFormat'

interface Props { project: BoardProject; woods: readonly WoodSpecies[]; boards: readonly BoardProject[] }

function SetupLine({ setting, lengthUnit }: { setting: SetupValue; lengthUnit: LengthUnit }) {
  return <li>
    <span>{setting.label}</span>
    <b>{formatQuantity(setting.value, setting.unit, lengthUnit)}</b>
    {setting.source === 'assumption' && <em className="steps-assumption">(assumption)</em>}
  </li>
}

function StepItem({ step, labels, lengthUnit }: { step: InstructionStep; labels: Map<string, string>; lengthUnit: LengthUnit }) {
  const outputs = step.outputs.map(output => labels.get(output.partKey)).filter((label): label is string => !!label)
  return <li className="steps-step" data-step-kind={step.kind}>
    <div className="steps-step-head">
      <span className="steps-order">{step.order}</span>
      <h5>{step.title}</h5>
      <span className="steps-kind">{step.kind}</span>
      {step.irreversible && <span className="steps-irreversible"><OctagonAlert aria-hidden="true"/>Irreversible</span>}
      {step.batch && <span className="steps-batch">× {step.batch.count} {step.batch.unitLabel}{step.batch.count === 1 ? '' : 's'}</span>}
    </div>
    <p>{step.instruction}</p>
    {step.machineSetup && step.machineSetup.settings.length > 0 && <ul className="steps-setup" aria-label={`${step.title} machine setup`}>
      {step.machineSetup.settings.map(setting => <SetupLine key={setting.label} setting={setting} lengthUnit={lengthUnit}/>)}
    </ul>}
    {step.measurements.length > 0 && <ul className="steps-measurements" aria-label={`${step.title} measurements`}>
      {step.measurements.map(measurement => <li key={measurement.key}>
        <span>{measurement.label}</span>
        <b>{formatQuantity(measurement.target, measurement.unit, lengthUnit)}</b>
        {formatTolerance(measurement, lengthUnit) && <small>{formatTolerance(measurement, lengthUnit)}</small>}
        <small>{measurement.phase === 'verify-before' ? 'verify before' : 'achieve after'}</small>
      </li>)}
    </ul>}
    {outputs.length > 0 && <div className="steps-outputs"><span>Makes</span>{outputs.map(label => <code key={label}>{label}</code>)}</div>}
    {step.warnings.map(warning => <div key={warning.id} className={`steps-warning ${warning.severity}`} role="note">
      <AlertTriangle aria-hidden="true"/><span>{warning.message}</span>
    </div>)}
  </li>
}

export function PlanStepsBody({ plan, lengthUnit }: { plan: InstructionPlan; lengthUnit: LengthUnit }) {
  const labels = useMemo(() => new Map(plan.parts.map(part => [part.key, part.label])), [plan])
  const phases = [...plan.phases].sort((a, b) => a.order - b.order)
  return <>
    {plan.warnings.length > 0 && <div className="steps-plan-warnings">{plan.warnings.map(warning => <div key={warning.id} className={`steps-warning ${warning.severity}`} role="note"><AlertTriangle aria-hidden="true"/><span>{warning.message}</span></div>)}</div>}
    {phases.map(phase => {
      const steps = plan.steps.filter(step => step.phaseKey === phase.key).sort((a, b) => a.order - b.order)
      if (steps.length === 0) return null
      return <section key={phase.key} className="steps-phase">
        <h4>{phase.title}</h4>
        <ol>{steps.map(step => <StepItem key={step.key} step={step} labels={labels} lengthUnit={lengthUnit}/>)}</ol>
      </section>
    })}
  </>
}

/** Read-only, collapsed preview of the generated instruction plan. Hidden in print. */
export function PlanStepList({ project, woods, boards }: Props) {
  const { lengthUnit } = useUnitSystem()
  const [open, setOpen] = useState(false)
  const plan = useMemo(() => open ? generateBoardInstructionPlan(project, { woods, boards }) : null, [open, project, woods, boards])
  return <section className="steps-preview" aria-label="Build steps preview">
    <button type="button" className="steps-toggle" aria-expanded={open} aria-controls="steps-preview-body" onClick={() => setOpen(value => !value)}>
      <ChevronRight aria-hidden="true" className={open ? 'open' : ''}/>Build steps (preview)
    </button>
    {open && plan && <div id="steps-preview-body" className="steps-body"><PlanStepsBody plan={plan} lengthUnit={lengthUnit}/></div>}
  </section>
}
