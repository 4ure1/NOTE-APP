import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Toute variable CSS utilisée par l'interface doit être définie dans base.css : un token mal
// orthographié ne provoque aucune erreur, la couleur disparaît simplement à l'écran.
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')

// Hors périmètre : variables propres au thème des notes (iframe d'aperçu) et à la visite guidée
const EXCLUDED = new Set(['CodeWorkspace.tsx', 'WelcomeTour.tsx'])

function definedTokens(): Set<string> {
  const css = readFileSync(join(SRC, 'assets', 'base.css'), 'utf8')
  return new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]))
}

function usedTokens(): Map<string, string[]> {
  const files = [
    'App.tsx',
    join('assets', 'main.css'),
    ...readdirSync(join(SRC, 'components'))
      .filter((f) => f.endsWith('.tsx') && !EXCLUDED.has(f))
      .map((f) => join('components', f))
  ]
  const used = new Map<string, string[]>()
  for (const file of files) {
    const text = readFileSync(join(SRC, file), 'utf8')
    for (const m of text.matchAll(/var\((--[a-z0-9-]+)/g)) {
      used.set(m[1], [...(used.get(m[1]) ?? []), file])
    }
  }
  return used
}

describe('tokens CSS de l’interface', () => {
  it('chaque var(--…) utilisée est définie dans base.css', () => {
    const defined = definedTokens()
    const missing = [...usedTokens()]
      .filter(([name]) => !defined.has(name))
      .map(([name, files]) => `${name} (${[...new Set(files)].join(', ')})`)
    expect(missing).toEqual([])
  })
})
