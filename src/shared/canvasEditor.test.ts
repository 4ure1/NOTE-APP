import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createCanvasGeometry, type CanvasBox } from './canvasGeometry'
import { installCanvasEditor } from './canvasEditor'
import { cleanPreviewDocument } from './previewClean'

const geo = createCanvasGeometry()

describe('createCanvasGeometry', () => {
  const box: CanvasBox = { x: 100, y: 50, w: 200, h: 100 }

  it('points d’accroche au milieu de chaque bord', () => {
    expect(geo.anchor(box, 'top')).toEqual({ x: 200, y: 50 })
    expect(geo.anchor(box, 'right')).toEqual({ x: 300, y: 100 })
    expect(geo.anchor(box, 'bottom')).toEqual({ x: 200, y: 150 })
    expect(geo.anchor(box, 'left')).toEqual({ x: 100, y: 100 })
  })

  it('bord le plus proche d’un point', () => {
    expect(geo.nearestSide(box, { x: 320, y: 90 })).toBe('right')
    expect(geo.nearestSide(box, { x: 190, y: 10 })).toBe('top')
    expect(geo.nearestSide(box, { x: 90, y: 110 })).toBe('left')
    expect(geo.nearestSide(box, { x: 210, y: 140 })).toBe('bottom')
  })

  it('courbe qui sort perpendiculairement aux bords et pointe sur la cible', () => {
    const { line, head } = geo.linkPath({ x: 0, y: 0 }, 'right', { x: 300, y: 0 }, 'left')
    // Points de contrôle dans l'axe des bords, trait arrêté à la base de la pointe (11 px)
    expect(line).toBe('M 0 0 C 135 0 165 0 289 0')
    expect(head).toBe('M 300 0 L 289 -5.5 L 289 5.5 Z')
  })

  it('extrémité libre : tracé valide vers le pointeur', () => {
    const { line } = geo.linkPath({ x: 0, y: 0 }, 'bottom', { x: 80, y: 200 }, null)
    expect(line.startsWith('M 0 0 C 0 ')).toBe(true)
    expect(line).not.toContain('NaN')
  })

  it('lecture et écriture des extrémités', () => {
    expect(geo.parseEnd('3:right')).toEqual({ node: '3', side: 'right' })
    expect(geo.parseEnd('a:b:left')).toEqual({ node: 'a:b', side: 'left' })
    expect(geo.parseEnd('3:milieu')).toBeNull()
    expect(geo.parseEnd(':top')).toBeNull()
    expect(geo.parseEnd(null)).toBeNull()
    expect(geo.formatEnd({ node: '7', side: 'top' })).toBe('7:top')
  })

  it('distance d’un point à une flèche', () => {
    const { line } = geo.linkPath({ x: 0, y: 0 }, 'right', { x: 300, y: 0 }, 'left')
    expect(geo.distanceToLine(line, { x: 150, y: 4 })).toBeLessThan(5)
    expect(geo.distanceToLine(line, { x: 150, y: 80 })).toBeGreaterThan(70)
    expect(geo.distanceToLine('n’importe quoi', { x: 0, y: 0 })).toBe(Infinity)
  })
})

