/*! NOTE-APP — © 2026 4URE1 — https://github.com/4ure1 — Tous droits réservés. */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { askConfirm } from './ConfirmDialog'
import { FolderIcon, MoreHorizontalIcon, PlusIcon, SearchIcon, XIcon } from './Icons'
import {
  addColumn,
  moveColumn,
  notesInColumn,
  renameColumn,
  toggleColumnCollapsed,
  type WorkflowColumn,
  type WorkflowStatuses
} from '../../../shared/workflow'

interface WorkflowViewProps {
  files: string[]
  columns: WorkflowColumn[]
  statuses: WorkflowStatuses
  onChangeColumns: (columns: WorkflowColumn[]) => void
  /** Supprime la colonne et retire ses notes du tableau. */
  onRemoveColumn: (columnId: string) => void
  /** Pose le statut d'une note, ou la retire du tableau (null). */
  onSetStatus: (file: string, columnId: string | null) => void
  onOpenNote: (file: string) => void
  onCreateNote: (parentFolder?: string) => void
  noteTags?: Record<string, string[]>
  modifiedLabel?: (file: string) => string | undefined
}

type Popover = { columnId: string; kind: 'actions' | 'add' } | null

const titleOf = (file: string): string =>
  (file.split('/').pop() || file).replace(/\.(html|htm|md|markdown)$/i, '')
