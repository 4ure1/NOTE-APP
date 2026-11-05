import type { CSSProperties, KeyboardEventHandler, ReactNode } from 'react'
import { useModalA11y } from '../utils/useModalA11y'

interface ModalProps {
  /** id du titre de la fenêtre, ou `label` si elle n'a pas de titre à relier. */
  labelledBy?: string
  label?: string
  /** Échap et clic sur le fond. */
  onClose: () => void
  closeOnEscape?: boolean
  closeOnBackdrop?: boolean
  initialFocus?: 'field' | 'first'
  /** Dimensions propres à la fenêtre, et fond si elle en a un autre. */
  panelStyle?: CSSProperties
  /** Fond : position dans un panneau, alignement, plan d'affichage. */
  overlayStyle?: CSSProperties
  className?: string
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
  children: ReactNode
}

// Structure commune des fenêtres modales : fond, panneau, sémantique et clavier (useModalA11y)
export default function Modal({
  labelledBy,
  label,
  onClose,
  closeOnEscape,
  closeOnBackdrop = true,
  initialFocus,
  panelStyle,
  overlayStyle,
  className,
  onKeyDown,
  children
}: ModalProps): ReactNode {
  const dialogRef = useModalA11y(true, onClose, { closeOnEscape, initialFocus })

  return (
    <div
      className={className}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        backgroundColor: 'var(--overlay-bg)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        ...overlayStyle
      }}
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose()
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={label}
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
