import { describe, it, expect, beforeEach } from 'vitest'
import { describeApiError, isAccessDenied, notifyApiError } from './apiError'

describe('describeApiError', () => {
  it('retire le préfixe ajouté par Electron', () => {
    const err = new Error(
      'Error invoking remote method \'read-note\': PathAccessError: Accès refusé : le chemin "../x" sort du dossier de notes.'
    )
    expect(describeApiError(err)).toBe('Accès refusé : le chemin "../x" sort du dossier de notes.')
  })

  it('gère une Error simple et une valeur non Error', () => {
    expect(describeApiError(new Error("Error invoking remote method 'x': Error: boom"))).toBe(
      'boom'
    )
    expect(describeApiError(new Error('direct'))).toBe('direct')
    expect(describeApiError('texte')).toBe('texte')
  })
})

describe('isAccessDenied', () => {
  it('reconnaît un refus du main', () => {
    expect(
      isAccessDenied(
        new Error("Error invoking remote method 'x': PathAccessError: Accès refusé : y")
      )
    ).toBe(true)
    expect(isAccessDenied(new Error('ENOENT'))).toBe(false)
  })
})

describe('notifyApiError', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('affiche un message lisible', () => {
    notifyApiError(
      'Lecture de la note',
      new Error("Error invoking remote method 'read-note': Error: Accès refusé : z")
    )
    const toast = document.querySelector('[role="alert"]')
    expect(toast?.textContent).toBe('Lecture de la note : Accès refusé : z')
  })
})
