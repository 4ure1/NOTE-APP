import { normalizeHtml } from './normalizeHtml'

/**
 * Délègue vers normalizeHtml, la source unique de vérité pour le nettoyage et l'indentation HTML.
 */
export function formatHtml(html: string): string {
  return normalizeHtml(html)
}

export { normalizeHtml }
