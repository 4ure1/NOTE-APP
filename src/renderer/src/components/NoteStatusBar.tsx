/*! NOTE-APP — © 2026 4URE1 — https://github.com/4ure1 — Tous droits réservés. */
import React from 'react'

export type SaveStatus = 'saved' | 'pending' | 'error'

interface NoteStatusBarProps {
  status: SaveStatus
  kind: 'HTML' | 'Markdown'
  words: number
}

const LABELS: Record<SaveStatus, string> = {
  saved: 'Enregistré',
  pending: 'Modifié',
  error: 'Échec de l’enregistrement'
}

/** Barre d'état sous la note : état d'enregistrement, type de note, nombre de mots. */
export default function NoteStatusBar({
  status,
  kind,
  words
}: NoteStatusBarProps): React.JSX.Element {
  return (
    <div className="ns-bar" role="status" aria-live="polite">
      <span className={'ns-state ' + status}>
        <span className="ns-dot" aria-hidden="true" />
        {LABELS[status]}
      </span>
      <span>{kind}</span>
      <span className="ns-right">
        <span>
          {words.toLocaleString('fr-FR')} {words > 1 ? 'mots' : 'mot'}
        </span>
      </span>
    </div>
  )
}
