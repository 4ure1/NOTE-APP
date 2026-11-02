/**
 * Outils de l'aperçu pour les tableaux et les cartes :
 * - sélection de cases : glisser d'une case à une autre (rectangle), Ctrl+clic pour ajouter / retirer ;
 *   Suppr vide les cases sélectionnées ;
 * - clic droit sur une case : fond de la case (ou des cases sélectionnées), insérer / supprimer une
 *   ligne ou une colonne, vider ;
 * - clic droit sur une carte (.node, .step) : couleur de la carte.
 *
 * Les fonds sont des classes du thème (bg-red…), les couleurs de carte aussi (.node.red, .step.purple).
 * L'interface (repères de sélection, menu) est marquée data-injected-preview-helpers.
 *
 * Fonction autonome (aucun import ni constante externe) : sa source est injectée dans l'iframe
 * d'aperçu (CodeWorkspace.tsx) via toString().
 */

export interface TableToolsOptions {
  onChange: () => void
  beforeChange?: () => void
  isEnabled: () => boolean
}

export interface TableTools {
  /** Cases du rectangle entre deux cases d'un même tableau. */
  cellsBetween(a: Element, b: Element): Element[]
  setBackground(cells: Element[], color: string): void
  insertRow(cell: Element, where: 'above' | 'below'): Element | null
  insertColumn(cell: Element, where: 'left' | 'right'): void
  deleteRow(cell: Element): void
  deleteColumn(cell: Element): void
  /** Couleur d'une carte (.node : red…brown, '' = gris ; .step : purple, orange, green, red, '' = bleu). */
  setCardColor(card: Element, color: string): void
  /** Cases actuellement sélectionnées. */
  selection(): Element[]
}

