import { describe, it, expect } from 'vitest'
import { DEFAULT_NOTE_FONT, NOTE_FONTS, getNoteFont, noteFontCss } from './noteFonts'

describe('police des notes', () => {
  it('revient à la police par défaut pour un identifiant inconnu', () => {
    expect(getNoteFont('inconnue').id).toBe(DEFAULT_NOTE_FONT)
    expect(getNoteFont(null).id).toBe(DEFAULT_NOTE_FONT)
  })

  it('ne touche pas à l’aperçu avec la police par défaut', () => {
    expect(noteFontCss(DEFAULT_NOTE_FONT)).toBe('')
    expect(noteFontCss(undefined)).toBe('')
  })

  it('remplace la police du corps du texte pour les autres', () => {
    expect(noteFontCss('segoe')).toContain("body { font-family: 'Segoe UI'")
  })

  it('n’utilise que des polices installées avec Windows (aucune ressource réseau)', () => {
    for (const f of NOTE_FONTS) expect(f.stack).not.toMatch(/url\(|https?:/)
  })
})
