import { TriangleAlert } from 'lucide-react'
import { axisDrivers, describeRelationship } from '../../domain/furniture/editing'
import { PART_ROLES } from '../../domain/furniture/project'
import { BOX_FACES, PART_ORIENTATIONS } from '../../domain/furniture/types'
import type { Axis, BoxFace, DimExpr, FurnitureIssue, FurniturePart, FurniturePartKind, FurnitureProject, PartOrientation, ResolvedFurniture } from '../../domain/furniture/types'
import type { WoodSpecies } from '../../types'
import { DimInput } from './DimInput'
import { PartRelationships } from './PartRelationships'
import { FACE_LABELS, KIND_LABELS, ORIENTATION_CHOICES, roleLabel } from './partVocabulary'
import { TextField } from './TextField'

const AXES: readonly Axis[] = ['x', 'y', 'z']
// A relationship-driven position is shown but never committed.
const NO_EDIT = () => undefined

// Every editable field of one part. Edits are whole-project replacements handed to
// `onChange`, which the designer commits as one undoable change.
export function PartInspector({ project, resolved, issues, part, woods, onChange, onAnnounce }: {
  project: FurnitureProject
  resolved: ResolvedFurniture
  issues: FurnitureIssue[]
  part: FurniturePart
  woods: WoodSpecies[]
  onChange: (project: FurnitureProject) => void
  /** Spoken confirmation for edits that change nothing visible in the inspector. */
  onAnnounce?: (message: string) => void
}) {
  const edit = (patch: Partial<FurniturePart>) => onChange({ ...project, parts: project.parts.map(candidate => candidate.id === part.id ? { ...candidate, ...patch } : candidate) })
  const scope = resolved.parameters
  const resolvedPart = resolved.parts.find(candidate => candidate.id === part.id)
  const drivers = axisDrivers(project, part.id)
  const partIssues = issues.filter(issue => issue.partIds?.includes(part.id))

  const changeKind = (kind: FurniturePartKind) => {
    // Each kind carries exactly its own material reference.
    const { speciesId: _species, sheetMaterialId: _sheet, hardwareName: _hardware, ...rest } = part
    const next: FurniturePart = { ...rest, kind }
    if (kind === 'solid') next.speciesId = woods[0]?.id ?? ''
    if (kind === 'sheet' && project.sheetMaterials[0]) next.sheetMaterialId = project.sheetMaterials[0].id
    if (kind === 'hardware') next.hardwareName = 'Hardware'
    onChange({ ...project, parts: project.parts.map(candidate => candidate.id === part.id ? next : candidate) })
  }
  const setPosition = (axis: Axis, value: DimExpr) => edit({ position: { ...part.position, [axis]: value } })
  const toggleFace = (face: BoxFace, on: boolean) => edit({ visibleFaces: BOX_FACES.filter(candidate => candidate === face ? on : part.visibleFaces.includes(candidate)) })
  const species = woods.find(wood => wood.id === part.speciesId)
  const sheet = project.sheetMaterials.find(material => material.id === part.sheetMaterialId)
  const swatch = part.kind === 'solid' ? species?.color : part.kind === 'sheet' ? sheet?.color : undefined

  return <section className="part-inspector" aria-label={`Inspector for ${part.name}`}>
    <h3>Part</h3>
    {partIssues.length > 0 && <ul className="part-issues" aria-label="Issues for this part">
      {partIssues.map((issue, index) => <li key={`${issue.code}-${index}`} className={issue.severity}><TriangleAlert size={13} aria-hidden="true" /><span><b>{issue.severity === 'error' ? 'Error' : 'Warning'}:</b> {issue.message}</span></li>)}
    </ul>}
    <div className="field-row">
      <TextField label="Mark" value={part.label} onCommit={value => { edit({ label: value.trim() }); return null }} />
      <TextField label="Name" value={part.name} onCommit={value => value.trim() ? (edit({ name: value.trim() }), null) : 'A part needs a name.'} />
    </div>
    <div className="field-row">
      <div className="field"><label htmlFor="part-role">Role</label>
        <select id="part-role" value={part.role} onChange={event => edit({ role: event.target.value as FurniturePart['role'] })}>
          {PART_ROLES.map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}
        </select></div>
      <div className="field"><label htmlFor="part-kind">Kind</label>
        <select id="part-kind" value={part.kind} onChange={event => changeKind(event.target.value as FurniturePartKind)}>
          {(Object.keys(KIND_LABELS) as FurniturePartKind[]).map(kind => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}
        </select></div>
    </div>

    {part.kind === 'solid' && <div className="field"><label htmlFor="part-species">Species</label>
      <div className="material-row">
        {swatch && <span className="swatch" style={{ background: swatch }} aria-hidden="true" />}
        <select id="part-species" value={part.speciesId ?? ''} onChange={event => edit({ speciesId: event.target.value })}>
          {!species && <option value={part.speciesId ?? ''}>{part.speciesId ? `Missing: ${part.speciesId}` : 'Choose a species'}</option>}
          {woods.map(wood => <option key={wood.id} value={wood.id}>{wood.name}</option>)}
        </select>
      </div></div>}
    {part.kind === 'sheet' && <div className="field"><label htmlFor="part-sheet">Sheet material</label>
      <div className="material-row">
        {swatch && <span className="swatch" style={{ background: swatch }} aria-hidden="true" />}
        <select id="part-sheet" value={part.sheetMaterialId ?? ''} onChange={event => edit({ sheetMaterialId: event.target.value })}>
          {!sheet && <option value={part.sheetMaterialId ?? ''}>{part.sheetMaterialId ? `Missing: ${part.sheetMaterialId}` : 'Add a sheet material in Settings'}</option>}
          {project.sheetMaterials.map(material => <option key={material.id} value={material.id}>{material.name}</option>)}
        </select>
      </div></div>}
    {part.kind === 'hardware' && <TextField label="Hardware name" value={part.hardwareName ?? ''} onCommit={value => { edit({ hardwareName: value.trim() }); return null }} />}

    <div className="field-group">
      <DimInput label="Length" focusKey="part:length" value={part.length} scope={scope} positive onCommit={value => edit({ length: value })} />
      <DimInput label="Width" focusKey="part:width" value={part.width} scope={scope} positive onCommit={value => edit({ width: value })} />
      <DimInput label="Thickness" focusKey="part:thickness" value={part.thickness} scope={scope} positive onCommit={value => edit({ thickness: value })} />
    </div>

    <div className="field"><label htmlFor="part-orientation">Orientation</label>
      <select id="part-orientation" value={part.orientation} onChange={event => edit({ orientation: event.target.value as PartOrientation })}>
        {PART_ORIENTATIONS.map(value => <option key={value} value={value}>{ORIENTATION_CHOICES.find(choice => choice.value === value)?.label ?? value}</option>)}
      </select></div>

    <div className="field-group">
      {AXES.map(axis => {
        const driver = drivers[axis]
        if (driver) {
          // A relationship decides this axis, so show where it landed and what decided it.
          return <DimInput key={axis} label={`Position ${axis.toUpperCase()}`} value={resolvedPart ? resolvedPart.box[axis] : 0} scope={scope} disabled
            note={<small className="dim-driver">Driven by: {describeRelationship(project, driver)}</small>} onCommit={NO_EDIT} />
        }
        return <DimInput key={axis} label={`Position ${axis.toUpperCase()}`} focusKey={`part:position.${axis}`} value={part.position[axis]} scope={scope} onCommit={value => setPosition(axis, value)} />
      })}
    </div>

    <PartRelationships project={project} resolved={resolved} partId={part.id} onChange={(next, summary) => { onChange(next); onAnnounce?.(summary) }} />

    <fieldset className="face-picks">
      <legend className="field-label">Visible faces</legend>
      {BOX_FACES.map(face => <label key={face} className="face-pick"><input type="checkbox" checked={part.visibleFaces.includes(face)} onChange={event => toggleFace(face, event.target.checked)} />{FACE_LABELS[face]}</label>)}
    </fieldset>

    <div className="field color-field"><label htmlFor="part-color">Color</label>
      <div className="material-row">
        <input id="part-color" type="color" value={part.color ?? resolvedPart?.color ?? '#b8a58a'} onChange={event => edit({ color: event.target.value })} />
        {part.color
          ? <button type="button" className="button secondary" onClick={() => { const { color: _color, ...rest } = part; onChange({ ...project, parts: project.parts.map(candidate => candidate.id === part.id ? rest : candidate) }) }}>Use material color</button>
          : <small>Using the material color</small>}
      </div></div>
  </section>
}
