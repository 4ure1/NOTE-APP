/**
 * Navigation clavier de l'arbre des notes (motif ARIA « tree view ») :
 * flèches haut/bas entre les lignes visibles, droite/gauche pour déplier/replier ou aller au parent,
 * Début/Fin, Entrée/Espace pour ouvrir, Maj+F10 ou touche Menu pour le menu contextuel, F2 pour renommer.
 *
 * Logique pure : Sidebar.tsx fournit la position de la ligne parmi les lignes visibles et applique l'action.
 */

export interface TreeKeyContext {
  /** Position de la ligne focalisée parmi les lignes visibles de l'arbre. */
  index: number
  /** Nombre de lignes visibles. */
  count: number
  isFolder: boolean
  /** Dossier déplié. */
  isOpen: boolean
  /** Le dossier a au moins un enfant (affiché juste en dessous quand il est déplié). */
  hasChildren: boolean
  /** Position de la ligne du dossier parent, -1 à la racine. */
  parentIndex: number
}

export type TreeKeyAction =
  | { kind: 'focus'; index: number }
  | { kind: 'expand' }
  | { kind: 'collapse' }
  | { kind: 'activate' }
  | { kind: 'menu' }
  | { kind: 'rename' }
  | { kind: 'none' }

export function treeKeyAction(key: string, shiftKey: boolean, ctx: TreeKeyContext): TreeKeyAction {
  const { index, count, isFolder, isOpen, hasChildren, parentIndex } = ctx
  switch (key) {
    case 'ArrowDown':
      return index >= 0 && index < count - 1
        ? { kind: 'focus', index: index + 1 }
        : { kind: 'none' }
    case 'ArrowUp':
      return index > 0 ? { kind: 'focus', index: index - 1 } : { kind: 'none' }
    case 'Home':
      return count > 0 ? { kind: 'focus', index: 0 } : { kind: 'none' }
    case 'End':
      return count > 0 ? { kind: 'focus', index: count - 1 } : { kind: 'none' }
    case 'ArrowRight':
      if (!isFolder) return { kind: 'none' }
      if (!isOpen) return { kind: 'expand' }
      return hasChildren && index < count - 1
        ? { kind: 'focus', index: index + 1 }
        : { kind: 'none' }
    case 'ArrowLeft':
      if (isFolder && isOpen) return { kind: 'collapse' }
      return parentIndex >= 0 ? { kind: 'focus', index: parentIndex } : { kind: 'none' }
    case 'Enter':
    case ' ':
      return { kind: 'activate' }
    case 'ContextMenu':
      return { kind: 'menu' }
    case 'F10':
      return shiftKey ? { kind: 'menu' } : { kind: 'none' }
    case 'F2':
      return { kind: 'rename' }
    default:
      return { kind: 'none' }
  }
}
