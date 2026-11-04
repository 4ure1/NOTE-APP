import { useId, useMemo, useState, type ReactNode } from 'react'
import { TreeNode } from '../types'
import { filterMoveTargets, listMoveTargets } from '../../../shared/moveTargets'
import { useModalA11y } from '../utils/useModalA11y'
import { FolderIcon } from './Icons'

interface MoveToModalProps {
  itemPath: string
  treeNodes: TreeNode[]
  onMove: (targetFolder: string) => void
  onClose: () => void
}

// « Déplacer vers… » : même action que le glisser-déposer, utilisable au clavier
export default function MoveToModal({
  itemPath,
  treeNodes,
  onMove,
  onClose
}: MoveToModalProps): ReactNode {
  const [query, setQuery] = useState('')
  const dialogRef = useModalA11y(true, onClose)
  const titleId = useId()
  const targets = useMemo(() => listMoveTargets(treeNodes, itemPath), [treeNodes, itemPath])
  const visible = filterMoveTargets(targets, query)
  const itemName = itemPath.split('/').pop() || itemPath

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        backgroundColor: 'var(--overlay-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          width: '100%',
          maxWidth: '420px',
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--surface-raised)',
          border: '1px solid var(--border-strong)',
          borderRadius: '10px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
          color: 'var(--text-primary)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '14px 16px 10px' }}>
          <h3
            id={titleId}
            style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}
          >
            Déplacer « {itemName} »
          </h3>
          <input
            aria-label="Filtrer les dossiers"
            placeholder="Filtrer les dossiers…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && visible.length > 0) {
                e.preventDefault()
                onMove(visible[0])
              }
            }}
            style={{
              width: '100%',
              marginTop: '10px',
              padding: '7px 10px',
              borderRadius: '6px',
              border: '1px solid var(--border-input)',
              background: 'var(--surface-sunken)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ overflowY: 'auto', padding: '0 8px 8px' }}>
          {visible.length === 0 ? (
            <div
              role="status"
              style={{ padding: '10px', fontSize: '12.5px', color: 'var(--text-muted)' }}
            >
              Aucun dossier ne correspond.
            </div>
          ) : (
            visible.map((target) => (
              <button
                key={target || '__root__'}
                onClick={() => onMove(target)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '7px 8px',
                  border: 'none',
                  borderRadius: '5px',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  textAlign: 'left',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = 'var(--surface-input)')
                }
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <FolderIcon size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <span
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {target || 'Racine'}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
