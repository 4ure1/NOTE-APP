import React, { useState, useEffect, useRef } from 'react'
import { TreeNode } from '../types'
import { isAccessDenied, notifyApiError } from '../utils/apiError'
import { treeKeyAction } from '../../../shared/treeKeys'
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

// Trait rouge de marge à gauche de la vue active (seul accent de marque de l'interface)
const ACTIVE_MARK = 'inset 3px 0 0 var(--accent-marge)'

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

  // Menu contextuel au clavier : focus sur la première entrée à l'ouverture ; à la fermeture, si le
  // focus est perdu (menu retiré), il revient à la ligne de l'arbre d'où le menu est parti
  const contextMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!contextMenu) return
    const menu = contextMenuRef.current
    menu?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const itemPath = contextMenu.itemPath
    return () => {
      const active = document.activeElement
      if (active && active !== document.body && !menu?.contains(active)) return
      document
        .querySelector<HTMLElement>(`[role="treeitem"][data-path="${CSS.escape(itemPath)}"]`)
        ?.focus()
    }
  }, [contextMenu])

  const handleContextMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    if (items.length === 0) return
    const i = items.indexOf(document.activeElement as HTMLElement)
    let handled = true
    if (e.key === 'ArrowDown') items[(i + 1) % items.length].focus()
    else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length].focus()
    else if (e.key === 'Home') items[0].focus()
    else if (e.key === 'End') items[items.length - 1].focus()
    else if ((e.key === 'Enter' || e.key === ' ') && i >= 0) items[i].click()
    else if (e.key === 'Escape' || e.key === 'Tab') setContextMenu(null)
    else handled = false
    if (handled) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

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

  // Type de la note d'après le nom tapé : HTML par défaut, Markdown seulement pour un nom en .md
  const detectTemplateType = (name: string): 'html' | 'md' => {
    const lower = name.toLowerCase()
    return lower.endsWith('.md') || lower.endsWith('.markdown') ? 'md' : 'html'
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
        // Dossier cible refusé : on l'indique au lieu de basculer sur le sélecteur de fichiers
        if (isAccessDenied(err)) {
          notifyApiError('Import de PDF', err)
          return
        }
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
      try {
        const rel = await window.api.importDroppedFile(file, targetFolder)
        if (rel) importedList.push(rel)
      } catch (err) {
        // Fichier sans chemin disque : un PDF peut encore être enregistré à partir de son contenu
        if (file.name.toLowerCase().endsWith('.pdf') && window.api?.savePdfBinary) {
          try {
            const buffer = await file.arrayBuffer()
            const rel = await window.api.savePdfBinary(file.name, buffer, targetFolder)
            if (rel) importedList.push(rel)
          } catch (fallbackErr) {
            notifyApiError(`Import de « ${file.name} »`, fallbackErr)
          }
        } else {
          notifyApiError(`Import de « ${file.name} »`, err)
        }
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

  // Clavier dans l'arbre (motif ARIA « tree view ») ; la décision est dans src/shared/treeKeys.ts
  const handleTreeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, node: TreeNode): void => {
    if (e.target !== e.currentTarget) return
    const isFolder = node.type === 'folder'
    const isOpen = !!openFolders[node.relativePath]
    const tree = e.currentTarget.closest('[role="tree"]')
    const items = tree ? Array.from(tree.querySelectorAll<HTMLElement>('[role="treeitem"]')) : []
    const slash = node.relativePath.lastIndexOf('/')
    const parentPath = slash > 0 ? node.relativePath.substring(0, slash) : ''
    const action = treeKeyAction(e.key, e.shiftKey, {
      index: items.indexOf(e.currentTarget),
      count: items.length,
      isFolder,
      isOpen,
      hasChildren: !!node.children && node.children.length > 0,
      parentIndex: parentPath ? items.findIndex((el) => el.dataset.path === parentPath) : -1
    })
    if (action.kind === 'none') return
    e.preventDefault()
    e.stopPropagation()

    if (action.kind === 'focus') {
      items[action.index]?.focus()
    } else if (action.kind === 'expand' || action.kind === 'collapse') {
      setOpenFolders((prev) => ({ ...prev, [node.relativePath]: action.kind === 'expand' }))
    } else if (action.kind === 'activate') {
      if (isFolder) {
        setOpenFolders((prev) => ({ ...prev, [node.relativePath]: !prev[node.relativePath] }))
      } else {
        if (setActiveView) setActiveView('all')
        onSelectFiles([node.relativePath])
      }
    } else if (action.kind === 'menu') {
      const rect = e.currentTarget.getBoundingClientRect()
      setContextMenu({ x: rect.left + 24, y: rect.bottom, itemPath: node.relativePath, isFolder })
      if (!isFolder) onSelectFiles([node.relativePath])
    } else if (action.kind === 'rename') {
      setEditingFile(node.relativePath)
      setEditValue(node.name.replace(/\.(html|htm|md|markdown)$/i, ''))
    }
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
        <div key={node.id} role="none" style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            className="tree-row"
            role="treeitem"
            tabIndex={-1}
            data-path={node.relativePath}
            aria-level={depth + 1}
            aria-expanded={isFolder ? isOpen : undefined}
            aria-selected={isSelected}
            onKeyDown={(e) => handleTreeKeyDown(e, node)}
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
                  try {
                    const importedRel = await window.api.importDroppedFile(f, targetFolder)
                    if (importedRel && !firstImported) {
                      firstImported = importedRel
                    }
                  } catch (err) {
                    notifyApiError(`Import de « ${f.name} »`, err)
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
                aria-hidden="true"
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
                aria-label="Nouveau nom"
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
            <div role="group">
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
                    aria-label={
                      creatingInFolder!.type === 'folder'
                        ? 'Nom du nouveau dossier'
                        : 'Nom de la nouvelle note'
                    }
                    placeholder={
                      creatingInFolder!.type === 'folder'
                        ? 'Nom du dossier...'
                        : 'nom (→ .html) ou nom.md'
                    }
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
              <PlusIcon size={15} style={{ color: 'var(--accent-marge)' }} />
              <span>Nouvelle note</span>
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
              <span>Rechercher</span>
            </span>
            <kbd>Ctrl+P</kbd>
          </button>

          <button
            onClick={() => setActiveView && setActiveView(activeView === 'recent' ? 'all' : 'recent')}
            aria-current={activeView === 'recent' ? 'page' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 10px',
              borderRadius: '6px',
              background: activeView === 'recent' ? 'var(--element-active)' : 'transparent',
              boxShadow: activeView === 'recent' ? ACTIVE_MARK : 'none',
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
              <ClockIcon
                size={15}
                style={{
                  color: activeView === 'recent' ? 'var(--accent-marge)' : 'var(--text-secondary)'
                }}
              />
              <span>Récentes</span>
            </span>
            <kbd>Ctrl+R</kbd>
          </button>
        </div>

        {/* System Views (Workflow, Drafts, Deleted) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '18px', paddingBottom: '12px', borderBottom: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => setActiveView && setActiveView('workflow')}
            aria-current={activeView === 'workflow' ? 'page' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              borderRadius: '6px',
              background: activeView === 'workflow' ? 'var(--element-active)' : 'transparent',
              boxShadow: activeView === 'workflow' ? ACTIVE_MARK : 'none',
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
              <KanbanIcon
                size={15}
                style={{ color: activeView === 'workflow' ? 'var(--accent-marge)' : 'inherit' }}
              />
              <span>Tableau</span>
            </span>
          </button>

          <button
            onClick={() => setActiveView && setActiveView('youtube')}
            aria-current={activeView === 'youtube' ? 'page' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              borderRadius: '6px',
              background: activeView === 'youtube' ? 'var(--element-active)' : 'transparent',
              boxShadow: activeView === 'youtube' ? ACTIVE_MARK : 'none',
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
          </button>

          <button
            onClick={() => setActiveView && setActiveView('drafts')}
            aria-current={activeView === 'drafts' ? 'page' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              borderRadius: '6px',
              background: activeView === 'drafts' ? 'var(--element-active)' : 'transparent',
              boxShadow: activeView === 'drafts' ? ACTIVE_MARK : 'none',
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
              <span>Brouillons</span>
            </span>
            {draftsCount > 0 && (
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  background: 'var(--element-bg)',
                  padding: '1px 6px',
                  borderRadius: '10px'
                }}
              >
                {draftsCount}
              </span>
            )}
          </button>

          {/* <div> et non <button> : contient le bouton « Vider » ; rendu accessible au clavier */}
          <div
            role="button"
            tabIndex={0}
            aria-current={activeView === 'deleted' ? 'page' : undefined}
            onClick={() => setActiveView && setActiveView('deleted')}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setActiveView?.('deleted')
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              borderRadius: '6px',
              background: activeView === 'deleted' ? 'var(--element-active)' : 'transparent',
              boxShadow: activeView === 'deleted' ? ACTIVE_MARK : 'none',
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
              <span>Corbeille</span>
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
              {deletedCount > 0 && (
                <span
                  style={{
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    background: 'var(--element-bg)',
                    padding: '1px 6px',
                    borderRadius: '10px'
                  }}
                >
                  {deletedCount}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Favourites Section */}
        {favorites.length > 0 && (
          <div style={{ marginBottom: '18px' }}>
            <div
              role="button"
              tabIndex={0}
              aria-expanded={favouritesOpen}
              onClick={() => setFavouritesOpen(!favouritesOpen)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setFavouritesOpen(!favouritesOpen)
                }
              }}
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
              <span>Favoris</span>
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
                      role="button"
                      tabIndex={0}
                      aria-current={isSelected ? 'true' : undefined}
                      onClick={() => {
                        if (setActiveView) setActiveView('all')
                        onSelectFiles([favPath])
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          if (setActiveView) setActiveView('all')
                          onSelectFiles([favPath])
                        }
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
              role="button"
              tabIndex={0}
              aria-expanded={foldersOpen}
              onClick={() => setFoldersOpen(!foldersOpen)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setFoldersOpen(!foldersOpen)
                }
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}
            >
              <span>{foldersOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
              <span>Mes notes</span>
            </div>

            {/* Create root file and folder buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <button
                onClick={(e) => handleStartCreate('', 'file', e)}
                title="Nouvelle note à la racine (.html par défaut, .md pour du Markdown)"
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
                aria-label={
                  creatingInFolder.type === 'folder'
                    ? 'Nom du nouveau dossier'
                    : 'Nom de la nouvelle note'
                }
                placeholder={
                  creatingInFolder.type === 'folder'
                    ? 'Nouveau dossier...'
                    : 'nom (→ .html) ou nom.md'
                }
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
                // Un seul arrêt de Tab pour tout l'arbre : le focus va à la note sélectionnée (ou à la
                // première ligne), puis les flèches prennent le relais
                <div
                  role="tree"
                  aria-label="Mes notes"
                  tabIndex={0}
                  onFocus={(e) => {
                    if (e.target !== e.currentTarget) return
                    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
                    const rows = Array.from(
                      e.currentTarget.querySelectorAll<HTMLElement>('[role="treeitem"]')
                    )
                    const target =
                      rows.find((el) => el.getAttribute('aria-selected') === 'true') ?? rows[0]
                    target?.focus()
                  }}
                >
                  {renderTree(treeNodes)}
                </div>
              ) : (
                <div style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  Aucune note pour l’instant. Créez-en une avec Ctrl+N ou importez un PDF.
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
          <span>Paramètres</span>
        </button>

        <button
          onClick={() => window.dispatchEvent(new Event('nf-open-tour'))}
          title="Relancer la visite guidée"
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
          <span>Aide</span>
        </button>
      </div>

      {/* Context Menu for right-click on tree item */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          role="menu"
          aria-label={contextMenu.isFolder ? 'Actions du dossier' : 'Actions de la note'}
          onKeyDown={handleContextMenuKeyDown}
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
                role="menuitem"
                tabIndex={-1}
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
                  role="menuitem"
                  tabIndex={-1}
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
                role="menuitem"
                tabIndex={-1}
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
                role="menuitem"
                tabIndex={-1}
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
                role="menuitem"
                tabIndex={-1}
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
                  if (window.api?.openInBrowser) {
                    window.api
                      .openInBrowser(contextMenu.itemPath)
                      .catch((err) => notifyApiError('Ouverture externe', err))
                  }
                  setContextMenu(null)
                }}
              >
                Ouvrir en externe
              </div>
              <div
                role="menuitem"
                tabIndex={-1}
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
                  if (window.api?.showItemInFolder) {
                    window.api
                      .showItemInFolder(contextMenu.itemPath)
                      .catch((err) => notifyApiError("Affichage dans l'Explorateur", err))
                  }
                  setContextMenu(null)
                }}
              >
                Afficher dans le dossier
              </div>
            </>
          )}

          {!contextMenu.isFolder && (
            <div
              role="menuitem"
              tabIndex={-1}
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
              role="menuitem"
              tabIndex={-1}
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
            role="menuitem"
            tabIndex={-1}
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
            role="menuitem"
            tabIndex={-1}
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