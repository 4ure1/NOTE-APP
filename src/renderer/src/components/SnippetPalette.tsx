import React, { useEffect, useRef, useMemo } from 'react'
import { Snippet } from '../types/snippets'
import { filterSnippets } from '../utils/snippetEngine'

interface SnippetPaletteProps {
  isOpen: boolean
  onClose: () => void
  scope: 'html' | 'markdown'
  snippets: Snippet[]
  initialQuery?: string
  selectedIndex?: number
  position?: { top: number; left: number } | null
  onSelectSnippet: (snippet: Snippet) => void
}

/**
 * Hint widget compact et discret inspiré de l'IntelliSense de VS Code
 */
export const SnippetPalette: React.FC<SnippetPaletteProps> = ({
  isOpen,
  scope,
  snippets,
  initialQuery = '',
  selectedIndex = 0,
  position,
  onSelectSnippet
}) => {
  const listRef = useRef<HTMLDivElement>(null)

  // Filtrage ultra-rapide des snippets selon le scope et la saisie
  const filteredList = useMemo(() => {
    return filterSnippets(snippets, initialQuery, scope)
  }, [snippets, initialQuery, scope])

  // Défilement automatique vers l'élément sélectionné
  useEffect(() => {
    if (!listRef.current) return
    const activeEl = listRef.current.querySelector<HTMLElement>(`[data-snippet-index="${selectedIndex}"]`)
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  if (!isOpen || filteredList.length === 0) return null

  const top = position ? Math.min(position.top, window.innerHeight - 240) : 100
  const left = position ? Math.min(position.left, window.innerWidth - 320) : 100

  return (
    <div
      ref={listRef}
      style={{
        position: 'fixed',
        top,
        left,
        width: 300,
        maxHeight: 220,
        background: '#1e1e1e', // Menu sombre style VS Code
        border: '1px solid #3c3c3c',
        borderRadius: 4,
        boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
        zIndex: 99999,
        overflowY: 'auto',
        fontFamily: "Consolas, 'Cascadia Code', 'Fira Code', monospace",
        fontSize: '12px',
        color: '#cccccc',
        padding: '2px 0',
        userSelect: 'none'
      }}
    >
      {filteredList.map((s, idx) => {
        const isSelected = idx === selectedIndex
        return (
          <div
            key={s.prefix}
            data-snippet-index={idx}
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onSelectSnippet(s)
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              height: '24px',
              padding: '0 8px',
              gap: '6px',
              backgroundColor: isSelected ? '#04395e' : 'transparent',
              color: isSelected ? '#ffffff' : '#cccccc',
              cursor: 'pointer'
            }}
          >
            {/* Icône de snippet style VS Code */}
            <span style={{ color: '#569cd6', fontSize: '11px', flexShrink: 0 }}>⧉</span>

            {/* Préfixe du snippet (/card) */}
            <span
              style={{
                fontWeight: 600,
                color: isSelected ? '#ffffff' : '#e0e0e0',
                flexShrink: 0
              }}
            >
              /{s.prefix}
            </span>

            {/* Nom / description discrète à droite */}
            <span
              style={{
                marginLeft: 'auto',
                fontSize: '11px',
                color: isSelected ? '#d0d0d0' : '#858585',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '140px',
                textAlign: 'right'
              }}
            >
              {s.name}
            </span>
          </div>
        )
      })}
    </div>
  )
}
