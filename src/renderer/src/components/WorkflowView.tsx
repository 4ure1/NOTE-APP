import React, { useState, useEffect } from 'react'
import { PlusIcon, KanbanIcon, FolderIcon, getFileIcon } from './Icons'

export type WorkflowStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done'

export interface WorkflowColumnDef {
  id: WorkflowStatus
  label: string
  color: string
  bgBadge: string
  borderBadge: string
  iconColor: string
}

export const WORKFLOW_COLUMNS: WorkflowColumnDef[] = [
  {
    id: 'backlog',
    label: 'Backlog & Idées',
    color: '#94a3b8',
    bgBadge: 'rgba(148, 163, 184, 0.12)',
    borderBadge: 'rgba(148, 163, 184, 0.25)',
    iconColor: '#94a3b8'
  },
  {
    id: 'todo',
    label: 'À faire',
    color: '#38bdf8',
    bgBadge: 'rgba(56, 189, 248, 0.12)',
    borderBadge: 'rgba(56, 189, 248, 0.25)',
    iconColor: '#38bdf8'
  },
  {
    id: 'in_progress',
    label: 'En cours',
    color: '#fbbf24',
    bgBadge: 'rgba(251, 191, 36, 0.12)',
    borderBadge: 'rgba(251, 191, 36, 0.25)',
    iconColor: '#fbbf24'
  },
  {
    id: 'review',
    label: 'En révision',
    color: '#c084fc',
    bgBadge: 'rgba(192, 132, 252, 0.12)',
    borderBadge: 'rgba(192, 132, 252, 0.25)',
    iconColor: '#c084fc'
  },
  {
    id: 'done',
    label: 'Terminé',
    color: '#34d399',
    bgBadge: 'rgba(52, 211, 153, 0.12)',
    borderBadge: 'rgba(52, 211, 153, 0.25)',
    iconColor: '#34d399'
  }
]

interface WorkflowViewProps {
  files: string[]
  onOpenNote: (file: string) => void
  onCreateNote: (parentFolder?: string) => void
  onDeleteNote?: (file: string) => void
}

