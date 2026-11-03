/**
 * Édition des canvas dans l'aperçu : cartes placées librement (.canvas > .node) reliées par des flèches
 * souples (<svg class="canvas-links"> > <g class="link" data-from="1:right" data-to="2:left">).
 *
 * Au survol d'une carte : un point au milieu de chaque bord (tirer pour relier à une autre carte, la
 * flèche suit la souris), une barre (déplacer, couleur, nouvelle carte, supprimer) et une poignée de
 * largeur. Clic sur une flèche : sélection, Suppr l'efface.
 *
 * Tout ce qui est enregistré est du HTML/SVG statique (positions en style, tracés en d), lisible hors de
 * l'application et à l'export. L'interface ajoutée est marquée data-injected-preview-helpers
 * (retirée par cleanPreviewDocument). La note n'est modifiée qu'après un geste réel (onChange).
 *
 * Fonction autonome (aucun import ni constante externe) : sa source est injectée dans l'iframe
 * d'aperçu (CodeWorkspace.tsx) via toString(), avec celle de createCanvasGeometry.
 */
import type { CanvasBox, CanvasGeometry, CanvasPoint, CanvasSide } from './canvasGeometry'

export interface CanvasEditorOptions {
  geometry: CanvasGeometry
  onChange: () => void
  /** Appelé juste avant de modifier la note (instantané pour l'annulation). */
  beforeChange?: () => void
  isEnabled: () => boolean
  /** Position et taille d'une carte dans son canvas (offsetLeft… par défaut ; remplaçable en test). */
  measure?: (node: Element) => CanvasBox
}

export interface CanvasEditor {
  /** Recalcule les flèches d'un canvas (et retire celles dont une carte a disparu). */
  relayout(canvas: Element): void
  /** Relie deux cartes ; renvoie la flèche (existante si déjà reliées). */
  connect(
    canvas: Element,
    fromNode: Element,
    fromSide: CanvasSide,
    toNode: Element,
    toSide: CanvasSide
  ): Element | null
  removeLink(link: Element): void
  /** Nouvelle carte : à droite de after, ou au point at (coordonnées du canvas), sinon en haut à gauche. */
  addNode(canvas: Element, after: Element | null, at?: CanvasPoint): Element
  removeNode(node: Element): void
  cycleColor(node: Element): void
  /** Couleur choisie dans la palette ('' = gris). */
  setColor(node: Element, color: string): void
}

