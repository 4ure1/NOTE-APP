import { describe, it, expect } from 'vitest'
import { formatRelativeDate } from './relativeDate'

// Mardi 3 novembre 2026, 15:00 (heure locale)
const NOW = new Date(2026, 10, 3, 15, 0, 0).getTime()
const at = (y: number, mo: number, d: number, h = 12, mi = 0): number =>
  new Date(y, mo, d, h, mi).getTime()

describe('formatRelativeDate', () => {
  it('dit « à l’instant » pendant la première minute', () => {
    expect(formatRelativeDate(NOW - 20_000, NOW)).toBe('à l’instant')
  })

  it('compte en minutes pendant la première heure', () => {
    expect(formatRelativeDate(NOW - 15 * 60_000, NOW)).toBe('il y a 15 min')
  })

  it('compte en heures le jour même', () => {
    expect(formatRelativeDate(at(2026, 10, 3, 9, 30), NOW)).toBe('il y a 5 h')
  })

  it('dit « hier » pour la veille, même tard le soir', () => {
    expect(formatRelativeDate(at(2026, 10, 2, 23, 50), NOW)).toBe('hier')
  })

  it('donne le jour de la semaine dans les 7 derniers jours', () => {
    expect(formatRelativeDate(at(2026, 9, 31), NOW)).toBe('samedi')
  })

  it('donne le jour et le mois au-delà, avec l’année si elle diffère', () => {
    expect(formatRelativeDate(at(2026, 9, 28), NOW)).toBe('mercredi')
    expect(formatRelativeDate(at(2026, 9, 20), NOW)).toBe('20 oct.')
    expect(formatRelativeDate(at(2025, 11, 2), NOW)).toBe('2 déc. 2025')
  })

  it('renvoie une chaîne vide sans date connue', () => {
    expect(formatRelativeDate(0, NOW)).toBe('')
    expect(formatRelativeDate(Number.NaN, NOW)).toBe('')
  })
})