const folderOf = (file: string): string =>
  file.includes('/') ? file.substring(0, file.lastIndexOf('/')).replace(/\//g, ' / ') : ''
const extOf = (file: string): string | null => {
  const m = /\.(md|markdown|pdf)$/i.exec(file)
  return m ? m[1].toLowerCase() : null
}

export default function WorkflowView({
  files,
  columns,
  statuses,
  onChangeColumns,
  onRemoveColumn,
  onSetStatus,
  onOpenNote,
  onCreateNote,
  noteTags = {},
  modifiedLabel
}: WorkflowViewProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [folderFilter, setFolderFilter] = useState('all')
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [popover, setPopover] = useState<Popover>(null)
  const [pickerQuery, setPickerQuery] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [addingColumn, setAddingColumn] = useState(false)
  const [newColumnLabel, setNewColumnLabel] = useState('')
  const popoverRef = useRef<HTMLDivElement>(null)

  const notes = useMemo(() => files.filter((f) => f !== '__claude_code__'), [files])
  const folders = useMemo(
    () =>
      Array.from(
        new Set(notes.filter((f) => f.includes('/')).map((f) => f.substring(0, f.lastIndexOf('/'))))
      ).sort(),
    [notes]
  )
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return notes.filter((f) => {
      if (q && !f.toLowerCase().includes(q)) return false
      if (folderFilter === 'all') return true
      if (folderFilter === 'root') return !f.includes('/')
      return f.startsWith(`${folderFilter}/`)
    })
  }, [notes, query, folderFilter])
  const tracked = notes.filter((f) => statuses[f]).length

  // Fermeture des menus : clic ailleurs ou Échap
  useEffect(() => {
    if (!popover) return
    const onDown = (e: MouseEvent): void => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setPopover(null)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setPopover(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [popover])

  const startRename = (col: WorkflowColumn): void => {
    setPopover(null)
    setRenaming(col.id)
    setRenameValue(col.label)
  }
  const finishRename = (): void => {
    if (renaming) onChangeColumns(renameColumn(columns, renaming, renameValue))
    setRenaming(null)
  }
  const finishAddColumn = (): void => {
    if (newColumnLabel.trim()) onChangeColumns(addColumn(columns, newColumnLabel))
    setAddingColumn(false)
    setNewColumnLabel('')
  }
  const deleteColumn = async (col: WorkflowColumn): Promise<void> => {
    setPopover(null)
    const count = notesInColumn(notes, statuses, col.id).length
    const ok = await askConfirm({
      title: `Supprimer la colonne « ${col.label} » ?`,
      message:
        count > 0
          ? `${count} note(s) quitteront le tableau. Les notes elles-mêmes ne sont pas supprimées.`
          : 'La colonne est vide.',
      confirmLabel: 'Supprimer la colonne',
      danger: true
    })
    if (ok) onRemoveColumn(col.id)
  }

  const drop = (e: React.DragEvent, columnId: string): void => {
    e.preventDefault()
    const file = e.dataTransfer.getData('application/x-workflow-note') || dragging
    if (file) onSetStatus(file, columnId)
    setDragging(null)
    setDragOver(null)
  }

  const untracked = notes.filter(
    (f) => !statuses[f] && f.toLowerCase().includes(pickerQuery.trim().toLowerCase())
  )

  return (
    <div className="wf">
      <div className="wf-head">
        <div className="wf-title">
          <h1>Tableau</h1>
          <span>
            {tracked === 0
              ? 'Aucune note suivie'
              : `${tracked} note${tracked > 1 ? 's' : ''} suivie${tracked > 1 ? 's' : ''}`}
          </span>
        </div>
        <div className="wf-filters">
          <label className="wf-field">
            <SearchIcon size={14} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrer les notes"
              aria-label="Filtrer les notes"
            />
          </label>
          {folders.length > 0 && (
            <select
              className="wf-select"
              value={folderFilter}
              onChange={(e) => setFolderFilter(e.target.value)}
              aria-label="Dossier"
            >
              <option value="all">Tous les dossiers</option>
              <option value="root">Racine</option>
              {folders.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          )}
          <button className="eh-btn wf-new" onClick={() => onCreateNote()}>
            <PlusIcon size={14} />
            Nouvelle note
          </button>
        </div>
      </div>

      <div className="wf-board">
        {columns.map((col, index) => {
          const items = notesInColumn(visible, statuses, col.id)
          const total = notesInColumn(notes, statuses, col.id).length
          const isOver = dragOver === col.id
          if (col.collapsed) {
            return (
              <button
                key={col.id}
                className={'wf-col folded' + (isOver ? ' over' : '')}
                onClick={() => onChangeColumns(toggleColumnCollapsed(columns, col.id))}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(col.id)
                }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => drop(e, col.id)}
                title={`${col.label} : cliquer pour déplier`}
              >
                <span className="wf-count">{total}</span>
                <span className="wf-vertical">{col.label}</span>
              </button>
            )
          }
          return (
            <section
              key={col.id}
              className={'wf-col' + (isOver ? ' over' : '')}
              aria-label={col.label}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(col.id)
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null)
              }}
              onDrop={(e) => drop(e, col.id)}
            >
              <div className="wf-col-head">
                {renaming === col.id ? (
                  <input
                    className="wf-rename"
                    autoFocus
                    value={renameValue}
                    maxLength={40}
                    aria-label="Nom de la colonne"
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={finishRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') finishRename()
                      if (e.key === 'Escape') setRenaming(null)
                    }}
                  />
                ) : (
                  <button
                    className="wf-col-name"
                    onDoubleClick={() => startRename(col)}
                    title="Double-clic pour renommer"
                  >
                    {col.label}
                  </button>
                )}
                <span className="wf-count">{total}</span>
                <span className="wf-col-tools">
                  <button
                    className="eh-icon"
                    aria-label={`Ajouter une note à « ${col.label} »`}
                    title="Ajouter une note"
                    onClick={() => {
                      setPickerQuery('')
                      setPopover({ columnId: col.id, kind: 'add' })
                    }}
                  >
                    <PlusIcon size={14} />
                  </button>
                  <button
                    className="eh-icon"
                    aria-label={`Actions de la colonne « ${col.label} »`}
                    aria-haspopup="menu"
                    aria-expanded={popover?.columnId === col.id && popover.kind === 'actions'}
                    onClick={() => setPopover({ columnId: col.id, kind: 'actions' })}
                  >
                    <MoreHorizontalIcon size={14} />
                  </button>
                </span>

                {popover?.columnId === col.id && popover.kind === 'actions' && (
                  <div className="wf-menu" role="menu" ref={popoverRef}>
                    <button role="menuitem" onClick={() => startRename(col)}>
                      Renommer
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setPopover(null)
                        onChangeColumns(toggleColumnCollapsed(columns, col.id))
                      }}
                    >
                      Replier
                    </button>
                    <button
                      role="menuitem"
                      disabled={index === 0}
                      onClick={() => {
                        setPopover(null)
                        onChangeColumns(moveColumn(columns, col.id, 'left'))
                      }}
                    >
                      Déplacer à gauche
                    </button>
                    <button
                      role="menuitem"
                      disabled={index === columns.length - 1}
                      onClick={() => {
                        setPopover(null)
                        onChangeColumns(moveColumn(columns, col.id, 'right'))
                      }}
                    >
                      Déplacer à droite
                    </button>
                    <hr />
                    <button
                      role="menuitem"
                      className="danger"
                      disabled={columns.length <= 1}
                      onClick={() => void deleteColumn(col)}
                    >
                      Supprimer la colonne
                    </button>
                  </div>
                )}

                {popover?.columnId === col.id && popover.kind === 'add' && (
                  <div className="wf-menu wf-picker" ref={popoverRef}>
                    <input
                      autoFocus
                      className="wf-picker-input"
                      value={pickerQuery}
                      onChange={(e) => setPickerQuery(e.target.value)}
                      placeholder="Chercher une note à suivre"
                      aria-label="Chercher une note à suivre"
                    />
                    <div className="wf-picker-list">
                      {untracked.slice(0, 8).map((f) => (
                        <button
                          key={f}
                          onClick={() => {
                            onSetStatus(f, col.id)
                            setPopover(null)
                          }}
                        >
                          <span className="wf-picker-title">{titleOf(f)}</span>
                          {folderOf(f) && <span className="wf-picker-folder">{folderOf(f)}</span>}
                        </button>
                      ))}
                      {untracked.length === 0 && (
                        <div className="wf-empty">Toutes les notes sont déjà sur le tableau.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="wf-cards">
                {items.map((file) => {
                  const tag = noteTags[file]?.[0]
                  const ext = extOf(file)
                  const when = modifiedLabel?.(file)
                  return (
                    <div
                      key={file}
                      className={'wf-card' + (dragging === file ? ' dragging' : '')}
                      role="button"
                      tabIndex={0}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-workflow-note', file)
                        e.dataTransfer.effectAllowed = 'move'
                        setDragging(file)
                      }}
                      onDragEnd={() => {
                        setDragging(null)
                        setDragOver(null)
                      }}
                      onClick={() => onOpenNote(file)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onOpenNote(file)
                        }
                      }}
                    >
                      <div className="wf-card-title">{titleOf(file)}</div>
                      {folderOf(file) && (
                        <div className="wf-card-folder">
                          <FolderIcon size={12} />
                          {folderOf(file)}
                        </div>
                      )}
                      {(when || tag || ext) && (
                        <div className="wf-card-meta">
                          {when && <span>{when}</span>}
                          {tag && <span className="wf-tag">{tag}</span>}
                          {ext && <span className="wf-ext">.{ext}</span>}
                        </div>
                      )}
                      <button
                        className="wf-card-remove"
                        title="Retirer du tableau (la note n’est pas supprimée)"
                        aria-label={`Retirer « ${titleOf(file)} » du tableau`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onSetStatus(file, null)
                        }}
                      >
                        <XIcon size={11} />
                      </button>
                    </div>
                  )
                })}
                {items.length === 0 && index === 0 && tracked === 0 && (
                  <div className="wf-empty">
                    Ajoutez une note avec +, ou depuis le statut affiché au-dessus du titre d’une
                    note.
                  </div>
                )}
              </div>
            </section>
          )
        })}

        {addingColumn ? (
          <div className="wf-col wf-new-col">
            <input
              className="wf-rename"
              autoFocus
              value={newColumnLabel}
              maxLength={40}
              placeholder="Nom de la colonne"
              aria-label="Nom de la nouvelle colonne"
              onChange={(e) => setNewColumnLabel(e.target.value)}
              onBlur={finishAddColumn}
              onKeyDown={(e) => {
                if (e.key === 'Enter') finishAddColumn()
                if (e.key === 'Escape') {
                  setAddingColumn(false)
                  setNewColumnLabel('')
                }
              }}
            />
          </div>
        ) : (
          <button className="wf-add-col" onClick={() => setAddingColumn(true)}>
            <PlusIcon size={14} />
            Ajouter une colonne
          </button>
        )}
      </div>
    </div>
  )
}
