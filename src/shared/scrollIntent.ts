/**
 * Synchronisation du défilement aperçu -> Monaco : l'aperçu ne signale un défilement que s'il suit un
 * vrai geste de l'utilisateur dans l'aperçu (molette, glisser, touche, clic) depuis peu.
 *
 * Sans cette règle, le rechargement de l'aperçu (700 ms après chaque pause de frappe dans Monaco, par
 * exemple le temps de choisir un snippet) repartait du haut, le signalait, et faisait remonter Monaco.
 *
 * Fonction autonome (aucun import, aucune constante externe) : sa source est injectée telle quelle
 * dans l'iframe d'aperçu (CodeWorkspace.tsx) via toString().
 */
export function isUserScrollIntent(now: number, lastGestureAt: number, windowMs?: number): boolean {
  const limit = typeof windowMs === 'number' ? windowMs : 1000
  if (!(lastGestureAt > 0)) return false
  const elapsed = now - lastGestureAt
  return elapsed >= 0 && elapsed <= limit
}

/**
 * Sens inverse : pendant un geste de souris dans Monaco (et juste après), le défilement de l'aperçu
 * ne doit pas faire bouger l'éditeur. Sinon le texte glisse sous la souris et la sélection en cours
 * se pose sur une autre ligne.
 */
export function isCodePointerActive(
  now: number,
  isPressed: boolean,
  lastPointerAt: number,
  windowMs: number = 600
): boolean {
  if (isPressed) return true
  if (!(lastPointerAt > 0)) return false
  const elapsed = now - lastPointerAt
  return elapsed >= 0 && elapsed <= windowMs
}
