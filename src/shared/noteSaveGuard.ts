/**
 * Règle d'écriture de la note ouverte (App.tsx) : on n'écrit jamais une note qui n'a pas été lue
 * avec succès dans cette session (lecture en cours ou échouée), ni un contenu identique au disque.
 */

export interface SavedNoteState {
  // Note dont le contenu sur le disque est connu (null : aucune, ou lecture en cours / échouée)
  file: string | null
  // Dernier contenu lu ou écrit par l'app pour cette note
  content: string
}

export type NoteSaveDecision = 'write' | 'not-loaded' | 'unchanged'

export function decideNoteSave(
  saved: SavedNoteState,
  file: string,
  content: string
): NoteSaveDecision {
  if (saved.file === null || saved.file !== file) return 'not-loaded'
  if (saved.content === content) return 'unchanged'
  return 'write'
}
