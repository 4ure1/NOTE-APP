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
