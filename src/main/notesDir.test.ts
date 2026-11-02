import path from 'path'
import os from 'os'
import { describe, it, expect } from 'vitest'
import { resolveNotesDir, isDefaultNotesDir } from './notesDir'

const home = path.join(os.tmpdir(), 'home-test')
const cwd = path.join(os.tmpdir(), 'projet-test')

describe('resolveNotesDir', () => {
  it('utilise ~/Notes quand la variable est absente', () => {
    expect(resolveNotesDir(undefined, home, cwd)).toBe(path.join(home, 'Notes'))
  })

  it('utilise ~/Notes quand la variable est vide ou ne contient que des espaces', () => {
    expect(resolveNotesDir('', home, cwd)).toBe(path.join(home, 'Notes'))
    expect(resolveNotesDir('   ', home, cwd)).toBe(path.join(home, 'Notes'))
  })

  it('résout un chemin relatif depuis le dossier courant', () => {
    expect(resolveNotesDir('./test-vault', home, cwd)).toBe(path.join(cwd, 'test-vault'))
    expect(resolveNotesDir('  test-vault  ', home, cwd)).toBe(path.join(cwd, 'test-vault'))
  })

  it('normalise les segments ..', () => {
    expect(resolveNotesDir('../vault', home, cwd)).toBe(path.join(os.tmpdir(), 'vault'))
  })

  it('garde un chemin absolu tel quel', () => {
    const abs = path.join(os.tmpdir(), 'autre-vault')
    expect(resolveNotesDir(abs, home, cwd)).toBe(abs)
  })
})

describe('isDefaultNotesDir', () => {
  it('reconnaît ~/Notes, avec ou sans séparateur final', () => {
    expect(isDefaultNotesDir(path.join(home, 'Notes'), home)).toBe(true)
    expect(isDefaultNotesDir(path.join(home, 'Notes') + path.sep, home)).toBe(true)
  })

  it('ne confond pas un dossier de test ni un sous-dossier avec ~/Notes', () => {
    expect(isDefaultNotesDir(path.join(cwd, 'test-vault'), home)).toBe(false)
    expect(isDefaultNotesDir(path.join(home, 'Notes', 'cours'), home)).toBe(false)
  })
})

describe('dossier choisi au premier lancement', () => {
  it('ordre : variable de test, puis dossier choisi, puis ~/Notes', async () => {
    const { resolveNotesDir: resolve } = await import('./notesDir')
    const chosen = path.join(os.tmpdir(), 'Mes cours')
    expect(resolve(undefined, home, cwd, chosen)).toBe(chosen)
    expect(resolve('./test-vault', home, cwd, chosen)).toBe(path.join(cwd, 'test-vault'))
    expect(resolve(undefined, home, cwd, '')).toBe(path.join(home, 'Notes'))
    // Un choix invalide (relatif, racine) est ignoré
    expect(resolve(undefined, home, cwd, 'relatif')).toBe(path.join(home, 'Notes'))
    expect(resolve(undefined, home, cwd, path.parse(chosen).root)).toBe(path.join(home, 'Notes'))
  })

  it('validateNotesFolder refuse la racine d’un disque, les chemins relatifs et les dossiers système', async () => {
    const { validateNotesFolder } = await import('./notesDir')
    expect(validateNotesFolder(path.join(os.tmpdir(), 'notes')).ok).toBe(true)
    expect(validateNotesFolder('notes').ok).toBe(false)
    expect(validateNotesFolder('').ok).toBe(false)
    expect(validateNotesFolder(path.parse(os.tmpdir()).root).ok).toBe(false)
    if (process.platform === 'win32') {
      expect(validateNotesFolder(path.win32.join('C:\\', 'Windows', 'Notes')).ok).toBe(false)
      expect(validateNotesFolder(path.win32.join('C:\\', 'Program Files', 'Notes')).ok).toBe(false)
      expect(validateNotesFolder(path.win32.join('D:\\', 'Cours', 'Notes')).ok).toBe(true)
    }
  })

  it('réglages : écrits de façon atomique, relus en ignorant le reste', async () => {
    const fs = await import('fs')
    const { readAppSetup, writeAppSetup } = await import('./notesDir')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-app-setup-'))
    const file = path.join(dir, 'app-setup.json')
    expect(readAppSetup(file)).toEqual({})
    const chosen = path.join(os.tmpdir(), 'Notes perso')
    writeAppSetup(file, { notesDir: chosen, onboardingDone: true })
    expect(readAppSetup(file)).toEqual({ notesDir: chosen, onboardingDone: true })
    fs.writeFileSync(file, '{"notesDir": 3, "onboardingDone": "oui", "autre": 1}')
    expect(readAppSetup(file)).toEqual({})
    fs.writeFileSync(file, 'pas du json')
    expect(readAppSetup(file)).toEqual({})
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
