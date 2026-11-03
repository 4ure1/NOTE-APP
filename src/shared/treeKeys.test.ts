import { describe, it, expect } from 'vitest'
import { treeKeyAction, type TreeKeyContext } from './treeKeys'

const file = (over: Partial<TreeKeyContext> = {}): TreeKeyContext => ({
  index: 2,
  count: 5,
  isFolder: false,
  isOpen: false,
  hasChildren: false,
  parentIndex: 1,
  ...over
})
const folder = (over: Partial<TreeKeyContext> = {}): TreeKeyContext =>
  file({ isFolder: true, hasChildren: true, ...over })

describe('treeKeyAction', () => {
  it('descend et monte entre les lignes visibles, sans sortir de l’arbre', () => {
    expect(treeKeyAction('ArrowDown', false, file())).toEqual({ kind: 'focus', index: 3 })
    expect(treeKeyAction('ArrowUp', false, file())).toEqual({ kind: 'focus', index: 1 })
    expect(treeKeyAction('ArrowDown', false, file({ index: 4 }))).toEqual({ kind: 'none' })
    expect(treeKeyAction('ArrowUp', false, file({ index: 0 }))).toEqual({ kind: 'none' })
  })

  it('va à la première et à la dernière ligne avec Début et Fin', () => {
    expect(treeKeyAction('Home', false, file())).toEqual({ kind: 'focus', index: 0 })
    expect(treeKeyAction('End', false, file())).toEqual({ kind: 'focus', index: 4 })
  })

  it('déplie un dossier replié, puis entre dans son premier enfant', () => {
    expect(treeKeyAction('ArrowRight', false, folder())).toEqual({ kind: 'expand' })
    expect(treeKeyAction('ArrowRight', false, folder({ isOpen: true }))).toEqual({
      kind: 'focus',
      index: 3
    })
  })

  it('ne saute pas au voisin depuis un dossier déplié mais vide', () => {
    expect(
      treeKeyAction('ArrowRight', false, folder({ isOpen: true, hasChildren: false }))
    ).toEqual({
      kind: 'none'
    })
  })

  it('ignore la flèche droite sur une note', () => {
    expect(treeKeyAction('ArrowRight', false, file())).toEqual({ kind: 'none' })
  })

  it('replie un dossier déplié, sinon remonte au dossier parent', () => {
    expect(treeKeyAction('ArrowLeft', false, folder({ isOpen: true }))).toEqual({
      kind: 'collapse'
    })
    expect(treeKeyAction('ArrowLeft', false, folder())).toEqual({ kind: 'focus', index: 1 })
    expect(treeKeyAction('ArrowLeft', false, file())).toEqual({ kind: 'focus', index: 1 })
    expect(treeKeyAction('ArrowLeft', false, file({ parentIndex: -1 }))).toEqual({ kind: 'none' })
  })

  it('ouvre avec Entrée ou Espace', () => {
    expect(treeKeyAction('Enter', false, file())).toEqual({ kind: 'activate' })
    expect(treeKeyAction(' ', false, folder())).toEqual({ kind: 'activate' })
  })

  it('ouvre le menu contextuel avec la touche Menu ou Maj+F10, renomme avec F2', () => {
    expect(treeKeyAction('ContextMenu', false, file())).toEqual({ kind: 'menu' })
    expect(treeKeyAction('F10', true, file())).toEqual({ kind: 'menu' })
    expect(treeKeyAction('F10', false, file())).toEqual({ kind: 'none' })
    expect(treeKeyAction('F2', false, file())).toEqual({ kind: 'rename' })
  })

  it('laisse passer les autres touches', () => {
    expect(treeKeyAction('a', false, file())).toEqual({ kind: 'none' })
    expect(treeKeyAction('Delete', false, file())).toEqual({ kind: 'none' })
  })
})
