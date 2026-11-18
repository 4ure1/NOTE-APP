/**
 * Tableau de suivi (vue « Tableau ») : colonnes modifiables par l'utilisateur et statut des notes.
 * Seules les notes qui ont un statut apparaissent sur le tableau (aucune déduction d'après le nom).
 * Les deux sont enregistrés dans .config.json : `workflowColumns` et `workflowStatuses`.
 */

export interface WorkflowColumn {
  id: string
  label: string
  /** Colonne repliée en bande étroite (ex. « Terminé »). */
  collapsed?: boolean
}

/** Statut de chaque note suivie : chemin relatif POSIX → id de colonne. */
export type WorkflowStatuses = Record<string, string>

export const MAX_COLUMN_LABEL = 40

export const DEFAULT_WORKFLOW_COLUMNS: WorkflowColumn[] = [
  { id: 'backlog', label: 'Idées' },
  { id: 'todo', label: 'À faire' },
  { id: 'in_progress', label: 'En cours' },
  { id: 'review', label: 'En révision' },
  { id: 'done', label: 'Terminé', collapsed: true }
]

export function cleanColumnLabel(label: string): string {
  return label.replace(/\s+/g, ' ').trim().slice(0, MAX_COLUMN_LABEL)
}

/** Colonnes lues dans la configuration ; les colonnes par défaut si rien d'exploitable. */
export function sanitizeColumns(raw: unknown): WorkflowColumn[] {
  if (!Array.isArray(raw)) return DEFAULT_WORKFLOW_COLUMNS.map((c) => ({ ...c }))
  const seen = new Set<string>()
  const out: WorkflowColumn[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const { id, label, collapsed } = item as Record<string, unknown>
    if (typeof id !== 'string' || !id || seen.has(id) || typeof label !== 'string') continue
    const clean = cleanColumnLabel(label)
    if (!clean) continue
    seen.add(id)
    out.push(collapsed === true ? { id, label: clean, collapsed: true } : { id, label: clean })
  }
  return out.length ? out : DEFAULT_WORKFLOW_COLUMNS.map((c) => ({ ...c }))
}

/** Statuts lus dans la configuration ; ceux qui visent une colonne disparue sont oubliés. */
export function sanitizeStatuses(raw: unknown, columns: WorkflowColumn[]): WorkflowStatuses {
  const out: WorkflowStatuses = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const ids = new Set(columns.map((c) => c.id))
  for (const [path, status] of Object.entries(raw as Record<string, unknown>)) {
    if (path && typeof status === 'string' && ids.has(status)) out[path] = status
  }
  return out
}

/** Nouvel identifiant de colonne, stable même si la colonne est renommée ensuite. */
export function newColumnId(columns: WorkflowColumn[], label: string): string {
  const base =
    'col-' +
    (cleanColumnLabel(label)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'colonne')
  const ids = new Set(columns.map((c) => c.id))
  if (!ids.has(base)) return base
  let n = 2
  while (ids.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

export function addColumn(columns: WorkflowColumn[], label: string): WorkflowColumn[] {
  const clean = cleanColumnLabel(label)
  if (!clean) return columns
  return [...columns, { id: newColumnId(columns, clean), label: clean }]
}

export function renameColumn(
  columns: WorkflowColumn[],
  id: string,
  label: string
): WorkflowColumn[] {
  const clean = cleanColumnLabel(label)
  if (!clean) return columns
  return columns.map((c) => (c.id === id ? { ...c, label: clean } : c))
}

export function toggleColumnCollapsed(columns: WorkflowColumn[], id: string): WorkflowColumn[] {
  return columns.map((c) => {
    if (c.id !== id) return c
    if (c.collapsed) return { id: c.id, label: c.label }
    return { ...c, collapsed: true }
  })
}

export function moveColumn(
  columns: WorkflowColumn[],
  id: string,
  direction: 'left' | 'right'
): WorkflowColumn[] {
  const i = columns.findIndex((c) => c.id === id)
  const j = direction === 'left' ? i - 1 : i + 1
  if (i === -1 || j < 0 || j >= columns.length) return columns
  const next = columns.slice()
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

/**
 * Supprime une colonne (jamais la dernière) ; ses notes quittent le tableau (elles ne sont pas supprimées).
 */
export function removeColumn(
  columns: WorkflowColumn[],
  statuses: WorkflowStatuses,
  id: string
): { columns: WorkflowColumn[]; statuses: WorkflowStatuses } {
  if (columns.length <= 1 || !columns.some((c) => c.id === id)) return { columns, statuses }
  const nextStatuses: WorkflowStatuses = {}
  for (const [path, status] of Object.entries(statuses)) {
    if (status !== id) nextStatuses[path] = status
  }
  return { columns: columns.filter((c) => c.id !== id), statuses: nextStatuses }
}

/** Pose (ou retire, avec null) le statut d'une note. */
export function setNoteStatus(
  statuses: WorkflowStatuses,
  path: string,
  columnId: string | null
): WorkflowStatuses {
  const next = { ...statuses }
  if (columnId) next[path] = columnId
  else delete next[path]
  return next
}

/** Notes suivies d'une colonne, parmi les notes existantes, dans l'ordre de `files`. */
export function notesInColumn(
  files: string[],
  statuses: WorkflowStatuses,
  columnId: string
): string[] {
  return files.filter((f) => statuses[f] === columnId)
}
