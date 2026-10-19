import type { PackagePreview, ProjectPackage } from '../../packages'
import { useModalDialog } from '../useModalDialog'

export type ShareImportState =
  | { kind: 'preview'; pkg: ProjectPackage; preview: PackagePreview }
  | { kind: 'error'; error: string }

export function ShareImportDialog({ state, onImport, onClose }: { state: ShareImportState; onImport: () => void; onClose: () => void }) {
  const dialogRef = useModalDialog<HTMLDivElement>(onClose)
  const preview = state.kind === 'preview' ? state.preview : null
  return <div className="modal-scrim" role="presentation" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={dialogRef} tabIndex={-1} className="import-dialog" role="dialog" aria-modal="true" aria-label={preview ? 'Import shared project' : 'Shared project could not open'}>
      <header><strong>{preview ? 'Open a shared project' : "Couldn't open that link"}</strong></header>
      {preview
        ? <>
          <p className="import-counts"><b>{preview.name}</b> · {preview.label} · {preview.size}</p>
          <p className="import-counts">
            Woods: {preview.woodsAdded.length > 0 ? `${preview.woodsAdded.join(', ')} will be added to your library` : 'nothing new for your library'}
            {preview.woodsPresent.length > 0 ? `; ${preview.woodsPresent.join(', ')} already there (your versions are kept)` : ''}.
          </p>
          <p className="import-counts">Importing adds this project to this browser. Nothing you already have changes, and Undo takes it back out.</p>
        </>
        : state.kind === 'error' && <ul className="import-errors"><li>{state.error}</li></ul>}
      <footer>
        {preview
          ? <><button type="button" className="button" onClick={onImport}>Import</button><button type="button" className="button secondary" onClick={onClose}>Cancel</button></>
          : <button type="button" className="button secondary" onClick={onClose}>Close</button>}
      </footer>
    </div>
  </div>
}
