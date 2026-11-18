import React, { useState, useRef, useEffect } from 'react'
import {
  MoreHorizontalIcon,
  PlusIcon,
  ClaudeIcon,
  ChatGPTIcon,
  GeminiIcon,
  SparklesIcon,
  EyeIcon,
  EditIcon,
  CheckIcon,
  ClockIcon,
  CodeIcon,
  ColumnsIcon,
  ChevronRight,
  ChevronDown,
  ShareIcon
} from './Icons'
import type { WorkflowColumn } from '../../../shared/workflow'

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
  /** Colonne du tableau où se trouve la note ; null : note non suivie. */
  workflowStatus?: string | null
  workflowColumns?: WorkflowColumn[]
  onStatusChange?: (columnId: string | null) => void
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
  workflowColumns,
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
      {/* Barre de la note : chemin du fichier, puis disposition et actions */}
      <div className="eh-bar">
        <nav className="eh-path" aria-label="Emplacement de la note">
          {folders.map((folder, idx) => (
            <React.Fragment key={idx}>
              <span className="eh-crumb">{folder}</span>
              <ChevronRight size={12} className="eh-sep" aria-hidden="true" />
            </React.Fragment>
          ))}
          <span className="eh-file" title={currentFilePath}>
            {fileName}
          </span>
        </nav>

        {/* Action icons right */}
        <div className="eh-actions">
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
                fontSize: 'var(--fs-sm)',
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

          {/* Disposition : Code | Côte à côte | Aperçu */}
          {onChangeEditorMode ? (
            <div className="eh-seg" role="group" aria-label="Disposition">
              <button
                aria-pressed={editorMode === 'edit'}
                onClick={() => onChangeEditorMode('edit')}
                title="Code seul"
              >
                <CodeIcon size={14} />
                Code
              </button>
              <button
                aria-pressed={editorMode === 'live'}
                onClick={() => onChangeEditorMode('live')}
                title="Côte à côte : code à gauche, aperçu à droite"
              >
                <ColumnsIcon size={14} />
                Côte à côte
              </button>
              <button
                aria-pressed={editorMode === 'preview'}
                onClick={() => onChangeEditorMode('preview')}
                title="Aperçu seul, éditable"
              >
                <EyeIcon size={14} />
                Aperçu
              </button>
            </div>
          ) : onToggleEditorMode ? (
            <button
              className="hv-background-color-element-bg-hover"
              onClick={onToggleEditorMode}
              title={editorMode === 'preview' ? 'Passer en mode édition' : 'Passer en mode aperçu'}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                padding: '4px 9px',
                borderRadius: '6px',
                fontSize: 'var(--fs-sm)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                height: '28px',
                boxSizing: 'border-box',
                transition: 'all 0.15s'
              }}
            >
              {editorMode === 'preview' ? <EditIcon size={12} /> : <EyeIcon size={12} />}
              <span>{editorMode === 'preview' ? 'Modifier' : 'Aperçu'}</span>
            </button>
          ) : null}

          {/* Historique et Exporter : actions fréquentes, gardées visibles avec leur libellé */}
          {onOpenHistory && (
            <button className="eh-btn" onClick={onOpenHistory} title="Historique des versions">
              <ClockIcon size={14} />
              Historique
            </button>
          )}
          {onOpenExport && (
            <button
              className="eh-btn"
              onClick={onOpenExport}
              title="Exporter la note (PDF, Word, HTML)"
            >
              <ShareIcon size={14} />
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
              className="eh-icon"
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
                    fontSize: 'var(--fs-sm)',
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
                        fontSize: 'var(--fs-md)',
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
                        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                          {entry.hint}
                        </span>
                      )}
                    </button>
                  )
                )}
              </div>
            )}
          </div>

          {/* Assistant : ouvre le panneau IA du fournisseur choisi */}
          {(() => {
            const ai = {
              agent: { name: 'Agent local', icon: <SparklesIcon size={14} /> },
              claude: { name: 'Claude', icon: <ClaudeIcon size={14} /> },
              chatgpt: { name: 'ChatGPT', icon: <ChatGPTIcon size={14} /> },
              gemini: { name: 'Gemini', icon: <GeminiIcon size={14} /> }
            }[activeAI] || { name: 'Agent local', icon: <SparklesIcon size={14} /> }
            return (
              <button
                className="eh-btn eh-assistant"
                aria-pressed={showAIWorkspace}
                onClick={onToggleAIWorkspace}
                title={showAIWorkspace ? `Masquer ${ai.name}` : `Ouvrir ${ai.name}`}
              >
                {ai.icon}
                Assistant
              </button>
            )
          })()}
        </div>
      </div>

      {/* Note Hero: Tags, Large Title, Meta Timestamps */}
      <div className="eh-meta">
        {/* Titre de la note : <title> en HTML, ligne « # » en Markdown */}
        <input
          className="eh-title-input"
          value={noteTitle}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Titre de la note"
          aria-label="Titre de la note"
          title={
            createdAt || modifiedAt
              ? `Créée ${createdAt ?? '?'}, modifiée ${modifiedAt ?? '?'}`
              : undefined
          }
        />
        {/* Pill tags matching screenshot */}
        <div className="eh-meta-tags">
          {/* Statut dans le tableau : colonne actuelle, ou « Ajouter au tableau » */}
          {workflowColumns && onStatusChange && (
            <div className="wf-status">
              <button
                className={'wf-status-chip' + (workflowStatus ? '' : ' empty')}
                aria-haspopup="menu"
                aria-expanded={statusDropdownOpen}
                onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
              >
                {workflowStatus
                  ? workflowColumns.find((c) => c.id === workflowStatus)?.label || 'Tableau'
                  : 'Ajouter au tableau'}
                <ChevronDown size={12} />
              </button>
              {statusDropdownOpen && (
                <div className="wf-menu wf-status-menu" role="menu">
                  {workflowColumns.map((col) => (
                    <button
                      key={col.id}
                      role="menuitemradio"
                      aria-checked={col.id === workflowStatus}
                      onClick={() => {
                        onStatusChange(col.id)
                        setStatusDropdownOpen(false)
                      }}
                    >
                      {col.label}
                      {col.id === workflowStatus && <CheckIcon size={13} />}
                    </button>
                  ))}
                  {workflowStatus && (
                    <>
                      <hr />
                      <button
                        role="menuitem"
                        onClick={() => {
                          onStatusChange(null)
                          setStatusDropdownOpen(false)
                        }}
                      >
                        Retirer du tableau
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          {tags.map((tag, idx) => (
            <span key={tag} className={`tag-pill ${getTagColorClass(idx)}`}>
              <span>{tag}</span>
              <button
                className="hv-opacity-1"
                onClick={() => onRemoveTag(tag)}
                title="Supprimer ce tag"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  marginLeft: '6px',
                  padding: 0,
                  fontSize: 'var(--fs-md)',
                  lineHeight: 1,
                  opacity: 0.6,
                  display: 'inline-flex',
                  alignItems: 'center'
                }}
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
                fontSize: 'var(--fs-sm)',
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
                fontSize: 'var(--fs-sm)',
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

      </div>
    </div>
  )
}
