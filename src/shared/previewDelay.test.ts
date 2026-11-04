import { describe, it, expect } from 'vitest'
import { previewRefreshDelay } from './previewDelay'

describe('previewRefreshDelay', () => {
  it('attend une courte pause après une frappe', () => {
    expect(previewRefreshDelay(5_000, 0)).toBe(300)
  })

  it('raccourcit le délai à l’approche du plafond pendant une frappe continue', () => {
    expect(previewRefreshDelay(5_000, 1_400)).toBe(100)
  })

  it('rafraîchit sans attendre une fois le plafond atteint', () => {
    expect(previewRefreshDelay(5_000, 1_500)).toBe(0)
    expect(previewRefreshDelay(5_000, 9_000)).toBe(0)
  })

  it('laisse plus de temps aux très grosses notes', () => {
    expect(previewRefreshDelay(300_000, 0)).toBe(700)
    expect(previewRefreshDelay(300_000, 3_800)).toBe(200)
  })
})
