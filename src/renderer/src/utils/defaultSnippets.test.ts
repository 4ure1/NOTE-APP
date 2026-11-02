import { describe, it, expect } from 'vitest'
import mainDefaults from '../../../main/defaultSnippets.json'
import rendererDefaults from '../assets/snippets.default.json'
import { expandSnippet } from './snippetEngine'

const CATEGORIES = [
  'Structure',
  'Blocs',
  'Mise en page',
  'Code',
  'Texte',
  'Quiz',
  'Markdown',
  'Divers'
]

describe('snippets par défaut', () => {
  const snippets = mainDefaults.snippets

  it('les deux fichiers par défaut sont identiques', () => {
    expect(rendererDefaults).toEqual(mainDefaults)
  })

  it('préfixes uniques, identiques à l’id, en minuscules avec tirets', () => {
    const prefixes = snippets.map((s) => s.prefix)
    expect(new Set(prefixes).size).toBe(prefixes.length)
    for (const s of snippets) {
      expect(s.id, s.prefix).toBe(s.prefix)
      expect(s.prefix, s.prefix).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  it('champs, catégorie et portée valides', () => {
    for (const s of snippets) {
      expect(s.name, s.prefix).toBeTruthy()
      expect(s.description, s.prefix).toBeTruthy()
      expect(CATEGORIES, s.prefix).toContain(s.category)
      expect(['html', 'markdown', 'all'], s.prefix).toContain(s.scope)
      expect(Array.isArray(s.body) && s.body.length > 0, s.prefix).toBe(true)
    }
  })

  it('chaque snippet se développe sans variable ni tabstop résiduel', () => {
    for (const s of snippets) {
      for (const selected of ['', 'texte sélectionné']) {
        const { text } = expandSnippet(s.body, selected)
        expect(text, `${s.prefix} (sélection : "${selected}")`).not.toMatch(
          /\$\{|\$\d|\$[A-Z_]{3,}/
        )
      }
    }
  })

  it('le texte sélectionné est repris par les snippets qui l’utilisent', () => {
    for (const s of snippets) {
      if (!s.body.join('\n').includes('TM_SELECTED_TEXT')) continue
      expect(expandSnippet(s.body, 'MARQUEUR').text, s.prefix).toContain('MARQUEUR')
    }
  })

  it('aucune ressource externe dans un snippet', () => {
    for (const s of snippets) {
      expect(s.body.join('\n'), s.prefix).not.toMatch(/(src|href)="(https?:)?\/\//i)
    }
  })
})
