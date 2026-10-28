import { resolve, relative } from 'node:path'

/**
 * Ensures a relative or absolute path is strictly contained within notesDir.
 * Prevents directory traversal attacks (e.g. ../../etc/passwd or C:\Windows).
 */
export function assertSafeNotePath(notesDir: string, targetPath: string): string {
  if (!targetPath || typeof targetPath !== 'string') {
    throw new Error('Chemin de note invalide : chaîne non vide requise.')
  }

  // Normalize separators to forward slash for consistency
  const cleanInput = targetPath.trim().replace(/^[/\\]+/, '')
  const fullPath = resolve(notesDir, cleanInput)
  const rel = relative(notesDir, fullPath)

  // A safe relative path cannot start with '..' and cannot be absolute
  if (rel.startsWith('..') || resolve(fullPath) !== fullPath || !fullPath.startsWith(resolve(notesDir))) {
    throw new Error(`Accès refusé : le chemin "${targetPath}" sort du dossier de notes autorisé.`)
  }

  return fullPath
}

/**
 * Sanitizes a folder or note name by removing invalid file name characters.
 */
export function sanitizeFileName(name: string): string {
  if (!name) return 'Sans-titre'
  // Remove Windows forbidden characters: < > : " / \ | ? *
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').trim()
}
