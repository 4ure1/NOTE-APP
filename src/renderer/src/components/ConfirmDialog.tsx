import { useEffect, useId, useState, type ReactNode } from 'react'
import Modal from './Modal'

interface ConfirmOptions {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
}

interface ConfirmRequest extends ConfirmOptions {
  resolve: (confirmed: boolean) => void
}

let showRequest: ((request: ConfirmRequest) => void) | null = null

/** Demande une confirmation dans l'app, avec des boutons explicites (ConfirmHost doit être monté). */
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (showRequest) showRequest({ ...options, resolve })
    else resolve(window.confirm(`${options.title}\n\n${options.message}`))
  })
}

export function ConfirmHost(): ReactNode {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const titleId = useId()

  useEffect(() => {
    showRequest = setRequest
    return () => {
      showRequest = null
    }
  }, [])

  if (!request) return null

  const answer = (confirmed: boolean): void => {
    request.resolve(confirmed)
    setRequest(null)
  }

  return (
    <Modal
      labelledBy={titleId}
      onClose={() => answer(false)}
      initialFocus="first"
      overlayStyle={{ zIndex: 100000 }}
      panelStyle={{ maxWidth: '420px', padding: '20px 22px' }}
    >
      <h3 id={titleId} style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
        {request.title}
      </h3>
      <p
        style={{
          margin: '8px 0 18px',
          fontSize: '13px',
          lineHeight: 1.5,
          color: 'var(--text-secondary)'
        }}
      >
        {request.message}
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <button
          data-autofocus
          onClick={() => answer(false)}
          style={{
            padding: '7px 14px',
            borderRadius: '6px',
            border: '1px solid var(--border-strong)',
            background: 'transparent',
            color: 'var(--text-primary)',
            fontSize: '12.5px',
            cursor: 'pointer'
          }}
        >
          Annuler
        </button>
        <button
          onClick={() => answer(true)}
          style={{
            padding: '7px 14px',
            borderRadius: '6px',
            border: 'none',
            background: request.danger ? 'var(--danger-strong)' : 'var(--accent-strong)',
            color: '#ffffff',
            fontSize: '12.5px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          {request.confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
