/*! NOTE-APP — © 2026 4URE1 — https://github.com/4ure1 — Tous droits réservés. */
import fs from 'fs'
import path from 'path'
import { writeFileAtomic } from './atomicWrite'

// Variable d'environnement qui remplace le dossier de notes par défaut (~/Notes)
export const NOTES_DIR_ENV = 'NOTE_APP_NOTES_DIR'

// Réglages de l'application rangés hors du dossier de notes (dossier userData d'Electron) : le dossier
// choisi au premier lancement, et la visite guidée déjà vue
export const APP_SETUP_FILE_NAME = 'app-setup.json'

export interface AppSetup {
  // Dossier de notes choisi par l'utilisateur (absolu) ; absent = ~/Notes
  notesDir?: string
  // Visite guidée de premier lancement terminée ou passée
  onboardingDone?: boolean
}

// Résout le dossier de notes, dans cet ordre :
// 1. la variable d'environnement (mode test, dev:safe ; un chemin relatif est résolu depuis cwd) ;
// 2. le dossier choisi au premier lancement (chemin absolu valide) ;
// 3. ~/Notes.
// Retourne toujours un chemin absolu.
export function resolveNotesDir(
  envValue: string | undefined,
  homeDir: string,
  cwd: string,
  chosenDir?: string
): string {
  const raw = envValue?.trim()
  if (raw) return path.resolve(cwd, raw)
  const chosen = chosenDir?.trim()
  if (chosen && validateNotesFolder(chosen).ok) return path.resolve(chosen)
  return path.join(homeDir, 'Notes')
}

// Indique si le dossier résolu est le vrai dossier de notes de l'utilisateur
export function isDefaultNotesDir(notesDir: string, homeDir: string): boolean {
  return path.relative(path.join(homeDir, 'Notes'), notesDir) === ''
}

/**
 * Un dossier peut-il servir de dossier de notes ? Chemin absolu, pas la racine d'un disque (l'app y
 * créerait .history, .trash… et en scannerait tout le contenu), pas un dossier système de Windows.
 */
export function validateNotesFolder(
  folder: string
): { ok: true; path: string } | { ok: false; error: string } {
  if (typeof folder !== 'string' || !folder.trim()) {
    return { ok: false, error: 'Aucun dossier indiqué.' }
  }
  const p = folder.trim()
  if (!path.isAbsolute(p)) return { ok: false, error: 'Le chemin du dossier doit être complet.' }
  const resolved = path.resolve(p)
  if (path.parse(resolved).root === resolved || path.dirname(resolved) === resolved) {
    return { ok: false, error: 'Choisis un dossier, pas la racine d’un disque.' }
  }
  const lower = resolved.toLowerCase().replace(/\//g, '\\')
  const forbidden = ['\\windows', '\\program files', '\\program files (x86)', '\\programdata']
  const afterDrive = lower.slice(path.parse(resolved).root.length - 1)
  if (forbidden.some((f) => afterDrive === f || afterDrive.startsWith(f + '\\'))) {
    return { ok: false, error: 'Ce dossier système ne peut pas contenir tes notes.' }
  }
  return { ok: true, path: resolved }
}

export function readAppSetup(file: string): AppSetup {
  try {
    if (!fs.existsSync(file)) return {}
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
    const setup: AppSetup = {}
    if (typeof data.notesDir === 'string') setup.notesDir = data.notesDir
    if (data.onboardingDone === true) setup.onboardingDone = true
    return setup
  } catch (err) {
    console.error('[AppSetup] lecture impossible, valeurs par défaut :', err)
    return {}
  }
}

export function writeAppSetup(file: string, setup: AppSetup): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  writeFileAtomic(file, JSON.stringify(setup, null, 2) + '\n')
}
