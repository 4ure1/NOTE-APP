import React, { useState, useEffect, useRef } from 'react'
import { TreeNode } from '../types'
import {
  FolderIcon,
  FolderOpenIcon,
  ChevronRight,
  ChevronDown,
  PlusIcon,
  SearchIcon,
  ClockIcon,
  TrashIcon,
  DraftsIcon,
  PinIcon,
  SettingsIcon,
  HelpCircleIcon,
  SidebarToggleIcon,
  FolderPlusIcon,
  KanbanIcon,
  HtmlIcon,
  MarkdownIcon,
  SparklesIcon,
  ClaudeIcon,
  ChatGPTIcon,
  GeminiIcon,
  PdfIcon,
  YouTubeIcon,
  ColumnsIcon,
  getFileIcon
} from './Icons'

interface SidebarProps {
  onSelectFiles: (files: string[]) => void
  selectedFiles: string[]
  files: string[]
  fetchFiles: () => void
  treeNodes?: TreeNode[]
  activeAI?: 'agent' | 'claude' | 'chatgpt' | 'gemini'
  onSelectAI?: (ai: 'agent' | 'claude' | 'chatgpt' | 'gemini') => void
  
  editingFile: string | null
  setEditingFile: (file: string | null) => void
  editValue: string
  setEditValue: (val: string) => void
  
  onDeleteNotes: (files: string[]) => void
  onCreateNote: (parentFolder?: string, title?: string, templateType?: 'html' | 'md') => void
  onCreateFolder?: (parentFolder: string, name: string) => void
  submitRename: () => void
  
  favorites?: string[]
  onToggleFavorite?: (filePath: string) => void
  
  activeView?: 'all' | 'drafts' | 'deleted' | 'workflow' | 'recent' | 'youtube'
  setActiveView?: (view: 'all' | 'drafts' | 'deleted' | 'workflow' | 'recent' | 'youtube') => void
  
  deletedCount?: number
  draftsCount?: number
  onEmptyTrash?: () => void
  
  onOpenSettings?: () => void
  onOpenSearch?: () => void
  onToggleSidebar?: () => void
  
  width?: number
  onMoveItem?: (sourcePath: string, targetFolderPath: string) => void
  onOpenSideBySide?: (filePath: string) => void
  onOpenNewSession?: (folderPath: string) => void
}

