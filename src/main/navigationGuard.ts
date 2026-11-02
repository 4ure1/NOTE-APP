/**
 * Règles de navigation et d'ouverture d'URL (pures, sans Electron) utilisées par les gardes posées sur
 * tous les webContents dans src/main/index.ts (app.on('web-contents-created')).
 * Hôtes comparés sur new URL().hostname : jamais de recherche de sous-chaîne dans l'URL complète.
 */

function parseUrl(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

// Schémas que l'on peut confier au système (navigateur, client mail). Jamais file:, ms-msdt:, search-ms:…
const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

export function isAllowedExternalUrl(url: string): boolean {
  const parsed = parseUrl(url)
  return parsed !== null && EXTERNAL_PROTOCOLS.has(parsed.protocol)
}

/**
 * Vrai si `hostname` est l'un des domaines donnés ou l'un de leurs sous-domaines
 * ("google.com" accepte "accounts.google.com", pas "evilgoogle.com" ni "google.com.evil.fr").
 */
export function hostMatches(hostname: string, domains: string[]): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  return domains.some((domain) => host === domain || host.endsWith('.' + domain))
}

function httpsHostMatches(url: string, domains: string[], exactHosts: string[] = []): boolean {
  const parsed = parseUrl(url)
  if (!parsed || parsed.protocol !== 'https:') return false
  const host = parsed.hostname.toLowerCase()
  return exactHosts.includes(host) || hostMatches(host, domains)
}

/**
 * Navigation de la fenêtre de l'app vers `url` autorisée ?
 * - app servie par Vite en dev (http) : même origine ;
 * - app en build (file:) : même fichier, en ignorant la query et le hash (navigation interne).
 */
export function isAppUrl(
  url: string,
  appUrl: string,
  isWindows = process.platform === 'win32'
): boolean {
  const target = parseUrl(url)
  const app = parseUrl(appUrl)
  if (!target || !app || target.protocol !== app.protocol) return false
  if (app.protocol === 'http:' || app.protocol === 'https:') return target.origin === app.origin
  if (app.protocol !== 'file:') return false
  const normalize = (u: URL): string => {
    const p = decodeURIComponent(u.pathname)
    return isWindows ? p.toLowerCase() : p
  }
  return target.host === app.host && normalize(target) === normalize(app)
}

// Seules adresses permises aux sous-frames de la fenêtre de l'app (iframes d'aperçu des notes)
export function isAllowedSubframeUrl(url: string): boolean {
  return url === 'about:srcdoc' || url === 'about:blank'
}

// Sites que les <webview> de l'app peuvent charger au départ (panneaux IA et YouTube)
const WEBVIEW_DOMAINS = ['claude.ai', 'chatgpt.com', 'google.com', 'youtube.com', 'youtu.be']

export function isAllowedWebviewSrc(url: string): boolean {
  return url === 'about:blank' || httpsHostMatches(url, WEBVIEW_DOMAINS)
}

// Fenêtres de connexion (OAuth) que les webviews IA peuvent ouvrir avec la session persist:claude
const OAUTH_DOMAINS = ['google.com', 'auth0.com', 'claude.ai', 'chatgpt.com', 'oaistatic.com']
const OAUTH_EXACT_HOSTS = ['appleid.apple.com', 'auth.openai.com']

export function isOAuthPopupUrl(url: string): boolean {
  return httpsHostMatches(url, OAUTH_DOMAINS, OAUTH_EXACT_HOSTS)
}

export function isYouTubeUrl(url: string): boolean {
  return httpsHostMatches(url, ['youtube.com', 'youtu.be'])
}

// Fichiers générés par ChatGPT, téléchargés dans le vault plutôt qu'ouverts
export function isOpenAiFileUrl(url: string): boolean {
  return httpsHostMatches(url, ['files.oaiusercontent.com'])
}
