/**
 * Snippets proposés par l'app : ceux du fichier de l'utilisateur (<notes>/.snippets/snippets.json), puis
 * les snippets par défaut qu'il n'a pas. Le fichier n'est créé qu'une fois : sans cette fusion, un
 * nouveau snippet par défaut n'arrivait jamais chez un utilisateur existant.
 *
 * - Fusion en mémoire seulement : le fichier de l'utilisateur n'est jamais modifié.
 * - Un snippet de l'utilisateur gagne toujours (même préfixe ou même id, sans tenir compte de la casse).
 * - "disabledDefaults": ["id", …] dans le fichier masque des snippets par défaut dont on ne veut pas.
 */

export interface SnippetLike {
  prefix: string
  id?: string
}

export function mergeDefaultSnippets<T extends SnippetLike>(
  userSnippets: T[],
  defaultSnippets: T[],
  disabledDefaults?: unknown
): T[] {
  const key = (value: unknown): string => String(value ?? '').toLowerCase()
  const taken = new Set<string>()
  for (const s of userSnippets) {
    taken.add(key(s.prefix))
    if (s.id) taken.add(key(s.id))
  }
  const disabled = new Set(
    Array.isArray(disabledDefaults) ? disabledDefaults.map((d) => key(d)) : []
  )
  const missing = defaultSnippets.filter(
    (s) =>
      !taken.has(key(s.prefix)) &&
      !(s.id && taken.has(key(s.id))) &&
      !disabled.has(key(s.prefix)) &&
      !(s.id && disabled.has(key(s.id)))
  )
  return [...userSnippets, ...missing]
}

/**
 * Anciennes versions de snippets par défaut, recopiées telles quelles dans le fichier de l'utilisateur
 * au premier lancement (identifiant → corps d'origine, lignes jointes par \n).
 */
export const RETIRED_DEFAULT_BODIES: Record<string, string[]> = {
  divider: ['<div class="divider">⸻</div>', '<div class="chapter-break">${1:Chapitre}</div>\n$0']
}

/**
 * Remplace, en mémoire seulement, un snippet de l'utilisateur resté identique à une ancienne version
 * par défaut (jamais modifié par lui) par la version actuelle. Un snippet personnalisé est gardé.
 */
export function replaceRetiredDefaults<T extends SnippetLike & { body?: unknown }>(
  userSnippets: T[],
  defaultSnippets: T[],
  retired: Record<string, string[]> = RETIRED_DEFAULT_BODIES
): T[] {
  const bodyText = (body: unknown): string =>
    Array.isArray(body) ? body.join('\n') : String(body ?? '')
  return userSnippets.map((s) => {
    const id = String(s.id || s.prefix || '').toLowerCase()
    const old = retired[id]
    if (!old || old.indexOf(bodyText(s.body)) === -1) return s
    const current = defaultSnippets.find((d) => String(d.id || d.prefix).toLowerCase() === id)
    return current || s
  })
}
