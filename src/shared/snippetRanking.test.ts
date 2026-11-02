import { describe, it, expect } from 'vitest'
import { rankSnippets } from './snippetRanking'

const list = [
  { prefix: 'note', name: 'Bloc note', description: 'Analogie', category: 'Blocs' },
  { prefix: 'ho', name: 'Texte orange', description: 'Couleur', category: 'Couleurs' },
  { prefix: 'h2-couleur', name: 'Titre h2 coloré', description: '', category: 'Titres' },
  { prefix: 'h2', name: 'Titre 2', description: '', category: 'Titres' },
  { prefix: 'cards', name: 'Trois cartes', description: 'orange inclus', category: 'Mise en page' }
]

describe('rankSnippets', () => {
  it('préfixe exact d’abord, puis préfixes qui commencent par la saisie', () => {
    expect(rankSnippets(list, 'h2').map((s) => s.prefix)).toEqual(['h2', 'h2-couleur'])
  })

  it('début d’un mot du nom avant la description', () => {
    expect(rankSnippets(list, 'orange').map((s) => s.prefix)).toEqual(['ho', 'cards'])
  })

  it('ignore la casse et les espaces ; saisie vide = tout, dans l’ordre', () => {
    expect(rankSnippets(list, '  NOTE ').map((s) => s.prefix)).toEqual(['note'])
    expect(rankSnippets(list, '')).toEqual(list)
  })

  it('rien ne correspond : liste vide', () => {
    expect(rankSnippets(list, 'zzz')).toEqual([])
  })

  it('reste autonome une fois sérialisée', () => {
    const rebuilt = new Function(`return (${rankSnippets.toString()})`)() as typeof rankSnippets
    expect(rebuilt(list, 'ho')[0].prefix).toBe('ho')
  })
})
