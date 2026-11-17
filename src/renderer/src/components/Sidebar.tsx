import React, { useState, useEffect, useMemo, useRef } from 'react'
import { TreeNode } from '../types'
import { isAccessDenied, notifyApiError } from '../utils/apiError'
import { treeKeyAction } from '../../../shared/treeKeys'
import { DEFAULT_TREE_SORT, parseTreeSort, sortTree, type TreeSort } from '../utils/treeSort'
import MoveToModal from './MoveToModal'
import TreeSortMenu from './TreeSortMenu'
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
  PdfIcon,
  YouTubeIcon,
  ColumnsIcon,
  DownloadIcon,
  FileTextIcon,
  CapIcon
} from './Icons'


interface SidebarProps {
  onSelectFiles: (files: string[]) => void
  selectedFiles: string[]
  files: string[]
  fetchFiles: () => void
  treeNodes?: TreeNode[]

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
  width = 260,
  onMoveItem,
  onOpenNewSession
}: SidebarProps) {
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('sidebar_open_folders')
      if (saved) return JSON.parse(saved)
    } catch (err) {
      console.debug('[Sidebar]', err)
    }
    return {}
  })

  useEffect(() => {
    try {
      localStorage.setItem('sidebar_open_folders', JSON.stringify(openFolders))
    } catch (err) {
      console.debug('[Sidebar]', err)
    }
  }, [openFolders])

  // Tri de « Mes notes », retenu d'un lancement à l'autre
  const [treeSort, setTreeSort] = useState<TreeSort>(() => {
    try {
      return parseTreeSort(localStorage.getItem('sidebar_tree_sort'))
    } catch {
      return DEFAULT_TREE_SORT
    }
  })
  const sortedTree = useMemo(() => sortTree(treeNodes, treeSort), [treeNodes, treeSort])

  const handleTreeSortChange = (next: TreeSort): void => {
    setTreeSort(next)
    try {
      localStorage.setItem('sidebar_tree_sort', JSON.stringify(next))
    } catch (err) {
      console.error('[Sidebar] Tri non enregistré', err)
    }
  }

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
  const [moveItemPath, setMoveItemPath] = useState<string | null>(null)

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
              // Couleurs, survol et sélection : .tree-row (main.css) ; seul le dépôt en cours reste ici
              backgroundColor:
                isFolder && dragOverFolder === node.relativePath
                  ? 'color-mix(in srgb, var(--accent-color) 15%, transparent)'
                  : undefined,
              borderColor:
                isFolder && dragOverFolder === node.relativePath
                  ? 'var(--accent-color)'
                  : undefined,
              opacity: draggingPath === node.relativePath ? 0.35 : 1,
              ...({ WebkitUserDrag: 'element' } as React.CSSProperties)
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
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                marginRight: '7px',
                color: 'inherit'
              }}
            >
              {isFolder ? (
                node.name.toLowerCase().includes('equal') ? (
                  <span
                    style={{
                      color: 'var(--success-color)',
                      display: 'inline-flex',
                      alignItems: 'center'
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="#4ade80" stroke="#4ade80" strokeWidth="2">
                      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                    </svg>
                  </span>
                ) : isOpen ? (
                  <FolderOpenIcon size={14} />
                ) : (
                  <FolderIcon size={14} />
                )
              ) : /\.pdf$/i.test(node.name) ? (
                <PdfIcon size={14} />
              ) : (
                <FileTextIcon size={14} />
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
                  color: 'var(--text-strong)',
                  borderRadius: '4px',
                  padding: '1px 5px',
                  fontSize: 'var(--fs-md)',
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
                {isFolder ? node.name : node.name.replace(/\.(html|htm|md|pdf)$/i, '')}
              </span>
            )}
            {/* Type seulement pour les exceptions (les notes sont en HTML par défaut) */}
            {!isFolder && !isEditing && /\.(md|markdown|pdf)$/i.test(node.name) && (
              <span className={'sb-ext' + (/\.pdf$/i.test(node.name) ? ' pdf' : '')}>
                .{node.name.split('.').pop()?.toLowerCase()}
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
                      <CapIcon size={12} />
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
                      color: 'var(--text-strong)',
                      borderRadius: '4px',
                      padding: '2px 6px',
                      fontSize: 'var(--fs-sm)',
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
      {/* En-tête : recherche (Ctrl+P) et masquage de la barre */}
      <div className="sb-head">
        <button
          className="sb-search"
          onClick={onOpenSearch}
          aria-label="Rechercher dans les notes (Ctrl+P)"
        >
          <SearchIcon size={15} />
          <span>Rechercher</span>
          <kbd>Ctrl P</kbd>
        </button>
        {onToggleSidebar && (
          <button
            className="sb-icon-btn"
            onClick={onToggleSidebar}
            title="Masquer la barre latérale (Ctrl+B)"
            aria-label="Masquer la barre latérale"
          >
            <SidebarToggleIcon size={16} />
          </button>
        )}
      </div>

      {/* Corps défilant : création, vues, favoris, arbre */}
      <div className="sb-body">
        <div className="sb-quick">
          <button
            className="sb-btn"
            onClick={(e) => handleStartCreate('', 'file', e)}
            title="Nouvelle note (Ctrl+N)"
          >
            <PlusIcon size={15} />
            Note
          </button>
          <button className="sb-btn" onClick={() => handleImportPdf('')}>
            <DownloadIcon size={15} />
            Importer un PDF
          </button>
        </div>

        {/* Vues */}
        <button
          className="sb-row"
          aria-current={activeView === 'recent' ? 'page' : undefined}
          onClick={() => setActiveView && setActiveView(activeView === 'recent' ? 'all' : 'recent')}
          title="Récentes (Ctrl+R)"
        >
          <ClockIcon size={16} />
          <span className="sb-label">Récentes</span>
        </button>
        <button
          className="sb-row"
          aria-current={activeView === 'drafts' ? 'page' : undefined}
          onClick={() => setActiveView && setActiveView('drafts')}
        >
          <DraftsIcon size={16} />
          <span className="sb-label">Brouillons</span>
          {draftsCount > 0 && <span className="sb-count">{draftsCount}</span>}
        </button>
        <button
          className="sb-row"
          aria-current={activeView === 'workflow' ? 'page' : undefined}
          onClick={() => setActiveView && setActiveView('workflow')}
        >
          <KanbanIcon size={16} />
          <span className="sb-label">Tableau</span>
        </button>
        <button
          className="sb-row"
          aria-current={activeView === 'youtube' ? 'page' : undefined}
          onClick={() => setActiveView && setActiveView('youtube')}
        >
          <YouTubeIcon size={16} />
          <span className="sb-label">YouTube</span>
        </button>

        {/* Favourites Section */}
        {favorites.length > 0 && (
          <div>
            <div className="sb-section">
              <button
                className="sb-section-toggle"
                aria-expanded={favouritesOpen}
                onClick={() => setFavouritesOpen(!favouritesOpen)}
              >
                {favouritesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                Favoris
              </button>
            </div>

            {favouritesOpen && (
              <div>
                {favorites.map((favPath) => {
                  const isSelected = selectedFiles.includes(favPath)
                  const cleanName = favPath.split('/').pop()?.replace(/\.(html|htm|md|markdown)$/i, '') || favPath

                  return (
                    <button
                      key={favPath}
                      className="sb-row"
                      aria-current={isSelected ? 'true' : undefined}
                      onClick={() => {
                        if (setActiveView) setActiveView('all')
                        onSelectFiles([favPath])
                      }}
                    >
                      <PinIcon size={14} />
                      <span className="sb-label">{cleanName}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* My Folders Explorer Section */}
        <div>
          <div className="sb-section">
            <button
              className="sb-section-toggle"
              aria-expanded={foldersOpen}
              onClick={() => setFoldersOpen(!foldersOpen)}
            >
              {foldersOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Mes notes
            </button>
            <TreeSortMenu sort={treeSort} onChange={handleTreeSortChange} />
            <button
              className="sb-icon-btn sm"
              onClick={(e) => handleStartCreate('', 'file', e)}
              title="Nouvelle note à la racine (.html par défaut, .md pour du Markdown)"
              aria-label="Nouvelle note à la racine"
            >
              <PlusIcon size={14} />
            </button>
            <button
              className="sb-icon-btn sm"
              onClick={(e) => handleStartCreate('', 'folder', e)}
              title="Nouveau dossier racine"
              aria-label="Nouveau dossier racine"
            >
              <FolderPlusIcon size={14} />
            </button>
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
                  color: 'var(--text-strong)',
                  borderRadius: '4px',
                  padding: '3px 6px',
                  fontSize: 'var(--fs-sm)',
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
                  {renderTree(sortedTree)}
                </div>
              ) : (
                <div
                  style={{
                    padding: '12px 14px',
                    fontSize: 'var(--fs-sm)',
                    color: 'var(--text-muted)'
                  }}
                >
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
                    border:
                      dragOverFolder === ''
                        ? '1.5px dashed var(--accent-color)'
                        : '1px dashed var(--border-strong)',
                    backgroundColor:
                      dragOverFolder === ''
                        ? 'color-mix(in srgb, var(--accent-color) 12%, transparent)'
                        : 'rgba(255, 255, 255, 0.02)',
                    borderRadius: '6px',
                    textAlign: 'center',
                    fontSize: 'var(--fs-xs)',
                    fontWeight: 500,
                    color: dragOverFolder === '' ? 'var(--accent-color)' : 'var(--text-muted)',
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

      {/* Pied : Corbeille, Paramètres, Aide */}
      <div className="sb-foot">
        {/* <div> et non <button> : contient le bouton « Vider » ; rendu accessible au clavier */}
        <div
          className="sb-row"
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
        >
          <TrashIcon size={16} />
          <span className="sb-label">Corbeille</span>
          {deletedCount > 0 && onEmptyTrash && (
            <button
              type="button"
              className="sb-empty-trash"
              onClick={(e) => {
                e.stopPropagation()
                onEmptyTrash()
              }}
              title="Vider la corbeille"
            >
              Vider
            </button>
          )}
          {deletedCount > 0 && <span className="sb-count">{deletedCount}</span>}
        </div>
        <button className="sb-row" onClick={onOpenSettings}>
          <SettingsIcon size={16} />
          <span className="sb-label">Paramètres</span>
        </button>
        <button
          className="sb-row"
          onClick={() => window.dispatchEvent(new Event('nf-open-tour'))}
          title="Relancer la visite guidée"
        >
          <HelpCircleIcon size={16} />
          <span className="sb-label">Aide</span>
        </button>
      </div>

      {moveItemPath !== null && onMoveItem && (
        <MoveToModal
          itemPath={moveItemPath}
          treeNodes={treeNodes}
          onClose={() => setMoveItemPath(null)}
          onMove={(targetFolder) => {
            setMoveItemPath(null)
            onMoveItem(moveItemPath, targetFolder)
            if (targetFolder) setOpenFolders((prev) => ({ ...prev, [targetFolder]: true }))
          }}
        />
      )}

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
            backgroundColor: 'var(--surface-control)',
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
                className="hv-background-color-element-bg-hover"
                role="menuitem"
                tabIndex={-1}
                style={{
                  padding: '6px 10px',
                  fontSize: 'var(--fs-md)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  borderRadius: '4px'
                }}
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
                    fontSize: 'var(--fs-md)',
                    color: 'var(--accent-color)',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 500
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor =
                      'color-mix(in srgb, var(--accent-color) 15%, transparent)')
                  }
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
                className="hv-background-color-element-bg-hover"
                role="menuitem"
                tabIndex={-1}
                style={{
                  padding: '6px 10px',
                  fontSize: 'var(--fs-md)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  borderRadius: '4px'
                }}
                onClick={(e) => {
                  handleStartCreate(contextMenu.itemPath, 'file', e)
                  setContextMenu(null)
                }}
              >
                Nouveau fichier
              </div>
              <div
                className="hv-background-color-element-bg-hover"
                role="menuitem"
                tabIndex={-1}
                style={{
                  padding: '6px 10px',
                  fontSize: 'var(--fs-md)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  borderRadius: '4px'
                }}
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
                className="hv-background-color-element-bg-hover"
                role="menuitem"
                tabIndex={-1}
                style={{
                  padding: '6px 10px',
                  fontSize: 'var(--fs-md)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  borderRadius: '4px'
                }}
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
                className="hv-background-color-element-bg-hover"
                role="menuitem"
                tabIndex={-1}
                style={{
                  padding: '6px 10px',
                  fontSize: 'var(--fs-md)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  borderRadius: '4px'
                }}
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
              className="hv-background-color-element-bg-hover"
              role="menuitem"
              tabIndex={-1}
              style={{
                padding: '6px 10px',
                fontSize: 'var(--fs-md)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
              onClick={() => {
                if (onOpenSideBySide) onOpenSideBySide(contextMenu.itemPath)
                setContextMenu(null)
              }}
            >
              <ColumnsIcon size={13} style={{ color: 'var(--accent-color)' }} />
              <span>Ouvrir côte à côte</span>
            </div>
          )}

          {!contextMenu.isFolder && (
            <div
              className="hv-background-color-element-bg-hover"
              role="menuitem"
              tabIndex={-1}
              style={{
                padding: '6px 10px',
                fontSize: 'var(--fs-md)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                borderRadius: '4px'
              }}
              onClick={() => {
                if (onToggleFavorite) onToggleFavorite(contextMenu.itemPath)
                setContextMenu(null)
              }}
            >
              {favorites.includes(contextMenu.itemPath) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            </div>
          )}

          <div
            className="hv-background-color-element-bg-hover"
            role="menuitem"
            tabIndex={-1}
            style={{
              padding: '6px 10px',
              fontSize: 'var(--fs-md)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              borderRadius: '4px'
            }}
            onClick={() => {
              setEditingFile(contextMenu.itemPath)
              setEditValue(contextMenu.itemPath.split('/').pop()?.replace(/\.(html|htm|md|markdown)$/i, '') || '')
              setContextMenu(null)
            }}
          >
            Renommer
          </div>

          {onMoveItem && (
            <div
              className="hv-background-color-element-bg-hover"
              role="menuitem"
              tabIndex={-1}
              style={{
                padding: '6px 10px',
                fontSize: 'var(--fs-md)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                borderRadius: '4px'
              }}
              onClick={() => {
                setMoveItemPath(contextMenu.itemPath)
                setContextMenu(null)
              }}
            >
              Déplacer vers…
            </div>
          )}

          <div
            className="hv-background-color-danger-bg-hover"
            role="menuitem"
            tabIndex={-1}
            style={{
              padding: '6px 10px',
              fontSize: 'var(--fs-md)',
              color: 'var(--danger-color)',
              cursor: 'pointer',
              borderRadius: '4px',
              borderTop: '1px solid var(--border-subtle)',
              marginTop: '4px'
            }}
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