import type { CSSProperties, KeyboardEventHandler, ReactNode } from 'react'
import { useModalA11y } from '../utils/useModalA11y'

interface ModalProps {
  /** id du titre de la fenêtre. */
  labelledBy: string
  /** Échap et clic sur le fond. */
  onClose: () => void
  closeOnEscape?: boolean
  initialFocus?: 'field' | 'first'
  /** Dimensions propres à la fenêtre, et fond si elle en a un autre. */
  panelStyle?: CSSProperties
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
  children: ReactNode
}

// Structure commune des fenêtres modales : fond, panneau, sémantique et clavier (useModalA11y)
export default function Modal({
  labelledBy,
  onClose,
  closeOnEscape,
  initialFocus,
  panelStyle,
  onKeyDown,
  children
}: ModalProps): ReactNode {
  const dialogRef = useModalA11y(true, onClose, { closeOnEscape, initialFocus })

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        backgroundColor: 'var(--overlay-bg)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        style={{
          width: '100%',
          backgroundColor: 'var(--surface-raised)',
          border: '1px solid var(--border-strong)',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
          color: 'var(--text-strong)',
          fontFamily: 'var(--font-ui)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          ...panelStyle
        }}
      >
        {children}
      </div>
    </div>
  )
}
