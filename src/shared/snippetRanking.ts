/**
 * Tri des snippets du menu « / » de l'aperçu : le plus pertinent d'abord.
 * Préfixe exact, puis préfixe qui commence par la saisie, puis nom qui commence par elle, puis
 * contenu ailleurs (préfixe, nom, description, catégorie). L'ordre d'origine départage.
 *
 * Fonction autonome (aucun import ni constante externe) : sa source est injectée dans l'iframe
 * d'aperçu (CodeWorkspace.tsx) via toString().
 */
export interface RankableSnippet {
  prefix: string
  name: string
  description?: string
  category?: string
}

export function rankSnippets<T extends RankableSnippet>(list: T[], query: string): T[] {
  const q = String(query || '')
    .trim()
    .toLowerCase()
  if (!q) return list.slice()
  const score = (s: T): number => {
    const prefix = String(s.prefix || '').toLowerCase()
    const name = String(s.name || '').toLowerCase()
    if (prefix === q) return 0
    if (prefix.indexOf(q) === 0) return 1
    if (name.indexOf(q) === 0) return 2
    // Début d'un mot du nom (« orange » dans « Texte orange »)
    if (name.indexOf(' ' + q) !== -1) return 3
    if (prefix.indexOf(q) !== -1) return 4
    if (name.indexOf(q) !== -1) return 5
    const rest = (String(s.description || '') + ' ' + String(s.category || '')).toLowerCase()
    if (rest.indexOf(q) !== -1) return 6
    return -1
  }
  return list
    .map((s, i) => ({ s, i, v: score(s) }))
    .filter((e) => e.v !== -1)
    .sort((a, b) => a.v - b.v || a.i - b.i)
    .map((e) => e.s)
}
