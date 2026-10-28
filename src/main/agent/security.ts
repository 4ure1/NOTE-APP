import fs from 'node:fs'
import path from 'node:path'

// Erreur levée quand un chemin sort du dossier de notes ou n'est pas un nom de fichier sûr
export class PathAccessError extends Error {
  constructor(detail: string) {
    super(`Accès refusé : ${detail}`)
    this.name = 'PathAccessError'
  }
}

export interface SafePathOptions {
  // Autorise la racine du dossier de notes ('' ou '.')
  allowRoot?: boolean
  // Autorise les entrées internes de la racine (.history, .trash, .snippets, .templates, .config.json)
  allowInternal?: boolean
}

const INTERNAL_ENTRIES = new Set(['.history', '.trash', '.snippets', '.templates', '.config.json'])
// Les caractères de contrôle sont interdits dans les noms Windows : la regex les cible volontairement
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[<>:"|?*\x00-\x1F]/
const RESERVED_NAME = /^(con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i
const IS_WINDOWS = process.platform === 'win32'

// Cache du chemin réel de chaque dossier de notes (calculé une fois, le dossier peut être une jonction)
const realRootCache = new Map<string, string>()

function comparable(p: string): string {
  return IS_WINDOWS ? p.toLowerCase() : p
}

// Vrai si `target` est `root` ou se trouve dessous (insensible à la casse sous Windows)
function isInsideOrEqual(root: string, target: string): boolean {
  const rel = path.relative(comparable(root), comparable(target))
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel))
}

function getRealRoot(notesDir: string): string {
  const key = path.resolve(notesDir)
  const cached = realRootCache.get(key)
  if (cached) return cached
  try {
    const real = fs.realpathSync.native(key)
    realRootCache.set(key, real)
    return real
  } catch {
    // Dossier pas encore créé : on compare au chemin lexical sans le mettre en cache
    return key
  }
}

function checkSegment(segment: string, original: string): void {
  if (segment === '..') {
    throw new PathAccessError(`le chemin "${original}" sort du dossier de notes.`)
  }
  if (FORBIDDEN_CHARS.test(segment)) {
    throw new PathAccessError(`le chemin "${original}" contient un caractère interdit.`)
  }
  if (/[. ]$/.test(segment)) {
    throw new PathAccessError(`le nom "${segment}" se termine par un point ou un espace.`)
  }
  if (RESERVED_NAME.test(segment)) {
    throw new PathAccessError(`"${segment}" est un nom réservé par Windows.`)
  }
}

// Le chemin réel du plus proche élément existant (lien ou jonction compris) doit rester dans le dossier
function assertRealPathInside(notesDir: string, fullPath: string, original: string): void {
  const realRoot = getRealRoot(notesDir)
  let current = fullPath
  for (;;) {
    let exists = false
    try {
      fs.lstatSync(current)
      exists = true
    } catch {
      exists = false
    }
    if (exists) {
      let real: string
      try {
        real = fs.realpathSync.native(current)
      } catch {
        throw new PathAccessError(`le chemin "${original}" passe par un lien cassé.`)
      }
      if (!isInsideOrEqual(realRoot, real)) {
        throw new PathAccessError(`le chemin "${original}" mène hors du dossier de notes.`)
      }
      return
    }
    const parent = path.dirname(current)
    if (parent === current) return
    current = parent
  }
}

/**
 * Vérifie qu'un chemin relatif reçu (IPC, agent) reste strictement dans notesDir et renvoie
 * le chemin absolu. Refuse les chemins absolus (lecteur, UNC, \\?\, / initial), "..", les
 * caractères interdits (dont ":" des flux NTFS), les noms réservés, les points ou espaces finaux,
 * les liens et jonctions qui sortent du dossier, la racine et les entrées internes (sauf options).
 */
export function assertSafeNotePath(
  notesDir: string,
  targetPath: string,
  options: SafePathOptions = {}
): string {
  if (typeof targetPath !== 'string') {
    throw new PathAccessError('chemin de note invalide (chaîne attendue).')
  }
  if (/^[/\\]/.test(targetPath) || /^[a-zA-Z]:/.test(targetPath)) {
    throw new PathAccessError(`le chemin "${targetPath}" est absolu.`)
  }

  const segments = targetPath.split(/[/\\]/).filter((s) => s !== '' && s !== '.')
  for (const segment of segments) checkSegment(segment, targetPath)

  if (segments.length === 0) {
    if (!options.allowRoot) {
      throw new PathAccessError('la racine du dossier de notes ne peut pas être ciblée.')
    }
    return path.resolve(notesDir)
  }

  if (!options.allowInternal && INTERNAL_ENTRIES.has(segments[0].toLowerCase())) {
    throw new PathAccessError(`"${segments[0]}" est un dossier interne de l'application.`)
  }

  const root = path.resolve(notesDir)
  const fullPath = path.resolve(root, ...segments)
  if (!isInsideOrEqual(root, fullPath) || comparable(fullPath) === comparable(root)) {
    throw new PathAccessError(`le chemin "${targetPath}" sort du dossier de notes.`)
  }

  assertRealPathInside(root, fullPath, targetPath)
  return fullPath
}

/**
 * Vérifie un nom simple (fichier ou dossier, sans séparateur) et le renvoie inchangé.
 */
export function assertSafeFileName(name: string): string {
  if (typeof name !== 'string' || name === '' || name === '.' || name === '..') {
    throw new PathAccessError(`nom de fichier invalide "${String(name)}".`)
  }
  if (/[/\\]/.test(name)) {
    throw new PathAccessError(`le nom "${name}" ne doit pas contenir de séparateur.`)
  }
  checkSegment(name, name)
  return name
}

/**
 * Nettoie un nom de fichier venant du réseau (Content-Disposition, URL, webview) au lieu de le
 * refuser : dernier segment seulement, caractères interdits remplacés, noms réservés préfixés.
 */
export function sanitizeDownloadName(rawName: string, extension = '.pdf'): string {
  const lastSegment = String(rawName ?? '')
    .split(/[/\\]/)
    .pop() as string
  let name = lastSegment
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"|?*\x00-\x1F]/g, '-')
    .trim()
    .replace(/[. ]+$/, '')
  if (!name || name === '.' || name === '..') name = 'document'
  if (RESERVED_NAME.test(name)) name = `_${name}`
  if (extension && !name.toLowerCase().endsWith(extension.toLowerCase())) name += extension
  if (name.length > 200) name = name.slice(0, 200 - extension.length) + extension
  return name
}

// Identifiant d'instantané Time Travel (timestamp en millisecondes)
export function isVersionId(value: unknown): value is string {
  return typeof value === 'string' && /^\d{1,16}$/.test(value)
}

// Identifiant d'opération de renommage (op_<timestamp>_<aléatoire>)
export function isOperationId(value: unknown): value is string {
  return typeof value === 'string' && /^op_\d+_[a-z0-9]+$/.test(value)
}

/**
 * Sanitizes a folder or note name by removing invalid file name characters.
 */
export function sanitizeFileName(name: string): string {
  if (!name) return 'Sans-titre'
  // Remove Windows forbidden characters: < > : " / \ | ? *
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').trim()
}
