import React, { useState, useMemo } from 'react'
import { OutlineHeading, buildOutlineTree, OutlineTreeNode } from '../utils/outlineExtractor'
import { ChevronDown, ChevronRight, XIcon } from './Icons'

export type OutlinePosition = 'left' | 'right'

export interface OutlinePanelProps {
  headings: OutlineHeading[]
  activeHeadingId?: string | null
  onSelectHeading: (heading: OutlineHeading) => void
  onClose: () => void
  position: OutlinePosition
  onChangePosition: (pos: OutlinePosition) => void
  isFloating?: boolean
}

export default function OutlinePanel({
  headings,
  activeHeadingId,
  onSelectHeading,
  onClose,
  position,
  onChangePosition,
  isFloating = false
}: OutlinePanelProps): React.ReactNode {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())

  // Arbre hiérarchique
  const tree = useMemo(() => buildOutlineTree(headings), [headings])

  // Déplier / Replier un nœud
  const toggleCollapse = (id: string, e: React.MouseEvent): void => {
    e.stopPropagation()
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Tout replier / Tout déplier
  const allParentIds = useMemo((): string[] => {
    const ids: string[] = []
    const visit = (nodes: OutlineTreeNode[]): void => {
      for (const n of nodes) {
        if (n.children.length > 0) {
          ids.push(n.id)
          visit(n.children)
        }
      }
    }
    visit(tree)
    return ids
  }, [tree])

  const isAllCollapsed = allParentIds.length > 0 && allParentIds.every((id) => collapsedIds.has(id))

  const handleToggleCollapseAll = (): void => {
    if (isAllCollapsed) {
      setCollapsedIds(new Set())
    } else {
      setCollapsedIds(new Set(allParentIds))
    }
  }

  // Rendu récursif d'un nœud d'arbre
  const renderTreeNode = (node: OutlineTreeNode, depth: number = 0): React.ReactNode => {
    const hasChildren = node.children.length > 0
    const isCollapsed = collapsedIds.has(node.id)
    const isActive = activeHeadingId === node.id || activeHeadingId === String(node.line)

    const levelColor =
      {
        1: '#38bdf8', // H1: Cyan
        2: '#818cf8', // H2: Indigo
        3: '#a78bfa', // H3: Purple
        4: '#94a3b8', // H4: Slate
        5: '#64748b', // H5: Slate dark
        6: '#475569' // H6: Dim
      }[node.level] || '#94a3b8'

    return (
      <div key={node.id} style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          onClick={() => onSelectHeading(node)}
          title={`${node.text} (Ligne ${node.line})`}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '5px 8px',
            paddingLeft: `${Math.max(6, depth * 14 + 6)}px`,
            borderRadius: '6px',
            cursor: 'pointer',
            backgroundColor: isActive ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
            borderLeft: isActive ? '2px solid #38bdf8' : '2px solid transparent',
            color: isActive ? '#38bdf8' : 'var(--text-secondary, #cbd5e1)',
            fontSize: node.level === 1 ? '12.5px' : '12px',
            fontWeight: node.level === 1 ? 600 : node.level === 2 ? 500 : 400,
            gap: '6px',
            transition: 'background-color 0.12s, color 0.12s, border-left-color 0.12s',
            userSelect: 'none',
            minHeight: '26px',
            boxSizing: 'border-box'
          }}
          onMouseEnter={(e) => {
            if (!isActive) {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
              e.currentTarget.style.color = '#f1f5f9'
            }
          }}
          onMouseLeave={(e) => {
            if (!isActive) {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = 'var(--text-secondary, #cbd5e1)'
            }
          }}
        >
          {/* Chevron pour replier/déplier */}
          {hasChildren ? (
            <button
              onClick={(e) => toggleCollapse(node.id, e)}
              title={isCollapsed ? 'Déplier la section' : 'Replier la section'}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                padding: '2px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '3px',
                width: '16px',
                height: '16px',
                flexShrink: 0
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)')
              }
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </button>
          ) : (
            <span
              style={{ width: '16px', height: '16px', display: 'inline-block', flexShrink: 0 }}
            />
          )}

          {/* Badge discret H1..H6 */}
          <span
            style={{
              fontSize: '9.5px',
              fontWeight: 700,
              padding: '1px 3.5px',
              borderRadius: '3px',
              backgroundColor: `${levelColor}22`,
              color: levelColor,
              border: `1px solid ${levelColor}44`,
              lineHeight: 1,
              flexShrink: 0,
              fontFamily: "Consolas, 'Cascadia Code', monospace"
            }}
          >
            H{node.level}
          </span>

          {/* Libellé du titre tronqué élégamment */}
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1
            }}
          >
            {node.text}
          </span>
        </div>

        {/* Enfants récursifs si non replié */}
        {hasChildren && !isCollapsed && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <aside
      className="outline-panel"
      style={{
        width: isFloating ? '280px' : '260px',
        height: '100%',
        backgroundColor: '#0d0e11',
        borderLeft: position === 'right' ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
        borderRight: position === 'left' ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        zIndex: 120,
        boxSizing: 'border-box',
        overflow: 'hidden',
        boxShadow: isFloating ? '0 10px 30px rgba(0, 0, 0, 0.5)' : 'none'
      }}
    >
      {/* En-tête du panneau */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
          backgroundColor: '#090a0d',
          minHeight: '40px',
          boxSizing: 'border-box',
          gap: '8px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
          <span
            style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap' }}
          >
            Plan
          </span>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              padding: '1px 5px',
              borderRadius: '10px',
              backgroundColor: 'rgba(56, 189, 248, 0.15)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.3)'
            }}
          >
            {headings.length}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* Bouton Replier / Déplier tout */}
          {allParentIds.length > 0 && (
            <button
              onClick={handleToggleCollapseAll}
              title={isAllCollapsed ? 'Déplier tout le plan' : 'Replier tout le plan'}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary, #94a3b8)',
                cursor: 'pointer',
                padding: '4px 6px',
                borderRadius: '4px',
                fontSize: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.12s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'
                e.currentTarget.style.color = '#ffffff'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = 'var(--text-secondary, #94a3b8)'
              }}
            >
              {isAllCollapsed ? '⊞' : '⊟'}
            </button>
          )}

          {/* Bouton Changer de côté (Gauche / Droite) */}
          <button
            onClick={() => onChangePosition(position === 'right' ? 'left' : 'right')}
            title={position === 'right' ? 'Ancrer le plan à gauche' : 'Ancrer le plan à droite'}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary, #94a3b8)',
              cursor: 'pointer',
              padding: '4px 6px',
              borderRadius: '4px',
              fontSize: '12px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.12s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'
              e.currentTarget.style.color = '#ffffff'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = 'var(--text-secondary, #94a3b8)'
            }}
          >
            {position === 'right' ? '◧' : '◨'}
          </button>

          {/* Bouton Fermer */}
          <button
            onClick={onClose}
            title="Fermer le plan (Ctrl+Shift+O)"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary, #94a3b8)',
              cursor: 'pointer',
              padding: '4px 5px',
              borderRadius: '4px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.12s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'
              e.currentTarget.style.color = '#ffffff'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = 'var(--text-secondary, #94a3b8)'
            }}
          >
            <XIcon size={13} />
          </button>
        </div>
      </div>

      {/* Liste défilante des titres */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '8px 6px',
          display: 'flex',
          flexDirection: 'column',
          gap: '1px'
        }}
      >
        {headings.length === 0 ? (
          <div
            style={{
              padding: '32px 14px',
              textAlign: 'center',
              color: '#64748b',
              fontSize: '12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px'
            }}
          >
            <span style={{ fontSize: '20px' }}>📑</span>
            <span>Aucun titre dans cette note</span>
            <span style={{ fontSize: '11px', color: '#475569', lineHeight: 1.4 }}>
              Ajoutez des balises &lt;h1&gt; à &lt;h6&gt; ou des dièses (#) en Markdown pour générer
              automatiquement le plan.
            </span>
          </div>
        ) : (
          tree.map((node) => renderTreeNode(node, 0))
        )}
      </div>
    </aside>
  )
}
