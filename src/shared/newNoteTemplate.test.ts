import { describe, it, expect } from 'vitest'
import { buildNewHtmlNote, displayTitle } from './newNoteTemplate'
import { REPOSITORY } from './credits'

describe('buildNewHtmlNote', () => {
  it('page reliée au thème partagé, au bon niveau de dossier', () => {
    const html = buildNewHtmlNote('Cours SQL', 'SQL/Chapitre 1/Cours SQL.html')
    expect(html).toContain('<link rel="stylesheet" href="../../.theme/notes.css" data-nf-theme>')
    expect(html).toContain('<title>Cours SQL</title>')
    expect(html).toContain('<h1>Cours SQL</h1>')
    expect(buildNewHtmlNote('x', 'x.html')).toContain('href=".theme/notes.css"')
  })

  it('carte « Créé avec NOTE-APP » qui renvoie au dépôt GitHub', () => {
    const html = buildNewHtmlNote('Note', 'Note.html')
    expect(html).toContain('<a class="nf-credit" href="' + REPOSITORY + '">')
    expect(html).toContain('4URE1')
  })

  it('échappe le titre et remplace les noms provisoires', () => {
    expect(buildNewHtmlNote('<b>&', 'a.html')).toContain('<h1>&lt;b&gt;&amp;</h1>')
    expect(displayTitle('page')).toBe('Nouvelle note')
    expect(displayTitle('page 3')).toBe('Nouvelle note')
    expect(displayTitle('Pages perso')).toBe('Pages perso')
  })

  it('HTML bien formé : un seul <body>, document complet', () => {
    const doc = new DOMParser().parseFromString(buildNewHtmlNote('T', 'T.html'), 'text/html')
    expect(doc.querySelectorAll('.container')).toHaveLength(1)
    expect(doc.querySelector('.nf-credit .nf-credit-name')!.textContent).toBe('NOTE-APP')
  })
})
