/**
 * Détection des liens et URL vers un PDF (module pur partagé main / renderer)
 */

export interface PdfHref {
  /** Chemin du PDF tel qu'écrit dans le lien, décodé, en POSIX, sans query ni ancre */
  path: string
  /** Page demandée par l'ancre #page=N (1 par défaut) */
  page: number
}

/**
 * Lien de note vers un PDF du dossier de notes (ex: "../assets/cours.pdf#page=3").
 * Renvoie null pour un lien externe (schéma, "//") ou qui ne désigne pas un PDF.
 * Seul le chemin compte : "annexe.html#voir.pdf" ou "note.md?f=a.pdf" ne sont pas des PDF.
 *
 * Fonction autonome (aucun import, aucune constante externe) : sa source est injectée telle
 * quelle dans l'iframe d'aperçu (CodeWorkspace.tsx) via toString().
 */
export function parsePdfHref(href: string): PdfHref | null {
  const raw = typeof href === 'string' ? href.trim() : ''
  if (!raw || raw.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return null

  const hashIdx = raw.indexOf('#')
  const fragment = hashIdx === -1 ? '' : raw.slice(hashIdx + 1)
  const beforeHash = hashIdx === -1 ? raw : raw.slice(0, hashIdx)
  const queryIdx = beforeHash.indexOf('?')
  let path = queryIdx === -1 ? beforeHash : beforeHash.slice(0, queryIdx)
  try {
    path = decodeURIComponent(path)
  } catch {
    // Encodage invalide (ex: "%E9") : on garde le chemin tel qu'écrit
  }
  path = path.replace(/\\/g, '/')
  // Un ":" décodé (lecteur Windows, schéma encodé) n'a rien à faire dans un chemin de note
  if (path.includes(':')) return null

  const name = path.slice(path.lastIndexOf('/') + 1)
  if (name.length <= 4 || name.slice(-4).toLowerCase() !== '.pdf') return null

  const pageMatch = /(?:^|&)page=(\d+)/i.exec(fragment)
  const page = pageMatch ? parseInt(pageMatch[1], 10) : 1
  return { path, page: page >= 1 ? page : 1 }
}

/**
 * Résout le chemin d'un lien par rapport au dossier de la note qui le contient.
 * Un chemin commençant par "/" part de la racine du dossier de notes.
 * Renvoie null si le lien sort du dossier de notes ou ne désigne aucun fichier.
 */
export function resolveVaultLinkPath(fromNotePath: string, linkPath: string): string | null {
  const segments = linkPath.startsWith('/')
    ? []
    : (fromNotePath || '').split('/').slice(0, -1).filter(Boolean)
  for (const part of linkPath.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (segments.length === 0) return null
      segments.pop()
    } else {
      segments.push(part)
    }
  }
  return segments.length > 0 ? segments.join('/') : null
}

/**
 * URL web (http/https) dont le chemin désigne un PDF. L'hôte et la query sont ignorés :
 * "google.com/search?q=cours.pdf" ou "exemple.pdf.io" ne sont pas des PDF.
 */
export function isPdfUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  let pathname = parsed.pathname
  try {
    pathname = decodeURIComponent(pathname)
  } catch {
    // Encodage invalide : on teste le chemin brut
  }
  const name = pathname.slice(pathname.lastIndexOf('/') + 1)
  return name.length > 4 && name.slice(-4).toLowerCase() === '.pdf'
}