export function installCanvasEditor(doc: Document, options: CanvasEditorOptions): CanvasEditor {
  const geo = options.geometry
  const SVG_NS = 'http://www.w3.org/2000/svg'
  const COLORS = ['', 'red', 'orange', 'yellow', 'green', 'purple', 'teal', 'blue', 'brown']
  const HELPER = 'data-injected-preview-helpers'
  const view = doc.defaultView
  const before = (): void => {
    if (options.beforeChange) options.beforeChange()
  }

  const measure =
    options.measure ||
    ((el: Element): CanvasBox => {
      const h = el as HTMLElement
      return { x: h.offsetLeft, y: h.offsetTop, w: h.offsetWidth, h: h.offsetHeight }
    })

  // ---------- Écriture lisible dans le code ----------
  function indentOf(el: Node): string {
    const prev = el.previousSibling
    if (!prev || prev.nodeType !== 3) return ''
    const data = prev.textContent || ''
    const nl = data.lastIndexOf('\n')
    if (nl === -1) return ''
    const tail = data.slice(nl + 1)
    return tail.trim() === '' ? tail : ''
  }

  function appendIndented(parent: Element, child: Node): void {
    const pi = indentOf(parent)
    const last = parent.lastChild
    if (last && last.nodeType === 3 && (last.textContent || '').trim() === '') {
      parent.insertBefore(doc.createTextNode('\n' + pi + '  '), last)
      parent.insertBefore(child, last)
    } else {
      parent.appendChild(doc.createTextNode('\n' + pi + '  '))
      parent.appendChild(child)
      parent.appendChild(doc.createTextNode('\n' + pi))
    }
  }

  function insertAfterIndented(ref: Element, child: Node): void {
    const parent = ref.parentNode
    if (!parent) return
    const ws = doc.createTextNode('\n' + indentOf(ref))
    parent.insertBefore(ws, ref.nextSibling)
    parent.insertBefore(child, ws.nextSibling)
  }

  function removeIndented(el: Element): void {
    const prev = el.previousSibling
    if (prev && prev.nodeType === 3 && (prev.textContent || '').trim() === '') prev.remove()
    el.remove()
  }

  // ---------- Modèle ----------
  function nodesOf(canvas: Element): Element[] {
    return Array.from(canvas.children).filter((c) => c.classList.contains('node'))
  }

  function nodeById(canvas: Element, id: string): Element | null {
    return nodesOf(canvas).find((n) => n.getAttribute('data-node') === id) || null
  }

  function idOf(canvas: Element, node: Element): string {
    let id = node.getAttribute('data-node')
    if (id) return id
    let max = 0
    nodesOf(canvas).forEach((n) => {
      const v = parseInt(n.getAttribute('data-node') || '', 10)
      if (!isNaN(v) && v > max) max = v
    })
    id = String(max + 1)
    node.setAttribute('data-node', id)
    return id
  }

  function linksSvg(canvas: Element, create: boolean): Element | null {
    const found = Array.from(canvas.children).find(
      (c) => c.nodeName.toLowerCase() === 'svg' && c.classList.contains('canvas-links')
    )
    if (found || !create) return found || null
    const svg = doc.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('class', 'canvas-links')
    const first = canvas.firstElementChild
    if (first) {
      canvas.insertBefore(svg, first)
      const ws = doc.createTextNode('\n' + indentOf(first))
      canvas.insertBefore(ws, first)
    } else {
      appendIndented(canvas, svg)
    }
    return svg
  }

  function linksOf(canvas: Element): Element[] {
    const svg = linksSvg(canvas, false)
    if (!svg) return []
    return Array.from(svg.children).filter((c) => c.classList.contains('link'))
  }

  function setPath(link: Element, cls: string, d: string): void {
    let path = Array.from(link.children).find((c) => c.classList.contains(cls))
    if (!path) {
      path = doc.createElementNS(SVG_NS, 'path')
      path.setAttribute('class', cls)
      link.appendChild(path)
    }
    if (path.getAttribute('d') !== d) path.setAttribute('d', d)
  }

  function layoutLink(canvas: Element, link: Element): boolean {
    const from = geo.parseEnd(link.getAttribute('data-from'))
    const to = geo.parseEnd(link.getAttribute('data-to'))
    const a = from && nodeById(canvas, from.node)
    const b = to && nodeById(canvas, to.node)
    if (!from || !to || !a || !b) return false
    const path = geo.linkPath(
      geo.anchor(measure(a), from.side),
      from.side,
      geo.anchor(measure(b), to.side),
      to.side
    )
    setPath(link, 'link-line', path.line)
    setPath(link, 'link-head', path.head)
    return true
  }

  function relayout(canvas: Element): void {
    linksOf(canvas).forEach((link) => {
      if (!layoutLink(canvas, link)) {
        if (link === selectedLink) selectLink(null)
        removeIndented(link)
      }
    })
  }

  function growCanvas(canvas: Element): void {
    let bottom = 0
    nodesOf(canvas).forEach((n) => {
      const b = measure(n)
      bottom = Math.max(bottom, b.y + b.h)
    })
    const c = canvas as HTMLElement
    const needed = Math.ceil(bottom + 28)
    if (needed > (c.clientHeight || 0)) c.style.height = needed + 'px'
  }

  function connect(
    canvas: Element,
    fromNode: Element,
    fromSide: CanvasSide,
    toNode: Element,
    toSide: CanvasSide
  ): Element | null {
    if (fromNode === toNode) return null
    const fromId = idOf(canvas, fromNode)
    const toId = idOf(canvas, toNode)
    const fromValue = geo.formatEnd({ node: fromId, side: fromSide })
    const toValue = geo.formatEnd({ node: toId, side: toSide })
    const existing = linksOf(canvas).find(
      (l) => l.getAttribute('data-from') === fromValue && l.getAttribute('data-to') === toValue
    )
    if (existing) return existing
    const svg = linksSvg(canvas, true)!
    const link = doc.createElementNS(SVG_NS, 'g')
    link.setAttribute('class', 'link')
    link.setAttribute('data-from', fromValue)
    link.setAttribute('data-to', toValue)
    appendIndented(svg, link)
    layoutLink(canvas, link)
    return link
  }

  function removeLink(link: Element): void {
    if (link === selectedLink) selectLink(null)
    removeIndented(link)
  }

  function colorOf(node: Element): string {
    for (const c of COLORS) if (c && node.classList.contains(c)) return c
    return ''
  }

  function cycleColor(node: Element): void {
    const current = colorOf(node)
    if (current) node.classList.remove(current)
    const next = COLORS[(COLORS.indexOf(current) + 1) % COLORS.length]
    if (next) node.classList.add(next)
  }

  function setColor(node: Element, color: string): void {
    COLORS.forEach((c) => {
      if (c) node.classList.remove(c)
    })
    if (color && COLORS.indexOf(color) !== -1) node.classList.add(color)
  }

  function addNode(canvas: Element, after: Element | null, at?: CanvasPoint): Element {
    const node = doc.createElement('div')
    const base = after ? measure(after) : { x: 24, y: 24, w: 230, h: 0 }
    const color = after
      ? COLORS[(COLORS.indexOf(colorOf(after)) + 1) % COLORS.length] || COLORS[1]
      : COLORS[1]
    node.className = color ? 'node ' + color : 'node'
    const left = after ? base.x + base.w + 60 : at ? Math.max(0, at.x - 115) : base.x
    const top = after ? base.y : at ? Math.max(0, at.y - 20) : base.y
    node.style.left = Math.round(left) + 'px'
    node.style.top = Math.round(top) + 'px'
    node.style.width = Math.round(base.w || 230) + 'px'
    if (after) insertAfterIndented(after, node)
    else appendIndented(canvas, node)
    idOf(canvas, node)
    const title = doc.createElement('div')
    title.className = 'node-title'
    title.textContent = 'Nouvelle carte'
    const p = doc.createElement('p')
    p.appendChild(doc.createElement('br'))
    appendIndented(node, title)
    appendIndented(node, p)
    return node
  }

  function removeNode(node: Element): void {
    const canvas = node.parentElement
    const id = node.getAttribute('data-node')
    if (canvas && id) {
      linksOf(canvas).forEach((l) => {
        const a = geo.parseEnd(l.getAttribute('data-from'))
        const b = geo.parseEnd(l.getAttribute('data-to'))
        if ((a && a.node === id) || (b && b.node === id)) removeLink(l)
      })
    }
    if (node === hovered) hideUi()
    removeIndented(node)
  }

  // ---------- Interface (jamais enregistrée) ----------
  let ui: HTMLElement | null = null
  let frame: HTMLElement | null = null
  let temp: SVGElement | null = null
  let hovered: Element | null = null
  let selectedLink: Element | null = null
  let drag: null | {
    kind: 'link' | 'move' | 'resize' | 'canvas'
    canvas: Element
    node: Element
    side?: CanvasSide
    startX: number
    startY: number
    // Zoom de l'aperçu au début du geste (pixels d'écran par pixel CSS)
    zoom: number
    box: CanvasBox
    moved: boolean
  } = null

  function ensureStyle(): void {
    if (!doc.head || doc.getElementById('nf-canvas-style')) return
    const style = doc.createElement('style')
    style.id = 'nf-canvas-style'
    style.setAttribute(HELPER, 'true')
    style.textContent = [
      '.nf-cv-ui{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:5;}',
      '.nf-cv-temp{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none;}',
      '.nf-cv-drag{fill:none;stroke:#38bdf8;stroke-width:2;stroke-dasharray:6 4;}',
      '.nf-cv-drag-head{fill:#38bdf8;}',
      '.nf-cv-sel{fill:none;stroke:#38bdf8;stroke-width:6;stroke-opacity:0.45;stroke-linecap:round;}',
      '.nf-cv-target{fill:rgba(56,189,248,0.06);stroke:#38bdf8;stroke-width:1.5;rx:12;}',
      '.nf-cv-frame{position:absolute;display:none;}',
      '.nf-cv-handle{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;',
      'background:#1e1e1e;border:2px solid #38bdf8;pointer-events:auto;cursor:crosshair;box-sizing:border-box;',
      'transition:transform .12s ease, background .12s ease;}',
      '.nf-cv-handle:hover{transform:scale(1.35);background:#38bdf8;}',
      '.nf-cv-bar{position:absolute;right:10px;top:-14px;display:flex;gap:2px;padding:2px;border-radius:7px;',
      'background:#202024;border:1px solid rgba(255,255,255,0.14);box-shadow:0 4px 14px rgba(0,0,0,0.45);pointer-events:auto;}',
      '.nf-cv-bar button{all:unset;width:22px;height:22px;line-height:22px;text-align:center;border-radius:5px;',
      'font:13px/22px "Segoe UI",sans-serif;color:#d4d4d8;cursor:pointer;}',
      '.nf-cv-bar button:hover{background:rgba(56,189,248,0.18);color:#fff;}',
      '.nf-cv-bar button[data-act="move"]{cursor:grab;}',
      '.nf-cv-grip{position:absolute;left:-26px;top:2px;width:18px;height:24px;border-radius:5px;display:flex;',
      'align-items:center;justify-content:center;font:14px/1 "Segoe UI",sans-serif;color:#a1a1aa;background:#202024;',
      'border:1px solid rgba(255,255,255,0.12);cursor:grab;pointer-events:auto;user-select:none;}',
      '.nf-cv-grip:hover{color:#fff;border-color:#38bdf8;}',
      '.nf-cv-palette{position:absolute;right:10px;top:14px;display:none;flex-wrap:wrap;gap:6px;width:150px;',
      'padding:8px;border-radius:9px;background:#202024;border:1px solid rgba(255,255,255,0.14);',
      'box-shadow:0 10px 26px rgba(0,0,0,0.5);pointer-events:auto;z-index:2;}',
      '.nf-cv-palette.nf-open{display:flex;}',
      '.nf-cv-empty{all:unset;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:none;',
      'padding:8px 14px;border-radius:8px;border:1px dashed rgba(56,189,248,0.6);color:#7dd3fc;cursor:pointer;',
      'font:13px "Segoe UI",sans-serif;background:rgba(56,189,248,0.06);pointer-events:auto;}',
      '.nf-cv-empty:hover{background:rgba(56,189,248,0.14);color:#fff;}',
      '.nf-cv-empty.nf-on{display:block;}',
      '.nf-cv-swatch{width:22px;height:22px;border-radius:6px;cursor:pointer;box-sizing:border-box;',
      'border:2px solid transparent;transition:transform .1s ease;}',
      '.nf-cv-swatch:hover{transform:scale(1.15);border-color:#fff;}',
      '.nf-cv-swatch.nf-current{border-color:#38bdf8;}',
      'body[contenteditable="true"] .canvas{outline:1px dashed rgba(255,255,255,0.09);outline-offset:2px;}',
      '.nf-cv-canvas-resize{position:absolute;right:3px;bottom:3px;width:16px;height:16px;border-radius:4px;display:none;',
      'pointer-events:auto;cursor:nwse-resize;background:linear-gradient(135deg,transparent 45%,rgba(56,189,248,0.85) 45%,',
      'rgba(56,189,248,0.85) 55%,transparent 55%,transparent 70%,rgba(56,189,248,0.85) 70%,rgba(56,189,248,0.85) 80%,transparent 80%);}',
      '.nf-cv-canvas-resize.nf-on{display:block;}',
      '.nf-cv-resize{position:absolute;right:-7px;bottom:-7px;width:14px;height:14px;border-radius:4px;cursor:nwse-resize;',
      'background:#38bdf8;border:2px solid #1e1e1e;pointer-events:auto;box-sizing:border-box;}'
    ].join('')
    doc.head.appendChild(style)
  }

  function ensureUi(canvas: Element): void {
    ensureStyle()
    if (!ui) {
      ui = doc.createElement('div')
      ui.className = 'nf-cv-ui'
      ui.setAttribute(HELPER, 'true')
      ui.setAttribute('contenteditable', 'false')
      temp = doc.createElementNS(SVG_NS, 'svg') as SVGElement
      temp.setAttribute('class', 'nf-cv-temp')
      ui.appendChild(temp)
      frame = doc.createElement('div')
      frame.className = 'nf-cv-frame'
      geo.SIDES.forEach((side) => {
        const h = doc.createElement('span')
        h.className = 'nf-cv-handle'
        h.setAttribute('data-side', side)
        h.title = 'Tirer pour relier à une autre carte'
        frame!.appendChild(h)
      })
      const bar = doc.createElement('div')
      bar.className = 'nf-cv-bar'
      const buttons: Array<[string, string, string]> = [
        ['move', '⠿', 'Déplacer la carte'],
        ['color', '◐', 'Changer la couleur'],
        ['add', '+', 'Nouvelle carte à côté'],
        ['delete', '×', 'Supprimer la carte et ses flèches']
      ]
      buttons.forEach(([act, label, title]) => {
        const b = doc.createElement('button')
        b.setAttribute('data-act', act)
        b.setAttribute('type', 'button')
        b.title = title
        b.textContent = label
        bar.appendChild(b)
      })
      frame.appendChild(bar)
      // Poignée de la carte (déplacer), comme celle des blocs
      const grip = doc.createElement('span')
      grip.className = 'nf-cv-grip'
      grip.title = 'Glisser pour déplacer la carte'
      grip.textContent = '⠿'
      frame.appendChild(grip)
      // Palette du bouton couleur
      const palette = doc.createElement('div')
      palette.className = 'nf-cv-palette'
      const SWATCH: Record<string, string> = {
        '': '#8b949e',
        red: '#ef4444',
        orange: '#e0823d',
        yellow: '#d4b13a',
        green: '#57ab5a',
        purple: '#a371f7',
        teal: '#3fb9a8',
        blue: '#4a8fe7',
        brown: '#a08065'
      }
      COLORS.forEach((c) => {
        const s = doc.createElement('span')
        s.className = 'nf-cv-swatch'
        s.setAttribute('data-color', c)
        s.title = c || 'gris'
        s.style.background = SWATCH[c]
        palette.appendChild(s)
      })
      frame.appendChild(palette)
      const resize = doc.createElement('span')
      resize.className = 'nf-cv-resize'
      resize.title = 'Taille de la carte (largeur et hauteur)'
      frame.appendChild(resize)
      ui.appendChild(frame)
      // Taille du canvas : coin bas-droit, visible au survol du canvas
      const canvasResize = doc.createElement('span')
      canvasResize.className = 'nf-cv-canvas-resize'
      canvasResize.title = 'Taille du canvas'
      ui.appendChild(canvasResize)
      // Canvas vide : bouton pour créer la première carte
      const empty = doc.createElement('button')
      empty.className = 'nf-cv-empty'
      empty.setAttribute('type', 'button')
      empty.textContent = '+ Nouvelle carte (ou double-clic dans le canvas)'
      ui.appendChild(empty)
    }
    if (ui.parentNode !== canvas) {
      clearTemp()
      canvas.appendChild(ui)
    }
  }

  function placeFrame(node: Element): void {
    if (!frame) return
    const b = measure(node)
    frame.style.left = b.x + 'px'
    frame.style.top = b.y + 'px'
    frame.style.width = b.w + 'px'
    frame.style.height = b.h + 'px'
    frame.style.display = 'block'
    const pos: Record<string, [string, string]> = {
      top: ['50%', '0%'],
      right: ['100%', '50%'],
      bottom: ['50%', '100%'],
      left: ['0%', '50%']
    }
    Array.from(frame.querySelectorAll('.nf-cv-handle')).forEach((h) => {
      const p = pos[h.getAttribute('data-side') || 'top']
      ;(h as HTMLElement).style.left = p[0]
      ;(h as HTMLElement).style.top = p[1]
    })
  }

  function showUi(node: Element): void {
    const canvas = node.parentElement
    if (!canvas) return
    ensureUi(canvas)
    if (hovered !== node) togglePalette(false)
    hovered = node
    placeFrame(node)
  }

  function togglePalette(open?: boolean): void {
    if (!frame) return
    const palette = frame.querySelector('.nf-cv-palette')
    if (!palette) return
    const on = open === undefined ? !palette.classList.contains('nf-open') : open
    palette.classList.toggle('nf-open', on)
    if (on && hovered) {
      const current = colorOf(hovered)
      Array.from(palette.children).forEach((s) =>
        s.classList.toggle('nf-current', (s.getAttribute('data-color') || '') === current)
      )
    }
  }

  function hideUi(): void {
    togglePalette(false)
    hovered = null
    if (frame) frame.style.display = 'none'
  }

  function svgPath(cls: string, d: string): void {
    if (!temp) return
    let p = temp.querySelector('.' + cls)
    if (!p) {
      p = doc.createElementNS(SVG_NS, 'path')
      p.setAttribute('class', cls)
      temp.appendChild(p)
    }
    p.setAttribute('d', d)
  }

  function clearTemp(keepSelection?: boolean): void {
    if (!temp) return
    Array.from(temp.children).forEach((c) => {
      if (keepSelection && c.classList.contains('nf-cv-sel')) return
      c.remove()
    })
  }

  function showTarget(box: CanvasBox | null): void {
    if (!temp) return
    let r = temp.querySelector('.nf-cv-target')
    if (!box) {
      if (r) r.remove()
      return
    }
    if (!r) {
      r = doc.createElementNS(SVG_NS, 'rect')
      r.setAttribute('class', 'nf-cv-target')
      temp.appendChild(r)
    }
    r.setAttribute('x', String(box.x - 4))
    r.setAttribute('y', String(box.y - 4))
    r.setAttribute('width', String(box.w + 8))
    r.setAttribute('height', String(box.h + 8))
  }

  function selectLink(link: Element | null): void {
    selectedLink = link
    if (!temp) return
    const old = temp.querySelector('.nf-cv-sel')
    if (old) old.remove()
    if (!link) return
    const line = Array.from(link.children).find((c) => c.classList.contains('link-line'))
    if (line) svgPath('nf-cv-sel', line.getAttribute('d') || '')
  }

  // Pixels d'écran par pixel CSS dans le canvas (zoom de l'aperçu ; 1 sans zoom)
  function zoomOf(canvas: Element): number {
    const c = canvas as HTMLElement
    const w = c.offsetWidth
    const r = canvas.getBoundingClientRect().width
    return w > 0 && r > 0 ? r / w : 1
  }

  function local(canvas: Element, e: { clientX: number; clientY: number }): CanvasPoint {
    const rect = canvas.getBoundingClientRect()
    const c = canvas as HTMLElement
    const z = zoomOf(canvas)
    return {
      x: (e.clientX - rect.left) / z - (c.clientLeft || 0) + (c.scrollLeft || 0),
      y: (e.clientY - rect.top) / z - (c.clientTop || 0) + (c.scrollTop || 0)
    }
  }

  function targetAt(canvas: Element, p: CanvasPoint, except: Element): Element | null {
    const nodes = nodesOf(canvas).filter((n) => n !== except)
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (geo.contains(measure(nodes[i]), p, 14)) return nodes[i]
    }
    return null
  }

  // Pendant un geste : feuille de style temporaire (rien n'est posé sur la note elle-même)
  function setDragging(on: boolean): void {
    let lock = doc.getElementById('nf-cv-lock')
    if (on && !lock && doc.head) {
      lock = doc.createElement('style')
      lock.id = 'nf-cv-lock'
      lock.setAttribute(HELPER, 'true')
      lock.textContent = '*{user-select:none !important;cursor:grabbing !important;}'
      doc.head.appendChild(lock)
    } else if (!on && lock) {
      lock.remove()
    }
  }

  function canvasOfEvent(target: EventTarget | null): Element | null {
    const el = target && (target as Element).closest ? (target as Element) : null
    return el ? el.closest('.canvas') : null
  }

  function focusTitle(node: Element): void {
    const title = node.querySelector('.node-title')
    const sel = doc.getSelection()
    if (title && sel) {
      const r = doc.createRange()
      r.selectNodeContents(title)
      sel.removeAllRanges()
      sel.addRange(r)
    }
  }

  // Double-clic dans le vide d'un canvas : nouvelle carte à cet endroit
  function onDoubleClick(e: MouseEvent): void {
    if (!options.isEnabled()) return
    const target = e.target as Element | null
    if (!target || !target.closest || target.closest('.node') || (ui && ui.contains(target))) return
    const canvas = canvasOfEvent(target)
    if (!canvas) return
    e.preventDefault()
    before()
    const created = addNode(canvas, null, local(canvas, e))
    growCanvas(canvas)
    showUi(created)
    focusTitle(created)
    options.onChange()
  }

  // Bande de 8 px le long du bord d'une carte : la saisir déplace la carte ; plus à l'intérieur, le clic
  // place le curseur comme d'habitude
  function onEdge(node: Element, e: PointerEvent): boolean {
    const canvas = node.parentElement
    if (!canvas) return false
    const b = measure(node)
    const p = local(canvas, e)
    const d = Math.min(p.x - b.x, b.x + b.w - p.x, p.y - b.y, b.y + b.h - p.y)
    return d >= -2 && d <= 8
  }

  function onPointerDown(e: PointerEvent): void {
    if (!options.isEnabled()) return
    const target = e.target as Element | null
    if (!target || !target.closest) return
    const inUi = ui && ui.contains(target)
    if (hovered && !hovered.isConnected) hideUi()
    if (inUi && target.closest('.nf-cv-canvas-resize') && ui!.parentElement) {
      e.preventDefault()
      e.stopPropagation()
      const canvas = ui!.parentElement
      before()
      startDrag('canvas', canvas, canvas, e)
      return
    }
    if (inUi && target.closest('.nf-cv-empty') && ui!.parentElement) {
      e.preventDefault()
      e.stopPropagation()
      const canvas = ui!.parentElement
      before()
      const created = addNode(canvas, null)
      target.closest('.nf-cv-empty')!.classList.remove('nf-on')
      growCanvas(canvas)
      showUi(created)
      focusTitle(created)
      options.onChange()
      return
    }
    if (inUi && hovered) {
      const canvas = hovered.parentElement!
      const handle = target.closest('.nf-cv-handle')
      const button = target.closest('.nf-cv-bar button')
      const resize = target.closest('.nf-cv-resize')
      e.preventDefault()
      e.stopPropagation()
      selectLink(null)
      const swatch = target.closest('.nf-cv-swatch')
      if (swatch) {
        before()
        setColor(hovered, swatch.getAttribute('data-color') || '')
        togglePalette(false)
        options.onChange()
        return
      }
      if (target.closest('.nf-cv-grip')) {
        before()
        togglePalette(false)
        startDrag('move', canvas, hovered, e)
        return
      }
      if (button) {
        const act = button.getAttribute('data-act')
        if (act !== 'color') togglePalette(false)
        if (act === 'move') {
          before()
          startDrag('move', canvas, hovered, e)
        } else if (act === 'color') {
          togglePalette()
        } else if (act === 'add') {
          before()
          const node = addNode(canvas, hovered)
          growCanvas(canvas)
          showUi(node)
          focusTitle(node)
          options.onChange()
        } else if (act === 'delete') {
          before()
          removeNode(hovered)
          options.onChange()
        }
        return
      }
      if (handle) {
        startDrag('link', canvas, hovered, e, handle.getAttribute('data-side') as CanvasSide)
        return
      }
      if (resize) {
        before()
        startDrag('resize', canvas, hovered, e)
      }
      return
    }
    togglePalette(false)
    // Clic sur le bord d'une carte (bande de 8 px) : déplacement
    if (target.matches('.canvas > .node') && e.button === 0 && onEdge(target, e)) {
      e.preventDefault()
      showUi(target)
      before()
      startDrag('move', target.parentElement!, target, e)
      return
    }
    // Clic dans le vide d'un canvas : sélection de la flèche la plus proche
    const canvas = canvasOfEvent(target)
    if (canvas && !target.closest('.node')) {
      const p = local(canvas, e)
      let best: Element | null = null
      let bestDist = 9
      linksOf(canvas).forEach((l) => {
        const line = Array.from(l.children).find((c) => c.classList.contains('link-line'))
        const d = line ? geo.distanceToLine(line.getAttribute('d') || '', p) : Infinity
        if (d < bestDist) {
          bestDist = d
          best = l
        }
      })
      if (best) {
        e.preventDefault()
        ensureUi(canvas)
        selectLink(best)
        return
      }
    }
    if (selectedLink) selectLink(null)
  }

  function startDrag(
    kind: 'link' | 'move' | 'resize' | 'canvas',
    canvas: Element,
    node: Element,
    e: PointerEvent,
    side?: CanvasSide
  ): void {
    drag = {
      kind,
      canvas,
      node,
      side,
      startX: e.clientX,
      startY: e.clientY,
      zoom: zoomOf(canvas),
      box:
        kind === 'canvas'
          ? {
              x: 0,
              y: 0,
              w: (canvas as HTMLElement).offsetWidth,
              h: (canvas as HTMLElement).offsetHeight
            }
          : measure(node),
      moved: false
    }
    setDragging(true)
  }

  function onPointerMove(e: PointerEvent): void {
    if (drag) {
      e.preventDefault()
      const d = drag
      const dx = (e.clientX - d.startX) / d.zoom
      const dy = (e.clientY - d.startY) / d.zoom
      if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true
      const el = d.node as HTMLElement
      if (d.kind === 'move') {
        el.style.left = Math.max(0, Math.round(d.box.x + dx)) + 'px'
        el.style.top = Math.max(0, Math.round(d.box.y + dy)) + 'px'
        relayout(d.canvas)
        growCanvas(d.canvas)
        placeFrame(d.node)
      } else if (d.kind === 'resize') {
        // Largeur libre ; hauteur minimale (le contenu peut toujours l'agrandir)
        el.style.width = Math.max(140, Math.round(d.box.w + dx)) + 'px'
        el.style.minHeight = Math.max(60, Math.round(d.box.h + dy)) + 'px'
        relayout(d.canvas)
        growCanvas(d.canvas)
        placeFrame(d.node)
      } else if (d.kind === 'canvas') {
        // Canvas : jamais plus petit que ses cartes ; pleine largeur dès qu'il atteint son conteneur
        const c = d.canvas as HTMLElement
        let bottom = 0
        let right = 0
        nodesOf(d.canvas).forEach((n) => {
          const b = measure(n)
          bottom = Math.max(bottom, b.y + b.h)
          right = Math.max(right, b.x + b.w)
        })
        c.style.height = Math.round(Math.max(120, bottom + 24, d.box.h + dy)) + 'px'
        const parentWidth = c.parentElement ? c.parentElement.clientWidth : Infinity
        const width = Math.max(280, right + 24, d.box.w + dx)
        if (width >= parentWidth - 2) c.style.removeProperty('width')
        else c.style.width = Math.round(width) + 'px'
      } else if (d.kind === 'link' && d.side) {
        const p = local(d.canvas, e)
        const from = geo.anchor(measure(d.node), d.side)
        const target = targetAt(d.canvas, p, d.node)
        let path
        if (target) {
          const box = measure(target)
          const side = geo.nearestSide(box, p)
          path = geo.linkPath(from, d.side, geo.anchor(box, side), side)
          showTarget(box)
        } else {
          path = geo.linkPath(from, d.side, p, null)
          showTarget(null)
        }
        svgPath('nf-cv-drag', path.line)
        svgPath('nf-cv-drag-head', path.head)
      }
      return
    }
    if (!options.isEnabled()) return
    const target = e.target as Element | null
    if (!target || !target.closest) return
    if (ui && ui.contains(target)) return
    const overCanvas = canvasOfEvent(target)
    if (overCanvas) {
      if (hovered && hovered.parentElement !== overCanvas) hideUi()
      ensureUi(overCanvas)
    }
    const canvasResize = ui ? ui.querySelector('.nf-cv-canvas-resize') : null
    if (canvasResize) canvasResize.classList.toggle('nf-on', !!overCanvas)
    const node = target.closest('.canvas > .node')
    if (node) {
      if (node !== hovered) showUi(node)
      return
    }
    // Survol d'un canvas sans carte : bouton « Nouvelle carte »
    const over = canvasOfEvent(target)
    if (over && !nodesOf(over).length) {
      ensureUi(over)
      const empty = ui!.querySelector('.nf-cv-empty')
      if (empty) empty.classList.add('nf-on')
    } else if (ui) {
      const empty = ui.querySelector('.nf-cv-empty')
      if (empty) empty.classList.remove('nf-on')
    }
    if (hovered) {
      const canvas = hovered.parentElement
      if (!canvas || !geo.contains(measure(hovered), local(canvas, e), 34)) hideUi()
    }
  }

  function onPointerUp(e: PointerEvent): void {
    if (!drag) return
    const d = drag
    drag = null
    setDragging(false)
    if (d.kind === 'link' && d.side) {
      clearTemp(true)
      const p = local(d.canvas, e)
      const target = targetAt(d.canvas, p, d.node)
      if (target) {
        before()
        connect(d.canvas, d.node, d.side, target, geo.nearestSide(measure(target), p))
        options.onChange()
      }
      return
    }
    if (d.moved) options.onChange()
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (!selectedLink) return
    if (!selectedLink.isConnected) {
      selectLink(null)
      return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      e.stopImmediatePropagation()
      before()
      removeLink(selectedLink)
      options.onChange()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopImmediatePropagation()
      selectLink(null)
    } else {
      selectLink(null)
    }
  }

  function onInput(): void {
    // Le texte d'une carte change sa hauteur : ses flèches suivent (la saisie est enregistrée de toute façon)
    const sel = doc.getSelection()
    const anchor = sel && sel.anchorNode
    const el = anchor ? (anchor.nodeType === 1 ? (anchor as Element) : anchor.parentElement) : null
    const canvas = el ? el.closest('.canvas') : null
    if (!canvas) return
    relayout(canvas)
    growCanvas(canvas)
    if (hovered && hovered.parentElement === canvas) placeFrame(hovered)
    if (selectedLink) selectLink(selectedLink.isConnected ? selectedLink : null)
  }

  ensureStyle()
  if (view) {
    view.addEventListener('pointerdown', onPointerDown as EventListener, true)
    view.addEventListener('pointermove', onPointerMove as EventListener, true)
    view.addEventListener('pointerup', onPointerUp as EventListener, true)
    view.addEventListener('pointercancel', onPointerUp as EventListener, true)
    view.addEventListener('dblclick', onDoubleClick as EventListener, true)
    view.addEventListener('keydown', onKeyDown as EventListener, true)
    doc.addEventListener('input', onInput, true)
  }

  return { relayout, connect, removeLink, addNode, removeNode, cycleColor, setColor }
}
