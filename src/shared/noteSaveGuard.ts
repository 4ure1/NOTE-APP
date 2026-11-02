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

/**
 * Faut-il demander avant de quitter la note ouverte ? Oui seulement si elle est en conflit avec le disque
 * et que l'éditeur contient une saisie non enregistrée : la sauvegarde automatique est alors en pause,
 * et changer de note abandonnerait cette saisie.
 */
export function shouldConfirmLeavingNote(params: {
  conflictFile: string | null
  activeFile: string | null
  targetFile: string | null
  hasUnsavedEdits: boolean
}): boolean {
  const { conflictFile, activeFile, targetFile, hasUnsavedEdits } = params
  if (!conflictFile || !activeFile || conflictFile !== activeFile) return false
  if (targetFile === activeFile) return false
  return hasUnsavedEdits
}

/**
 * L'aperçu affiche-t-il le contenu chargé de la note ouverte ? Après un changement de note, il peut
 * encore montrer l'ancienne note (contenu en cours de lecture, aperçu figé pendant une saisie) : il est
 * alors remplacé par un écran neutre, et ses modifications sont ignorées, sinon le HTML de l'ancienne
 * note serait enregistré dans la nouvelle.
 */
export function previewMatchesNote(params: {
  // Note pour laquelle l'aperçu affiché a été construit
  previewFile: string | null
  // Note ouverte
  currentFile: string | null
  // Note dont le contenu de l'éditeur est issu (lecture terminée)
  contentFile: string | null
}): boolean {
  const { previewFile, currentFile, contentFile } = params
  return !!currentFile && previewFile === currentFile && contentFile === currentFile
}

export function decideNoteSave(
  saved: SavedNoteState,
  file: string,
  content: string
): NoteSaveDecision {
  if (saved.file === null || saved.file !== file) return 'not-loaded'
  if (saved.content === content) return 'unchanged'
  return 'write'
}
