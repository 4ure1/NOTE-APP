/**
 * Nom libre pour enregistrer « ma version » d'une note en conflit, dans le même dossier :
 * "cours/note.html" -> "cours/note (ma version).html", puis "(ma version 2)", etc.
 * Comparaison sans tenir compte de la casse (Windows). Chemins POSIX.
 */
export function copyNoteName(notePath: string, existing: Iterable<string>): string {
  const taken = new Set(Array.from(existing, (p) => p.toLowerCase()))
  const slash = notePath.lastIndexOf('/')
  const dir = slash === -1 ? '' : notePath.slice(0, slash + 1)
  const name = notePath.slice(slash + 1)
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''

  for (let n = 1; ; n++) {
    const suffix = n === 1 ? ' (ma version)' : ` (ma version ${n})`
    const candidate = `${dir}${base}${suffix}${ext}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}
