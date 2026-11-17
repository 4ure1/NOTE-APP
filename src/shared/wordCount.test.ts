import { describe, it, expect } from 'vitest'
import { countWords } from './wordCount'

describe('countWords', () => {
  it('compte les mots d’un texte brut (Markdown)', () => {
    expect(countWords('# Titre\n\nUn effet s’exécute après le rendu.', false)).toBe(7)
    expect(countWords('', false)).toBe(0)
  })

  it('ignore les balises, attributs et commentaires HTML', () => {
    const html =
      '<h1 class="t">Hooks React</h1><!-- note --><p>Un <strong>effet</strong> par rendu.</p>'
    expect(countWords(html, true)).toBe(6)
  })

  it('ignore le contenu des <script> et <style>', () => {
    const html = '<style>.a { color: red }</style><p>deux mots</p><script>let x = 1</script>'
    expect(countWords(html, true)).toBe(2)
  })

  it('garde ensemble les mots avec apostrophe ou tiret', () => {
    expect(countWords('l’effet c’est-à-dire', false)).toBe(2)
  })
})
