/**
 * Tri de l'arbre des notes (barre latérale) : nom, dates, taille ou type. Les dossiers restent avant
 * les fichiers, comme dans l'Explorateur. Un dossier n'a pas de date ni de taille propres : il prend
 * la note la plus récente qu'il contient et le total de leurs tailles.
 */
export type TreeSortKey = 'name' | 'modified' | 'created' | 'size' | 'type'

export interface TreeSort {
  key: TreeSortKey
  descending: boolean
}

export interface SortableNode {
  name: string
  type: 'file' | 'folder'
  children?: SortableNode[]
  mtime?: number
  birthtime?: number
  size?: number
}

export const DEFAULT_TREE_SORT: TreeSort = { key: 'name', descending: false }

const KEYS: TreeSortKey[] = ['name', 'modified', 'created', 'size', 'type']

/** Critère choisi : le même inverse l'ordre ; un nouveau part du plus utile (récent, gros, A→Z). */
export function nextTreeSort(current: TreeSort, key: TreeSortKey): TreeSort {
  if (current.key === key) return { key, descending: !current.descending }
  return { key, descending: key === 'modified' || key === 'created' || key === 'size' }
}

/** Valeur enregistrée : tout contenu invalide ramène au tri par défaut. */
export function parseTreeSort(raw: string | null): TreeSort {
  if (!raw) return DEFAULT_TREE_SORT
  try {
    const parsed = JSON.parse(raw)
    if (parsed && KEYS.indexOf(parsed.key) !== -1 && typeof parsed.descending === 'boolean') {
      return { key: parsed.key, descending: parsed.descending }
    }
  } catch {
    return DEFAULT_TREE_SORT
  }
  return DEFAULT_TREE_SORT
}

function latest(node: SortableNode, field: 'mtime' | 'birthtime'): number {
  if (node.type !== 'folder') return node[field] ?? 0
  return (node.children ?? []).reduce((max, child) => Math.max(max, latest(child, field)), 0)
}

function totalSize(node: SortableNode): number {
  if (node.type !== 'folder') return node.size ?? 0
  return (node.children ?? []).reduce((sum, child) => sum + totalSize(child), 0)
}

function extensionOf(node: SortableNode): string {
  const dot = node.name.lastIndexOf('.')
  return node.type === 'file' && dot > 0 ? node.name.slice(dot + 1).toLowerCase() : ''
}

function compareNames(a: SortableNode, b: SortableNode): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
}

function compareBy(key: TreeSortKey, a: SortableNode, b: SortableNode): number {
  if (key === 'modified') return latest(a, 'mtime') - latest(b, 'mtime')
  if (key === 'created') return latest(a, 'birthtime') - latest(b, 'birthtime')
  if (key === 'size') return totalSize(a) - totalSize(b)
  if (key === 'type') return extensionOf(a).localeCompare(extensionOf(b))
  return compareNames(a, b)
}

/** Copie triée de l'arbre, à tous les niveaux ; à égalité, l'ordre alphabétique départage. */
export function sortTree<T extends SortableNode>(nodes: T[], sort: TreeSort): T[] {
  const direction = sort.descending ? -1 : 1
  return nodes
    .map((node) =>
      node.children ? { ...node, children: sortTree(node.children as T[], sort) } : node
    )
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return direction * compareBy(sort.key, a, b) || compareNames(a, b)
    })
}
