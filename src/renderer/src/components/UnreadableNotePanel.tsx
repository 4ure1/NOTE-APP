import type { JSX } from 'react'

interface UnreadableNotePanelProps {
  filePath: string
  // Message d'erreur de la lecture (déjà lisible, via describeApiError)
  errorMessage: string
  isRetrying: boolean
  onRetry: () => void
}

// Remplace l'éditeur quand la note n'a pas pu être lue : rien n'est éditable, donc rien n'est écrit
export default function UnreadableNotePanel({
  filePath,
  errorMessage,
  isRetrying,
  onRetry
}: UnreadableNotePanelProps): JSX.Element {
  return (
    <div
      role="alert"
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px',
        background: 'var(--editor-bg)'
      }}
    >
      <div
        style={{
          maxWidth: '520px',
          padding: '20px 24px',
          borderRadius: '8px',
          border: '1px solid var(--danger-color)',
          background: 'var(--danger-bg-hover)',
          color: 'var(--text-primary)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}
      >
        <strong style={{ fontSize: '14px' }}>
          Note illisible : les modifications ne seront pas enregistrées
        </strong>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
          {filePath}
        </span>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{errorMessage}</span>
        <div>
          <button
            type="button"
            onClick={onRetry}
            disabled={isRetrying}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              background: 'var(--element-bg)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              cursor: isRetrying ? 'default' : 'pointer',
              opacity: isRetrying ? 0.6 : 1
            }}
          >
            {isRetrying ? 'Lecture…' : 'Réessayer'}
          </button>
        </div>
      </div>
    </div>
  )
}
