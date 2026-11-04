/**
 * Dossiers proposés par « Déplacer vers… » (alternative au glisser-déposer, WCAG 2.5.7).
 * '' désigne la racine des notes. Sont exclus le dossier actuel de l'élément et, pour un dossier,
 * lui-même et ses sous-dossiers (on ne peut pas le déplacer dans son propre contenu).
 */
export interface MoveTreeNode {
  relativePath: string
  type: 'file' | 'folder'
  children?: MoveTreeNode[]
}

export function listMoveTargets(nodes: MoveTreeNode[], itemPath: string): string[] {
  const slash = itemPath.lastIndexOf('/')
  const currentParent = slash > 0 ? itemPath.slice(0, slash) : ''
  const targets: string[] = ['']

  const walk = (list: MoveTreeNode[]): void => {
    for (const node of list) {
      if (node.type !== 'folder') continue
      if (node.relativePath === itemPath) continue
      targets.push(node.relativePath)
      walk(node.children ?? [])
    }
  }
  walk(nodes)

  return targets.filter((target) => target !== currentParent)
}

/** Filtre sans tenir compte de la casse ; la racine répond au mot « racine ». */
export function filterMoveTargets(targets: string[], query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return targets
  return targets.filter((target) => (target || 'racine').toLowerCase().includes(q))
}
