import type { JSX } from 'react'

export type ExternalChangeReason = 'changed' | 'deleted' | 'unknown'

interface ExternalChangeBarProps {
  // Message du main (« « x.html » a été modifiée par un autre programme… »)
  message: string
  reason: ExternalChangeReason
  isBusy: boolean
  onReload: () => void
  onKeepMine: () => void
  onSaveCopy: () => void
}

// Barre de conflit : la note a changé sur le disque depuis son ouverture. Rien n'est écrit
// tant que l'utilisateur n'a pas choisi.
export default function ExternalChangeBar({
  message,
  reason,
  isBusy,
  onReload,
  onKeepMine,
  onSaveCopy
}: ExternalChangeBarProps): JSX.Element {
  const buttonStyle = {
    padding: '5px 12px',
    borderRadius: '6px',
    border: '1px solid var(--border-color)',
    background: 'var(--element-bg)',
    color: 'var(--text-primary)',
    fontSize: '12.5px',
    cursor: isBusy ? 'default' : 'pointer',
    opacity: isBusy ? 0.6 : 1
  }
  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        top: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100001,
        maxWidth: 'min(760px, calc(100vw - 32px))',
        padding: '12px 16px',
        borderRadius: '8px',
        border: '1px solid var(--accent-amber)',
        background: 'var(--sidebar-bg)',
        color: 'var(--text-primary)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}
    >
      <span style={{ fontSize: '13px' }}>
        {message} Tes modifications ne sont pas enregistrées tant que tu n&apos;as pas choisi.
      </span>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          type="button"
          style={buttonStyle}
          disabled={isBusy || reason === 'deleted'}
          title={
            reason === 'deleted'
              ? 'La note n’existe plus sur le disque'
              : 'Afficher la version du disque (tes modifications seront perdues)'
          }
          onClick={onReload}
        >
          Recharger
        </button>
        <button
          type="button"
          style={buttonStyle}
          disabled={isBusy}
          title="Écraser la version du disque avec la tienne"
          onClick={onKeepMine}
        >
          Garder ma version
        </button>
        <button
          type="button"
          style={buttonStyle}
          disabled={isBusy}
          title="Enregistrer ta version dans une nouvelle note, sans toucher à l’autre"
          onClick={onSaveCopy}
        >
          Enregistrer une copie
        </button>
      </div>
    </div>
  )
}
