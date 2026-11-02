import { describe, it, expect, beforeEach, vi } from 'vitest'
import { installTableTools } from './tableTools'
import { cleanPreviewDocument } from './previewClean'

// Une seule installation : les écouteurs sont posés sur la fenêtre, partagée entre les tests
const onChange = vi.fn()
const beforeChange = vi.fn()
const tools = installTableTools(document, { onChange, beforeChange, isEnabled: () => true })

beforeEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML =
    '<table>\n' +
    '  <tbody>\n' +
    '    <tr><th>A</th><th>B</th><th>C</th></tr>\n' +
    '    <tr><td>1</td><td>2</td><td>3</td></tr>\n' +
    '    <tr><td>4</td><td>5</td><td>6</td></tr>\n' +
    '  </tbody>\n' +
    '</table>'
  onChange.mockClear()
  beforeChange.mockClear()
})

const cells = (): Element[] => Array.from(document.querySelectorAll('td, th'))
const cell = (text: string): Element => cells().find((c) => c.textContent === text)!
const texts = (): string[][] =>
  Array.from(document.querySelectorAll('tr')).map((tr) =>
    Array.from(tr.children).map((c) => c.textContent || '')
  )

describe('installTableTools : modèle', () => {
  it('rectangle de cases entre deux cases', () => {
    expect(tools.cellsBetween(cell('2'), cell('6')).map((c) => c.textContent)).toEqual([
      '2',
      '3',
      '5',
      '6'
    ])
    expect(tools.cellsBetween(cell('C'), cell('1')).map((c) => c.textContent)).toEqual([
      'A',
      'B',
      'C',
      '1',
      '2',
      '3'
    ])
  })

  it('fond de case par classe, remplacé ou retiré proprement', () => {
    tools.setBackground([cell('1'), cell('2')], 'red')
    expect(cell('1').className).toBe('bg-red')
    tools.setBackground([cell('1')], 'teal')
    expect(cell('1').className).toBe('bg-teal')
    tools.setBackground([cell('1'), cell('2')], '')
    expect(cell('1').hasAttribute('class')).toBe(false)
    expect(cell('2').hasAttribute('class')).toBe(false)
  })

  it('insère une ligne (indentée) et une colonne', () => {
    tools.insertRow(cell('2'), 'below')
    expect(texts()).toEqual([
      ['A', 'B', 'C'],
      ['1', '2', '3'],
      ['', '', ''],
      ['4', '5', '6']
    ])
    expect(document.querySelector('tbody')!.innerHTML).toContain(
      '</tr>\n    <tr><td></td><td></td><td></td></tr>'
    )
    tools.insertColumn(cell('B'), 'left')
    expect(texts()[0]).toEqual(['A', '', 'B', 'C'])
    expect(document.querySelector('tr')!.children[1].nodeName).toBe('TH')
  })

  it('supprime une ligne, une colonne ; la dernière supprime le tableau', () => {
    tools.deleteRow(cell('5'))
    expect(texts()).toEqual([
      ['A', 'B', 'C'],
      ['1', '2', '3']
    ])
    tools.deleteColumn(cell('B'))
    expect(texts()).toEqual([
      ['A', 'C'],
      ['1', '3']
    ])
    tools.deleteRow(cell('1'))
    tools.deleteRow(cell('A'))
    expect(document.querySelector('table')).toBeNull()
  })

  it('couleur de carte : .node et .step', () => {
    document.body.innerHTML = '<div class="node red"></div><div class="step purple"></div>'
    const node = document.querySelector('.node')!
    const step = document.querySelector('.step')!
    tools.setCardColor(node, 'teal')
    expect(node.className).toBe('node teal')
    tools.setCardColor(node, '')
    expect(node.className).toBe('node')
    tools.setCardColor(step, 'green')
    expect(step.className).toBe('step green')
    tools.setCardColor(step, 'teal') // pas une couleur de .step : retirée
    expect(step.className).toBe('step')
  })
})

describe('installTableTools : sélection et menu', () => {
  it('Ctrl+clic ajoute des cases à la sélection, puis le clic droit colore toutes les cases', () => {
    cell('1').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    cell('5').dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: true })
    )
    cell('6').dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: true })
    )
    expect(tools.selection().map((c) => c.textContent)).toEqual(['1', '5', '6'])

    cell('5').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    const menu = document.querySelector('.nf-ctx')!
    expect(menu.textContent).toContain('Fond des 3 cases')
    const green = Array.from(menu.querySelectorAll('.nf-ctx-swatch')).find(
      (s) => (s as HTMLElement).title === 'green'
    )!
    green.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(['1', '5', '6'].map((t) => cell(t).className)).toEqual([
      'bg-green',
      'bg-green',
      'bg-green'
    ])
    expect(cell('2').hasAttribute('class')).toBe(false)
    expect(beforeChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.nf-ctx')).toBeNull()
  })

  it('clic droit sur une carte : couleur de la carte', () => {
    document.body.insertAdjacentHTML('beforeend', '<div class="node"><p>x</p></div>')
    document
      .querySelector('.node p')!
      .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    const menu = document.querySelector('.nf-ctx')!
    expect(menu.textContent).toContain('Couleur de la carte')
    const red = Array.from(menu.querySelectorAll('.nf-ctx-swatch')).find(
      (s) => (s as HTMLElement).title === 'red'
    )!
    red.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(document.querySelector('.node')!.className).toBe('node red')
  })

  it('menu, repères de sélection : jamais enregistrés', () => {
    cell('1').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    cell('2').dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: true })
    )
    cell('2').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    const html = cleanPreviewDocument(document, {
      hadHtmlTag: false,
      hadDoctype: false,
      originalBodyStyle: null
    })
    expect(html).not.toContain('nf-')
  })

  it('reste autonome une fois sérialisé', () => {
    const rebuilt = new Function(
      `return (${installTableTools.toString()})`
    )() as typeof installTableTools
    const t = rebuilt(document, { onChange, isEnabled: () => false })
    expect(t.cellsBetween(cell('1'), cell('5'))).toHaveLength(4)
  })
})
