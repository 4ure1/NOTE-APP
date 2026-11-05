import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import {
  APP_THEMES,
  DEFAULT_APP_THEME,
  getAppTheme,
  previewThemeCss,
  themeVariables
} from './appThemes'

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('thèmes de l’interface', () => {
  it.each(APP_THEMES.map((t) => [t.label, t] as const))('%s respecte le contraste AA', (_l, t) => {
    const c = t.colors
    for (const bg of [c.app, c.panel, c.page, c.raised, c.hover, c.active]) {
      expect(contrast(c.text, bg)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(c.textSecondary, bg)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(c.textMuted, bg)).toBeGreaterThanOrEqual(4.5)
    }
    expect(contrast('#ffffff', c.accentStrong)).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#111111', c.accent)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(c.accent, c.panel)).toBeGreaterThanOrEqual(4.5)
  })

  it('le thème par défaut reprend les valeurs de base.css', () => {
    const dir = dirname(fileURLToPath(import.meta.url))
    const css = readFileSync(join(dir, '../renderer/src/assets/base.css'), 'utf8')
    const vars = themeVariables(getAppTheme(DEFAULT_APP_THEME))
    for (const [name, value] of Object.entries(vars)) {
      expect(css).toMatch(new RegExp(`${name}:\\s*${value}\\b`))
    }
  })

  it('revient au thème par défaut pour un identifiant inconnu', () => {
    expect(getAppTheme('inconnu').id).toBe(DEFAULT_APP_THEME)
    expect(getAppTheme(null).id).toBe(DEFAULT_APP_THEME)
  })

  it('ne touche pas à l’aperçu avec le thème par défaut', () => {
    expect(previewThemeCss(getAppTheme(DEFAULT_APP_THEME))).toBe('')
    expect(previewThemeCss(getAppTheme('nuit'))).toContain('#181d2c')
  })
})
