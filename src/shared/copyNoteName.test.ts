import { describe, it, expect } from 'vitest'
import { copyNoteName } from './copyNoteName'

describe('copyNoteName', () => {
  it('ajoute « (ma version) » avant l’extension, dans le même dossier', () => {
    expect(copyNoteName('cours/note.html', [])).toBe('cours/note (ma version).html')
    expect(copyNoteName('note.md', [])).toBe('note (ma version).md')
  })

  it('numérote si le nom est déjà pris, sans tenir compte de la casse', () => {
    const existing = ['cours/note (ma version).html', 'cours/NOTE (MA VERSION 2).HTML']
    expect(copyNoteName('cours/note.html', existing)).toBe('cours/note (ma version 3).html')
  })

  it('gère un nom sans extension et un nom à plusieurs points', () => {
    expect(copyNoteName('dossier/LISEZMOI', [])).toBe('dossier/LISEZMOI (ma version)')
    expect(copyNoteName('cours.pdf.md', [])).toBe('cours.pdf (ma version).md')
  })

  it('ne prend pas le point d’un dossier pour une extension', () => {
    expect(copyNoteName('v1.2/note', [])).toBe('v1.2/note (ma version)')
  })
})
