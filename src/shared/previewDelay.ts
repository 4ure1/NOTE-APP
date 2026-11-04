/**
 * Délai avant de recharger l'aperçu après une frappe dans Monaco : court après une pause, et plafonné
 * pour qu'une frappe continue finisse quand même par s'afficher. Les très grosses notes attendent plus
 * longtemps, leur rechargement étant coûteux.
 */
const DELAY_MS = 300
const MAX_WAIT_MS = 1500
const LARGE_DELAY_MS = 700
const LARGE_MAX_WAIT_MS = 4000
const LARGE_NOTE_CHARS = 200_000

/** `waitedMs` : temps écoulé depuis la première frappe pas encore affichée. */
export function previewRefreshDelay(contentLength: number, waitedMs: number): number {
  const large = contentLength > LARGE_NOTE_CHARS
  const delay = large ? LARGE_DELAY_MS : DELAY_MS
  const maxWait = large ? LARGE_MAX_WAIT_MS : MAX_WAIT_MS
  return Math.max(0, Math.min(delay, maxWait - waitedMs))
}
