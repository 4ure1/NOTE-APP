import React, { useState, useRef, useEffect } from 'react'
import {
  MoreHorizontalIcon,
  FolderIcon,
  PlusIcon,
  ClaudeIcon,
  ChatGPTIcon,
  GeminiIcon,
  SparklesIcon,
  EyeIcon,
  EditIcon,
  CheckIcon,
  ClockIcon,
  getFileIcon
} from './Icons'
import { WORKFLOW_COLUMNS, WorkflowStatus } from './WorkflowView'

interface EditorHeaderProps {
  currentFilePath: string
  isFavorite: boolean
  onToggleFavorite: () => void
  showAIWorkspace: boolean
  onToggleAIWorkspace: () => void
  activeAI?: 'agent' | 'claude' | 'chatgpt' | 'gemini'
  tags: string[]
  onAddTag: (tag: string) => void
  onRemoveTag: (tag: string) => void
  createdAt?: string
  modifiedAt?: string
  noteTitle: string
  onTitleChange: (newTitle: string) => void
  editorMode?: 'preview' | 'live' | 'edit'
  onToggleEditorMode?: () => void
  onChangeEditorMode?: (mode: 'preview' | 'live' | 'edit') => void
  workflowStatus?: WorkflowStatus
  onStatusChange?: (status: WorkflowStatus) => void
  noteContent?: string
  onDeleteNote?: () => void
  onOpenInBrowser?: () => void
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
  onOpenSideBySide?: () => void
  isZenMode?: boolean
  onToggleZenMode?: () => void
  isTypewriterMode?: boolean
  onToggleTypewriterMode?: () => void
  onHighlightCode?: () => void
  onOpenHistory?: () => void
  onOpenExport?: () => void
  isCopilotEnabled?: boolean
  onToggleCopilot?: () => void
  isOutlineOpen?: boolean
  onToggleOutline?: () => void
}

