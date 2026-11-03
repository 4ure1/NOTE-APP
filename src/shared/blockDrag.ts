/**
 * Glisser-déposer des blocs dans l'aperçu : tableaux, blocs de code, listes, citations, figures et blocs du
 * design system (.step, .note, .result, .duo, .nodes, .canvas, .quiz-item, <details>).
 *
 * Au survol d'un bloc, une poignée ⠿ apparaît à sa gauche ; on la tire : une copie du bloc suit le
 * pointeur avec un ressort, une ligne glisse vers l'endroit où le bloc sera
 * posé (avant ou après le bloc visé, à n'importe quel niveau de contenu), et le bloc est déplacé au
 * lâcher. Le code reste lisible : le bloc reprend l'indentation de sa nouvelle place.
 *
 * L'interface (poignée, ligne) est marquée data-injected-preview-helpers (retirée par
 * cleanPreviewDocument). La note n'est modifiée qu'au lâcher (onChange).
 *
 * Fonction autonome (aucun import ni constante externe) : sa source est injectée dans l'iframe
 * d'aperçu (CodeWorkspace.tsx) via toString().
 */

export interface BlockDragOptions {
  onChange: () => void
  /** Appelé juste avant de modifier la note (instantané pour l'annulation). */
  beforeChange?: () => void
  isEnabled: () => boolean
}

export interface BlockDrag {
  /** Déplace block avant ou après ref, avec l'indentation de ref ; false si impossible. */
  moveBlock(block: Element, ref: Element, where: 'before' | 'after'): boolean
  /** Élément déplaçable qui contient el : une carte d'une grille (.duo, .nodes), sinon le bloc. */
  draggableOf(el: Element | null): Element | null
  /** Bloc qui contient la grille d'une carte (pour déplacer tout le groupe), ou null. */
  groupOf(item: Element): Element | null
  /** Sélection de blocs (clic sur la poignée, Ctrl/Maj+clic pour en ajouter). */
  select(blocks: Element[]): void
  selected(): Element[]
  /** Supprime / duplique les blocs sélectionnés (Suppr, Ctrl+D). */
  deleteSelected(): void
  duplicateSelected(): void
}

