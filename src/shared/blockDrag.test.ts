import { describe, it, expect, beforeEach } from 'vitest'
import { installBlockDrag } from './blockDrag'

const noop = (): void => {}
let drag: ReturnType<typeof installBlockDrag>

beforeEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML =
    '<div class="container">\n' +
    '  <h2>Titre</h2>\n' +
    '  <p>Intro</p>\n' +
    '  <table><tr><td><ul><li>x</li></ul></td></tr></table>\n' +
    '  <div class="step">\n' +
    '    <p>Dans la carte</p>\n' +
    '  </div>\n' +
    '</div>'
  drag = installBlockDrag(document, { onChange: noop, isEnabled: () => true })
})

const container = (): Element => document.querySelector('.container')!

describe('installBlockDrag', () => {
  it('bloc déplaçable : le tableau, même depuis une liste dans une cellule', () => {
    const li = document.querySelector('li')!
    expect(drag.draggableOf(li)).toBe(document.querySelector('table'))
    expect(drag.draggableOf(document.querySelector('.step p'))).toBe(
      document.querySelector('.step')
    )
    expect(drag.draggableOf(document.querySelector('h2'))).toBeNull()
  })

  it('les cartes d’un canvas déplacent le canvas entier', () => {
    container().insertAdjacentHTML(
      'beforeend',
      '<div class="canvas"><div class="node"><table><tr><td>t</td></tr></table></div></div>'
    )
    expect(drag.draggableOf(document.querySelector('.canvas td'))).toBe(
      document.querySelector('.canvas')
    )
  })

  it('déplace le tableau avant le titre, indentation propre', () => {
    const table = document.querySelector('table')!
    expect(drag.moveBlock(table, document.querySelector('h2')!, 'before')).toBe(true)
    expect(container().innerHTML).toBe(
      '\n  <table><tbody><tr><td><ul><li>x</li></ul></td></tr></tbody></table>\n  <h2>Titre</h2>\n  <p>Intro</p>\n' +
        '  <div class="step">\n    <p>Dans la carte</p>\n  </div>\n'
    )
  })

  it('déplace le tableau dans une carte, à l’indentation de la carte', () => {
    const table = document.querySelector('table')!
    drag.moveBlock(table, document.querySelector('.step p')!, 'after')
    expect(document.querySelector('.step')!.innerHTML).toBe(
      '\n    <p>Dans la carte</p>\n    <table><tbody><tr><td><ul><li>x</li></ul></td></tr></tbody></table>\n  '
    )
  })

  it('refuse de poser un bloc dans lui-même ou à sa propre place', () => {
    const step = document.querySelector('.step')!
    expect(drag.moveBlock(step, step.querySelector('p')!, 'after')).toBe(false)
    const table = document.querySelector('table')!
    expect(drag.moveBlock(table, document.querySelector('p')!, 'after')).toBe(false)
  })

  it('pose une carte à côté d’une autre dans une rangée .duo lisible', () => {
    container().innerHTML = '\n  <div class="step">A</div>\n  <div class="step">B</div>\n'
    const [a, b] = Array.from(document.querySelectorAll('.step'))
    expect(drag.placeBeside(b, a, 'after')).toBe(true)
    expect(container().innerHTML).toBe(
      '\n  <div class="duo">\n    <div class="step">A</div>\n    <div class="step">B</div>\n  </div>\n'
    )
  })

  it('respecte le côté choisi', () => {
    container().innerHTML = '\n  <div class="step">A</div>\n  <div class="step">B</div>\n'
    const [a, b] = Array.from(document.querySelectorAll('.step'))
    drag.placeBeside(b, a, 'before')
    expect(Array.from(document.querySelector('.duo')!.children).map((c) => c.textContent)).toEqual([
      'B',
      'A'
    ])
  })

  it('crée une rangée .nodes pour deux cartes .node', () => {
    container().innerHTML = '<div class="node">A</div><div class="node">B</div>'
    const [a, b] = Array.from(document.querySelectorAll('.node'))
    drag.placeBeside(b, a, 'after')
    expect(document.querySelector('.nodes')).not.toBeNull()
    expect(document.querySelector('.duo')).toBeNull()
  })

  it('refuse de poser une carte à côté d’elle-même ou de son contenu', () => {
    const step = document.querySelector('.step')!
    expect(drag.placeBeside(step, step, 'after')).toBe(false)
    expect(drag.placeBeside(step, step.querySelector('p')!, 'after')).toBe(false)
  })

  it('une carte de grille se saisit depuis la grille', () => {
    container().innerHTML =
      '<div class="duo"><div class="step"><p>A</p></div><div class="step">B</div></div>'
    expect(drag.draggableOf(document.querySelector('.step p'))).toBe(
      document.querySelector('.step')
    )
    expect(drag.draggableOf(document.querySelector('.duo'))).toBe(document.querySelector('.duo'))
  })

  it('reste autonome une fois sérialisé', () => {
    const rebuilt = new Function(
      `return (${installBlockDrag.toString()})`
    )() as typeof installBlockDrag
    const d = rebuilt(document, { onChange: noop, isEnabled: () => true })
    expect(d.draggableOf(document.querySelector('li'))).toBe(document.querySelector('table'))
  })
})

describe('installBlockDrag : sélection de blocs', () => {
  it('supprime plusieurs blocs sélectionnés, avec leurs blancs de mise en page', () => {
    drag.select([document.querySelector('table')!, document.querySelector('.step')!])
    expect(drag.selected()).toHaveLength(2)
    drag.deleteSelected()
    expect(container().innerHTML).toBe('\n  <h2>Titre</h2>\n  <p>Intro</p>\n')
    expect(drag.selected()).toHaveLength(0)
  })

  it('duplique les blocs sélectionnés juste après eux ; les copies deviennent la sélection', () => {
    const step = document.querySelector('.step')!
    drag.select([step])
    drag.duplicateSelected()
    const steps = document.querySelectorAll('.step')
    expect(steps).toHaveLength(2)
    expect(steps[0]).toBe(step)
    expect(steps[1].nextElementSibling).toBeNull()
    expect(drag.selected()).toEqual([steps[1]])
  })

  it('un canvas vide se supprime comme les autres blocs', () => {
    container().insertAdjacentHTML('beforeend', '<div class="canvas" style="height: 214px;"></div>')
    const canvas = document.querySelector('.canvas')!
    expect(drag.draggableOf(canvas)).toBe(canvas)
    drag.select([canvas])
    drag.deleteSelected()
    expect(document.querySelector('.canvas')).toBeNull()
  })

  it('Suppr au clavier supprime la sélection ; l’interface n’est jamais enregistrée', () => {
    drag.select([document.querySelector('table')!])
    expect(document.querySelector('.nf-bd-bar')!.textContent).toContain('1 bloc')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    expect(document.querySelector('table')).toBeNull()
  })
})
