import { describe, it, expect } from 'vitest'
import { decideNoteSave, shouldConfirmLeavingNote, previewMatchesNote } from './noteSaveGuard'

describe('previewMatchesNote', () => {
  it('accepte un aperçu construit pour la note ouverte, une fois son contenu chargé', () => {
    expect(
      previewMatchesNote({ previewFile: 'a.html', currentFile: 'a.html', contentFile: 'a.html' })
    ).toBe(true)
  })

  it('refuse un aperçu resté sur la note précédente (aperçu figé après une saisie)', () => {
    expect(
      previewMatchesNote({ previewFile: 'b.html', currentFile: 'a.html', contentFile: 'a.html' })
    ).toBe(false)
  })

  it('refuse un aperçu tant que la lecture de la nouvelle note n’est pas finie', () => {
    // L'éditeur contient encore l'ancienne note : l'aperçu ne doit rien enregistrer dans la nouvelle
    expect(
      previewMatchesNote({ previewFile: 'a.html', currentFile: 'a.html', contentFile: 'b.html' })
    ).toBe(false)
    expect(
      previewMatchesNote({ previewFile: 'a.html', currentFile: 'a.html', contentFile: null })
    ).toBe(false)
  })

  it('refuse sans note ouverte', () => {
    expect(previewMatchesNote({ previewFile: null, currentFile: null, contentFile: null })).toBe(
      false
    )
  })
})

describe('shouldConfirmLeavingNote', () => {
  const base = {
    conflictFile: 'a.html',
    activeFile: 'a.html',
    targetFile: 'b.html',
    hasUnsavedEdits: true
  }

  it('demande avant de quitter une note en conflit avec une saisie non enregistrée', () => {
    expect(shouldConfirmLeavingNote(base)).toBe(true)
  })

  it('demande aussi quand on ferme l’onglet sans en ouvrir un autre', () => {
    expect(shouldConfirmLeavingNote({ ...base, targetFile: null })).toBe(true)
  })

  it('ne demande rien sans conflit, sans saisie, ou en restant sur la même note', () => {
    expect(shouldConfirmLeavingNote({ ...base, conflictFile: null })).toBe(false)
    expect(shouldConfirmLeavingNote({ ...base, hasUnsavedEdits: false })).toBe(false)
    expect(shouldConfirmLeavingNote({ ...base, targetFile: 'a.html' })).toBe(false)
  })

  it('ignore un conflit qui concerne une autre note que celle ouverte', () => {
    expect(shouldConfirmLeavingNote({ ...base, conflictFile: 'c.html' })).toBe(false)
  })
})

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
