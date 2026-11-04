import { describe, it, expect } from 'vitest'
import { filterMoveTargets, listMoveTargets, type MoveTreeNode } from './moveTargets'

const tree: MoveTreeNode[] = [
  {
    relativePath: 'cours',
    type: 'folder',
    children: [
      {
        relativePath: 'cours/reseaux',
        type: 'folder',
        children: [{ relativePath: 'cours/reseaux/tcp.html', type: 'file' }]
      },
      { relativePath: 'cours/intro.html', type: 'file' }
    ]
  },
  { relativePath: 'projets', type: 'folder', children: [] },
  { relativePath: 'note.md', type: 'file' }
]

describe('listMoveTargets', () => {
  it('propose la racine et tous les dossiers, sans les fichiers', () => {
    expect(listMoveTargets(tree, 'cours/intro.html')).toEqual(['', 'cours/reseaux', 'projets'])
  })

  it('retire le dossier actuel de la note', () => {
    expect(listMoveTargets(tree, 'cours/reseaux/tcp.html')).toEqual(['', 'cours', 'projets'])
  })

  it('retire la racine pour un élément déjà à la racine', () => {
    expect(listMoveTargets(tree, 'note.md')).toEqual(['cours', 'cours/reseaux', 'projets'])
  })

  it('ne propose ni un dossier ni ses sous-dossiers pour le déplacer', () => {
    expect(listMoveTargets(tree, 'cours')).toEqual(['projets'])
  })

  it('ne confond pas un dossier avec un autre au préfixe commun', () => {
    const nodes: MoveTreeNode[] = [
      { relativePath: 'cours', type: 'folder', children: [] },
      { relativePath: 'cours-2', type: 'folder', children: [] }
    ]
    expect(listMoveTargets(nodes, 'cours')).toEqual(['cours-2'])
  })
})

describe('filterMoveTargets', () => {
  const targets = ['', 'cours/reseaux', 'projets']

  it('garde tout sans saisie', () => {
    expect(filterMoveTargets(targets, '  ')).toEqual(targets)
  })

  it('filtre sans tenir compte de la casse', () => {
    expect(filterMoveTargets(targets, 'RESEAUX')).toEqual(['cours/reseaux'])
  })

  it('trouve la racine par son nom', () => {
    expect(filterMoveTargets(targets, 'rac')).toEqual([''])
  })
})
