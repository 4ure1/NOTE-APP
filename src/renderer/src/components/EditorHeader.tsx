import React, { useState, useRef, useEffect } from 'react'
import {
  StarIcon,
  ShareIcon,
  MoreHorizontalIcon,
  FolderIcon,
  FileTextIcon,
  PlusIcon,
  ClaudeIcon,
  ChatGPTIcon,
  GeminiIcon,
  SparklesIcon,
  EyeIcon,
  EditIcon,
  CheckIcon,
  CopyIcon,
  TrashIcon,
  ExternalLinkIcon,
  ColumnsIcon,
  OutlineIcon,
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
  onOpenSettings?: () => void
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
  onOpenSettings,
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
  const [shareMenuOpen, setShareMenuOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const shareMenuRef = useRef<HTMLDivElement>(null)
  const moreMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (shareMenuRef.current && !shareMenuRef.current.contains(e.target as Node)) {
        setShareMenuOpen(false)
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', handleOutside)
    return () => window.removeEventListener('mousedown', handleOutside)
  }, [])

  const triggerToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 2200)
  }

  // Compute breadcrumbs path segments
  const pathParts = currentFilePath ? currentFilePath.split('/') : []
  const fileName = pathParts.pop() || 'Nouvelle note'
  const folders = pathParts

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
                    <span style={{ color: '#4ade80', fontSize: '12px', display: 'inline-flex', alignItems: 'center' }}>
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
                backgroundColor: '#18181b',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#ffffff',
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
              <CheckIcon size={13} style={{ color: '#4ade80' }} />
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
                  background: editorMode === 'edit' ? '#27272a' : 'transparent',
                  border: 'none',
                  color: editorMode === 'edit' ? '#ffffff' : 'var(--text-secondary)',
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
                title="Mode Split (Code à gauche, rendu en direct à droite)"
                style={{
                  background: editorMode === 'live' ? '#27272a' : 'transparent',
                  border: 'none',
                  color: editorMode === 'live' ? '#ffffff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '3px 7px',
                  borderRadius: '4px',
                  fontSize: '11.5px',
                  fontWeight: editorMode === 'live' ? 600 : 400,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s'
                }}
              >
                <span style={{ fontSize: '11px', lineHeight: 1 }}>◫</span>
                <span>Split</span>
              </button>
              <button
                onClick={() => onChangeEditorMode('preview')}
                title="Mode Rendu interactif plein écran"
                style={{
                  background: editorMode === 'preview' ? '#27272a' : 'transparent',
                  border: 'none',
                  color: editorMode === 'preview' ? '#ffffff' : 'var(--text-secondary)',
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

          {/* Open in Browser (HTML files only) */}
          {onOpenInBrowser && (
            <button
              onClick={onOpenInBrowser}
              title="Ouvrir dans le navigateur"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
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
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <ExternalLinkIcon size={15} />
            </button>
          )}



          {/* Side-by-side: ouvrir un 2e panneau */}
          {onOpenSideBySide && (
            <button
              onClick={onOpenSideBySide}
              title="Ouvrir un 2ᵉ panneau côte à côte"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
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
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--element-bg)'
                e.currentTarget.style.color = '#38bdf8'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = 'var(--text-secondary)'
              }}
            >
              <ColumnsIcon size={15} />
            </button>
          )}

          {/* Plan du document (Outline) */}
          {onToggleOutline && (
            <button
              onClick={onToggleOutline}
              title={isOutlineOpen ? 'Masquer le plan du document (Ctrl+Shift+O)' : 'Afficher le plan du document (Ctrl+Shift+O)'}
              style={{
                background: isOutlineOpen ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                border: isOutlineOpen ? '1px solid rgba(56, 189, 248, 0.4)' : 'none',
                color: isOutlineOpen ? '#38bdf8' : 'var(--text-secondary)',
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
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = isOutlineOpen ? 'rgba(56, 189, 248, 0.25)' : 'var(--element-bg)'
                e.currentTarget.style.color = '#38bdf8'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = isOutlineOpen ? 'rgba(56, 189, 248, 0.15)' : 'transparent'
                e.currentTarget.style.color = isOutlineOpen ? '#38bdf8' : 'var(--text-secondary)'
              }}
            >
              <OutlineIcon size={15} />
            </button>
          )}

          {/* Favorite toggle star */}
          <button
            onClick={onToggleFavorite}
            title={isFavorite ? 'Retirer des favoris' : 'Marquer comme favori'}
            style={{
              background: 'transparent',
              border: 'none',
              color: isFavorite ? '#fbbf24' : 'var(--text-secondary)',
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
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <StarIcon size={15} filled={isFavorite} />
          </button>

          {/* Copilote IA (Ghostwriter Ollama) */}
          {onToggleCopilot && (
            <button
              onClick={onToggleCopilot}
              title={isCopilotEnabled ? "Copilote IA actif (complétion Tab en arrière-plan)" : "Activer le Copilote IA inline"}
              style={{
                background: isCopilotEnabled ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                border: isCopilotEnabled ? '1px solid rgba(56, 189, 248, 0.4)' : 'none',
                color: isCopilotEnabled ? '#38bdf8' : 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '4px 7px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                height: '28px',
                fontSize: '11px',
                fontWeight: 600,
                boxSizing: 'border-box',
                transition: 'all 0.15s'
              }}
            >
              <span>🤖</span>
              <span>IA</span>
            </button>
          )}

          {/* Colorier le code (spans k/t/f/s/n/c) */}
          {onHighlightCode && (
            <button
              onClick={onHighlightCode}
              title="Colorier les blocs de code (Highlight.js avec thème)"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
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
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <span style={{ fontSize: '14px' }}>🎨</span>
            </button>
          )}

          {/* Time Travel / Historique des versions */}
          {onOpenHistory && (
            <button
              onClick={onOpenHistory}
              title="Historique des versions (Time Travel & Diffs)"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
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
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <span style={{ fontSize: '14px' }}>⏳</span>
            </button>
          )}

          {/* Centrage Typewriter */}
          {onToggleTypewriterMode && (
            <button
              onClick={onToggleTypewriterMode}
              title={isTypewriterMode ? "Désactiver le centrage machine à écrire" : "Activer le centrage machine à écrire (Typewriter)"}
              style={{
                background: isTypewriterMode ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                border: isTypewriterMode ? '1px solid rgba(56, 189, 248, 0.4)' : 'none',
                color: isTypewriterMode ? '#38bdf8' : 'var(--text-secondary)',
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
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = isTypewriterMode ? 'rgba(56, 189, 248, 0.15)' : 'transparent')}
            >
              <span style={{ fontSize: '13px' }}>🎯</span>
            </button>
          )}

          {/* Mode Zen / Focus */}
          {onToggleZenMode && (
            <button
              onClick={onToggleZenMode}
              title={isZenMode ? "Quitter le Mode Zen" : "Mode Focus / Zen (Ctrl+Shift+Z)"}
              style={{
                background: isZenMode ? 'rgba(168, 85, 247, 0.15)' : 'transparent',
                border: isZenMode ? '1px solid rgba(168, 85, 247, 0.4)' : 'none',
                color: isZenMode ? '#c084fc' : 'var(--text-secondary)',
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
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = isZenMode ? 'rgba(168, 85, 247, 0.15)' : 'transparent')}
            >
              <span style={{ fontSize: '14px' }}>🧘</span>
            </button>
          )}

          {/* Exporter (PDF, Word, HTML) */}
          {onOpenExport && (
            <button
              onClick={onOpenExport}
              title="Exporter la note (PDF, Word, HTML)"
              style={{
                background: 'rgba(56, 189, 248, 0.1)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                color: '#38bdf8',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                height: '28px',
                fontSize: '11px',
                fontWeight: 600,
                boxSizing: 'border-box',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.2)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.1)')}
            >
              <span>🚀</span>
              <span>Export</span>
            </button>
          )}

          {/* Share / Export Menu */}
          <div style={{ position: 'relative' }} ref={shareMenuRef}>
            <button
              onClick={() => {
                setShareMenuOpen(!shareMenuOpen)
                setMoreMenuOpen(false)
              }}
              title="Partager / Exporter"
              style={{
                background: shareMenuOpen ? 'var(--element-bg)' : 'transparent',
                border: 'none',
                color: shareMenuOpen ? '#ffffff' : 'var(--text-secondary)',
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
                if (!shareMenuOpen) e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <ShareIcon size={15} />
            </button>

            {shareMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '34px',
                  right: '0',
                  width: '210px',
                  backgroundColor: '#18181b',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '10px',
                  padding: '5px',
                  boxShadow: '0 14px 35px -5px rgba(0, 0, 0, 0.75)',
                  zIndex: 1000,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px'
                }}
              >
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(noteContent || '')
                    triggerToast('Contenu Markdown copié !')
                    setShareMenuOpen(false)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: 'transparent',
                    border: 'none',
                    color: '#e4e4e7',
                    fontSize: '12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background-color 0.12s'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#27272a')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <CopyIcon size={13} style={{ color: '#38bdf8' }} />
                  <span>Copier le Markdown</span>
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(currentFilePath)
                    triggerToast('Chemin d\'accès copié !')
                    setShareMenuOpen(false)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: 'transparent',
                    border: 'none',
                    color: '#e4e4e7',
                    fontSize: '12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background-color 0.12s'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#27272a')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <FileTextIcon size={13} style={{ color: '#a1a1aa' }} />
                  <span>Copier le chemin</span>
                </button>
                <button
                  onClick={() => {
                    const blob = new Blob([noteContent || ''], { type: 'text/markdown;charset=utf-8' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = fileName.endsWith('.md') ? fileName : `${fileName}.md`
                    a.click()
                    URL.revokeObjectURL(url)
                    triggerToast('Fichier exporté !')
                    setShareMenuOpen(false)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: 'transparent',
                    border: 'none',
                    color: '#e4e4e7',
                    fontSize: '12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background-color 0.12s'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#27272a')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <ShareIcon size={13} style={{ color: '#4ade80' }} />
                  <span>Exporter le fichier brut</span>
                </button>
                {onOpenExport && (
                  <button
                    onClick={() => {
                      setShareMenuOpen(false)
                      onOpenExport()
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'rgba(56, 189, 248, 0.1)',
                      border: 'none',
                      color: '#38bdf8',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background-color 0.12s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.1)')}
                  >
                    <span>🚀</span>
                    <span>Exporter (PDF, Word, HTML)...</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* More actions Menu */}
          <div style={{ position: 'relative' }} ref={moreMenuRef}>
            <button
              onClick={() => {
                setMoreMenuOpen(!moreMenuOpen)
                setShareMenuOpen(false)
              }}
              title="Plus d'actions"
              style={{
                background: moreMenuOpen ? 'var(--element-bg)' : 'transparent',
                border: 'none',
                color: moreMenuOpen ? '#ffffff' : 'var(--text-secondary)',
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
                style={{
                  position: 'absolute',
                  top: '34px',
                  right: '0',
                  width: '220px',
                  backgroundColor: '#18181b',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '10px',
                  padding: '5px',
                  boxShadow: '0 14px 35px -5px rgba(0, 0, 0, 0.75)',
                  zIndex: 1000,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px'
                }}
              >
                {/* Stats row */}
                <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: '4px' }}>
                  <div style={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Statistiques</div>
                  <div style={{ fontSize: '12px', color: '#e4e4e7', marginTop: '3px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{(noteContent || '').trim() ? (noteContent || '').trim().split(/\s+/).length : 0} mots</span>
                    <span style={{ color: '#71717a' }}>•</span>
                    <span>{(noteContent || '').length} caractères</span>
                  </div>
                </div>


                <button
                  onClick={() => {
                    onToggleFavorite()
                    setMoreMenuOpen(false)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: 'transparent',
                    border: 'none',
                    color: '#e4e4e7',
                    fontSize: '12px',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#27272a')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <StarIcon size={13} filled={isFavorite} style={{ color: isFavorite ? '#fbbf24' : '#a1a1aa' }} />
                  <span>{isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}</span>
                </button>

                {onDeleteNote && (
                  <button
                    onClick={() => {
                      setMoreMenuOpen(false)
                      onDeleteNote()
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'transparent',
                      border: 'none',
                      color: '#ef4444',
                      fontSize: '12px',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.12)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <TrashIcon size={13} style={{ color: '#ef4444' }} />
                    <span>Supprimer la note</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Assistant AI Toggle - Dynamic Branding */}
          {(() => {
            const aiData = {
              agent: { name: 'Agent IA', color: '#10b981', icon: <SparklesIcon size={15} color="#10b981" /> },
              claude: { name: 'Claude', color: '#D97757', icon: <ClaudeIcon size={15} color="#D97757" /> },
              chatgpt: { name: 'ChatGPT', color: '#ffffff', icon: <ChatGPTIcon size={15} style={{ color: '#ffffff' }} /> },
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
                  color: '#ffffff',
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
                <span style={{ color: '#ffffff', letterSpacing: '0.2px' }}>{aiData.name}</span>
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

          {/* User Profile Avatar - Clickable */}
          <div
            onClick={onOpenSettings}
            title="Paramètres / Profil"
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #d97706, #b45309)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
              transition: 'transform 0.15s ease, opacity 0.15s',
              boxSizing: 'border-box',
              flexShrink: 0
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.85'
              e.currentTarget.style.transform = 'scale(1.05)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1'
              e.currentTarget.style.transform = 'scale(1)'
            }}
          >
            AU
          </div>
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
                    backgroundColor: '#18181b',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
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
                        color: col.id === workflowStatus ? '#ffffff' : '#a1a1aa',
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
                color: '#fff',
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
                border: '1px dashed rgba(255, 255, 255, 0.15)',
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
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)'
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