export default function EditorHeader({
  currentFilePath,
  isFavorite,
  onToggleFavorite,
  showAIWorkspace,
  onToggleAIWorkspace,
  activeAI = 'claude',
  tags,
  onAddTag,
  onRemoveTag,
  createdAt = '2 days ago',
  modifiedAt = '12 hours ago',
  noteTitle,
  onTitleChange,
  editorMode = 'preview',
  onToggleEditorMode,
  onChangeEditorMode,
  workflowStatus,
  onStatusChange,
  noteContent = '',
  onDeleteNote,
  onOpenInBrowser,
  onOpenSideBySide,
  isZenMode = false,
  onToggleZenMode,
  isTypewriterMode = false,
  onToggleTypewriterMode,
  onHighlightCode,
  onOpenHistory,
  onOpenExport,
  isCopilotEnabled = true,
  onToggleCopilot,
  isOutlineOpen = false,
  onToggleOutline
}: EditorHeaderProps) {
  const [isAddingTag, setIsAddingTag] = useState(false)
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  const [newTagInput, setNewTagInput] = useState('')

  // Menus & Toast state
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const moreMenuListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', handleOutside)
    return () => window.removeEventListener('mousedown', handleOutside)
  }, [])

  // Menu « ⋯ » au clavier : focus sur la première entrée à l'ouverture
  useEffect(() => {
    if (moreMenuOpen) {
      moreMenuListRef.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus()
    }
  }, [moreMenuOpen])

  const handleMoreMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]'))
    if (items.length === 0) return
    const i = items.indexOf(document.activeElement as HTMLElement)
    let handled = true
    if (e.key === 'ArrowDown') items[(i + 1) % items.length].focus()
    else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length].focus()
    else if (e.key === 'Home') items[0].focus()
    else if (e.key === 'End') items[items.length - 1].focus()
    else if (e.key === 'Escape' || e.key === 'Tab') {
      setMoreMenuOpen(false)
      moreButtonRef.current?.focus()
    } else handled = false
    if (handled) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  const triggerToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 2200)
  }

  // Compute breadcrumbs path segments
  const pathParts = currentFilePath ? currentFilePath.split('/') : []
  const fileName = pathParts.pop() || 'Nouvelle note'
  const folders = pathParts

  // Entrées du menu « ⋯ », par groupes ; une entrée n'apparaît que si son action existe pour ce type
  // de note (HTML, Markdown, PDF). `checked` en fait une case à cocher (état affiché par ✓).
  type MoreMenuEntry = {
    label: string
    onSelect: () => void
    hint?: string
    checked?: boolean
    danger?: boolean
  }
  const downloadSourceFile = (): void => {
    const blob = new Blob([noteContent || ''], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
    triggerToast('Fichier téléchargé')
  }
  const moreMenuGroups: Array<Array<MoreMenuEntry | false | undefined>> = [
    [
      onToggleOutline && {
        label: 'Plan de la note',
        hint: 'Ctrl+Maj+O',
        checked: isOutlineOpen,
        onSelect: onToggleOutline
      },
      onOpenSideBySide && { label: 'Ouvrir un 2ᵉ panneau', onSelect: onOpenSideBySide },
      onOpenInBrowser && { label: 'Ouvrir dans le navigateur', onSelect: onOpenInBrowser }
    ],
    [
      onToggleCopilot && {
        label: 'Copilote IA (complétion Tab)',
        checked: isCopilotEnabled,
        onSelect: onToggleCopilot
      },
      onHighlightCode && { label: 'Colorer les blocs de code', onSelect: onHighlightCode },
      onToggleTypewriterMode && {
        label: 'Machine à écrire',
        checked: isTypewriterMode,
        onSelect: onToggleTypewriterMode
      },
      onToggleZenMode && {
        label: 'Mode zen',
        hint: 'Ctrl+Maj+Z',
        checked: isZenMode,
        onSelect: onToggleZenMode
      }
    ],
    [
      {
        label: isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris',
        onSelect: onToggleFavorite
      },
      {
        label: 'Copier le contenu',
        onSelect: () => {
          navigator.clipboard.writeText(noteContent || '')
          triggerToast('Contenu copié')
        }
      },
      {
        label: 'Copier le chemin',
        onSelect: () => {
          navigator.clipboard.writeText(currentFilePath)
          triggerToast('Chemin copié')
        }
      },
      { label: 'Télécharger le fichier source', onSelect: downloadSourceFile }
    ],
    [onDeleteNote && { label: 'Supprimer la note', danger: true, onSelect: onDeleteNote }]
  ]
  const moreMenuEntries: Array<MoreMenuEntry | 'separator'> = []
  for (const group of moreMenuGroups) {
    const entries = group.filter((entry): entry is MoreMenuEntry => Boolean(entry))
    if (entries.length === 0) continue
    if (moreMenuEntries.length > 0) moreMenuEntries.push('separator')
    moreMenuEntries.push(...entries)
  }

  const handleTagSubmit = () => {
    const val = newTagInput.trim()
    if (val && !tags.includes(val)) {
      onAddTag(val)
    }
    setIsAddingTag(false)
    setNewTagInput('')
  }

  // Pre-configured elegant tag color styles matching mockup
  const getTagColorClass = (index: number) => {
    const classes = ['tag-pill-green', 'tag-pill-blue', 'tag-pill-purple', 'tag-pill-amber', 'tag-pill-neutral']
    return classes[index % classes.length]
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', userSelect: 'none', backgroundColor: 'var(--editor-bg)' }}>
      {/* Top Navbar: Breadcrumbs + Actions (matching screenshot) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 32px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--editor-bg)',
          minHeight: '46px'
        }}
      >
        {/* Breadcrumb links with icons and slash separators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)', overflow: 'hidden' }}>
          {folders.map((folder, idx) => {
            const isFirst = idx === 0
            const isAgency = folder.toLowerCase().includes('equal')
            return (
              <React.Fragment key={idx}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
                  {isAgency ? (
                    <span
                      style={{
                        color: 'var(--success-color)',
                        fontSize: '12px',
                        display: 'inline-flex',
                        alignItems: 'center'
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="#4ade80" stroke="#4ade80" strokeWidth="2">
                        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                      </svg>
                    </span>
                  ) : (
                    <FolderIcon size={14} style={{ color: 'var(--text-muted)' }} />
                  )}
                  <span style={{ color: isFirst ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: isFirst ? 500 : 400 }}>
                    {folder}
                  </span>
                </span>
                <span style={{ color: 'rgba(255, 255, 255, 0.25)', fontSize: '12px' }}>/</span>
              </React.Fragment>
            )
          })}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {getFileIcon(fileName, 14)}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{fileName.replace(/\.(html|htm|md|markdown)$/i, '')}</span>
          </span>
        </div>

        {/* Action icons right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, position: 'relative' }}>
          {/* Toast Notification */}
          {toastMessage && (
            <div
              style={{
                position: 'absolute',
                top: '38px',
                right: '0',
                backgroundColor: 'var(--surface-raised)',
                border: '1px solid var(--border-strong)',
                color: 'var(--text-strong)',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.6)',
                zIndex: 2000,
                pointerEvents: 'none',
                whiteSpace: 'nowrap'
              }}
            >
              <CheckIcon size={13} style={{ color: 'var(--success-color)' }} />
              <span>{toastMessage}</span>
            </div>
          )}

          {/* Mode Switcher: Code | Split | Aperçu */}
          {onChangeEditorMode ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                padding: '2px',
                gap: '2px',
                height: '28px',
                boxSizing: 'border-box'
              }}
            >
              <button
                onClick={() => onChangeEditorMode('edit')}
                title="Mode Code seul (moteur VS Code)"
                style={{
                  background: editorMode === 'edit' ? 'var(--surface-input)' : 'transparent',
                  border: 'none',
                  color: editorMode === 'edit' ? 'var(--text-strong)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '3px 7px',
                  borderRadius: '4px',
                  fontSize: '11.5px',
                  fontWeight: editorMode === 'edit' ? 600 : 400,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s'
                }}
              >
                <EditIcon size={12} />
                <span>Code</span>
              </button>
              <button
                onClick={() => onChangeEditorMode('live')}
                title="Côte à côte : code à gauche, aperçu en direct à droite"
                style={{
                  background: editorMode === 'live' ? 'var(--surface-input)' : 'transparent',
                  border: 'none',
                  color: editorMode === 'live' ? 'var(--text-strong)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '3px 7px',
                  borderRadius: '4px',
                  fontSize: '11.5px',
                  fontWeight: editorMode === 'live' ? 600 : 400,
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s'
                }}
              >
                <span style={{ fontSize: '11px', lineHeight: 1 }}>◫</span>
                <span>Côte à côte</span>
              </button>
              <button
                onClick={() => onChangeEditorMode('preview')}
                title="Mode Rendu interactif plein écran"
                style={{
                  background: editorMode === 'preview' ? 'var(--surface-input)' : 'transparent',
                  border: 'none',
                  color: editorMode === 'preview' ? 'var(--text-strong)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '3px 7px',
                  borderRadius: '4px',
                  fontSize: '11.5px',
                  fontWeight: editorMode === 'preview' ? 600 : 400,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s'
                }}
              >
                <EyeIcon size={12} />
                <span>Aperçu</span>
              </button>
            </div>
          ) : onToggleEditorMode ? (
            <button
              onClick={onToggleEditorMode}
              title={editorMode === 'preview' ? 'Passer en mode édition' : 'Passer en mode aperçu'}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                padding: '4px 9px',
                borderRadius: '6px',
                fontSize: '11.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                height: '28px',
                boxSizing: 'border-box',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--element-bg-hover)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
              }}
            >
              {editorMode === 'preview' ? <EditIcon size={12} /> : <EyeIcon size={12} />}
              <span>{editorMode === 'preview' ? 'Modifier' : 'Aperçu'}</span>
            </button>
          ) : null}

          {/* Historique des versions : action fréquente, gardée visible avec son libellé */}
          {onOpenHistory && (
            <button
              onClick={onOpenHistory}
              title="Historique des versions"
              style={{
                background: 'transparent',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '0 10px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                height: '28px',
                fontSize: '12px',
                boxSizing: 'border-box',
                transition: 'background-color 0.15s, color 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--element-bg-hover)'
                e.currentTarget.style.color = 'var(--text-strong)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = 'var(--text-secondary)'
              }}
            >
              <ClockIcon size={13} />
              <span>Historique</span>
            </button>
          )}

          {/* Exporter (PDF, Word, HTML) : bouton principal de l'en-tête */}
          {onOpenExport && (
            <button
              onClick={onOpenExport}
              title="Exporter la note (PDF, Word, HTML)"
              style={{
                background: 'var(--accent-strong)',
                border: '1px solid transparent',
                color: '#ffffff',
                cursor: 'pointer',
                padding: '0 12px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                height: '28px',
                fontSize: '12px',
                fontWeight: 600,
                boxSizing: 'border-box',
                transition: 'filter 0.15s'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.12)')}
              onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
            >
              Exporter
            </button>
          )}

          {/* Menu « ⋯ » : tous les réglages et actions secondaires de la note */}
          <div style={{ position: 'relative' }} ref={moreMenuRef}>
            <button
              ref={moreButtonRef}
              onClick={() => setMoreMenuOpen(!moreMenuOpen)}
              title="Plus d'actions"
              aria-label="Plus d'actions"
              aria-haspopup="menu"
              aria-expanded={moreMenuOpen}
              style={{
                background: moreMenuOpen ? 'var(--element-bg)' : 'transparent',
                border: 'none',
                color: moreMenuOpen ? 'var(--text-strong)' : 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '28px',
                width: '28px',
                boxSizing: 'border-box',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--element-bg)')}
              onMouseLeave={(e) => {
                if (!moreMenuOpen) e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <MoreHorizontalIcon size={15} />
            </button>

            {moreMenuOpen && (
              <div
                ref={moreMenuListRef}
                role="menu"
                aria-label="Actions de la note"
                onKeyDown={handleMoreMenuKeyDown}
                style={{
                  position: 'absolute',
                  top: '34px',
                  right: '0',
                  width: '264px',
                  backgroundColor: 'var(--surface-raised)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: '8px',
                  padding: '5px',
                  boxShadow: '0 14px 35px -5px rgba(0, 0, 0, 0.75)',
                  zIndex: 1000,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1px'
                }}
              >
                {/* Statistiques de la note */}
                <div
                  style={{
                    padding: '6px 10px 8px',
                    borderBottom: '1px solid var(--border-color)',
                    marginBottom: '4px',
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    gap: '12px'
                  }}
                >
                  <span>
                    {(noteContent || '').trim()
                      ? (noteContent || '').trim().split(/\s+/).length
                      : 0}{' '}
                    mots
                  </span>
                  <span>{(noteContent || '').length} caractères</span>
                </div>

                {moreMenuEntries.map((entry, i) =>
                  entry === 'separator' ? (
                    <div
                      key={`sep-${i}`}
                      role="separator"
                      style={{
                        height: '1px',
                        background: 'var(--border-color)',
                        margin: '4px 6px'
                      }}
                    />
                  ) : (
                    <button
                      key={entry.label}
                      role={entry.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                      aria-checked={entry.checked}
                      tabIndex={-1}
                      onClick={() => {
                        setMoreMenuOpen(false)
                        entry.onSelect()
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '7px 10px',
                        borderRadius: '5px',
                        background: 'transparent',
                        border: 'none',
                        color: entry.danger ? 'var(--danger-strong)' : 'var(--text-primary)',
                        fontSize: '12.5px',
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor = entry.danger
                          ? 'color-mix(in srgb, var(--danger-strong) 12%, transparent)'
                          : 'var(--surface-input)')
                      }
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <span
                        aria-hidden="true"
                        style={{ width: '12px', color: 'var(--accent-marge)', fontWeight: 700 }}
                      >
                        {entry.checked ? '✓' : ''}
                      </span>
                      <span style={{ flex: 1 }}>{entry.label}</span>
                      {entry.hint && (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {entry.hint}
                        </span>
                      )}
                    </button>
                  )
                )}
              </div>
            )}
          </div>

          {/* Assistant AI Toggle - Dynamic Branding */}
          {(() => {
            const aiData = {
              agent: { name: 'Agent IA', color: '#10b981', icon: <SparklesIcon size={15} color="#10b981" /> },
              claude: { name: 'Claude', color: '#D97757', icon: <ClaudeIcon size={15} color="#D97757" /> },
              chatgpt: {
                name: 'ChatGPT',
                color: '#ffffff',
                icon: <ChatGPTIcon size={15} style={{ color: 'var(--text-strong)' }} />
              },
              gemini: { name: 'Gemini', color: '#4285f4', icon: <GeminiIcon size={15} style={{ color: '#4285f4' }} /> }
            }[activeAI] || { name: 'Agent IA', color: '#10b981', icon: <SparklesIcon size={15} color="#10b981" /> }

            return (
              <button
                onClick={onToggleAIWorkspace}
                title={showAIWorkspace ? `Masquer ${aiData.name}` : `Ouvrir ${aiData.name}`}
                style={{
                  height: '28px',
                  padding: '0 10px',
                  borderRadius: '6px',
                  backgroundColor: showAIWorkspace ? `${aiData.color}33` : `${aiData.color}14`,
                  border: showAIWorkspace ? `1px solid ${aiData.color}99` : `1px solid ${aiData.color}40`,
                  color: 'var(--text-strong)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  boxShadow: showAIWorkspace ? `0 0 10px ${aiData.color}40` : 'none',
                  transition: 'all 0.15s ease',
                  boxSizing: 'border-box'
                }}
                onMouseEnter={(e) => {
                  if (!showAIWorkspace) {
                    e.currentTarget.style.backgroundColor = `${aiData.color}29`
                    e.currentTarget.style.borderColor = `${aiData.color}73`
                  }
                }}
                onMouseLeave={(e) => {
                  if (!showAIWorkspace) {
                    e.currentTarget.style.backgroundColor = `${aiData.color}14`
                    e.currentTarget.style.borderColor = `${aiData.color}40`
                  }
                }}
              >
                {aiData.icon}
                <span style={{ color: 'var(--text-strong)', letterSpacing: '0.2px' }}>
                  {aiData.name}
                </span>
                {showAIWorkspace && (
                  <span
                    style={{
                      width: '5px',
                      height: '5px',
                      borderRadius: '50%',
                      backgroundColor: aiData.color,
                      boxShadow: `0 0 6px ${aiData.color}`
                    }}
                  />
                )}
              </button>
            )
          })()}

        </div>
      </div>

      {/* Note Hero: Tags, Large Title, Meta Timestamps */}
      <div style={{ padding: '28px 36px 12px 36px' }}>
        {/* Pill tags matching screenshot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {/* Workflow Status Badge Dropdown */}
          {workflowStatus && onStatusChange && (
            <div style={{ position: 'relative' }}>
              {(() => {
                const currentCol = WORKFLOW_COLUMNS.find((c) => c.id === workflowStatus) || WORKFLOW_COLUMNS[1]
                return (
                  <button
                    onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      backgroundColor: currentCol.bgBadge,
                      border: `1px solid ${currentCol.borderBadge}`,
                      color: currentCol.color,
                      borderRadius: '6px',
                      padding: '3px 10px',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      outline: 'none',
                      transition: 'all 0.15s'
                    }}
                  >
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: currentCol.color,
                        boxShadow: `0 0 6px ${currentCol.color}`
                      }}
                    />
                    <span>{currentCol.label}</span>
                    <span style={{ fontSize: '9px', opacity: 0.7 }}>▼</span>
                  </button>
                )
              })()}

              {statusDropdownOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: '4px',
                    backgroundColor: 'var(--surface-raised)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: '8px',
                    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.6)',
                    zIndex: 50,
                    minWidth: '150px',
                    padding: '4px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                  }}
                >
                  {WORKFLOW_COLUMNS.map((col) => (
                    <div
                      key={col.id}
                      onClick={() => {
                        onStatusChange(col.id)
                        setStatusDropdownOpen(false)
                      }}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        color:
                          col.id === workflowStatus
                            ? 'var(--text-strong)'
                            : 'var(--text-secondary)',
                        backgroundColor: col.id === workflowStatus ? 'rgba(255, 255, 255, 0.08)' : 'transparent'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)')}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor =
                          col.id === workflowStatus ? 'rgba(255, 255, 255, 0.08)' : 'transparent'
                      }}
                    >
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: col.color
                        }}
                      />
                      <span>{col.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {tags.map((tag, idx) => (
            <span key={tag} className={`tag-pill ${getTagColorClass(idx)}`}>
              <span>{tag}</span>
              <button
                onClick={() => onRemoveTag(tag)}
                title="Supprimer ce tag"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  marginLeft: '6px',
                  padding: 0,
                  fontSize: '13px',
                  lineHeight: 1,
                  opacity: 0.6,
                  display: 'inline-flex',
                  alignItems: 'center'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
              >
                &times;
              </button>
            </span>
          ))}

          {isAddingTag ? (
            <input
              autoFocus
              placeholder="Tag..."
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              onBlur={handleTagSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTagSubmit()
                if (e.key === 'Escape') setIsAddingTag(false)
              }}
              style={{
                background: 'var(--element-bg)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-strong)',
                borderRadius: '6px',
                padding: '3px 10px',
                fontSize: '11.5px',
                outline: 'none'
              }}
            />
          ) : (
            <button
              onClick={() => setIsAddingTag(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: 'transparent',
                border: '1px dashed var(--border-strong)',
                color: 'var(--text-muted)',
                borderRadius: '6px',
                padding: '3px 10px',
                fontSize: '11.5px',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text-primary)'
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-muted)'
                e.currentTarget.style.borderColor = 'var(--border-strong)'
              }}
            >
              <PlusIcon size={11} />
              <span>Tag</span>
            </button>
          )}
        </div>

        {/* Note Title H1 - large bold typography */}
        <input
          value={noteTitle}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Titre de la note..."
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: '32px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '-0.025em',
            marginBottom: '8px',
            fontFamily: 'inherit',
            lineHeight: 1.25
          }}
        />

        {/* Metadata timestamps matching mockup */}
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>Created {createdAt}</span>
          <span style={{ opacity: 0.5 }}>•</span>
          <span>Last modified {modifiedAt}</span>
        </div>
      </div>
    </div>
  )
}
