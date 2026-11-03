import { describe, it, expect } from 'vitest'
import { nextTrapMove } from './focusTrap'

describe('nextTrapMove', () => {
  it('laisse le navigateur avancer entre deux éléments de la fenêtre', () => {
    expect(nextTrapMove(3, 0, false)).toEqual({ kind: 'native' })
    expect(nextTrapMove(3, 1, false)).toEqual({ kind: 'native' })
    expect(nextTrapMove(3, 2, true)).toEqual({ kind: 'native' })
  })

  it('revient au premier élément après Tab sur le dernier', () => {
    expect(nextTrapMove(3, 2, false)).toEqual({ kind: 'focus', index: 0 })
  })

  it('revient au dernier élément après Maj+Tab sur le premier', () => {
    expect(nextTrapMove(3, 0, true)).toEqual({ kind: 'focus', index: 2 })
  })

  it('entre dans la liste quand le focus est sur la fenêtre elle-même', () => {
    expect(nextTrapMove(4, -1, false)).toEqual({ kind: 'focus', index: 0 })
    expect(nextTrapMove(4, -1, true)).toEqual({ kind: 'focus', index: 3 })
  })

  it('garde le focus sur place avec un seul élément', () => {
    expect(nextTrapMove(1, 0, false)).toEqual({ kind: 'focus', index: 0 })
    expect(nextTrapMove(1, 0, true)).toEqual({ kind: 'focus', index: 0 })
  })

  it('bloque Tab quand rien n’est focalisable', () => {
    expect(nextTrapMove(0, -1, false)).toEqual({ kind: 'stay' })
    expect(nextTrapMove(0, -1, true)).toEqual({ kind: 'stay' })
  })
})
