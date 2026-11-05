import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Script } from 'node:vm'
import { describe, it, expect } from 'vitest'

// Le script de l'aperçu vit dans une chaîne de CodeWorkspace.tsx : ni tsc ni ESLint ne le lisent, et
// une faute de syntaxe y casserait tout l'aperçu sans aucune erreur à la compilation.
function previewScript(): string {
  const file = join(dirname(fileURLToPath(import.meta.url)), 'CodeWorkspace.tsx')
  const src = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  const anchor = src.indexOf('function insertSnippet(snip)')
  const start = src.indexOf('>', src.lastIndexOf('<script', anchor)) + 1
  const body = src.slice(start, src.indexOf('</script>', anchor))

  // Chaque interpolation ${…} (accolades équilibrées) devient une valeur neutre
  let out = ''
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '\\') {
      out += body[i] + (body[i + 1] ?? '')
      i++
    } else if (body[i] === '$' && body[i + 1] === '{') {
      let depth = 0
      let j = i + 1
      for (; j < body.length; j++) {
        if (body[j] === '{') depth++
        else if (body[j] === '}' && --depth === 0) break
      }
      out += 'null'
      i = j
    } else {
      out += body[i]
    }
  }
  return out.replace(/\\\\/g, '\\').replace(/\\`/g, '`').replace(/\\\$/g, '$')
}

describe('script de l’aperçu', () => {
  it('est du JavaScript valide', () => {
    const code = previewScript()
    expect(code.length).toBeGreaterThan(10_000)
    expect(() => new Script(code)).not.toThrow()
  })
})
