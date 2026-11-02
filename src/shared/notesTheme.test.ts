import { describe, it, expect } from 'vitest'
import {
  notesThemeHref,
  resolveNotesThemeVariable,
  stripNotesThemeLink,
  NOTES_THEME_FILE
} from './notesTheme'

describe('notesThemeHref', () => {
  it('donne le chemin relatif vers .theme/notes.css selon la profondeur de la note', () => {
    expect(notesThemeHref('note.html')).toBe('.theme/notes.css')
    expect(notesThemeHref('cours/note.html')).toBe('../.theme/notes.css')
    expect(notesThemeHref('cours/algo/note.html')).toBe('../../.theme/notes.css')
  })

  it('accepte les antislashs et un chemin vide', () => {
    expect(notesThemeHref('cours\\algo\\note.html')).toBe('../../.theme/notes.css')
    expect(notesThemeHref('')).toBe(NOTES_THEME_FILE)
  })
})

describe('resolveNotesThemeVariable', () => {
  it('remplace toutes les occurrences de ${NOTES_THEME}', () => {
    expect(resolveNotesThemeVariable('<link href="${NOTES_THEME}">', 'cours/a.html')).toBe(
      '<link href="../.theme/notes.css">'
    )
  })

  it('laisse le reste du snippet intact (tabstops compris)', () => {
    expect(resolveNotesThemeVariable('<title>${1:Titre}</title>', 'a.html')).toBe(
      '<title>${1:Titre}</title>'
    )
  })
})

describe('stripNotesThemeLink', () => {
  it('retire le lien vers le thème partagé et sa fin de ligne', () => {
    const html =
      '<head>\n<title>T</title>\n<link rel="stylesheet" href="../.theme/notes.css" data-nf-theme>\n</head>'
    expect(stripNotesThemeLink(html)).toBe('<head>\n<title>T</title>\n</head>')
  })

  it('garde les autres feuilles de style', () => {
    const html = '<link rel="stylesheet" href="perso.css">'
    expect(stripNotesThemeLink(html)).toBe(html)
  })
})