describe('installCanvasEditor', () => {
  // happy-dom ne calcule pas la mise en page : positions lues dans le style
  const measure = (el: Element): CanvasBox => {
    const s = (el as HTMLElement).style
    return {
      x: parseFloat(s.left) || 0,
      y: parseFloat(s.top) || 0,
      w: parseFloat(s.width) || 200,
      h: 100
    }
  }

  let onChange: () => void
  let editor: ReturnType<typeof installCanvasEditor>

  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML =
      '<div class="canvas" style="height: 300px;">\n' +
      '  <svg class="canvas-links"></svg>\n' +
      '  <div class="node red" data-node="1" style="left: 0px; top: 0px; width: 200px;">A</div>\n' +
      '  <div class="node" data-node="2" style="left: 400px; top: 0px; width: 200px;">B</div>\n' +
      '</div>'
    onChange = vi.fn()
    editor = installCanvasEditor(document, {
      geometry: geo,
      onChange,
      isEnabled: () => true,
      measure
    })
  })

  const canvas = (): Element => document.querySelector('.canvas')!
  const node = (id: string): Element => document.querySelector('[data-node="' + id + '"]')!

  it('relie deux cartes par une flèche statique, indentée dans le code', () => {
    const link = editor.connect(canvas(), node('1'), 'right', node('2'), 'left')!
    expect(link.getAttribute('data-from')).toBe('1:right')
    expect(link.getAttribute('data-to')).toBe('2:left')
    expect(link.querySelector('.link-line')!.getAttribute('d')).toBe(
      'M 200 50 C 290 50 310 50 389 50'
    )
    expect(document.querySelector('svg')!.innerHTML).toMatch(/^\n {4}<g class="link"/)
    // Pas de doublon
    expect(editor.connect(canvas(), node('1'), 'right', node('2'), 'left')).toBe(link)
    expect(document.querySelectorAll('g.link')).toHaveLength(1)
  })

  it('la flèche suit la carte déplacée', () => {
    editor.connect(canvas(), node('1'), 'right', node('2'), 'left')
    ;(node('2') as HTMLElement).style.top = '200px'
    editor.relayout(canvas())
    expect(document.querySelector('.link-line')!.getAttribute('d')).toMatch(/ 389 250$/)
  })

  it('supprimer une carte retire ses flèches', () => {
    editor.connect(canvas(), node('1'), 'right', node('2'), 'left')
    editor.removeNode(node('2'))
    expect(document.querySelectorAll('g.link')).toHaveLength(0)
    expect(document.querySelectorAll('.node')).toHaveLength(1)
  })

  it('une flèche dont une carte a disparu est retirée au recalcul', () => {
    editor.connect(canvas(), node('1'), 'right', node('2'), 'left')
    node('2').remove()
    editor.relayout(canvas())
    expect(document.querySelectorAll('g.link')).toHaveLength(0)
  })

  it('nouvelle carte à côté : identifiant libre, couleur suivante', () => {
    const added = editor.addNode(canvas(), node('1'))
    expect(added.getAttribute('data-node')).toBe('3')
    expect(added.className).toBe('node orange')
    expect((added as HTMLElement).style.left).toBe('260px')
    expect(added.querySelector('.node-title')!.textContent).toBe('Nouvelle carte')
  })

  it('carte sans identifiant : un identifiant est donné au moment de la relier', () => {
    const extra = document.createElement('div')
    extra.className = 'node'
    extra.style.left = '0px'
    extra.style.top = '200px'
    canvas().appendChild(extra)
    editor.connect(canvas(), extra, 'top', node('1'), 'bottom')
    expect(extra.getAttribute('data-node')).toBe('3')
  })

  it('couleur : passe d’une teinte à la suivante puis revient au gris', () => {
    const n = node('2')
    editor.cycleColor(n)
    expect(n.className).toBe('node red')
    for (let i = 0; i < 8; i++) editor.cycleColor(n)
    expect(n.className).toBe('node')
  })

  it('l’interface ajoutée n’est jamais enregistrée', () => {
    node('1').dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))
    expect(document.querySelector('.nf-cv-ui')).not.toBeNull()
    const html = cleanPreviewDocument(document, {
      hadHtmlTag: false,
      hadDoctype: false,
      originalBodyStyle: null
    })
    expect(html).not.toContain('nf-cv')
    expect(html).toContain('class="node red"')
  })

  it('reste autonome une fois sérialisé (injection dans l’iframe)', () => {
    const rebuiltGeo = new Function(`return (${createCanvasGeometry.toString()})`)()
    const rebuilt = new Function(`return (${installCanvasEditor.toString()})`)()
    const ed = rebuilt(document, {
      geometry: rebuiltGeo(),
      onChange,
      isEnabled: () => true,
      measure
    })
    expect(ed.connect(canvas(), node('1'), 'bottom', node('2'), 'top')).not.toBeNull()
  })
})
