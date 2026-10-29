/**
 * Chemins à mettre à jour après le renommage ou le déplacement d'une note ou d'un dossier.
 * Chemins relatifs au dossier de notes, en POSIX. Comparaison sans tenir compte de la casse (Windows) ;
 * la partie située sous le dossier déplacé garde sa casse d'origine.
 */

function stripSlashes(p: string): string {
  return p.replace(/^\/+|\/+$/g, '')
}

/**
 * Nouveau chemin de `filePath` si `oldPath` (note ou dossier) est devenu `newPath` ; sinon `filePath`
 * inchangé. "cours" -> "archives" transforme "cours/a.html" en "archives/a.html", pas "cours-2/a.html".
 */
export function remapMovedPath(filePath: string, oldPath: string, newPath: string): string {
  const from = stripSlashes(oldPath)
  const to = stripSlashes(newPath)
  if (!from || from === to) return filePath
  const lowerFile = filePath.toLowerCase()
  const lowerFrom = from.toLowerCase()
  if (lowerFile === lowerFrom) return to
  if (lowerFile.startsWith(lowerFrom + '/')) return to + filePath.slice(from.length)
  return filePath
}

/**
 * Vrai si `filePath` est l'élément supprimé lui-même ou se trouve dans le dossier supprimé
 * (même règle de préfixe que remapMovedPath : "cours" contient "cours/a.html", pas "cours-2/a.html").
 */
export function isInsideRemovedPath(filePath: string, removedPath: string): boolean {
  const removed = stripSlashes(removedPath).toLowerCase()
  if (!removed) return false
  const lowerFile = filePath.toLowerCase()
  return lowerFile === removed || lowerFile.startsWith(removed + '/')
}

// Retire d'une liste les chemins supprimés (notes ou dossiers) ; la liste d'origine si rien ne change
export function withoutRemovedPaths(paths: string[], removedPaths: string[]): string[] {
  const next = paths.filter((p) => !removedPaths.some((r) => isInsideRemovedPath(p, r)))
  return next.length === paths.length ? paths : next
}

// Même chose pour une liste ; renvoie la liste d'origine si rien ne change (évite un rendu inutile)
export function remapMovedPaths(paths: string[], oldPath: string, newPath: string): string[] {
  const next = paths.map((p) => remapMovedPath(p, oldPath, newPath))
  return next.some((p, i) => p !== paths[i]) ? next : paths
}

// Même chose pour un objet indexé par chemin (tags, statuts) ; l'objet d'origine si rien ne change
export function remapMovedKeys<T>(
  record: Record<string, T>,
  oldPath: string,
  newPath: string
): Record<string, T> {
  let changed = false
  const next: Record<string, T> = {}
  for (const [key, value] of Object.entries(record)) {
    const mapped = remapMovedPath(key, oldPath, newPath)
    if (mapped !== key) changed = true
    next[mapped] = value
  }
  return changed ? next : record
}