export function installBlockDrag(doc: Document, options: BlockDragOptions): BlockDrag {
  const DRAGGABLE =
    'table, pre, blockquote, ul, ol, figure, details, .step, .note, .result, .duo, .nodes, .canvas, ' +
    '.quiz-item'
  // Conteneurs dans lesquels on peut poser un bloc
  const FLOW_PARENT =
    'body, .container, section, article, main, .step, .note, .result, .duo > div, details, .quiz-item, ' +
    'blockquote, .node'
  const HELPER = 'data-injected-preview-helpers'
  const view = doc.defaultView

  function isHelper(el: Element | null): boolean {
    return !!el && !!el.closest && !!el.closest('[' + HELPER + ']')
  }

  // Cartes ou colonnes d'une grille : déplaçables une par une (le groupe garde sa propre poignée)
  const GRID = '.duo, .nodes'
  const ITEM = '.duo > *, .nodes > *'

  function itemOf(el: Element | null): Element | null {
    if (!el || !el.closest || isHelper(el)) return null
    const item = el.closest(ITEM)
    if (!item || isHelper(item) || item.closest('.canvas')) return null
    const grid = item.parentElement
    if (!grid || grid.closest('table') || grid.closest('pre')) return null
    return item
  }

  function isItem(el: Element): boolean {
    return !!el.parentElement && el.parentElement.matches(GRID) && !isHelper(el)
  }

  function groupOf(item: Element): Element | null {
    return item.parentElement ? blockOf(item.parentElement) : null
  }

  function draggableOf(el: Element | null): Element | null {
    return itemOf(el) || blockOf(el)
  }

  function blockOf(el: Element | null): Element | null {
    if (!el || !el.closest || isHelper(el)) return null
    let block = el.closest(DRAGGABLE)
    // Listes dans un tableau, tableau dans une carte de canvas… : le bloc extérieur qui se déplace
    while (block) {
      const parent = block.parentElement
      if (!parent) return null
      if (block.closest('.canvas') && !block.classList.contains('canvas')) {
        block = block.closest('.canvas')
        continue
      }
      if (parent.closest('table') || parent.closest('pre')) {
        block = parent.closest(DRAGGABLE)
        continue
      }
      if (parent.matches(FLOW_PARENT)) return block
      block = parent.closest(DRAGGABLE)
    }
    return null
  }

  // ---------- Déplacement lisible ----------
  function isBlank(n: Node | null): boolean {
    return !!n && n.nodeType === 3 && (n.textContent || '').trim() === ''
  }

  function indentOf(el: Node): string | null {
    const prev = el.previousSibling
    if (!prev || prev.nodeType !== 3) return null
    const data = prev.textContent || ''
    const nl = data.lastIndexOf(String.fromCharCode(10))
    if (nl === -1) return null
    const tail = data.slice(nl + 1)
    return tail.trim() === '' ? tail : null
  }

  function moveBlock(block: Element, ref: Element, where: 'before' | 'after'): boolean {
    if (block === ref || block.contains(ref) || !ref.parentNode) return false
    const parent = ref.parentNode
    if (where === 'after' && ref.nextElementSibling === block) return false
    if (where === 'before' && ref.previousElementSibling === block) return false
    const NL = String.fromCharCode(10)
    // Retire le bloc avec le blanc de mise en page qui le précède
    const prevBlank = block.previousSibling
    if (isBlank(prevBlank) && block.parentNode) block.parentNode.removeChild(prevBlank!)
    block.parentNode && block.parentNode.removeChild(block)
    const indent = indentOf(ref)
    if (where === 'before') {
      parent.insertBefore(block, ref)
      if (indent !== null) parent.insertBefore(doc.createTextNode(NL + indent), ref)
    } else {
      let anchor: Node = ref
      if (indent !== null) {
        const ws = doc.createTextNode(NL + indent)
        parent.insertBefore(ws, ref.nextSibling)
        anchor = ws
      }
      parent.insertBefore(block, anchor.nextSibling)
    }
    return true
  }

  // ---------- Interface (jamais enregistrée) ----------
  let grip: HTMLElement | null = null
  let line: HTMLElement | null = null
  let source: HTMLElement | null = null
  let hovered: Element | null = null
  // Poignée du groupe (grille entière) quand on survole une carte de la grille
  let grip2: HTMLElement | null = null
  // Poignée de taille des cartes d'une rangée .nodes (coin bas-droit) et geste en cours
  let sizeGrip: HTMLElement | null = null
  let sizing: null | {
    el: HTMLElement
    startX: number
    startY: number
    w: number
    h: number
    zoom: number
    moved: boolean
  } = null
  let hoveredGroup: Element | null = null

  interface DragState {
    block: Element
    target: Element | null
    where: 'before' | 'after'
    // Sens de la ligne de dépôt : entre deux cartes d'une grille (x) ou entre deux blocs (y)
    axis: 'x' | 'y'
    started: boolean
    // Ctrl / Maj au moment de saisir la poignée : un simple clic ajoute le bloc à la sélection
    additive: boolean
    startX: number
    startY: number
    // Point de saisie dans le bloc, pour que le fantôme reste « attrapé » au même endroit
    grabX: number
    grabY: number
    clientX: number
    clientY: number
    // Position affichée du fantôme (suit la position voulue avec un ressort)
    x: number
    y: number
    ghost: HTMLElement | null
    raf: number
  }
  let drag: DragState | null = null

  function ensureStyle(): void {
    if (!doc.head || doc.getElementById('nf-block-drag-style')) return
    const style = doc.createElement('style')
    style.id = 'nf-block-drag-style'
    style.setAttribute(HELPER, 'true')
    style.textContent = [
      '.nf-bd-grip{position:absolute;z-index:6;width:18px;height:24px;border-radius:5px;',
      'display:flex;align-items:center;justify-content:center;font:14px/1 "Segoe UI",sans-serif;',
      'color:#a1a1aa;background:#202024;border:1px solid rgba(255,255,255,0.12);cursor:grab;user-select:none;',
      'opacity:0;pointer-events:none;transform:scale(0.85);',
      'transition:opacity .12s ease, transform .12s ease, color .12s ease, border-color .12s ease;}',
      '.nf-bd-grip.nf-on{opacity:1;pointer-events:auto;transform:scale(1);}',
      '.nf-bd-grip:hover{color:#fff;border-color:#38bdf8;transform:scale(1.08);}',
      '.nf-bd-group{color:#71717a;}',
      '.nf-bd-size{position:absolute;z-index:6;width:14px;height:14px;border-radius:4px;box-sizing:border-box;',
      'background:#38bdf8;border:2px solid #1e1e1e;cursor:nwse-resize;opacity:0;pointer-events:none;',
      'transition:opacity .12s ease, transform .12s ease;}',
      '.nf-bd-size.nf-on{opacity:1;pointer-events:auto;}',
      '.nf-bd-size:hover{transform:scale(1.2);}',
      '.nf-bd-line{position:absolute;z-index:6;height:3px;margin-top:-1.5px;border-radius:2px;',
      'background:#38bdf8;box-shadow:0 0 0 3px rgba(56,189,248,0.18),0 0 12px rgba(56,189,248,0.5);',
      'pointer-events:none;opacity:0;',
      'transition:top .14s cubic-bezier(.2,.8,.2,1), left .14s cubic-bezier(.2,.8,.2,1), ',
      'width .14s cubic-bezier(.2,.8,.2,1), opacity .1s ease;}',
      '.nf-bd-line.nf-on{opacity:1;}',
      '.nf-bd-source{position:absolute;z-index:5;pointer-events:none;display:none;border-radius:8px;',
      'outline:2px dashed rgba(56,189,248,0.55);outline-offset:3px;background:rgba(24,24,27,0.55);}',
      '.nf-bd-ghost{position:fixed;left:0;top:0;z-index:2147483000;pointer-events:none;margin:0;',
      'box-sizing:border-box;border-radius:10px;background:#1e1e1e;opacity:0.94;overflow:hidden;',
      'max-height:280px;box-shadow:0 22px 50px rgba(0,0,0,0.55),0 0 0 1px rgba(56,189,248,0.45);',
      'will-change:transform;transform-origin:var(--grab-x,50%) var(--grab-y,20px);}',
      '.nf-bd-ghost > *{margin-top:0 !important;margin-bottom:0 !important;}',
      '.nf-bd-ghost::after{content:"";position:absolute;left:0;right:0;bottom:0;height:40px;',
      'background:linear-gradient(transparent,#1e1e1e);}',
      '.nf-bd-ghost.nf-short::after{display:none;}',
      '.nf-bd-sel-layer{position:absolute;left:0;top:0;width:0;height:0;z-index:5;}',
      '.nf-bd-picked{position:absolute;pointer-events:none;border-radius:8px;outline:2px solid #38bdf8;',
      'outline-offset:3px;background:rgba(56,189,248,0.07);}',
      '.nf-bd-bar{position:absolute;transform:translateX(-100%);display:flex;align-items:center;gap:2px;',
      'padding:3px;border-radius:8px;background:#202024;border:1px solid rgba(255,255,255,0.14);',
      'box-shadow:0 8px 22px rgba(0,0,0,0.45);font:12px "Segoe UI",sans-serif;white-space:nowrap;}',
      '.nf-bd-bar span{color:#a1a1aa;padding:3px 8px;}',
      '.nf-bd-bar button{all:unset;padding:3px 9px;border-radius:5px;cursor:pointer;color:#e4e4e7;}',
      '.nf-bd-bar button:hover{background:rgba(56,189,248,0.18);color:#fff;}',
      '.nf-bd-bar button.nf-danger:hover{background:rgba(239,68,68,0.22);}'
    ].join('')
    doc.head.appendChild(style)
  }

  function helperDiv(cls: string): HTMLElement {
    const el = doc.createElement('div')
    el.className = cls
    el.setAttribute(HELPER, 'true')
    el.setAttribute('contenteditable', 'false')
    return el
  }

  function ensureUi(): void {
    ensureStyle()
    if (!grip) {
      grip = helperDiv('nf-bd-grip')
      grip.title = 'Glisser pour déplacer · clic pour sélectionner (Ctrl+clic : plusieurs)'
      grip.textContent = '⠿'
      sizeGrip = helperDiv('nf-bd-size')
      sizeGrip.title = 'Taille de la carte (largeur et hauteur)'
      grip2 = helperDiv('nf-bd-grip nf-bd-group')
      grip2.title = 'Glisser pour déplacer tout le groupe'
      grip2.textContent = '⠿'
      line = helperDiv('nf-bd-line')
      source = helperDiv('nf-bd-source')
    }
    // Remis en place si le contenu du <body> a été remplacé (annulation…)
    // Rattachés à <html> et non au <body> : l'aperçu zoome le <body> (zoom CSS), ce qui décalerait
    // tout élément placé en coordonnées d'écran
    const root = doc.documentElement
    if (root && grip.parentNode !== root) {
      root.appendChild(grip)
      root.appendChild(grip2!)
      root.appendChild(sizeGrip!)
      root.appendChild(line!)
      root.appendChild(source!)
    }
  }

  function pageRect(el: Element): { left: number; top: number; width: number; height: number } {
    const r = el.getBoundingClientRect()
    const sx = view ? view.scrollX : 0
    const sy = view ? view.scrollY : 0
    return { left: r.left + sx, top: r.top + sy, width: r.width, height: r.height }
  }

  function placeGrip(g: HTMLElement, el: Element, inside: boolean): void {
    const r = pageRect(el)
    const left = inside || r.left - 26 < 2 ? r.left + 4 : r.left - 26
    g.style.left = left + 'px'
    g.style.top = r.top + (inside ? 4 : 2) + 'px'
    g.classList.add('nf-on')
  }

  function showGrip(block: Element): void {
    ensureUi()
    hovered = block
    const item = isItem(block)
    // Carte d'une grille : sa poignée dans son coin (la marge à gauche appartient à la carte voisine)
    placeGrip(grip!, block, item && !!block.previousElementSibling)
    hoveredGroup = item ? groupOf(block) : null
    if (hoveredGroup && grip2) placeGrip(grip2, hoveredGroup, false)
    else if (grip2) grip2.classList.remove('nf-on')
    // Carte d'une rangée .nodes : poignée de taille dans son coin bas-droit
    if (sizeGrip) {
      if (item && block.matches('.nodes > .node')) {
        const r = pageRect(block)
        sizeGrip.style.left = r.left + r.width - 9 + 'px'
        sizeGrip.style.top = r.top + r.height - 9 + 'px'
        sizeGrip.classList.add('nf-on')
      } else {
        sizeGrip.classList.remove('nf-on')
      }
    }
  }

  function hideGrip(): void {
    hovered = null
    hoveredGroup = null
    if (grip) grip.classList.remove('nf-on')
    if (grip2) grip2.classList.remove('nf-on')
    if (sizeGrip) sizeGrip.classList.remove('nf-on')
  }

  // Pendant le glisser : rien n'est posé sur la note elle-même (une sauvegarde à ce moment
  // l'enregistrerait), seulement des éléments d'interface
  function setLock(on: boolean): void {
    let lock = doc.getElementById('nf-bd-lock')
    if (on && !lock && doc.head) {
      lock = doc.createElement('style')
      lock.id = 'nf-bd-lock'
      lock.setAttribute(HELPER, 'true')
      lock.textContent = '*{user-select:none !important;cursor:grabbing !important;}'
      doc.head.appendChild(lock)
    } else if (!on && lock) {
      lock.remove()
    }
  }

  function showSource(block: Element | null): void {
    if (!source) return
    if (!block) {
      source.style.display = 'none'
      return
    }
    const r = pageRect(block)
    source.style.left = r.left + 'px'
    source.style.top = r.top + 'px'
    source.style.width = r.width + 'px'
    source.style.height = r.height + 'px'
    source.style.display = 'block'
  }

  function makeGhost(block: Element, d: DragState): HTMLElement {
    const r = block.getBoundingClientRect()
    const ghost = helperDiv('nf-bd-ghost')
    const clone = block.cloneNode(true) as Element
    // Copie d'affichage seulement : pas d'id en double, pas d'interface, rien d'éditable
    clone.removeAttribute('id')
    const inner = clone.querySelectorAll('[id], [' + HELPER + ']')
    for (let i = 0; i < inner.length; i++) {
      if (inner[i].hasAttribute(HELPER)) inner[i].remove()
      else inner[i].removeAttribute('id')
    }
    // Contenus lourds ou actifs (vidéo, page intégrée, script) : remplacés par un cadre vide, sinon la
    // copie les rechargerait pendant le geste
    const heavy = clone.querySelectorAll('iframe, video, audio, object, embed, script')
    for (let i = 0; i < heavy.length; i++) {
      const el = heavy[i]
      if (el.nodeName === 'SCRIPT') {
        el.remove()
        continue
      }
      const box = doc.createElement('div')
      box.style.cssText =
        'height:120px;border-radius:8px;background:rgba(255,255,255,0.06);border:1px dashed rgba(255,255,255,0.2);'
      el.replaceWith(box)
    }
    ghost.appendChild(clone)
    ghost.style.width = r.width + 'px'
    if (r.height <= 280) ghost.classList.add('nf-short')
    ghost.style.setProperty('--grab-x', d.grabX + 'px')
    ghost.style.setProperty('--grab-y', Math.min(d.grabY, 280) + 'px')
    doc.documentElement.appendChild(ghost)
    return ghost
  }

  function placeGhost(d: DragState, rotate: number, scale: number): void {
    if (!d.ghost) return
    d.ghost.style.transform =
      'translate3d(' + d.x + 'px,' + d.y + 'px,0) rotate(' + rotate + 'deg) scale(' + scale + ')'
  }

  /** Conteneur principal de la note : sert à garder la cible dans le contenu (pas dans les marges). */
  function mainContainer(): Element | null {
    return doc.querySelector('.container') || doc.body
  }

  /** Bloc visé sous le pointeur et côté (avant / après selon la moitié survolée). */
  function dropTargetAt(
    clientX: number,
    clientY: number,
    block: Element
  ): { target: Element; where: 'before' | 'after'; axis: 'x' | 'y' } | null {
    // Carte d'une grille : posée avant / après une autre carte, selon la moitié horizontale
    if (isItem(block)) {
      const under = doc.elementFromPoint(clientX, clientY)
      let other = itemOf(under)
      if (!other && under && under.matches(GRID) && !isHelper(under)) {
        // Dans l'espace entre deux cartes : la plus proche
        let bestDist = Infinity
        Array.from(under.children).forEach((c) => {
          if (c === block || isHelper(c)) return
          const r = c.getBoundingClientRect()
          const dx = clientX < r.left ? r.left - clientX : clientX > r.right ? clientX - r.right : 0
          const dy = clientY < r.top ? r.top - clientY : clientY > r.bottom ? clientY - r.bottom : 0
          const dist = Math.hypot(dx, dy)
          if (dist < bestDist) {
            bestDist = dist
            other = c
          }
        })
      }
      if (other && other !== block && !block.contains(other)) {
        const r = other.getBoundingClientRect()
        const gridRect = other.parentElement!.getBoundingClientRect()
        // Grille d'une seule colonne (fenêtre étroite) : dessus / dessous
        const oneColumn = r.width > gridRect.width * 0.8
        if (oneColumn) {
          return {
            target: other,
            where: clientY < r.top + r.height / 2 ? 'before' : 'after',
            axis: 'y'
          }
        }
        return {
          target: other,
          where: clientX < r.left + r.width / 2 ? 'before' : 'after',
          axis: 'x'
        }
      }
    }
    // Dans les marges : on vise comme si le pointeur était dans le contenu (largeur de dépôt)
    const main = mainContainer()
    let x = clientX
    if (main && main !== doc.body) {
      const mr = main.getBoundingClientRect()
      x = Math.max(mr.left + 12, Math.min(mr.right - 12, clientX))
    }
    const vh = view ? view.innerHeight : 0
    const y = vh ? Math.max(1, Math.min(vh - 2, clientY)) : clientY
    const el = doc.elementFromPoint(x, y)
    if (!el || isHelper(el)) return null
    if (block.contains(el)) return null
    // Remonte jusqu'à un enfant direct d'un conteneur de contenu
    let target: Element | null = el
    while (target && target.parentElement) {
      const parent: Element = target.parentElement
      if (parent.matches(FLOW_PARENT) && !parent.closest('table') && !parent.closest('pre')) break
      target = parent
    }
    if (!target || !target.parentElement || target === doc.body || target === main) {
      // Dans le vide d'un conteneur : enfant le plus proche verticalement
      const container = el.matches(FLOW_PARENT) ? el : main
      if (!container) return null
      let best: Element | null = null
      let bestDist = Infinity
      Array.from(container.children).forEach((c) => {
        if (isHelper(c) || c === block) return
        const r = c.getBoundingClientRect()
        if (!r.height) return
        const dist = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
        if (dist < bestDist) {
          bestDist = dist
          best = c
        }
      })
      if (!best) return null
      target = best
    }
    if (!target || target === block || block.contains(target)) return null
    const r = target.getBoundingClientRect()
    return { target, where: y < r.top + r.height / 2 ? 'before' : 'after', axis: 'y' }
  }

  function showLine(target: Element | null, where: 'before' | 'after', axis: 'x' | 'y'): void {
    if (!line) return
    if (!target) {
      line.classList.remove('nf-on')
      return
    }
    const r = pageRect(target)
    if (axis === 'x') {
      // Ligne verticale entre deux cartes
      line.style.top = r.top + 'px'
      line.style.height = r.height + 'px'
      line.style.width = '3px'
      line.style.left = (where === 'before' ? r.left - 9 : r.left + r.width + 6) + 'px'
    } else {
      line.style.height = '3px'
      line.style.left = r.left + 'px'
      line.style.width = Math.max(40, r.width) + 'px'
      line.style.top = (where === 'before' ? r.top - 7 : r.top + r.height + 7) + 'px'
    }
    line.classList.add('nf-on')
  }

  function updateTarget(d: DragState): void {
    const found = dropTargetAt(d.clientX, d.clientY, d.block)
    // Poser le bloc à sa propre place ne change rien : pas de ligne
    const same =
      found &&
      ((found.where === 'after' && found.target.nextElementSibling === d.block) ||
        (found.where === 'before' && found.target.previousElementSibling === d.block))
    d.target = found && !same ? found.target : null
    d.where = found ? found.where : 'after'
    d.axis = found ? found.axis : 'y'
    showLine(d.target, d.where, d.axis)
  }

  // Boucle d'animation : ressort du fantôme et défilement automatique près des bords
  function tick(): void {
    const d = drag
    if (!d || !d.started) return
    const tx = d.clientX - d.grabX
    const ty = d.clientY - d.grabY
    const dx = tx - d.x
    d.x += dx * 0.3
    d.y += (ty - d.y) * 0.3
    const rotate = Math.max(-4, Math.min(4, dx * 0.08))
    placeGhost(d, rotate, 1.02)
    if (view) {
      const edge = 70
      const vh = view.innerHeight
      let speed = 0
      if (d.clientY < edge) speed = -Math.ceil((edge - d.clientY) / 4)
      else if (d.clientY > vh - edge) speed = Math.ceil((d.clientY - (vh - edge)) / 4)
      if (speed) {
        view.scrollBy(0, Math.max(-22, Math.min(22, speed)))
        updateTarget(d)
        showSource(d.block)
      }
    }
    d.raf = view ? view.requestAnimationFrame(tick) : 0
  }

  function startVisual(d: DragState): void {
    d.started = true
    if (grip) grip.classList.remove('nf-on')
    if (grip2) grip2.classList.remove('nf-on')
    setLock(true)
    showSource(d.block)
    d.ghost = makeGhost(d.block, d)
    d.x = d.clientX - d.grabX
    d.y = d.clientY - d.grabY
    placeGhost(d, 0, 1)
    if (view) d.raf = view.requestAnimationFrame(tick)
  }

  function onPointerMove(e: PointerEvent): void {
    if (sizing) {
      e.preventDefault()
      const s = sizing
      const dx = (e.clientX - s.startX) / s.zoom
      const dy = (e.clientY - s.startY) / s.zoom
      if (Math.abs(dx) + Math.abs(dy) > 2) s.moved = true
      // Taille propre à la carte : la rangée (flex) la respecte
      s.el.style.flex = '0 0 auto'
      s.el.style.width = Math.max(140, Math.round(s.w + dx)) + 'px'
      s.el.style.minHeight = Math.max(60, Math.round(s.h + dy)) + 'px'
      showGrip(s.el)
      return
    }
    if (drag) {
      e.preventDefault()
      const d = drag
      d.clientX = e.clientX
      d.clientY = e.clientY
      if (!d.started) {
        if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) < 4) return
        startVisual(d)
      }
      updateTarget(d)
      return
    }
    if (!options.isEnabled()) return
    const target = e.target as Element | null
    if (!target || !target.closest) return
    if (
      (grip && target === grip) ||
      (grip2 && target === grip2) ||
      (sizeGrip && target === sizeGrip)
    )
      return
    const block = draggableOf(target)
    if (block) {
      if (block !== hovered) showGrip(block)
      return
    }
    if (hovered) {
      const r = (hoveredGroup || hovered).getBoundingClientRect()
      const inside =
        e.clientX >= r.left - 34 &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom
      if (!inside || !hovered.isConnected) hideGrip()
    }
  }

  // ---------- Sélection de blocs (clic sur la poignée ; Ctrl/Maj+clic pour en ajouter) ----------
  let picked: Element[] = []
  let selLayer: HTMLElement | null = null

  function inDocOrder(list: Element[]): Element[] {
    return list.slice().sort((a, b) => (a.compareDocumentPosition(b) & 4 ? -1 : 1))
  }

  function drawPicked(): void {
    picked = picked.filter((b) => b.isConnected)
    ensureUi()
    if (!selLayer) {
      selLayer = helperDiv('nf-bd-sel-layer')
    }
    if (selLayer.parentNode !== doc.documentElement) doc.documentElement.appendChild(selLayer)
    while (selLayer.firstChild) selLayer.removeChild(selLayer.firstChild)
    if (!picked.length) return
    picked.forEach((b) => {
      const r = pageRect(b)
      const box = doc.createElement('div')
      box.className = 'nf-bd-picked'
      box.style.left = r.left + 'px'
      box.style.top = r.top + 'px'
      box.style.width = r.width + 'px'
      box.style.height = r.height + 'px'
      selLayer!.appendChild(box)
    })
    // Barre d'actions au-dessus du premier bloc sélectionné
    const first = pageRect(inDocOrder(picked)[0])
    const bar = doc.createElement('div')
    bar.className = 'nf-bd-bar'
    const count = doc.createElement('span')
    count.textContent = picked.length > 1 ? picked.length + ' blocs' : '1 bloc'
    bar.appendChild(count)
    const actions: Array<[string, string, string]> = [
      ['duplicate', 'Dupliquer', 'Ctrl+D'],
      ['delete', 'Supprimer', 'Suppr']
    ]
    actions.forEach(([act, label, key]) => {
      const b = doc.createElement('button')
      b.setAttribute('type', 'button')
      b.setAttribute('data-act', act)
      b.textContent = label
      b.title = label + ' (' + key + ')'
      if (act === 'delete') b.className = 'nf-danger'
      bar.appendChild(b)
    })
    bar.style.left = first.left + first.width - 4 + 'px'
    bar.style.top = Math.max(0, first.top - 34) + 'px'
    selLayer.appendChild(bar)
  }

  function setPicked(list: Element[]): void {
    picked = list
    drawPicked()
  }

  function pick(block: Element, additive: boolean): void {
    if (!additive) {
      setPicked(picked.length === 1 && picked[0] === block ? [] : [block])
      return
    }
    // Un bloc et ce qu'il contient ne sont jamais sélectionnés ensemble
    const has = picked.indexOf(block) !== -1
    const rest = picked.filter((b) => b !== block && !b.contains(block) && !block.contains(b))
    setPicked(has ? rest : rest.concat([block]))
  }

  function removeWithSpace(el: Element): void {
    const prev = el.previousSibling
    if (isBlank(prev) && prev!.parentNode) prev!.parentNode.removeChild(prev!)
    el.remove()
  }

  function deletePicked(): void {
    if (!picked.length) return
    if (options.beforeChange) options.beforeChange()
    inDocOrder(picked).forEach(removeWithSpace)
    setPicked([])
    hideGrip()
    options.onChange()
  }

  function duplicatePicked(): void {
    if (!picked.length) return
    if (options.beforeChange) options.beforeChange()
    const copies: Element[] = []
    inDocOrder(picked).forEach((b) => {
      const copy = b.cloneNode(true) as Element
      copy.removeAttribute('id')
      moveBlock(copy, b, 'after')
      copies.push(copy)
    })
    setPicked(copies)
    options.onChange()
  }

  function onPointerDown(e: PointerEvent): void {
    if (!grip || !options.isEnabled()) return
    const target = e.target as Element | null
    // Barre d'actions de la sélection
    const action = target && target.closest ? target.closest('.nf-bd-bar button') : null
    if (action) {
      e.preventDefault()
      e.stopPropagation()
      if (action.getAttribute('data-act') === 'delete') deletePicked()
      else duplicatePicked()
      return
    }
    if (sizeGrip && e.target === sizeGrip && hovered && hovered.isConnected) {
      e.preventDefault()
      e.stopPropagation()
      const el = hovered as HTMLElement
      const r = el.getBoundingClientRect()
      if (options.beforeChange) options.beforeChange()
      sizing = {
        el,
        startX: e.clientX,
        startY: e.clientY,
        w: el.offsetWidth,
        h: el.offsetHeight,
        zoom: el.offsetWidth > 0 && r.width > 0 ? r.width / el.offsetWidth : 1,
        moved: false
      }
      setLock(true)
      return
    }
    const block = e.target === grip ? hovered : grip2 && e.target === grip2 ? hoveredGroup : null
    if (!block) {
      // Clic ailleurs : la sélection de blocs disparaît
      if (picked.length && !(target && selLayer && selLayer.contains(target))) setPicked([])
      return
    }
    if (!block.isConnected) {
      hideGrip()
      return
    }
    e.preventDefault()
    e.stopPropagation()
    const r = block.getBoundingClientRect()
    drag = {
      block,
      target: null,
      where: 'after',
      axis: 'y',
      started: false,
      additive: e.ctrlKey || e.metaKey || e.shiftKey,
      startX: e.clientX,
      startY: e.clientY,
      grabX: Math.max(8, Math.min(r.width - 8, e.clientX - r.left)),
      grabY: Math.max(8, e.clientY - r.top),
      clientX: e.clientX,
      clientY: e.clientY,
      x: 0,
      y: 0,
      ghost: null,
      raf: 0
    }
  }

  /** Le fantôme rejoint la place finale du bloc (ou sa place d'origine), puis disparaît. */
  function land(d: DragState): void {
    const ghost = d.ghost
    if (!ghost) return
    const r = d.block.getBoundingClientRect()
    ghost.style.transition =
      'transform .2s cubic-bezier(.2,.8,.2,1), opacity .2s ease, box-shadow .2s ease'
    ghost.style.transform = 'translate3d(' + r.left + 'px,' + r.top + 'px,0) rotate(0deg) scale(1)'
    ghost.style.opacity = '0'
    ghost.style.boxShadow = 'none'
    setTimeout(() => ghost.remove(), 220)
  }

  /** Blocs déplacés par le geste : toute la sélection si le bloc tiré en fait partie. */
  function movingBlocks(d: DragState): Element[] {
    return picked.length > 1 && picked.indexOf(d.block) !== -1 ? inDocOrder(picked) : [d.block]
  }

  function endDrag(apply: boolean): void {
    if (!drag) return
    const d = drag
    drag = null
    if (view && d.raf) view.cancelAnimationFrame(d.raf)
    setLock(false)
    showSource(null)
    showLine(null, 'after', 'y')
    hideGrip()
    if (!d.started) {
      // Simple clic sur la poignée : sélection
      if (apply) pick(d.block, d.additive)
      return
    }
    const blocks = movingBlocks(d)
    const target = d.target
    const valid =
      apply &&
      !!target &&
      target.isConnected &&
      blocks.every((b) => b.isConnected && b !== target && !b.contains(target))
    if (valid) {
      if (options.beforeChange) options.beforeChange()
      let ref: Element = target!
      let where = d.where
      let moved = false
      blocks.forEach((b) => {
        if (moveBlock(b, ref, where)) moved = true
        ref = b
        where = 'after'
      })
      if (moved) options.onChange()
    }
    land(d)
    if (picked.length) drawPicked()
  }

  if (view) {
    view.addEventListener('pointermove', onPointerMove as EventListener, true)
    view.addEventListener('pointerdown', onPointerDown as EventListener, true)
    const endSizing = (): void => {
      if (!sizing) return
      const s = sizing
      sizing = null
      setLock(false)
      if (s.moved) options.onChange()
    }
    view.addEventListener(
      'pointerup',
      () => {
        endSizing()
        endDrag(true)
      },
      true
    )
    view.addEventListener(
      'pointercancel',
      () => {
        endSizing()
        endDrag(false)
      },
      true
    )
    view.addEventListener('blur', () => endDrag(false))
    view.addEventListener(
      'keydown',
      (e: Event) => {
        const k = e as KeyboardEvent
        if (drag && k.key === 'Escape') {
          e.preventDefault()
          e.stopImmediatePropagation()
          endDrag(false)
          return
        }
        // Blocs disparus entre-temps (annulation…) : oubliés, la touche reste au texte
        picked = picked.filter((b) => b.isConnected)
        if (!picked.length || drag) return
        if (k.key === 'Delete' || k.key === 'Backspace') {
          e.preventDefault()
          e.stopImmediatePropagation()
          deletePicked()
        } else if ((k.ctrlKey || k.metaKey) && (k.key === 'd' || k.key === 'D')) {
          e.preventDefault()
          e.stopImmediatePropagation()
          duplicatePicked()
        } else if (k.key === 'Escape') {
          e.preventDefault()
          e.stopImmediatePropagation()
          setPicked([])
        } else if (k.key.length === 1 && !k.ctrlKey && !k.metaKey) {
          // Une frappe de texte reprend la main normalement
          setPicked([])
        }
      },
      true
    )
    view.addEventListener('scroll', () => {
      if (drag) return
      if (hovered && hovered.isConnected) showGrip(hovered)
      else hideGrip()
    })
    view.addEventListener('resize', () => {
      if (picked.length) drawPicked()
    })
    doc.addEventListener('input', () => {
      if (picked.length) drawPicked()
    })
  }

  return {
    moveBlock,
    draggableOf,
    groupOf,
    select: (blocks: Element[]) => setPicked(blocks.slice()),
    selected: () => picked.slice(),
    deleteSelected: deletePicked,
    duplicateSelected: duplicatePicked
  }
}
