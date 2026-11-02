import { describe, it, expect, beforeEach } from 'vitest'
import { createPreviewEditing } from './previewEditing'

const editing = createPreviewEditing()

function setCaret(node: Node, offset: number): void {
  const sel = document.getSelection()!
  const r = document.createRange()
  r.setStart(node, offset)
  r.collapse(true)
  sel.removeAllRanges()
  sel.addRange(r)
}

function caret(): { node: Node; offset: number } {
  const r = document.getSelection()!.getRangeAt(0)
  return { node: r.startContainer, offset: r.startOffset }
}

function textNode(selector: string, index = 0): Text {
  const el = document.querySelector(selector)!
  const texts = Array.from(el.childNodes).filter((n) => n.nodeType === 3) as Text[]
  return texts[index]
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('handleEnter : paragraphes', () => {
  it('coupe un <p> au curseur, sans <br> au milieu', () => {
    document.body.innerHTML = '<div class="container">\n  <p>Bonjour monde</p>\n</div>'
    setCaret(textNode('p'), 7)
    expect(editing.handleEnter(document)).toBe(true)
    expect(document.querySelector('.container')!.innerHTML).toBe(
      '\n  <p>Bonjour</p>\n  <p> monde</p>\n'
    )
    expect(caret().node.textContent).toBe(' monde')
    expect(caret().offset).toBe(0)
  })

  it('au bout d’un texte coloré : ligne vide sans la coloration', () => {
    document.body.innerHTML = '<p>Mot <span class="o">orange</span></p>'
    setCaret(textNode('span'), 6)
    editing.handleEnter(document)
    const ps = document.querySelectorAll('p')
    expect(ps).toHaveLength(2)
    expect(ps[0].innerHTML).toBe('Mot <span class="o">orange</span>')
    expect(ps[1].innerHTML).toBe('<br>')
    expect(caret().node).toBe(ps[1])
  })

  it('au début d’un paragraphe rempli : ligne vide au-dessus, curseur qui reste', () => {
    document.body.innerHTML = '<p>Texte</p>'
    setCaret(textNode('p'), 0)
    editing.handleEnter(document)
    expect(document.body.innerHTML).toBe('<p><br></p><p>Texte</p>')
    expect(caret().node.textContent).toBe('Texte')
  })

  it('dans un titre : le reste du titre passe dans un <p>', () => {
    document.body.innerHTML = '<h2>Titre suite</h2>'
    setCaret(textNode('h2'), 5)
    editing.handleEnter(document)
    expect(document.body.innerHTML).toBe('<h2>Titre</h2><p> suite</p>')
  })

  it('dans une liste : nouvel élément <li>', () => {
    document.body.innerHTML = '<ul>\n  <li>Un</li>\n</ul>'
    setCaret(textNode('li'), 2)
    editing.handleEnter(document)
    expect(document.querySelector('ul')!.innerHTML).toBe('\n  <li>Un</li>\n  <li><br></li>\n')
  })

  it('texte nu dans une carte : enveloppé dans des <p>, indentation gardée', () => {
    document.body.innerHTML =
      '<div class="step">\n  <span class="x">Label</span>\n  Du texte libre\n</div>'
    const free = document.querySelector('.step')!.childNodes[2] as Text
    setCaret(free, free.textContent!.indexOf('libre') + 5)
    editing.handleEnter(document)
    expect(document.querySelector('.step')!.innerHTML).toBe(
      '\n  <p><span class="x">Label</span>\n  Du texte libre</p>\n  <p><br></p>\n'
    )
  })

  it('titre de carte (.node-title) : paragraphe après lui, dans la carte', () => {
    document.body.innerHTML = '<div class="node">\n  <div class="node-title">Titre</div>\n</div>'
    setCaret(textNode('.node-title'), 5)
    editing.handleEnter(document)
    expect(document.querySelector('.node')!.innerHTML).toBe(
      '\n  <div class="node-title">Titre</div>\n  <p><br></p>\n'
    )
  })

  it('laisse faire le navigateur dans le code, les cellules et les zones non éditables', () => {
    document.body.innerHTML =
      '<pre><code>a</code></pre><table><tr><td>b</td></tr></table><div contenteditable="false"><p>c</p></div>'
    setCaret(textNode('code'), 1)
    expect(editing.handleEnter(document)).toBe(false)
    setCaret(textNode('td'), 1)
    expect(editing.handleEnter(document)).toBe(false)
    setCaret(document.querySelector('[contenteditable] p')!.firstChild!, 1)
    expect(editing.handleEnter(document)).toBe(false)
  })

  it('remplace une sélection avant de couper', () => {
    document.body.innerHTML = '<p>abcdef</p>'
    const t = textNode('p')
    const r = document.createRange()
    r.setStart(t, 2)
    r.setEnd(t, 4)
    document.getSelection()!.removeAllRanges()
    document.getSelection()!.addRange(r)
    editing.handleEnter(document)
    expect(document.body.innerHTML).toBe('<p>ab</p><p>ef</p>')
  })
})

describe('sortie d’une coloration', () => {
  it('curseur placé juste après un <span> (fin de snippet) : la frappe s’écrit dehors', () => {
    document.body.innerHTML = '<p><span class="o">orange</span></p>'
    const p = document.querySelector('p')!
    setCaret(p, 1)
    expect(editing.insertTextOutside(document, 'x')).toBe(true)
    expect(p.innerHTML).toBe('<span class="o">orange</span>x')
    expect(caret().node.textContent).toBe('x')
    expect(caret().offset).toBe(1)
  })

  it('Flèche droite au bout du texte coloré, puis frappe : hors du <span>', () => {
    document.body.innerHTML = '<p>Avant <span class="g"><strong>vert</strong></span></p>'
    setCaret(textNode('strong'), 4)
    expect(editing.armExit(document)).toBe(true)
    expect(editing.insertTextOutside(document, ' suite')).toBe(true)
    expect(document.querySelector('p')!.innerHTML).toBe(
      'Avant <span class="g"><strong>vert</strong></span> suite'
    )
  })

  it('pas de sortie au milieu d’un texte coloré, ni sans Flèche droite', () => {
    document.body.innerHTML = '<p><span class="o">orange</span></p>'
    setCaret(textNode('span'), 3)
    expect(editing.armExit(document)).toBe(false)
    setCaret(textNode('span'), 6)
    expect(editing.insertTextOutside(document, 'x')).toBe(false)
    expect(editing.armExit(document)).toBe(true)
    editing.disarm()
    expect(editing.insertTextOutside(document, 'x')).toBe(false)
  })
})

describe('nettoyage des <span style> inventés par le navigateur', () => {
  it('retire seulement les nouveaux éléments de style, sans classe ni attribut', () => {
    document.body.innerHTML =
      '<p><span style="color: red">à moi</span> <span class="o" style="x">à moi aussi</span></p>'
    const before = editing.snapshotStyled(document)
    const p = document.querySelector('p')!
    p.insertAdjacentHTML(
      'beforeend',
      '<span style="font-size: 16px; color: rgb(212, 212, 212);">fusion</span><font color="red">f</font>'
    )
    expect(editing.unwrapNewStyled(document, before)).toBe(2)
    expect(p.innerHTML).toBe(
      '<span style="color: red">à moi</span> <span class="o" style="x">à moi aussi</span>fusionf'
    )
  })
})

describe('injection dans l’iframe', () => {
  it('reste autonome une fois sérialisée', () => {
    const rebuilt = new Function(
      `return (${createPreviewEditing.toString()})`
    )() as typeof createPreviewEditing
    document.body.innerHTML = '<p>ab</p>'
    setCaret(textNode('p'), 1)
    expect(rebuilt().handleEnter(document)).toBe(true)
    expect(document.body.innerHTML).toBe('<p>a</p><p>b</p>')
  })
})

describe('Entrée dans un bloc de code', () => {
  it('saut de ligne dans le même <code>, indentation de la ligne reprise', () => {
    document.body.innerHTML = '<pre><code>if (a) {\n  b()\n}</code></pre>'
    const t = textNode('code')
    setCaret(t, t.textContent!.indexOf('b()') + 3)
    expect(editing.insertCodeNewline(document)).toBe(true)
    expect(document.querySelector('pre')!.innerHTML).toBe('<code>if (a) {\n  b()\n  \n}</code>')
    expect(document.querySelectorAll('code')).toHaveLength(1)
    expect(caret().offset).toBe('if (a) {\n  b()\n  '.length)
  })

  it('au bout du code : une ligne visible (saut de ligne doublé)', () => {
    document.body.innerHTML = '<pre><code>x</code></pre>'
    setCaret(textNode('code'), 1)
    editing.insertCodeNewline(document)
    expect(document.querySelector('code')!.textContent).toBe('x\n\n')
    expect(caret().offset).toBe(2)
  })

  it('bloc vide (<code><br></code>) : le <br> de remplissage disparaît', () => {
    document.body.innerHTML = '<pre><code><br></code></pre>'
    setCaret(document.querySelector('code')!, 0)
    editing.insertCodeNewline(document)
    expect(document.querySelector('code')!.innerHTML).toBe('\n\n')
  })

  it('hors <pre> : rien ; un <code> en ligne se coupe comme son paragraphe', () => {
    document.body.innerHTML = '<p>Voir <code>select</code></p>'
    setCaret(textNode('code'), 6)
    expect(editing.insertCodeNewline(document)).toBe(false)
    expect(editing.handleEnter(document)).toBe(true)
    expect(document.body.innerHTML).toBe('<p>Voir <code>select</code></p><p><br></p>')
  })
})

describe('insertFragment : jamais de bloc dans un <p>', () => {
  const frag = (html: string): DocumentFragment => {
    const t = document.createElement('template')
    t.innerHTML = html
    return t.content
  }

  it('snippet de bloc tapé seul dans un paragraphe : remplace le paragraphe', () => {
    document.body.innerHTML = '<div class="container">\n  <p>Avant</p>\n  <p></p>\n</div>'
    setCaret(document.querySelectorAll('p')[1], 0)
    editing.insertFragment(document, frag('\n<ul>\n  <li>a</li>\n</ul>\n'))
    expect(document.querySelector('.container')!.innerHTML).toBe(
      '\n  <p>Avant</p>\n  <ul>\n  <li>a</li>\n</ul>\n'
    )
    expect(document.querySelector('p ul')).toBeNull()
  })

  it('au milieu d’un paragraphe : coupé autour du bloc', () => {
    document.body.innerHTML = '<p>début fin</p>'
    setCaret(textNode('p'), 6)
    editing.insertFragment(document, frag('<table><tbody><tr><td>x</td></tr></tbody></table>'))
    expect(document.body.innerHTML).toBe(
      '<p>début </p><table><tbody><tr><td>x</td></tr></tbody></table><p>fin</p>'
    )
  })

  it('dans un titre : le bloc va après le titre', () => {
    document.body.innerHTML = '<h2>Titre</h2>'
    setCaret(textNode('h2'), 5)
    editing.insertFragment(document, frag('<div class="note">n</div>'))
    expect(document.body.innerHTML).toBe('<h2>Titre</h2><div class="note">n</div>')
  })

  it('contenu en ligne : inséré au curseur, dans le paragraphe', () => {
    document.body.innerHTML = '<p>ab</p>'
    setCaret(textNode('p'), 1)
    editing.insertFragment(document, frag('<span class="o">x</span>'))
    expect(document.body.innerHTML).toBe('<p>a<span class="o">x</span>b</p>')
  })
})

describe('pasteText : collage sur plusieurs lignes', () => {
  it('une ligne = un paragraphe, lignes vides ignorées, pas de <div> ni de <br>', () => {
    document.body.innerHTML = '<p>Début</p>'
    setCaret(textNode('p'), 5)
    expect(editing.pasteText(document, ' un\r\n\r\ndeux\ntrois')).toBe(true)
    expect(document.body.innerHTML).toBe('<p>Début un</p><p>deux</p><p>trois</p>')
  })

  it('dans une liste : un élément par ligne', () => {
    document.body.innerHTML = '<ul><li><br></li></ul>'
    setCaret(document.querySelector('li')!, 0)
    editing.pasteText(document, 'a\nb')
    expect(document.querySelector('ul')!.innerHTML).toBe('<li>a</li><li>b</li>')
  })

  it('dans un bloc de code : collé tel quel', () => {
    document.body.innerHTML = '<pre><code>x</code></pre>'
    setCaret(textNode('code'), 1)
    expect(editing.pasteText(document, '\n  y\r\n  z')).toBe(true)
    expect(document.querySelector('code')!.textContent).toBe('x\n  y\n  z')
  })

  it('une seule ligne : collage normal du navigateur', () => {
    document.body.innerHTML = '<p>a</p>'
    setCaret(textNode('p'), 1)
    expect(editing.pasteText(document, 'simple')).toBe(false)
  })
})