export default function Sidebar({
  onSelectFiles,
  selectedFiles,
  onOpenSideBySide,
  files: _files,
  fetchFiles,
  treeNodes = [],
  editingFile,
  setEditingFile,
  editValue,
  setEditValue,
  onDeleteNotes,
  onCreateNote,
  onCreateFolder,
  submitRename,
  favorites = [],
  onToggleFavorite,
  activeView = 'all',
  setActiveView,
  deletedCount = 0,
  draftsCount = 0,
  onEmptyTrash,
  onOpenSettings,
  onOpenSearch,
  onToggleSidebar,
  activeAI = 'claude',
  onSelectAI,
  width = 260,
  onMoveItem,
  onOpenNewSession
}: SidebarProps) {
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('sidebar_open_folders')
      if (saved) return JSON.parse(saved)
    } catch {}
    return {}
  })

  useEffect(() => {
    try {
      localStorage.setItem('sidebar_open_folders', JSON.stringify(openFolders))
    } catch {}
  }, [openFolders])

  // Assurer que le dossier parent de la note actuellement ouverte est déplié
  useEffect(() => {
    if (selectedFiles.length > 0 && selectedFiles[0]) {
      const parts = selectedFiles[0].split('/')
      if (parts.length > 1) {
        setOpenFolders((prev) => {
          let updated = false
          const next = { ...prev }
          let current = ''
          for (let i = 0; i < parts.length - 1; i++) {
            current = current ? `${current}/${parts[i]}` : parts[i]
            if (!next[current]) {
              next[current] = true
              updated = true
            }
          }
          return updated ? next : prev
        })
      }
    }
  }, [selectedFiles])

  const [favouritesOpen, setFavouritesOpen] = useState(true)
  const [foldersOpen, setFoldersOpen] = useState(true)
  
  // Creation modal/inline input
  const [creatingInFolder, setCreatingInFolder] = useState<{ parentPath: string; type: 'file' | 'folder' } | null>(null)
  const [newItemName, setNewItemName] = useState('')
  const creationInputRef = useRef<HTMLInputElement>(null)

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; itemPath: string; isFolder: boolean } | null>(null)

  // Drag & drop state
  const [draggingPath, setDraggingPath] = useState<string | null>(null)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null)
    window.addEventListener('click', handleClickOutside)
    return () => window.removeEventListener('click', handleClickOutside)
  }, [])

  useEffect(() => {
    if (creatingInFolder && creationInputRef.current) {
      creationInputRef.current.focus()
    }
  }, [creatingInFolder])

  const toggleFolder = (path: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setOpenFolders((prev) => ({ ...prev, [path]: !prev[path] }))
  }

  const handleStartCreate = (parentPath: string, type: 'file' | 'folder', e: React.MouseEvent) => {
    e.stopPropagation()
    // Open parent folder if closed
    if (parentPath) {
      setOpenFolders((prev) => ({ ...prev, [parentPath]: true }))
    }
    setCreatingInFolder({ parentPath, type })
    setNewItemName('')
  }

  // Detect the template type from the typed name
  const detectTemplateType = (name: string): 'html' | 'md' => {
    const lower = name.toLowerCase()
    if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html'
    return 'md'
  }

  const handleFinishCreate = async () => {
    if (!creatingInFolder) return
    const name = newItemName.trim()
    if (name) {
      if (creatingInFolder.type === 'folder' && onCreateFolder) {
        await onCreateFolder(creatingInFolder.parentPath, name)
      } else {
        const templateType = detectTemplateType(name)
        await onCreateNote(creatingInFolder.parentPath, name, templateType)
      }
    }
    setCreatingInFolder(null)
    setNewItemName('')
  }

  const fileInputRef = useRef<HTMLInputElement>(null)
  const currentTargetFolderRef = useRef<string>('')

  // Importer un ou des fichiers PDF
  const handleImportPdf = async (targetFolder = '') => {
    currentTargetFolderRef.current = targetFolder
    if (window.api?.importPdfDialog) {
      try {
        const imported = await window.api.importPdfDialog(targetFolder)
        if (imported && imported.length > 0) {
          fetchFiles()
          onSelectFiles([imported[0]])
          if (targetFolder) {
            setOpenFolders((prev) => ({ ...prev, [targetFolder]: true }))
          }
          return
        }
      } catch (err) {
        console.warn('Native dialog failed, fallback to file input:', err)
        fileInputRef.current?.click()
        return
      }
    } else {
      fileInputRef.current?.click()
    }
  }

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const targetFolder = currentTargetFolderRef.current || ''
    const importedList: string[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const filePath = (file as any).path
      if (filePath && window.api?.importFileFromPath) {
        const rel = await window.api.importFileFromPath(filePath, targetFolder)
        if (rel) importedList.push(rel)
      } else if (window.api?.savePdfBinary) {
        const buffer = await file.arrayBuffer()
        const rel = await window.api.savePdfBinary(file.name, buffer, targetFolder)
        if (rel) importedList.push(rel)
      }
    }

    if (importedList.length > 0) {
      fetchFiles()
      onSelectFiles([importedList[0]])
      if (targetFolder) {
        setOpenFolders((prev) => ({ ...prev, [targetFolder]: true }))
      }
    }
    e.target.value = ''
  }

  // Recursive tree renderer
  const renderTree = (nodes: TreeNode[], depth = 0) => {
    return nodes.map((node) => {
      const isFolder = node.type === 'folder'
      const isOpen = !!openFolders[node.relativePath]
      const isSelected = selectedFiles.includes(node.relativePath)
      const isEditing = editingFile === node.relativePath
      const isFav = favorites.includes(node.relativePath)

      return (
        <div key={node.id} style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            className="tree-row"
            draggable
            onDragStart={(e) => {
              e.stopPropagation()
              setDraggingPath(node.relativePath)
              e.dataTransfer.setData('text/plain', node.relativePath)
              e.dataTransfer.setData('application/x-note-path', node.relativePath)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragEnd={() => {
              setDraggingPath(null)
              setDragOverFolder(null)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              e.dataTransfer.dropEffect = 'move'
              const targetFolder = isFolder
                ? node.relativePath
                : (node.relativePath.includes('/') ? node.relativePath.substring(0, node.relativePath.lastIndexOf('/')) : '')
              setDragOverFolder(targetFolder)
            }}
            onDragLeave={(e) => {
              e.stopPropagation()
              if (e.currentTarget.contains(e.relatedTarget as Node)) return
              setDragOverFolder(null)
            }}
            onDrop={async (e) => {
              e.preventDefault()
              e.stopPropagation()
              const targetFolder = isFolder
                ? node.relativePath
                : (node.relativePath.includes('/') ? node.relativePath.substring(0, node.relativePath.lastIndexOf('/')) : '')

              // Glisser-déposer de fichiers externes (ex: PDF depuis Windows Explorer)
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const droppedFiles = Array.from(e.dataTransfer.files)
                let firstImported = ''
                for (const f of droppedFiles) {
                  const srcPath = (f as any).path
                  if (srcPath && window.api?.importFileFromPath) {
                    const importedRel = await window.api.importFileFromPath(srcPath, targetFolder)
                    if (importedRel && !firstImported) {
                      firstImported = importedRel
                    }
                  }
                }
                if (firstImported) {
                  fetchFiles()
                  onSelectFiles([firstImported])
                  if (targetFolder) {
                    setOpenFolders((prev) => ({ ...prev, [targetFolder]: true }))
                  }
                }
                setDraggingPath(null)
                setDragOverFolder(null)
                return
              }

              const source = e.dataTransfer.getData('application/x-note-path') || e.dataTransfer.getData('text/plain') || draggingPath

              if (source && source !== targetFolder) {
                console.log('[Sidebar Move]', source, '->', targetFolder)
                onMoveItem?.(source, targetFolder)
                if (targetFolder) {
                  setOpenFolders((prev) => ({ ...prev, [targetFolder]: true }))
                }
              }
              setDraggingPath(null)
              setDragOverFolder(null)
            }}
            onClick={(e) => {
              if (isFolder) {
                toggleFolder(node.relativePath, e)
              } else {
                if (setActiveView) setActiveView('all')
                onSelectFiles([node.relativePath])
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                itemPath: node.relativePath,
                isFolder
              })
              if (!isFolder) {
                onSelectFiles([node.relativePath])
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              paddingLeft: `${14 + depth * 14}px`,
              paddingRight: '10px',
              paddingTop: '5px',
              paddingBottom: '5px',
              margin: '1px 6px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              color: isSelected ? '#ffffff' : isFolder ? '#d1d5db' : '#9ca3af',
              backgroundColor: isFolder && dragOverFolder === node.relativePath
                ? 'rgba(56, 189, 248, 0.15)'
                : isSelected ? 'var(--element-active)' : 'transparent',
              fontWeight: isSelected ? 500 : 400,
              boxShadow: isFolder && dragOverFolder === node.relativePath
                ? '0 0 10px rgba(56, 189, 248, 0.3)'
                : isSelected ? '0 1px 4px rgba(0, 0, 0, 0.25)' : 'none',
              border: isFolder && dragOverFolder === node.relativePath
                ? '1px solid #38bdf8'
                : '1px solid transparent',
              transition: 'background-color 0.15s, color 0.15s, border-color 0.1s',
              opacity: draggingPath === node.relativePath ? 0.35 : 1,
              ...({ WebkitUserDrag: 'element' } as React.CSSProperties)
            }}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.backgroundColor = 'var(--element-bg)'
                e.currentTarget.style.color = '#e5e7eb'
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = isFolder ? '#d1d5db' : '#9ca3af'
              }
            }}
          >
            {/* Folder chevron */}
            {isFolder ? (
              <span
                onClick={(e) => toggleFolder(node.relativePath, e)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  marginRight: '6px',
                  opacity: 0.7,
                  cursor: 'pointer'
                }}
              >
                {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </span>
            ) : (
              <span style={{ width: '13px', marginRight: '6px' }} />
            )}

            {/* Icon */}
            <span style={{ display: 'inline-flex', alignItems: 'center', marginRight: '7px', color: isSelected ? '#ffffff' : '#9ca3af' }}>
              {isFolder ? (
                node.name.toLowerCase().includes('equal') ? (
                  <span style={{ color: '#4ade80', display: 'inline-flex', alignItems: 'center' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="#4ade80" stroke="#4ade80" strokeWidth="2">
                      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                    </svg>
                  </span>
                ) : (
                  isOpen ? <FolderOpenIcon size={14} style={{ color: '#e0af68' }} /> : <FolderIcon size={14} style={{ color: '#e0af68' }} />
                )
              ) : (
                getFileIcon(node.name, 14, isSelected)
              )}
            </span>

            {/* Name or Inline Edit */}
            {isEditing ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={submitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitRename()
                  if (e.key === 'Escape') setEditingFile(null)
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  flex: 1,
                  background: 'var(--element-bg-hover)',
                  border: '1px solid var(--accent-color)',
                  color: '#fff',
                  borderRadius: '4px',
                  padding: '1px 5px',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
            ) : (
              <span
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {isFolder ? node.name : node.name.replace(/\.(html|htm|md)$/i, '')}
              </span>
            )}

            {/* Action buttons on hover */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              {isFolder && (
                <>
                  {onOpenNewSession && (
                    <button
                      className="tree-action-btn"
                      title="Nouvelle séance de cours"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenNewSession(node.relativePath)
                      }}
                    >
                      <span style={{ fontSize: '11px', lineHeight: 1 }}>🎓</span>
                    </button>
                  )}
                  <button
                    className="tree-action-btn"
                    title="Nouvelle note dans ce dossier"
                    onClick={(e) => handleStartCreate(node.relativePath, 'file', e)}
                  >
                    <PlusIcon size={12} />
                  </button>
                  <button
                    className="tree-action-btn"
                    title="Nouveau sous-dossier"
                    onClick={(e) => handleStartCreate(node.relativePath, 'folder', e)}
                  >
                    <FolderPlusIcon size={12} />
                  </button>
                </>
              )}
              {!isFolder && onToggleFavorite && (
                <button
                  className="tree-action-btn"
                  title={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  style={{ opacity: isFav ? 1 : undefined, color: isFav ? 'var(--accent-color)' : undefined }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleFavorite(node.relativePath)
                  }}
                >
                  <PinIcon size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Child nodes */}
          {isFolder && isOpen && (
            <div>
              {/* If inline creating in this folder */}
              {creatingInFolder?.parentPath === node.relativePath && (
                <div style={{ display: 'flex', alignItems: 'center', paddingLeft: `${14 + (depth + 1) * 14}px`, margin: '3px 8px' }}>
                  {creatingInFolder!.type === 'folder' ? (
                    <FolderIcon size={13} style={{ marginRight: '6px', flexShrink: 0 }} />
                  ) : detectTemplateType(newItemName) === 'html' ? (
                    <HtmlIcon size={13} style={{ marginRight: '6px', flexShrink: 0, color: '#e34f26' }} />
                  ) : (
                    <MarkdownIcon size={13} style={{ marginRight: '6px', flexShrink: 0 }} />
                  )}
                  <input
                    ref={creationInputRef}
                    placeholder={creatingInFolder!.type === 'folder' ? 'Nom du dossier...' : 'nom.html ou nom (→.md)'}
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    onBlur={handleFinishCreate}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleFinishCreate()
                      if (e.key === 'Escape') setCreatingInFolder(null)
                    }}
                    style={{
                      flex: 1,
                      background: 'var(--element-bg)',
                      border: `1px solid ${detectTemplateType(newItemName) === 'html' && newItemName ? '#e34f26' : 'var(--accent-color)'}`,
                      color: '#fff',
                      borderRadius: '4px',
                      padding: '2px 6px',
                      fontSize: '12px',
                      outline: 'none'
                    }}
                  />
                </div>
              )}
              {node.children && renderTree(node.children, depth + 1)}
            </div>
          )}
        </div>
      )
    })
  }

  return (
    <aside
      style={{
        width: `${width}px`,
        minWidth: `${width}px`,
        backgroundColor: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        userSelect: 'none',
        overflow: 'hidden'
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />
      {/* Top Window Dots & Toggle Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px 10px 16px',
          borderBottom: '1px solid var(--border-subtle)'
        }}
      >
        {/* Sélecteur d'IA : Agent, Claude, ChatGPT, Gemini */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          {/* Agent IA */}
          <button
            onClick={() => onSelectAI?.('agent')}
            title="Activer l'Agent IA"
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              border: activeAI === 'agent' ? '1px solid rgba(16, 185, 129, 0.45)' : '1px solid transparent',
              backgroundColor: activeAI === 'agent' ? 'rgba(16, 185, 129, 0.16)' : 'transparent',
              color: activeAI === 'agent' ? '#34d399' : '#71717a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              if (activeAI !== 'agent') {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'
                e.currentTarget.style.color = '#34d399'
              }
            }}
            onMouseLeave={(e) => {
              if (activeAI !== 'agent') {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = '#71717a'
              }
            }}
          >
            <SparklesIcon size={13} color={activeAI === 'agent' ? '#34d399' : 'currentColor'} />
          </button>

          {/* Claude */}
          <button
            onClick={() => onSelectAI?.('claude')}
            title="Activer Claude"
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              border: activeAI === 'claude' ? '1px solid rgba(217, 119, 87, 0.45)' : '1px solid transparent',
              backgroundColor: activeAI === 'claude' ? 'rgba(217, 119, 87, 0.16)' : 'transparent',
              color: activeAI === 'claude' ? '#D97757' : '#71717a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              if (activeAI !== 'claude') {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'
                e.currentTarget.style.color = '#D97757'
              }
            }}
            onMouseLeave={(e) => {
              if (activeAI !== 'claude') {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = '#71717a'
              }
            }}
          >
            <ClaudeIcon size={13} />
          </button>

          {/* ChatGPT */}
          <button
            onClick={() => onSelectAI?.('chatgpt')}
            title="Activer ChatGPT"
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              border: activeAI === 'chatgpt' ? '1px solid rgba(255, 255, 255, 0.45)' : '1px solid transparent',
              backgroundColor: activeAI === 'chatgpt' ? 'rgba(255, 255, 255, 0.16)' : 'transparent',
              color: activeAI === 'chatgpt' ? '#ffffff' : '#71717a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              if (activeAI !== 'chatgpt') {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'
                e.currentTarget.style.color = '#ffffff'
              }
            }}
            onMouseLeave={(e) => {
              if (activeAI !== 'chatgpt') {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = '#71717a'
              }
            }}
          >
            <ChatGPTIcon size={13} />
          </button>

          {/* Gemini */}
          <button
            onClick={() => onSelectAI?.('gemini')}
            title="Activer Gemini"
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              border: activeAI === 'gemini' ? '1px solid rgba(66, 133, 244, 0.45)' : '1px solid transparent',
              backgroundColor: activeAI === 'gemini' ? 'rgba(66, 133, 244, 0.16)' : 'transparent',
              color: activeAI === 'gemini' ? '#4285f4' : '#71717a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              if (activeAI !== 'gemini') {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'
                e.currentTarget.style.color = '#4285f4'
              }
            }}
            onMouseLeave={(e) => {
              if (activeAI !== 'gemini') {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = '#71717a'
              }
            }}
          >
            <GeminiIcon size={13} />
          </button>
        </div>

        {/* Sidebar Toggle button */}
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            title="Masquer la barre latérale (Ctrl+B)"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            <SidebarToggleIcon size={16} />
          </button>
        )}
      </div>

      {/* Main scrollable navigation body */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '10px 6px' }}>
        
        {/* Quick Action Buttons with Shortcuts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '14px' }}>
          <button
            onClick={(e) => handleStartCreate('', 'file', e)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 10px',
              borderRadius: '6px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'background-color 0.15s'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--element-bg)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <PlusIcon size={15} style={{ color: 'var(--accent-color)' }} />
              <span>New Note</span>
            </span>
            <kbd>Ctrl+N</kbd>
          </button>

          <button
            onClick={() => handleImportPdf('')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 10px',
              borderRadius: '6px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'background-color 0.15s'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--element-bg)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <PdfIcon size={15} />
              <span>Importer un PDF</span>
            </span>
          </button>

          <button
            onClick={onOpenSearch}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 10px',
              borderRadius: '6px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'background-color 0.15s'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--element-bg)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <SearchIcon size={15} style={{ color: 'var(--text-secondary)' }} />
              <span>Search</span>
            </span>
            <kbd>Ctrl+S</kbd>
          </button>

          <button
            onClick={() => setActiveView && setActiveView(activeView === 'recent' ? 'all' : 'recent')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 10px',
              borderRadius: '6px',
              background: activeView === 'recent' ? 'var(--element-active)' : 'transparent',
              border: 'none',
              color: activeView === 'recent' ? '#fff' : 'var(--text-primary)',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'background-color 0.15s'
            }}
            onMouseEnter={(e) => {
              if (activeView !== 'recent') e.currentTarget.style.backgroundColor = 'var(--element-bg)'
            }}
            onMouseLeave={(e) => {
              if (activeView !== 'recent') e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ClockIcon size={15} style={{ color: activeView === 'recent' ? '#38bdf8' : 'var(--text-secondary)' }} />
              <span>Recent</span>
            </span>
            <kbd>Ctrl+R</kbd>
          </button>
        </div>

        {/* System Views (Workflow, Drafts, Deleted) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '18px', paddingBottom: '12px', borderBottom: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => setActiveView && setActiveView('workflow')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              borderRadius: '6px',
              background: activeView === 'workflow' ? 'var(--element-active)' : 'transparent',
              border: 'none',
              color: activeView === 'workflow' ? '#fff' : 'var(--text-secondary)',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'background-color 0.15s'
            }}
            onMouseEnter={(e) => {
              if (activeView !== 'workflow') e.currentTarget.style.backgroundColor = 'var(--element-bg)'
            }}
            onMouseLeave={(e) => {
              if (activeView !== 'workflow') e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <KanbanIcon size={15} style={{ color: activeView === 'workflow' ? '#38bdf8' : 'inherit' }} />
              <span>Workflow</span>
            </span>
            <span style={{ fontSize: '10px', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.25)', padding: '1px 6px', borderRadius: '10px' }}>
              Board
            </span>
          </button>

          <button
            onClick={() => setActiveView && setActiveView('youtube')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              borderRadius: '6px',
              background: activeView === 'youtube' ? 'var(--element-active)' : 'transparent',
              border: 'none',
              color: activeView === 'youtube' ? '#fff' : 'var(--text-secondary)',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'background-color 0.15s'
            }}
            onMouseEnter={(e) => {
              if (activeView !== 'youtube') e.currentTarget.style.backgroundColor = 'var(--element-bg)'
            }}
            onMouseLeave={(e) => {
              if (activeView !== 'youtube') e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <YouTubeIcon size={16} />
              <span>YouTube</span>
            </span>
            <span style={{ fontSize: '10px', color: '#f87171', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.25)', padding: '1px 6px', borderRadius: '10px' }}>
              Onglets
            </span>
          </button>

          <button
            onClick={() => setActiveView && setActiveView('drafts')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              borderRadius: '6px',
              background: activeView === 'drafts' ? 'var(--element-active)' : 'transparent',
              border: 'none',
              color: activeView === 'drafts' ? '#fff' : 'var(--text-secondary)',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'background-color 0.15s'
            }}
            onMouseEnter={(e) => {
              if (activeView !== 'drafts') e.currentTarget.style.backgroundColor = 'var(--element-bg)'
            }}
            onMouseLeave={(e) => {
              if (activeView !== 'drafts') e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DraftsIcon size={15} />
              <span>Drafts</span>
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--element-bg)', padding: '1px 6px', borderRadius: '10px' }}>
              {draftsCount}
            </span>
          </button>

          <div
            onClick={() => setActiveView && setActiveView('deleted')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              borderRadius: '6px',
              background: activeView === 'deleted' ? 'var(--element-active)' : 'transparent',
              color: activeView === 'deleted' ? '#fff' : 'var(--text-secondary)',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'background-color 0.15s'
            }}
            onMouseEnter={(e) => {
              if (activeView !== 'deleted') e.currentTarget.style.backgroundColor = 'var(--element-bg)'
            }}
            onMouseLeave={(e) => {
              if (activeView !== 'deleted') e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrashIcon size={15} />
              <span>Deleted</span>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {deletedCount > 0 && onEmptyTrash && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onEmptyTrash()
                  }}
                  title="Vider la corbeille"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '11px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#ef4444'
                    e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--text-muted)'
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  Vider
                </button>
              )}
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--element-bg)', padding: '1px 6px', borderRadius: '10px' }}>
                {deletedCount}
              </span>
            </div>
          </div>
        </div>

        {/* Favourites Section */}
        {favorites.length > 0 && (
          <div style={{ marginBottom: '18px' }}>
            <div
              onClick={() => setFavouritesOpen(!favouritesOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                color: 'var(--text-muted)',
                cursor: 'pointer'
              }}
            >
              <span>Favourites</span>
              <span style={{ opacity: 0.7 }}>
                {favouritesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </span>
            </div>

            {favouritesOpen && (
              <div style={{ marginTop: '4px' }}>
                {favorites.map((favPath) => {
                  const isSelected = selectedFiles.includes(favPath)
                  const cleanName = favPath.split('/').pop()?.replace(/\.(html|htm|md|markdown)$/i, '') || favPath

                  return (
                    <div
                      key={favPath}
                      onClick={() => {
                        if (setActiveView) setActiveView('all')
                        onSelectFiles([favPath])
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '5px 10px',
                        margin: '1px 4px',
                        borderRadius: '6px',
                        fontSize: '12.5px',
                        cursor: 'pointer',
                        color: isSelected ? '#fff' : 'var(--text-primary)',
                        backgroundColor: isSelected ? 'var(--element-active)' : 'transparent',
                        transition: 'background-color 0.15s'
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--element-bg)'
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        {getFileIcon(favPath, 13, isSelected)}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {cleanName}
                        </span>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* My Folders Explorer Section */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 8px',
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.6px',
              color: 'var(--text-muted)'
            }}
          >
            <div
              onClick={() => setFoldersOpen(!foldersOpen)}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}
            >
              <span>{foldersOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
              <span>My Folders</span>
            </div>

            {/* Create root file and folder buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <button
                onClick={(e) => handleStartCreate('', 'file', e)}
                title="Nouveau fichier racine (ex: nom.html ou nom.md)"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
              >
                <PlusIcon size={13} />
              </button>

              <button
                onClick={(e) => handleStartCreate('', 'folder', e)}
                title="Nouveau dossier racine"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
              >
                <FolderPlusIcon size={13} />
              </button>

              <button
                onClick={() => handleImportPdf('')}
                title="Importer un fichier PDF"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
              >
                <PdfIcon size={13} />
              </button>
            </div>
          </div>

          {/* Root inline creation input */}
          {creatingInFolder?.parentPath === '' && (
            <div style={{ display: 'flex', alignItems: 'center', padding: '4px 10px', margin: '4px 6px' }}>
              {creatingInFolder.type === 'folder' ? (
                <FolderIcon size={14} style={{ marginRight: '6px', flexShrink: 0 }} />
              ) : detectTemplateType(newItemName) === 'html' ? (
                <HtmlIcon size={14} style={{ marginRight: '6px', flexShrink: 0, color: '#e34f26' }} />
              ) : (
                <MarkdownIcon size={14} style={{ marginRight: '6px', flexShrink: 0 }} />
              )}
              <input
                ref={creationInputRef}
                placeholder={creatingInFolder.type === 'folder' ? 'Nouveau dossier...' : 'nom.html ou nom (→.md)'}
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onBlur={handleFinishCreate}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleFinishCreate()
                  if (e.key === 'Escape') setCreatingInFolder(null)
                }}
                style={{
                  flex: 1,
                  background: 'var(--element-bg)',
                  border: `1px solid ${detectTemplateType(newItemName) === 'html' && newItemName ? '#e34f26' : 'var(--accent-color)'}`,
                  color: '#fff',
                  borderRadius: '4px',
                  padding: '3px 6px',
                  fontSize: '12px',
                  outline: 'none'
                }}
              />
            </div>
          )}

          {foldersOpen && (
            <div style={{ marginTop: '4px' }}>
              {treeNodes.length > 0 ? (
                renderTree(treeNodes)
              ) : (
                <div style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  Aucune note trouvée.
                </div>
              )}

              {/* Dedicated Root Drop Target when dragging */}
              {draggingPath && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    e.dataTransfer.dropEffect = 'move'
                    setDragOverFolder('')
                  }}
                  onDragLeave={(e) => {
                    e.stopPropagation()
                    if (e.currentTarget.contains(e.relatedTarget as Node)) return
                    setDragOverFolder(null)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const source = e.dataTransfer.getData('application/x-note-path') || e.dataTransfer.getData('text/plain') || draggingPath
                    if (source) {
                      console.log('[Sidebar Move to Root]', source)
                      onMoveItem?.(source, '')
                    }
                    setDraggingPath(null)
                    setDragOverFolder(null)
                  }}
                  style={{
                    margin: '8px 10px',
                    padding: '8px',
                    border: dragOverFolder === '' ? '1.5px dashed #38bdf8' : '1px dashed rgba(255, 255, 255, 0.15)',
                    backgroundColor: dragOverFolder === '' ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                    borderRadius: '6px',
                    textAlign: 'center',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: dragOverFolder === '' ? '#38bdf8' : 'var(--text-muted)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Déposer ici pour déplacer à la racine
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Pinned Bottom Footer (Settings & Help) */}
      <div
        style={{
          borderTop: '1px solid var(--border-subtle)',
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px'
        }}
      >
        <button
          onClick={onOpenSettings}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '7px 10px',
            borderRadius: '6px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: '13px',
            cursor: 'pointer',
            textAlign: 'left'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--element-bg)'
            e.currentTarget.style.color = '#fff'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
        >
          <SettingsIcon size={15} />
          <span>Settings</span>
        </button>

        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '7px 10px',
            borderRadius: '6px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: '13px',
            cursor: 'pointer',
            textAlign: 'left'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--element-bg)'
            e.currentTarget.style.color = '#fff'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
        >
          <HelpCircleIcon size={15} />
          <span>Help & Support</span>
        </button>
      </div>

      {/* Context Menu for right-click on tree item */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            top: `${contextMenu.y}px`,
            left: `${contextMenu.x}px`,
            backgroundColor: '#202020',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '4px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
            zIndex: 99999,
            minWidth: '150px'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.isFolder && (
            <>
              <div
                style={{
                  padding: '6px 10px',
                  fontSize: '12.5px',
                  color: '#e5e7eb',
                  cursor: 'pointer',
                  borderRadius: '4px'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--element-bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                onClick={() => {
                  handleImportPdf(contextMenu.itemPath)
                  setContextMenu(null)
                }}
              >
                Importer un PDF ici
              </div>
              {onOpenNewSession && (
                <div
                  style={{
                    padding: '6px 10px',
                    fontSize: '12.5px',
                    color: '#38bdf8',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 500
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.15)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  onClick={() => {
                    onOpenNewSession(contextMenu.itemPath)
                    setContextMenu(null)
                  }}
                >
                  <span>🎓</span>
                  <span>Nouvelle séance...</span>
                </div>
              )}
              <div
                style={{
                  padding: '6px 10px',
                  fontSize: '12.5px',
                  color: '#e5e7eb',
                  cursor: 'pointer',
                  borderRadius: '4px'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--element-bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                onClick={(e) => {
                  handleStartCreate(contextMenu.itemPath, 'file', e)
                  setContextMenu(null)
                }}
              >
                Nouveau fichier
              </div>
              <div
                style={{
                  padding: '6px 10px',
                  fontSize: '12.5px',
                  color: '#e5e7eb',
                  cursor: 'pointer',
                  borderRadius: '4px'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--element-bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                onClick={(e) => {
                  handleStartCreate(contextMenu.itemPath, 'folder', e)
                  setContextMenu(null)
                }}
              >
                Nouveau dossier
              </div>
            </>
          )}

          {!contextMenu.isFolder && contextMenu.itemPath.toLowerCase().endsWith('.pdf') && (
            <>
              <div
                style={{
                  padding: '6px 10px',
                  fontSize: '12.5px',
                  color: '#e5e7eb',
                  cursor: 'pointer',
                  borderRadius: '4px'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--element-bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                onClick={() => {
                  if (window.api?.openInBrowser) window.api.openInBrowser(contextMenu.itemPath)
                  setContextMenu(null)
                }}
              >
                Ouvrir en externe
              </div>
              <div
                style={{
                  padding: '6px 10px',
                  fontSize: '12.5px',
                  color: '#e5e7eb',
                  cursor: 'pointer',
                  borderRadius: '4px'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--element-bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                onClick={() => {
                  if (window.api?.showItemInFolder) window.api.showItemInFolder(contextMenu.itemPath)
                  setContextMenu(null)
                }}
              >
                Afficher dans le dossier
              </div>
            </>
          )}

          {!contextMenu.isFolder && (
            <div
              style={{
                padding: '6px 10px',
                fontSize: '12.5px',
                color: '#e5e7eb',
                cursor: 'pointer',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--element-bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              onClick={() => {
                if (onOpenSideBySide) onOpenSideBySide(contextMenu.itemPath)
                setContextMenu(null)
              }}
            >
              <ColumnsIcon size={13} style={{ color: '#38bdf8' }} />
              <span>Ouvrir côte à côte</span>
            </div>
          )}

          {!contextMenu.isFolder && (
            <div
              style={{
                padding: '6px 10px',
                fontSize: '12.5px',
                color: '#e5e7eb',
                cursor: 'pointer',
                borderRadius: '4px'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--element-bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              onClick={() => {
                if (onToggleFavorite) onToggleFavorite(contextMenu.itemPath)
                setContextMenu(null)
              }}
            >
              {favorites.includes(contextMenu.itemPath) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            </div>
          )}

          <div
            style={{
              padding: '6px 10px',
              fontSize: '12.5px',
              color: '#e5e7eb',
              cursor: 'pointer',
              borderRadius: '4px'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--element-bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            onClick={() => {
              setEditingFile(contextMenu.itemPath)
              setEditValue(contextMenu.itemPath.split('/').pop()?.replace(/\.(html|htm|md|markdown)$/i, '') || '')
              setContextMenu(null)
            }}
          >
            Renommer
          </div>

          <div
            style={{
              padding: '6px 10px',
              fontSize: '12.5px',
              color: 'var(--danger-color)',
              cursor: 'pointer',
              borderRadius: '4px',
              borderTop: '1px solid var(--border-subtle)',
              marginTop: '4px'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--danger-bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            onClick={() => {
              onDeleteNotes([contextMenu.itemPath])
              setContextMenu(null)
            }}
          >
            Supprimer
          </div>
        </div>
      )}
    </aside>
  )
}