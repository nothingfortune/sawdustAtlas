import { Unlink } from 'lucide-react'
import { relationshipsOf, removeRelationship } from '../../domain/furniture/arrange'
import { describeRelationship } from '../../domain/furniture/editing'
import type { FurnitureProject, ResolvedFurniture } from '../../domain/furniture/types'

// The relationships that place a part or read its faces. Removing one leaves every part
// where it is: the axes it drove become literal positions.
export function PartRelationships({ project, resolved, partId, onChange }: {
  project: FurnitureProject
  resolved: ResolvedFurniture
  partId: string
  onChange: (project: FurnitureProject, summary: string) => void
}) {
  const relationships = relationshipsOf(project, partId)
  if (relationships.length === 0) return null
  return <section className="part-relationships" aria-label="Relationships">
    <h4 className="field-label">Relationships</h4>
    <ul>
      {relationships.map(relationship => {
        const text = describeRelationship(project, relationship)
        return <li key={relationship.id}>
          <span>{text}</span>
          <button type="button" className="button secondary" data-focus-key={`relationship:${relationship.id}`} aria-label={`Remove relationship: ${text}`}
            onClick={() => onChange(removeRelationship(project, resolved, relationship.id), `Removed: ${text}. Parts stay where they are.`)}><Unlink size={14} aria-hidden="true" />Remove</button>
        </li>
      })}
    </ul>
  </section>
}
