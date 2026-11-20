/**
 * Entrée dans un champ d'un snippet de liste (/ul, /ol, /ul-6…) : au lieu de créer une nouvelle puce,
 * aller au champ de l'élément suivant, s'il est l'élément juste après dans la même liste et que son
 * texte n'a jamais été modifié (toujours « élément »). Sinon Entrée garde son comportement habituel.
 *
 * Fonction autonome (aucun import, aucune constante externe) : sa source est injectée dans l'iframe
 * d'aperçu (CodeWorkspace.tsx) via toString().
 */
export function enterJumpsToNextListField(
  current: Element | null,
  next: Element | null,
  nextInitialText: string | undefined,
  nextText: string
): boolean {
  if (!current || !next || typeof nextInitialText !== 'string') return false
  const item = current.closest('li')
  const nextItem = next.closest('li')
  if (!item || !nextItem || item === nextItem) return false
  if (item.nextElementSibling !== nextItem) return false
  return nextText === nextInitialText
}
