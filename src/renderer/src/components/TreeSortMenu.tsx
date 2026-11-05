import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { DEFAULT_TREE_SORT, nextTreeSort, type TreeSort, type TreeSortKey } from '../utils/treeSort'
import { SortIcon } from './Icons'

interface TreeSortMenuProps {
  sort: TreeSort
  onChange: (sort: TreeSort) => void
}

const OPTIONS: Array<{ key: TreeSortKey; label: string; asc: string; desc: string }> = [
  { key: 'name', label: 'Nom', asc: 'A → Z', desc: 'Z → A' },
  { key: 'modified', label: 'Date de modification', asc: 'ancien', desc: 'récent' },
  { key: 'created', label: 'Date de création', asc: 'ancien', desc: 'récent' },
  { key: 'size', label: 'Taille', asc: 'petit', desc: 'gros' },
  { key: 'type', label: 'Type', asc: 'A → Z', desc: 'Z → A' }
]

const MENU_WIDTH = 230
const MENU_HEIGHT = 170

// Bouton de tri de « Mes notes » : un critère choisi deux fois inverse l'ordre
export default function TreeSortMenu({ sort, onChange }: TreeSortMenuProps): ReactNode {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const isOpen = position !== null
  const current = OPTIONS.find((o) => o.key === sort.key) ?? OPTIONS[0]
  const isDefault =
    sort.key === DEFAULT_TREE_SORT.key && sort.descending === DEFAULT_TREE_SORT.descending

  useEffect(() => {
    if (!isOpen) return
    menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus()
    const handleOutside = (e: MouseEvent): void => {
      const target = e.target as Node
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setPosition(null)
      }
    }
    window.addEventListener('mousedown', handleOutside)
    return () => window.removeEventListener('mousedown', handleOutside)
  }, [isOpen])

  const toggle = (): void => {
    if (isOpen) {
      setPosition(null)
      return
    }
    const r = buttonRef.current?.getBoundingClientRect()
    // Toujours dans la fenêtre : la barre latérale est plus étroite que le menu à gauche du bouton
    if (r) {
      setPosition({
        top: Math.max(8, Math.min(r.bottom + 4, window.innerHeight - MENU_HEIGHT - 8)),
        left: Math.max(8, Math.min(r.left, window.innerWidth - MENU_WIDTH - 8))
      })
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]'))
    const i = items.indexOf(document.activeElement as HTMLElement)
    let handled = true
    if (e.key === 'ArrowDown') items[(i + 1) % items.length].focus()
    else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length].focus()
    else if (e.key === 'Home') items[0].focus()
    else if (e.key === 'End') items[items.length - 1].focus()
    else if (e.key === 'Escape' || e.key === 'Tab') {
      setPosition(null)
      buttonRef.current?.focus()
    } else handled = false
    if (handled) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggle}
        title={`Trier : ${current.label.toLowerCase()} (${sort.descending ? current.desc : current.asc})`}
        aria-label="Trier les notes"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        style={{
          background: 'transparent',
          border: 'none',
          color: isDefault ? 'var(--text-secondary)' : 'var(--accent-marge)',
          cursor: 'pointer',
          padding: '2px 4px',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        <SortIcon size={13} />
      </button>

      {position && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Trier les notes"
          onKeyDown={handleKeyDown}
          style={{
            position: 'fixed',
            top: `${position.top}px`,
            left: `${position.left}px`,
            width: `${MENU_WIDTH}px`,
            padding: '4px',
            backgroundColor: 'var(--surface-raised)',
            border: '1px solid var(--border-strong)',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
            zIndex: 99999,
            fontWeight: 400,
            textTransform: 'none',
            letterSpacing: 'normal'
          }}
        >
          {OPTIONS.map((option) => {
            const active = option.key === sort.key
            return (
              <button
                key={option.key}
                role="menuitemradio"
                aria-checked={active}
                tabIndex={-1}
                onClick={() => onChange(nextTreeSort(sort, option.key))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '6px 8px',
                  border: 'none',
                  borderRadius: '5px',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  fontSize: '12.5px',
                  textAlign: 'left',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = 'var(--surface-input)')
                }
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span
                  aria-hidden="true"
                  style={{ width: '12px', color: 'var(--accent-marge)', fontWeight: 700 }}
                >
                  {active ? '✓' : ''}
                </span>
                <span style={{ flex: 1 }}>{option.label}</span>
                {active && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {sort.descending ? option.desc : option.asc}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