export function installTableTools(doc: Document, options: TableToolsOptions): TableTools {
  const HELPER = 'data-injected-preview-helpers'
  const BG = ['red', 'orange', 'yellow', 'green', 'purple', 'teal', 'blue', 'brown', 'gray']
  const SWATCH: Record<string, string> = {
    red: '#ef4444',
    orange: '#e0823d',
    yellow: '#d4b13a',
    green: '#57ab5a',
    purple: '#a371f7',
    teal: '#3fb9a8',
    blue: '#4a8fe7',
    brown: '#a08065',
    gray: '#8b949e'
  }
  const NODE_COLORS = ['red', 'orange', 'yellow', 'green', 'purple', 'teal', 'blue', 'brown']
  const STEP_COLORS = ['purple', 'orange', 'green', 'red']
  const view = doc.defaultView
  const NL = String.fromCharCode(10)

  const before = (): void => {
    if (options.beforeChange) options.beforeChange()
  }

  // ---------- Modèle ----------
  function rowsOf(table: Element): Element[] {
    return Array.from(table.querySelectorAll('tr')).filter((tr) => tr.closest('table') === table)
  }

  function cellsOf(tr: Element): Element[] {
    return Array.from(tr.children).filter((c) => c.nodeName === 'TD' || c.nodeName === 'TH')
  }

  function hasSpans(table: Element): boolean {
    return rowsOf(table).some((tr) =>
      cellsOf(tr).some(
        (c) =>
          parseInt(c.getAttribute('colspan') || '1', 10) > 1 ||
          parseInt(c.getAttribute('rowspan') || '1', 10) > 1
      )
    )
  }

  function position(cell: Element): { table: Element; row: number; col: number } | null {
    const tr = cell.parentElement
    const table = cell.closest('table')
    if (!tr || !table) return null
    return { table, row: rowsOf(table).indexOf(tr), col: cellsOf(tr).indexOf(cell) }
  }

  function cellsBetween(a: Element, b: Element): Element[] {
    const pa = position(a)
    const pb = position(b)
    if (!pa || !pb || pa.table !== pb.table) return [a]
    const r0 = Math.min(pa.row, pb.row)
    const r1 = Math.max(pa.row, pb.row)
    const c0 = Math.min(pa.col, pb.col)
    const c1 = Math.max(pa.col, pb.col)
    const out: Element[] = []
    rowsOf(pa.table).forEach((tr, r) => {
      if (r < r0 || r > r1) return
      cellsOf(tr).forEach((c, i) => {
        if (i >= c0 && i <= c1) out.push(c)
      })
    })
    return out
  }

  function cleanClass(el: Element): void {
    if (el.getAttribute('class') === '') el.removeAttribute('class')
  }

  function setBackground(cells: Element[], color: string): void {
    cells.forEach((c) => {
      BG.forEach((b) => c.classList.remove('bg-' + b))
      if (color && BG.indexOf(color) !== -1) c.classList.add('bg-' + color)
      cleanClass(c)
    })
  }

  function setCardColor(card: Element, color: string): void {
    const list = card.classList.contains('node') ? NODE_COLORS : STEP_COLORS
    list.forEach((c) => card.classList.remove(c))
    if (color && list.indexOf(color) !== -1) card.classList.add(color)
  }

  function indentOf(el: Node): string | null {
    const prev = el.previousSibling
    if (!prev || prev.nodeType !== 3) return null
    const data = prev.textContent || ''
    const nl = data.lastIndexOf(NL)
    if (nl === -1) return null
    const tail = data.slice(nl + 1)
    return tail.trim() === '' ? tail : null
  }

  function insertRow(cell: Element, where: 'above' | 'below'): Element | null {
    const tr = cell.parentElement
    if (!tr || !tr.parentNode) return null
    const tr2 = doc.createElement('tr')
    // Une nouvelle ligne de corps : <td>, sauf si toute la ligne de référence est en <th> et sous <thead>
    const inHead = tr.parentElement && tr.parentElement.nodeName === 'THEAD'
    cellsOf(tr).forEach((c) => {
      const tag = inHead ? 'th' : c.nodeName === 'TH' && where === 'above' ? 'th' : 'td'
      const n = doc.createElement(tag)
      const colspan = c.getAttribute('colspan')
      if (colspan) n.setAttribute('colspan', colspan)
      tr2.appendChild(n)
    })
    const parent = tr.parentNode
    const indent = indentOf(tr)
    if (where === 'above') {
      parent.insertBefore(tr2, tr)
      if (indent !== null) parent.insertBefore(doc.createTextNode(NL + indent), tr)
    } else {
      let anchor: Node = tr
      if (indent !== null) {
        const ws = doc.createTextNode(NL + indent)
        parent.insertBefore(ws, tr.nextSibling)
        anchor = ws
      }
      parent.insertBefore(tr2, anchor.nextSibling)
    }
    return tr2
  }

  function insertColumn(cell: Element, where: 'left' | 'right'): void {
    const p = position(cell)
    if (!p) return
    rowsOf(p.table).forEach((tr) => {
      const cells = cellsOf(tr)
      const ref = cells[p.col] || cells[cells.length - 1]
      const tag = ref && ref.nodeName === 'TH' ? 'th' : 'td'
      const n = doc.createElement(tag)
      if (!ref) tr.appendChild(n)
      else if (where === 'left') tr.insertBefore(n, ref)
      else tr.insertBefore(n, ref.nextSibling)
    })
  }

  function removeWithSpace(el: Element): void {
    const prev = el.previousSibling
    if (prev && prev.nodeType === 3 && (prev.textContent || '').trim() === '') prev.remove()
    el.remove()
  }

  function deleteRow(cell: Element): void {
    const p = position(cell)
    const tr = cell.parentElement
    if (!p || !tr) return
    if (rowsOf(p.table).length <= 1) {
      removeWithSpace(p.table)
      return
    }
    const group = tr.parentElement
    removeWithSpace(tr)
    if (group && group !== p.table && !group.querySelector('tr')) removeWithSpace(group)
  }

  function deleteColumn(cell: Element): void {
    const p = position(cell)
    if (!p) return
    const rows = rowsOf(p.table)
    if (rows.every((tr) => cellsOf(tr).length <= 1)) {
      removeWithSpace(p.table)
      return
    }
    rows.forEach((tr) => {
      const c = cellsOf(tr)[p.col]
      if (c) c.remove()
    })
  }

  // ---------- Sélection de cases (repères d'interface) ----------
  let selected: Element[] = []
  let anchor: Element | null = null
  let selecting = false
  let layer: HTMLElement | null = null
  let menu: HTMLElement | null = null

  function ensureStyle(): void {
    if (!doc.head || doc.getElementById('nf-table-tools-style')) return
    const style = doc.createElement('style')
    style.id = 'nf-table-tools-style'
    style.setAttribute(HELPER, 'true')
    style.textContent = [
      '.nf-tt-layer{position:absolute;left:0;top:0;width:0;height:0;z-index:4;pointer-events:none;}',
      '.nf-tt-sel{position:absolute;background:rgba(56,189,248,0.16);',
      'box-shadow:inset 0 0 0 1.5px rgba(56,189,248,0.8);border-radius:3px;}',
      '.nf-ctx{position:fixed;z-index:2147483600;min-width:230px;padding:5px;border-radius:10px;',
      'background:rgba(24,24,27,0.98);border:1px solid rgba(255,255,255,0.1);',
      'box-shadow:0 18px 44px rgba(0,0,0,0.55);font:13px "Segoe UI",system-ui,sans-serif;color:#e4e4e7;',
      'user-select:none;animation:nfCtxIn .08s ease-out;}',
      '@keyframes nfCtxIn{from{opacity:0;transform:translateY(-3px);}to{opacity:1;transform:none;}}',
      '.nf-ctx-title{padding:6px 9px 4px;font-size:11px;color:#a1a1aa;text-transform:uppercase;letter-spacing:.4px;}',
      '.nf-ctx-swatches{display:flex;flex-wrap:wrap;gap:6px;padding:4px 9px 8px;}',
      '.nf-ctx-swatch{width:20px;height:20px;border-radius:6px;cursor:pointer;box-sizing:border-box;',
      'border:2px solid transparent;transition:transform .1s ease;}',
      '.nf-ctx-swatch:hover{transform:scale(1.15);border-color:#fff;}',
      '.nf-ctx-swatch.nf-none{background:linear-gradient(135deg,transparent 45%,#ef4444 45%,#ef4444 55%,transparent 55%),#2a2a2e;',
      'border-color:rgba(255,255,255,0.2);}',
      '.nf-ctx-swatch.nf-current{border-color:#38bdf8;}',
      '.nf-ctx-item{padding:6px 9px;border-radius:6px;cursor:pointer;}',
      '.nf-ctx-item:hover{background:rgba(56,189,248,0.14);}',
      '.nf-ctx-item.nf-danger:hover{background:rgba(239,68,68,0.18);}',
      '.nf-ctx-item.nf-off{opacity:.4;pointer-events:none;}',
      '.nf-ctx-sep{height:1px;margin:4px 6px;background:rgba(255,255,255,0.08);}'
    ].join('')
    doc.head.appendChild(style)
  }

  function ensureLayer(): HTMLElement {
    ensureStyle()
    if (!layer) {
      layer = doc.createElement('div')
      layer.className = 'nf-tt-layer'
      layer.setAttribute(HELPER, 'true')
      layer.setAttribute('contenteditable', 'false')
    }
    if (doc.body && layer.parentNode !== doc.body) doc.body.appendChild(layer)
    return layer
  }

  function drawSelection(): void {
    selected = selected.filter((c) => c.isConnected)
    const l = ensureLayer()
    while (l.firstChild) l.removeChild(l.firstChild)
    if (selected.length < 2 && !(selected.length === 1 && selecting)) return
    const sx = view ? view.scrollX : 0
    const sy = view ? view.scrollY : 0
    selected.forEach((c) => {
      const r = c.getBoundingClientRect()
      const box = doc.createElement('div')
      box.className = 'nf-tt-sel'
      box.style.left = r.left + sx + 'px'
      box.style.top = r.top + sy + 'px'
      box.style.width = r.width + 'px'
      box.style.height = r.height + 'px'
      l.appendChild(box)
    })
  }

  function setSelection(cells: Element[]): void {
    selected = cells
    drawSelection()
  }

  function cellOf(target: EventTarget | null): Element | null {
    const el = target as Element | null
    if (!el || !el.closest || el.closest('[' + HELPER + ']')) return null
    const cell = el.closest('td, th')
    return cell && doc.body && doc.body.contains(cell) ? cell : null
  }

  /** Cases couvertes par la sélection de texte du navigateur (glisser sur plusieurs cases). */
  function cellsInTextSelection(table: Element): Element[] {
    const sel = doc.getSelection()
    if (!sel || !sel.rangeCount || sel.isCollapsed) return []
    const r = sel.getRangeAt(0)
    return Array.from(table.querySelectorAll('td, th')).filter((c) => r.intersectsNode(c))
  }

  // ---------- Menu contextuel ----------
  function closeMenu(): void {
    if (menu) menu.remove()
    menu = null
  }

  function swatches(
    container: HTMLElement,
    colors: string[],
    current: string,
    noneLabel: string,
    apply: (c: string) => void
  ): void {
    const row = doc.createElement('div')
    row.className = 'nf-ctx-swatches'
    const all = [''].concat(colors)
    all.forEach((c) => {
      const s = doc.createElement('div')
      s.className = 'nf-ctx-swatch' + (c ? '' : ' nf-none') + (c === current ? ' nf-current' : '')
      if (c) s.style.background = SWATCH[c] || c
      s.title = c ? c : noneLabel
      s.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        before()
        apply(c)
        closeMenu()
        drawSelection()
        options.onChange()
      })
      row.appendChild(s)
    })
    container.appendChild(row)
  }

  function title(container: HTMLElement, text: string): void {
    const t = doc.createElement('div')
    t.className = 'nf-ctx-title'
    t.textContent = text
    container.appendChild(t)
  }

  function item(container: HTMLElement, text: string, action: () => void, extra?: string): void {
    const it = doc.createElement('div')
    it.className = 'nf-ctx-item' + (extra ? ' ' + extra : '')
    it.textContent = text
    it.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      before()
      action()
      closeMenu()
      setSelection([])
      options.onChange()
    })
    container.appendChild(it)
  }

  function separator(container: HTMLElement): void {
    const s = doc.createElement('div')
    s.className = 'nf-ctx-sep'
    container.appendChild(s)
  }

  function currentBg(cells: Element[]): string {
    for (const b of BG) if (cells.every((c) => c.classList.contains('bg-' + b))) return b
    return cells.every((c) => !BG.some((b) => c.classList.contains('bg-' + b))) ? '' : '?'
  }

  function openMenu(x: number, y: number, cells: Element[], card: Element | null): void {
    closeMenu()
    ensureStyle()
    const m = doc.createElement('div')
    m.className = 'nf-ctx'
    m.setAttribute(HELPER, 'true')
    m.setAttribute('contenteditable', 'false')
    if (cells.length) {
      const table = cells[0].closest('table')!
      const spans = hasSpans(table)
      title(m, cells.length > 1 ? 'Fond des ' + cells.length + ' cases' : 'Fond de la case')
      swatches(m, BG, currentBg(cells), 'Aucun fond', (c) => setBackground(cells, c))
      separator(m)
      const first = cells[0]
      const last = cells[cells.length - 1]
      const off = spans ? 'nf-off' : ''
      item(m, 'Insérer une ligne au-dessus', () => insertRow(first, 'above'), off)
      item(m, 'Insérer une ligne en dessous', () => insertRow(last, 'below'), off)
      item(m, 'Insérer une colonne à gauche', () => insertColumn(first, 'left'), off)
      item(m, 'Insérer une colonne à droite', () => insertColumn(last, 'right'), off)
      separator(m)
      item(m, cells.length > 1 ? 'Vider les cases' : 'Vider la case', () =>
        cells.forEach((c) => {
          while (c.firstChild) c.removeChild(c.firstChild)
        })
      )
      item(m, 'Supprimer la ligne', () => deleteRow(first), 'nf-danger ' + off)
      item(m, 'Supprimer la colonne', () => deleteColumn(first), 'nf-danger ' + off)
    }
    if (card) {
      if (cells.length) separator(m)
      const isNode = card.classList.contains('node')
      const list = isNode ? NODE_COLORS : STEP_COLORS
      const current = list.find((c) => card.classList.contains(c)) || ''
      title(m, 'Couleur de la carte')
      swatches(m, list, current, isNode ? 'Gris' : 'Bleu', (c) => setCardColor(card, c))
    }
    doc.body.appendChild(m)
    // Reste dans la fenêtre
    const vw = view ? view.innerWidth : 1000
    const vh = view ? view.innerHeight : 800
    const w = m.offsetWidth || 240
    const h = m.offsetHeight || 300
    m.style.left = Math.max(6, Math.min(x, vw - w - 6)) + 'px'
    m.style.top = Math.max(6, Math.min(y, vh - h - 6)) + 'px'
    menu = m
  }

  // ---------- Événements ----------
  function onPointerDown(e: PointerEvent): void {
    if (!options.isEnabled()) return
    const target = e.target as Element | null
    if (menu && target && menu.contains(target)) return
    closeMenu()
    if (e.button !== 0) return
    const cell = cellOf(target)
    if (cell && (e.ctrlKey || e.metaKey)) {
      // Ctrl+clic : ajoute ou retire la case de la sélection
      e.preventDefault()
      const base = selected.length ? selected : anchor && anchor !== cell ? [anchor] : []
      const has = base.indexOf(cell) !== -1
      setSelection(has ? base.filter((c) => c !== cell) : base.concat([cell]))
      anchor = cell
      return
    }
    setSelection([])
    anchor = cell
    selecting = !!cell
  }

  function onPointerMove(e: PointerEvent): void {
    if (!selecting || !anchor || !(e.buttons & 1)) return
    const el = doc.elementFromPoint(e.clientX, e.clientY)
    const cell = cellOf(el)
    if (!cell || cell.closest('table') !== anchor.closest('table')) return
    if (cell === anchor && selected.length <= 1) return
    // Plusieurs cases : sélection de cases à la place de la sélection de texte
    const sel = doc.getSelection()
    if (sel) sel.removeAllRanges()
    e.preventDefault()
    setSelection(cellsBetween(anchor, cell))
  }

  function onPointerUp(): void {
    selecting = false
    if (selected.length === 1) setSelection([])
  }

  function onContextMenu(e: MouseEvent): void {
    if (!options.isEnabled()) return
    const target = e.target as Element | null
    if (!target || !target.closest || target.closest('[' + HELPER + ']')) return
    const cell = cellOf(target)
    const card = target.closest('.node, .step')
    if (!cell && !card) return
    e.preventDefault()
    let cells: Element[] = []
    if (cell) {
      if (selected.indexOf(cell) !== -1) cells = selected.slice()
      else {
        const fromText = cellsInTextSelection(cell.closest('table')!)
        cells = fromText.length > 1 && fromText.indexOf(cell) !== -1 ? fromText : [cell]
      }
    }
    openMenu(e.clientX, e.clientY, cells, card)
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (menu && e.key === 'Escape') {
      e.preventDefault()
      e.stopImmediatePropagation()
      closeMenu()
      return
    }
    if (selected.length < 2) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopImmediatePropagation()
      setSelection([])
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      e.stopImmediatePropagation()
      before()
      selected.forEach((c) => {
        while (c.firstChild) c.removeChild(c.firstChild)
      })
      drawSelection()
      options.onChange()
    } else if (e.key.length === 1 || e.key === 'Enter') {
      // Une saisie reprend la main normalement : la sélection de cases disparaît
      setSelection([])
    }
  }

  if (view) {
    view.addEventListener('pointerdown', onPointerDown as EventListener, true)
    view.addEventListener('pointermove', onPointerMove as EventListener, true)
    view.addEventListener('pointerup', onPointerUp, true)
    view.addEventListener('contextmenu', onContextMenu as EventListener, true)
    view.addEventListener('keydown', onKeyDown as EventListener, true)
    view.addEventListener('resize', drawSelection)
    view.addEventListener('blur', closeMenu)
    doc.addEventListener('input', () => {
      if (selected.length) drawSelection()
    })
  }

  return {
    cellsBetween,
    setBackground,
    insertRow,
    insertColumn,
    deleteRow,
    deleteColumn,
    setCardColor,
    selection: () => selected.slice()
  }
}