export default function WorkflowView({
  files,
  onOpenNote,
  onCreateNote,
  onDeleteNote: _onDeleteNote
}: WorkflowViewProps) {
  const [statuses, setStatuses] = useState<Record<string, WorkflowStatus>>({})
  const [searchFilter, setSearchFilter] = useState('')
  const [folderFilter, setFolderFilter] = useState<string>('all')
  const [draggingFile, setDraggingFile] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<WorkflowStatus | null>(null)

  // Load saved statuses from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('note_workflow_statuses')
      if (saved) {
        setStatuses(JSON.parse(saved))
      }
    } catch {
      // ignore
    }
  }, [])

  // Save statuses when updated
  const updateStatus = (file: string, nextStatus: WorkflowStatus) => {
    setStatuses((prev) => {
      const updated = { ...prev, [file]: nextStatus }
      try {
        localStorage.setItem('note_workflow_statuses', JSON.stringify(updated))
      } catch {
        // ignore
      }
      return updated
    })
  }

  // Get status of a file, fallback intelligently
  const getFileStatus = (file: string): WorkflowStatus => {
    if (statuses[file]) return statuses[file]
    const lower = file.toLowerCase()
    if (lower.includes('draft') || lower.includes('sans titre') || lower.includes('untitled')) return 'backlog'
    if (lower.includes('done') || lower.includes('termine')) return 'done'
    if (lower.includes('cours') || lower.includes('progress') || lower.includes('active')) return 'in_progress'
    return 'todo'
  }

  // Valid selectable files (excluding system internal files)
  const validFiles = files.filter((f) => f !== '__claude_code__')

  // Extract unique folders for filter dropdown
  const uniqueFolders = Array.from(
    new Set(
      validFiles
        .filter((f) => f.includes('/'))
        .map((f) => f.substring(0, f.lastIndexOf('/')))
    )
  ).sort()

  // Filter notes
  const filteredFiles = validFiles.filter((file) => {
    const matchesSearch = file.toLowerCase().includes(searchFilter.toLowerCase())
    if (!matchesSearch) return false
    if (folderFilter === 'all') return true
    if (folderFilter === 'root') return !file.includes('/')
    return file.startsWith(`${folderFilter}/`)
  })

  // Move forward or backward
  const moveCard = (file: string, direction: 'prev' | 'next') => {
    const current = getFileStatus(file)
    const order: WorkflowStatus[] = ['backlog', 'todo', 'in_progress', 'review', 'done']
    const idx = order.indexOf(current)
    if (idx === -1) return
    const targetIdx = direction === 'next' ? idx + 1 : idx - 1
    if (targetIdx >= 0 && targetIdx < order.length) {
      updateStatus(file, order[targetIdx])
    }
  }

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, file: string) => {
    e.dataTransfer.setData('text/plain', file)
    setDraggingFile(file)
  }

  const handleDragOver = (e: React.DragEvent, colId: WorkflowStatus) => {
    e.preventDefault()
    setDragOverColumn(colId)
  }

  const handleDragLeave = () => {
    setDragOverColumn(null)
  }

  const handleDrop = (e: React.DragEvent, colId: WorkflowStatus) => {
    e.preventDefault()
    setDragOverColumn(null)
    const file = e.dataTransfer.getData('text/plain') || draggingFile
    if (file) {
      updateStatus(file, colId)
    }
    setDraggingFile(null)
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#141518',
        color: '#e4e4e7',
        overflow: 'hidden',
        userSelect: 'none'
      }}
    >
      {/* Top Header Bar */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: '#18181b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8'
            }}
          >
            <KanbanIcon size={18} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#ffffff' }}>Workflow</h1>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#9ca3af' }}>
              Tableau Kanban des notes et avancement des projets
            </p>
          </div>
        </div>

        {/* Controls: Search, Folder Filter, Add Note */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Search bar */}
          <input
            type="text"
            placeholder="Filtrer les notes..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            style={{
              backgroundColor: '#202125',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              padding: '6px 12px',
              color: '#ffffff',
              fontSize: '13px',
              outline: 'none',
              width: '180px',
              transition: 'border-color 0.15s'
            }}
            onFocus={(e) => (e.target.style.borderColor = 'rgba(56, 189, 248, 0.4)')}
            onBlur={(e) => (e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)')}
          />

          {/* Folder filter */}
          {uniqueFolders.length > 0 && (
            <select
              value={folderFilter}
              onChange={(e) => setFolderFilter(e.target.value)}
              style={{
                backgroundColor: '#202125',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '6px 10px',
                color: '#e4e4e7',
                fontSize: '12.5px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">Tous les dossiers</option>
              <option value="root">Racine uniquement</option>
              {uniqueFolders.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          )}

          {/* New note button */}
          <button
            onClick={() => onCreateNote()}
            style={{
              backgroundColor: '#27272a',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#ffffff',
              borderRadius: '8px',
              padding: '7px 14px',
              fontSize: '12.5px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'background-color 0.15s'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#3f3f46')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#27272a')}
          >
            <PlusIcon size={14} />
            <span>Nouvelle note</span>
          </button>
        </div>
      </div>

      {/* Kanban Board Horizontal Scroll */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          gap: '14px',
          padding: '20px 24px',
          overflowX: 'auto',
          overflowY: 'hidden'
        }}
      >
        {WORKFLOW_COLUMNS.map((col) => {
          const colNotes = filteredFiles.filter((f) => getFileStatus(f) === col.id)
          const isOver = dragOverColumn === col.id

          return (
            <div
              key={col.id}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.id)}
              style={{
                width: '300px',
                minWidth: '280px',
                backgroundColor: isOver ? 'rgba(39, 39, 42, 0.85)' : '#18181b',
                border: isOver ? `1px solid ${col.color}` : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '14px',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                maxHeight: '100%',
                transition: 'border-color 0.15s, background-color 0.15s',
                boxShadow: isOver ? `0 0 20px ${col.color}22` : 'none'
              }}
            >
              {/* Column Header */}
              <div
                style={{
                  padding: '14px 16px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: col.color,
                      boxShadow: `0 0 8px ${col.color}`
                    }}
                  />
                  <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#f4f4f5' }}>
                    {col.label}
                  </span>
                </div>
                <span
                  style={{
                    backgroundColor: col.bgBadge,
                    border: `1px solid ${col.borderBadge}`,
                    color: col.color,
                    padding: '1px 8px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 600
                  }}
                >
                  {colNotes.length}
                </span>
              </div>

              {/* Column Cards Container */}
              <div
                style={{
                  flex: 1,
                  padding: '10px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                {colNotes.map((file) => {
                  const cleanTitle = file.split('/').pop()?.replace(/\.(html|htm|md|markdown)$/i, '') || file
                  const folderPath = file.includes('/') ? file.substring(0, file.lastIndexOf('/')) : null

                  return (
                    <div
                      key={file}
                      draggable
                      onDragStart={(e) => handleDragStart(e, file)}
                      onClick={() => onOpenNote(file)}
                      style={{
                        backgroundColor: '#202125',
                        border: '1px solid rgba(255, 255, 255, 0.07)',
                        borderRadius: '10px',
                        padding: '12px 14px',
                        cursor: 'grab',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        transition: 'transform 0.12s, border-color 0.12s, box-shadow 0.12s',
                        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.16)'
                        e.currentTarget.style.transform = 'translateY(-1px)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.07)'
                        e.currentTarget.style.transform = 'translateY(0)'
                      }}
                    >
                      {/* Card Title & Icon */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        <span style={{ marginTop: '2px', flexShrink: 0 }}>
                          {getFileIcon(file, 14)}
                        </span>
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: 500,
                            color: '#ffffff',
                            lineHeight: '1.4',
                            flex: 1,
                            wordBreak: 'break-word'
                          }}
                        >
                          {cleanTitle}
                        </span>
                      </div>

                      {/* Folder tag & Move actions */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginTop: '4px',
                          paddingTop: '6px',
                          borderTop: '1px solid rgba(255, 255, 255, 0.04)'
                        }}
                      >
                        {folderPath ? (
                          <span
                            style={{
                              fontSize: '11px',
                              color: '#9ca3af',
                              backgroundColor: 'rgba(255, 255, 255, 0.04)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              maxWidth: '130px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <FolderIcon size={12} style={{ flexShrink: 0 }} />
                            <span>{folderPath}</span>
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#71717a' }}>Racine</span>
                        )}

                        {/* Quick directional arrows */}
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {col.id !== 'backlog' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                moveCard(file, 'prev')
                              }}
                              title="Déplacer vers la gauche"
                              style={{
                                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                                border: 'none',
                                color: '#a1a1aa',
                                borderRadius: '4px',
                                width: '22px',
                                height: '22px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                fontSize: '11px'
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = '#a1a1aa')}
                            >
                              ←
                            </button>
                          )}
                          {col.id !== 'done' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                moveCard(file, 'next')
                              }}
                              title="Déplacer vers la droite"
                              style={{
                                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                                border: 'none',
                                color: '#a1a1aa',
                                borderRadius: '4px',
                                width: '22px',
                                height: '22px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                fontSize: '11px'
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = '#a1a1aa')}
                            >
                              →
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {colNotes.length === 0 && (
                  <div
                    style={{
                      padding: '24px 12px',
                      textAlign: 'center',
                      color: '#52525b',
                      fontSize: '12px',
                      border: '1px dashed rgba(255, 255, 255, 0.06)',
                      borderRadius: '8px',
                      marginTop: '6px'
                    }}
                  >
                    Glisser une note ici
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
