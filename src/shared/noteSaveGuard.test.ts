import { describe, it, expect } from 'vitest'
import { decideNoteSave } from './noteSaveGuard'

describe('decideNoteSave', () => {
  it('écrit une note lue dont le contenu a changé', () => {
    expect(decideNoteSave({ file: 'a.html', content: 'v1' }, 'a.html', 'v2')).toBe('write')
  })

  it('n’écrit pas un contenu identique au disque (ouverture, clic, blur sans modification)', () => {
    expect(decideNoteSave({ file: 'a.html', content: 'v1' }, 'a.html', 'v1')).toBe('unchanged')
  })

  it('n’écrit jamais une note dont la lecture a échoué ou n’est pas finie', () => {
    expect(decideNoteSave({ file: null, content: '' }, 'a.html', 'texte tapé')).toBe('not-loaded')
    expect(decideNoteSave({ file: null, content: '' }, 'a.html', '')).toBe('not-loaded')
  })

  it('n’écrit jamais dans une autre note que celle qui a été lue', () => {
    // Ex. onChange tardif de l'ancienne note après un changement d'onglet
    expect(decideNoteSave({ file: 'b.html', content: 'B' }, 'a.html', 'A modifié')).toBe(
      'not-loaded'
    )
  })

  it('distingue la casse des chemins', () => {
    expect(decideNoteSave({ file: 'A.html', content: 'x' }, 'a.html', 'y')).toBe('not-loaded')
  })
})
