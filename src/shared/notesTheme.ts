/**
 * Thème partagé des notes : un seul fichier CSS dans le dossier de notes, tenu à jour par l'app à partir
 * de theme.css, auquel les notes créées avec /page se relient par
 * <link rel="stylesheet" href="…/.theme/notes.css" data-nf-theme>.
 * Dans l'app, ce lien ne sert pas (l'aperçu et l'export embarquent le thème) : il garde le style quand la
 * note est ouverte directement dans un navigateur.
 */

// Chemin du thème partagé, relatif à la racine du dossier de notes (POSIX)
export const NOTES_THEME_FILE = '.theme/notes.css'

// Chemin relatif d'une note (POSIX, relatif au dossier de notes) vers le thème partagé
export function notesThemeHref(notePath: string): string {
  const depth = notePath.replace(/\\/g, '/').split('/').filter(Boolean).length - 1
  return '../'.repeat(Math.max(0, depth)) + NOTES_THEME_FILE
}

// Remplace la variable de snippet ${NOTES_THEME} par le chemin calculé pour la note
export function resolveNotesThemeVariable(text: string, notePath: string): string {
  return text.split('${NOTES_THEME}').join(notesThemeHref(notePath))
}

// Retire le lien vers le thème partagé (export autonome : le thème y est déjà embarqué)
export function stripNotesThemeLink(html: string): string {
  return html.replace(/<link\b[^>]*\bdata-nf-theme\b[^>]*>[ \t]*\r?\n?/gi, '')
}

// En-tête du fichier .theme/notes.css écrit par l'app
export const NOTES_THEME_HEADER =
  '/* Thème NOTE-APP : fichier géré par l’application, réécrit à chaque mise à jour du thème.\n' +
  '   Ne pas le modifier : les styles propres à une note vont dans cette note. */\n'
