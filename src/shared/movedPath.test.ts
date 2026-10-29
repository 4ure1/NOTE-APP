import { describe, it, expect } from 'vitest'
import {
  remapMovedPath,
  remapMovedPaths,
  remapMovedKeys,
  isInsideRemovedPath,
  withoutRemovedPaths
} from './movedPath'

describe('isInsideRemovedPath', () => {
  it('reconnaît la note supprimée et tout le contenu d’un dossier supprimé', () => {
    expect(isInsideRemovedPath('cours/a.html', 'cours/a.html')).toBe(true)
    expect(isInsideRemovedPath('cours/a.html', 'cours')).toBe(true)
    expect(isInsideRemovedPath('cours/algo/poo/b.md', 'cours/algo')).toBe(true)
  })

  it('ignore un voisin au nom proche, un dossier homonyme ailleurs et un chemin vide', () => {
    expect(isInsideRemovedPath('cours-2/a.html', 'cours')).toBe(false)
    expect(isInsideRemovedPath('autre/cours/a.html', 'cours')).toBe(false)
    expect(isInsideRemovedPath('coursA.html', 'cours')).toBe(false)
    expect(isInsideRemovedPath('a.html', '')).toBe(false)
  })

  it('ignore la casse et les barres obliques en bord de chemin', () => {
    expect(isInsideRemovedPath('Cours/A.html', '/cours/')).toBe(true)
  })
})

describe('withoutRemovedPaths', () => {
  it('retire les onglets ouverts dans un dossier supprimé', () => {
    const tabs = ['cours/a.html', 'b.md', 'cours/sous/c.html', 'cours-2/d.html']
    expect(withoutRemovedPaths(tabs, ['cours'])).toEqual(['b.md', 'cours-2/d.html'])
  })

  it('accepte plusieurs éléments supprimés à la fois', () => {
    expect(withoutRemovedPaths(['a.md', 'x/b.md', 'c.md'], ['a.md', 'x'])).toEqual(['c.md'])
  })

  it('renvoie la même liste si rien n’est supprimé', () => {
    const tabs = ['b.md']
    expect(withoutRemovedPaths(tabs, ['cours'])).toBe(tabs)
  })
})

describe('remapMovedPath', () => {
  it('suit le renommage d’une note', () => {
    expect(remapMovedPath('cours/a.html', 'cours/a.html', 'cours/b.html')).toBe('cours/b.html')
  })

  it('suit le renommage ou le déplacement d’un dossier, à toute profondeur', () => {
    expect(remapMovedPath('cours/a.html', 'cours', 'archives/2026')).toBe('archives/2026/a.html')
    expect(remapMovedPath('cours/algo/poo/b.md', 'cours/algo', 'algo')).toBe('algo/poo/b.md')
  })

  it('laisse les chemins hors de l’élément déplacé, y compris un voisin au nom proche', () => {
    expect(remapMovedPath('cours-2/a.html', 'cours', 'archives')).toBe('cours-2/a.html')
    expect(remapMovedPath('autre/cours/a.html', 'cours', 'archives')).toBe('autre/cours/a.html')
    expect(remapMovedPath('coursA.html', 'cours', 'archives')).toBe('coursA.html')
  })

  it('ignore la casse du dossier et garde celle de la suite du chemin', () => {
    expect(remapMovedPath('Cours/Note.html', 'cours', 'archives')).toBe('archives/Note.html')
  })

  it('tolère des barres obliques en début ou fin de chemin', () => {
    expect(remapMovedPath('cours/a.html', '/cours/', 'archives/')).toBe('archives/a.html')
  })

  it('ne fait rien pour un ancien chemin vide ou identique au nouveau', () => {
    expect(remapMovedPath('a.html', '', 'x')).toBe('a.html')
    expect(remapMovedPath('cours/a.html', 'cours', 'cours')).toBe('cours/a.html')
  })
})

describe('remapMovedPaths et remapMovedKeys', () => {
  it('met à jour une sélection ou une liste de favoris', () => {
    const list = ['cours/a.html', 'b.md', 'cours/sous/c.html']
    expect(remapMovedPaths(list, 'cours', 'archives')).toEqual([
      'archives/a.html',
      'b.md',
      'archives/sous/c.html'
    ])
  })

  it('renvoie la même liste si rien ne change', () => {
    const list = ['b.md']
    expect(remapMovedPaths(list, 'cours', 'archives')).toBe(list)
  })

  it('met à jour les clés des tags ou des statuts et garde les valeurs', () => {
    const tags = { 'cours/a.html': ['algo'], 'b.md': ['divers'] }
    expect(remapMovedKeys(tags, 'cours', 'archives')).toEqual({
      'archives/a.html': ['algo'],
      'b.md': ['divers']
    })
  })

  it('renvoie le même objet si aucune clé ne change', () => {
    const tags = { 'b.md': ['divers'] }
    expect(remapMovedKeys(tags, 'cours', 'archives')).toBe(tags)
  })
})
