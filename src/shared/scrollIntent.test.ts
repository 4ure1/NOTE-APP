import { describe, it, expect } from 'vitest'
import { isCodePointerActive, isUserScrollIntent } from './scrollIntent'

describe('isCodePointerActive', () => {
  it('protège Monaco tant que le bouton de la souris est enfoncé', () => {
    expect(isCodePointerActive(60_000, true, 10_000)).toBe(true)
  })

  it('protège encore juste après le relâchement', () => {
    expect(isCodePointerActive(10_500, false, 10_000)).toBe(true)
  })

  it('laisse passer ensuite le défilement de l’aperçu', () => {
    expect(isCodePointerActive(10_601, false, 10_000)).toBe(false)
  })

  it('laisse passer sans geste dans le code', () => {
    expect(isCodePointerActive(10_000, false, 0)).toBe(false)
  })
})

describe('isUserScrollIntent', () => {
  it('accepte un défilement qui suit de près un geste dans l’aperçu', () => {
    expect(isUserScrollIntent(10_500, 10_000)).toBe(true)
    expect(isUserScrollIntent(11_000, 10_000)).toBe(true)
  })

  it('ignore un défilement sans geste récent (rechargement de l’aperçu pendant la frappe)', () => {
    expect(isUserScrollIntent(11_001, 10_000)).toBe(false)
    expect(isUserScrollIntent(60_000, 10_000)).toBe(false)
  })

  it('ignore un défilement quand aucun geste n’a encore eu lieu', () => {
    expect(isUserScrollIntent(5_000, 0)).toBe(false)
  })

  it('ignore une horloge incohérente (geste dans le futur)', () => {
    expect(isUserScrollIntent(10_000, 10_500)).toBe(false)
  })

  it('accepte une fenêtre personnalisée', () => {
    expect(isUserScrollIntent(12_500, 10_000, 3000)).toBe(true)
    expect(isUserScrollIntent(12_500, 10_000, 2000)).toBe(false)
  })

  it('reste autonome une fois sérialisée (injection dans l’iframe)', () => {
    const rebuilt = new Function(
      `return (${isUserScrollIntent.toString()})`
    )() as typeof isUserScrollIntent
    expect(rebuilt(10_500, 10_000)).toBe(true)
    expect(rebuilt(20_000, 10_000)).toBe(false)
  })
})
