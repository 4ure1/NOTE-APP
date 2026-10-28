import path from 'path'

// Variable d'environnement qui remplace le dossier de notes par défaut (~/Notes)
export const NOTES_DIR_ENV = 'NOTE_APP_NOTES_DIR'

// Résout le dossier de notes : la variable d'environnement si elle est renseignée
// (un chemin relatif est résolu depuis cwd), sinon ~/Notes. Retourne toujours un chemin absolu.
export function resolveNotesDir(
  envValue: string | undefined,
  homeDir: string,
  cwd: string
): string {
  const raw = envValue?.trim()
  if (!raw) return path.join(homeDir, 'Notes')
  return path.resolve(cwd, raw)
}

// Indique si le dossier résolu est le vrai dossier de notes de l'utilisateur
export function isDefaultNotesDir(notesDir: string, homeDir: string): boolean {
  return path.relative(path.join(homeDir, 'Notes'), notesDir) === ''
}
