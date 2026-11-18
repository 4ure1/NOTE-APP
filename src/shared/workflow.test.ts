import { describe, it, expect } from 'vitest'
import {
  DEFAULT_WORKFLOW_COLUMNS,
  addColumn,
  moveColumn,
  newColumnId,
  notesInColumn,
  removeColumn,
  renameColumn,
  sanitizeColumns,
  sanitizeStatuses,
  setNoteStatus,
  toggleColumnCollapsed
} from './workflow'

describe('sanitizeColumns', () => {
  it('colonnes par défaut si rien d’exploitable', () => {
    expect(sanitizeColumns(undefined)).toEqual(DEFAULT_WORKFLOW_COLUMNS)
    expect(sanitizeColumns([])).toEqual(DEFAULT_WORKFLOW_COLUMNS)
    expect(sanitizeColumns([{ id: 'a' }, null, 'x'])).toEqual(DEFAULT_WORKFLOW_COLUMNS)
  })

  it('garde les colonnes valides, sans doublon, libellés nettoyés', () => {
    expect(
      sanitizeColumns([
        { id: 'a', label: '  Lire   ', collapsed: true },
        { id: 'a', label: 'Doublon' },
        { id: 'b', label: '   ' },
        { id: 'c', label: 'Écrire', collapsed: 'oui' }
      ])
    ).toEqual([
      { id: 'a', label: 'Lire', collapsed: true },
      { id: 'c', label: 'Écrire' }
    ])
  })
})

describe('sanitizeStatuses', () => {
  it('oublie les statuts qui visent une colonne disparue ou mal formés', () => {
    const cols = [{ id: 'todo', label: 'À faire' }]
    expect(sanitizeStatuses({ 'a.html': 'todo', 'b.html': 'gone', 'c.html': 3 }, cols)).toEqual({
      'a.html': 'todo'
    })
    expect(sanitizeStatuses(['x'], cols)).toEqual({})
    expect(sanitizeStatuses(null, cols)).toEqual({})
  })
})

describe('colonnes', () => {
  const base = [
    { id: 'todo', label: 'À faire' },
    { id: 'done', label: 'Terminé' }
  ]

  it('ajoute une colonne avec un id unique tiré du libellé', () => {
    const one = addColumn(base, 'À relire')
    expect(one[2]).toEqual({ id: 'col-a-relire', label: 'À relire' })
    expect(newColumnId(one, 'À relire')).toBe('col-a-relire-2')
    expect(addColumn(base, '   ')).toBe(base)
  })

  it('renomme sans changer l’id (les statuts restent valides)', () => {
    expect(renameColumn(base, 'todo', ' Pour demain ')[0]).toEqual({
      id: 'todo',
      label: 'Pour demain'
    })
    expect(renameColumn(base, 'todo', '')).toBe(base)
  })

  it('replie et déplie une colonne', () => {
    const folded = toggleColumnCollapsed(base, 'done')
    expect(folded[1]).toEqual({ id: 'done', label: 'Terminé', collapsed: true })
    expect(toggleColumnCollapsed(folded, 'done')[1]).toEqual({ id: 'done', label: 'Terminé' })
  })

  it('déplace une colonne, sans sortir des bords', () => {
    expect(moveColumn(base, 'done', 'left').map((c) => c.id)).toEqual(['done', 'todo'])
    expect(moveColumn(base, 'todo', 'left')).toBe(base)
  })

  it('supprime une colonne : ses notes quittent le tableau, jamais la dernière colonne', () => {
    const statuses = { 'a.html': 'todo', 'b.html': 'done' }
    const res = removeColumn(base, statuses, 'todo')
    expect(res.columns.map((c) => c.id)).toEqual(['done'])
    expect(res.statuses).toEqual({ 'b.html': 'done' })
    expect(removeColumn(res.columns, res.statuses, 'done').columns).toHaveLength(1)
  })
})

describe('statuts des notes', () => {
  it('pose, change et retire un statut', () => {
    const one = setNoteStatus({}, 'a.html', 'todo')
    expect(one).toEqual({ 'a.html': 'todo' })
    expect(setNoteStatus(one, 'a.html', null)).toEqual({})
  })

  it('liste les notes existantes d’une colonne dans l’ordre des fichiers', () => {
    const statuses = { 'b.html': 'todo', 'a.html': 'todo', 'gone.html': 'todo', 'c.html': 'done' }
    expect(notesInColumn(['a.html', 'b.html', 'c.html'], statuses, 'todo')).toEqual([
      'a.html',
      'b.html'
    ])
  })
})
