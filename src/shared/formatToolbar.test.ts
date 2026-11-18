import { describe, it, expect, beforeEach, vi } from 'vitest'
import { installFormatToolbar } from './formatToolbar'

const onChange = vi.fn()
const beforeChange = vi.fn()
const tools = installFormatToolbar(document, { onChange, beforeChange, isEnabled: () => true })

function select(startNode: Node, start: number, endNode: Node, end: number): void {
  const r = document.createRange()
  r.setStart(startNode, start)
  r.setEnd(endNode, end)
  const sel = document.getSelection()!
  sel.removeAllRanges()
  sel.addRange(r)
}
const text = (selector: string): Text => document.querySelector(selector)!.firstChild as Text

beforeEach(() => {
  document.body.innerHTML = ''
  onChange.mockClear()
  beforeChange.mockClear()
})

describe('formatToolbar : couleurs, surlignage, police, taille', () => {
  it('colore la partie sélectionnée d’un paragraphe', () => {
    document.body.innerHTML = '<p>Un effet après le rendu</p>'
    select(text('p'), 3, text('p'), 8)
    tools.apply('color', 'o')
    expect(document.body.innerHTML).toBe('<p>Un <span class="o">effet</span> après le rendu</p>')
    expect(beforeChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('modifie sur place un texte déjà coloré sélectionné en entier', () => {
    document.body.innerHTML = '<p>Un <span class="o">effet</span> ici</p>'
    select(text('span'), 0, text('span'), 5)
    tools.apply('color', 'b')
    expect(document.querySelector('p')!.innerHTML).toBe('Un <span class="b">effet</span> ici')
    tools.apply('highlight', 'hl-yellow')
    expect(document.querySelector('p')!.innerHTML).toBe(
      'Un <span class="b hl-yellow">effet</span> ici'
    )
  })

  it('« normal » retire la classe et déballe un span resté sans classe', () => {
    document.body.innerHTML = '<p>Un <span class="o">effet</span> ici</p>'
    select(text('span'), 0, text('span'), 5)
    tools.apply('color', 'none')
    expect(document.querySelector('p')!.innerHTML).toBe('Un effet ici')
  })

  it('police et taille par paliers', () => {
    document.body.innerHTML = '<p>mot</p>'
    select(text('p'), 0, text('p'), 3)
    tools.apply('font', 'ff-mono')
    tools.apply('size', 'up')
    expect(document.querySelector('p')!.innerHTML).toBe('<span class="ff-mono fs-large">mot</span>')
    tools.apply('size', 'down')
    expect(document.querySelector('p')!.innerHTML).toBe('<span class="ff-mono">mot</span>')
  })

  it('refuse une classe inconnue', () => {
    document.body.innerHTML = '<p>mot</p>'
    select(text('p'), 0, text('p'), 3)
    expect(tools.apply('color', 'pirate')).toEqual([])
    expect(document.querySelector('p')!.innerHTML).toBe('mot')
  })
})

describe('formatToolbar : gras, italique, souligné', () => {
  it('met en gras puis retire le gras', () => {
    document.body.innerHTML = '<p>Un effet</p>'
    select(text('p'), 3, text('p'), 8)
    tools.apply('bold', '')
    expect(document.querySelector('p')!.innerHTML).toBe('Un <strong>effet</strong>')
    tools.apply('bold', '')
    expect(document.querySelector('p')!.innerHTML).toBe('Un effet')
  })
})

describe('formatToolbar : limites', () => {
  it('sur plusieurs paragraphes, un span par paragraphe, sans emballer les blancs entre blocs', () => {
    document.body.innerHTML = '<div><p>alpha</p>\n<p>beta</p></div>'
    const ps = document.querySelectorAll('p')
    select(ps[0].firstChild!, 2, ps[1].firstChild!, 2)
    tools.apply('color', 'g')
    expect(document.querySelector('div')!.innerHTML).toBe(
      '<p>al<span class="g">pha</span></p>\n<p><span class="g">be</span>ta</p>'
    )
  })

  it('ne touche jamais au code', () => {
    document.body.innerHTML = '<pre><code>const a = 1</code></pre>'
    select(text('code'), 0, text('code'), 5)
    expect(tools.apply('color', 'r')).toEqual([])
    expect(document.body.innerHTML).toBe('<pre><code>const a = 1</code></pre>')
  })

  it('ne fait rien sans sélection', () => {
    document.body.innerHTML = '<p>mot</p>'
    select(text('p'), 1, text('p'), 1)
    expect(tools.apply('color', 'o')).toEqual([])
    expect(beforeChange).not.toHaveBeenCalled()
  })
})
