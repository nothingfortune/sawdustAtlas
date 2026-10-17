import type { InstructionPlan, PlanValidation } from '../../domain/instructions/types'
import { useUnitSystem } from '../unitSystem'
import { PlanStepsBody } from '../instructions/PlanStepList'

/** The generated build plan: a one-line summary, the plan checker's findings, then the
 *  phases and steps exactly as cutting boards show them. */
export function FurnitureSteps({ plan, validation }: { plan: InstructionPlan; validation: PlanValidation }) {
  const { lengthUnit } = useUnitSystem()
  const irreversible = plan.steps.filter(step => step.irreversible).length
  const problems = validation.issues
  return <div className="furniture-steps">
    <p className="furniture-steps-summary">
      <b>{plan.steps.length} steps</b> in {plan.phases.length} phases, {irreversible} irreversible
      <span className="furniture-steps-revision">Plan revision {plan.revision}</span>
    </p>
    {validation.ok && problems.length === 0
      ? <p className="furniture-steps-check">Plan check passed.</p>
      : <div className="furniture-steps-check problems" role="note">
        <b>Plan check found {problems.length} {problems.length === 1 ? 'issue' : 'issues'}.</b>
        <ul>{problems.map((issue, index) => <li key={index}>{issue.severity === 'error' ? 'Error' : 'Warning'}: {issue.message}</li>)}</ul>
      </div>}
    {plan.steps.length === 0
      ? <p className="furniture-empty">No steps yet. Add parts to generate build steps.</p>
      : <PlanStepsBody plan={plan} lengthUnit={lengthUnit} />}
  </div>
}
