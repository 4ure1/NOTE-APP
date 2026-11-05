import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TREE_SORT,
  nextTreeSort,
  parseTreeSort,
  sortTree,
  type SortableNode,
  type TreeSort
} from './treeSort'

const file = (name: string, mtime: number, size: number, birthtime = mtime): SortableNode => ({
  name,
  type: 'file',
  mtime,
  size,
  birthtime
})
const folder = (name: string, children: SortableNode[]): SortableNode => ({
  name,
  type: 'folder',
  children
})

const tree: SortableNode[] = [
  folder('b-dossier', [file('z.md', 100, 10), file('a.html', 300, 30)]),
  folder('a-dossier', [file('x.md', 200, 500)]),
  file('note 10.html', 50, 5),
  file('note 2.md', 400, 1),
  file('cours.pdf', 10, 9000)
]
const names = (nodes: SortableNode[]): string[] => nodes.map((n) => n.name)
const sorted = (key: TreeSort['key'], descending: boolean): SortableNode[] =>
  sortTree(tree, { key, descending })

describe('sortTree', () => {
  it('trie par nom avec les nombres dans l’ordre naturel, dossiers d’abord', () => {
    expect(names(sorted('name', false))).toEqual([
      'a-dossier',
      'b-dossier',
      'cours.pdf',
      'note 2.md',
      'note 10.html'
    ])
  })

  it('trie par date de modification, le dossier prenant sa note la plus récente', () => {
    expect(names(sorted('modified', true))).toEqual([
      'b-dossier',
      'a-dossier',
      'note 2.md',
      'note 10.html',
      'cours.pdf'
    ])
  })

  it('trie par taille, le dossier prenant le total de ses notes', () => {
    expect(names(sorted('size', true))).toEqual([
      'a-dossier',
      'b-dossier',
      'cours.pdf',
      'note 10.html',
      'note 2.md'
    ])
  })

  it('trie par type de fichier', () => {
    expect(names(sorted('type', false)).slice(2)).toEqual([
      'note 10.html',
      'note 2.md',
      'cours.pdf'
    ])
  })

  it('applique le tri à tous les niveaux', () => {
    const b = sorted('modified', true).find((n) => n.name === 'b-dossier')!
    expect(names(b.children!)).toEqual(['a.html', 'z.md'])
  })

  it('garde les dossiers avant les fichiers, même en ordre inverse', () => {
    expect(names(sorted('name', true)).slice(0, 2)).toEqual(['b-dossier', 'a-dossier'])
  })

  it('départage par le nom, et accepte un fichier sans date', () => {
    const nodes: SortableNode[] = [
      { name: 'b.md', type: 'file' },
      { name: 'a.md', type: 'file' }
    ]
    expect(names(sortTree(nodes, { key: 'modified', descending: true }))).toEqual(['a.md', 'b.md'])
  })

  it('ne modifie pas l’arbre reçu', () => {
    const before = names(tree)
    sorted('size', true)
    expect(names(tree)).toEqual(before)
  })
})

describe('nextTreeSort', () => {
  it('part du plus récent et du plus gros, du A au Z pour le nom', () => {
    expect(nextTreeSort(DEFAULT_TREE_SORT, 'modified').descending).toBe(true)
    expect(nextTreeSort(DEFAULT_TREE_SORT, 'size').descending).toBe(true)
    expect(nextTreeSort({ key: 'size', descending: true }, 'name').descending).toBe(false)
  })

  it('inverse l’ordre quand on reprend le même critère', () => {
    expect(nextTreeSort({ key: 'size', descending: true }, 'size')).toEqual({
      key: 'size',
      descending: false
    })
  })
})

describe('parseTreeSort', () => {
  it('relit un tri enregistré', () => {
    expect(parseTreeSort('{"key":"size","descending":true}')).toEqual({
      key: 'size',
      descending: true
    })
  })

  it('revient au tri par défaut si la valeur est absente ou invalide', () => {
    expect(parseTreeSort(null)).toEqual(DEFAULT_TREE_SORT)
    expect(parseTreeSort('pas du json')).toEqual(DEFAULT_TREE_SORT)
    expect(parseTreeSort('{"key":"couleur","descending":true}')).toEqual(DEFAULT_TREE_SORT)
    expect(parseTreeSort('{"key":"size"}')).toEqual(DEFAULT_TREE_SORT)
  })
})
