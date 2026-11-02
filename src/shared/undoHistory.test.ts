import { describe, it, expect, beforeEach } from 'vitest'
import { createUndoHistory } from './undoHistory'

let clock = 0
const now = (): number => clock

function setCaret(node: Node, offset: number): void {
  const sel = document.getSelection()!
  const r = document.createRange()
  r.setStart(node, offset)
  r.collapse(true)
  sel.removeAllRanges()
  sel.addRange(r)
}

function caretText(): { text: string; offset: number } {
  const r = document.getSelection()!.getRangeAt(0)
  return { text: r.startContainer.textContent || '', offset: r.startOffset }
}

/** Simule une frappe : instantané puis modification, comme dans l'aperçu (beforeinput). */
function type(history: ReturnType<typeof createUndoHistory>, char: string): void {
  history.record('typing', char)
  const r = document.getSelection()!.getRangeAt(0)
  const t = r.startContainer as Text
  const at = r.startOffset
  t.data = t.data.slice(0, at) + char + t.data.slice(at)
  setCaret(t, at + char.length)
  clock += 100
}

beforeEach(() => {
  clock = 0
  document.body.innerHTML = '<p>Bonjour</p>'
})

describe('createUndoHistory', () => {
  it('Ctrl+Z annule un espace tapé, et remet le curseur', () => {
    const h = createUndoHistory(document, { now })
    setCaret(document.querySelector('p')!.firstChild!, 7)
    type(h, ' ')
    expect(document.body.innerHTML).toBe('<p>Bonjour </p>')
    expect(h.undo()).toBe(true)
    expect(document.body.innerHTML).toBe('<p>Bonjour</p>')
    expect(caretText()).toEqual({ text: 'Bonjour', offset: 7 })
  })

  it('regroupe la frappe par mot ; une pause d’une seconde coupe aussi', () => {
    const h = createUndoHistory(document, { now })
    setCaret(document.querySelector('p')!.firstChild!, 7)
    for (const c of [' ', 'l', 'e', ' ', 'm', 'o', 'n', 'd', 'e']) type(h, c)
    expect(document.body.textContent).toBe('Bonjour le monde')
    h.undo()
    expect(document.body.textContent).toBe('Bonjour le ')
    h.undo()
    expect(document.body.textContent).toBe('Bonjour ')
    h.undo()
    expect(document.body.textContent).toBe('Bonjour')
    h.redo()
    h.redo()
    expect(document.body.textContent).toBe('Bonjour le ')

    clock += 5000
    type(h, 'x')
    clock += 2000
    type(h, 'y')
    h.undo()
    expect(document.body.textContent).toBe('Bonjour le x')
  })

  it('modification par script (Entrée, glisser…) : une étape, rétablie par redo', () => {
    const h = createUndoHistory(document, { now })
    h.record('edit')
    document.body.insertAdjacentHTML('beforeend', '<p>Nouveau</p>')
    h.undo()
    expect(document.body.innerHTML).toBe('<p>Bonjour</p>')
    expect(h.redo()).toBe(true)
    expect(document.body.innerHTML).toBe('<p>Bonjour</p><p>Nouveau</p>')
    expect(h.redo()).toBe(false)
  })

  it('une nouvelle modification vide la pile de rétablissement', () => {
    const h = createUndoHistory(document, { now })
    h.record('edit')
    document.body.innerHTML = '<p>A</p>'
    h.undo()
    h.record('edit')
    document.body.innerHTML = '<p>B</p>'
    expect(h.canRedo()).toBe(false)
  })

  it('l’interface ajoutée n’entre pas dans l’historique et reste en place', () => {
    const h = createUndoHistory(document, { now })
    const menu = document.createElement('div')
    menu.id = 'preview-snippet-menu'
    document.body.appendChild(menu)
    h.record('edit')
    document.querySelector('p')!.textContent = 'Changé'
    h.undo()
    expect(document.querySelector('p')!.textContent).toBe('Bonjour')
    expect(document.getElementById('preview-snippet-menu')).toBe(menu)
    expect(document.body.innerHTML).toBe('<p>Bonjour</p><div id="preview-snippet-menu"></div>')
  })

  it('un instantané identique à l’état actuel est sauté', () => {
    const h = createUndoHistory(document, { now })
    h.record('edit')
    document.body.innerHTML = '<p>1</p>'
    h.record('edit')
    h.record('edit') // rien n'a changé entre les deux : pas de doublon
    expect(h.undo()).toBe(true)
    expect(document.body.innerHTML).toBe('<p>Bonjour</p>')
    expect(h.canUndo()).toBe(false)
  })

  it('Retour arrière maintenu : une seule étape d’annulation', () => {
    const h = createUndoHistory(document, { now })
    const t = document.querySelector('p')!.firstChild as Text
    for (let i = 0; i < 4; i++) {
      h.record('deleting')
      t.data = t.data.slice(0, -1)
      clock += 80
    }
    expect(document.body.textContent).toBe('Bon')
    h.undo()
    expect(document.body.textContent).toBe('Bonjour')
    expect(h.canUndo()).toBe(false)
  })

  it('reste autonome une fois sérialisé', () => {
    const rebuilt = new Function(
      `return (${createUndoHistory.toString()})`
    )() as typeof createUndoHistory
    const h = rebuilt(document, { now })
    h.record('edit')
    document.body.innerHTML = '<p>x</p>'
    expect(h.undo()).toBe(true)
    expect(document.body.innerHTML).toBe('<p>Bonjour</p>')
  })
})
