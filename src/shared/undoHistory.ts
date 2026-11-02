/**
 * Historique d'annulation de l'aperçu éditable (Ctrl+Z / Ctrl+Y / Ctrl+Maj+Z).
 *
 * L'annulation du navigateur ne suit pas les modifications faites par script (Entrée, snippets, canvas,
 * glisser-déposer, nettoyage…) et se vide au moindre changement du DOM hors de ses commandes : l'aperçu
 * garde donc ses propres instantanés du contenu du <body> (sans l'interface ajoutée) et de la position
 * du curseur (en caractères depuis le début du texte, insensible aux marqueurs de champ).
 *
 * record() est appelé AVANT chaque modification. La frappe continue est regroupée (un mot = une étape,
 * coupure après un espace ou une pause d'une seconde).
 *
 * Fonction autonome (aucun import ni constante externe) : sa source est injectée dans l'iframe
 * d'aperçu (CodeWorkspace.tsx) via toString().
 */

export interface UndoHistoryOptions {
  /** Horloge (remplaçable en test). */
  now?: () => number
  /** Taille maximale de la pile (200 par défaut). */
  limit?: number
}

export interface UndoHistory {
  /** Instantané avant une modification ; 'typing' regroupe la frappe (data = texte tapé), 'deleting' les effacements. */
  record(kind?: 'typing' | 'deleting' | 'edit', data?: string): void
  /** Revient à l'état précédent ; false s'il n'y en a pas. */
  undo(): boolean
  redo(): boolean
  /** Coupe le regroupement de frappe en cours (clic, déplacement du curseur). */
  breakGroup(): void
  canUndo(): boolean
  canRedo(): boolean
}

export function createUndoHistory(doc: Document, options?: UndoHistoryOptions): UndoHistory {
  const opts = options || {}
  const now = opts.now || ((): number => Date.now())
  const limit = opts.limit || 200
  const HELPERS = '[data-injected-preview-helpers], #preview-snippet-menu'
  const ZW = String.fromCharCode(8203)

  interface Snapshot {
    html: string
    caret: number
  }
  const undoStack: Snapshot[] = []
  const redoStack: Snapshot[] = []
  let lastKind = ''
  let lastTime = 0
  let lastData = ''

  function isHelper(n: Node): boolean {
    return n.nodeType === 1 && !!(n as Element).closest && !!(n as Element).closest(HELPERS)
  }

  /** Nœuds texte de la note dans l'ordre, sans l'interface ni les espaces de largeur nulle. */
  function textNodes(root: Node): Text[] {
    const out: Text[] = []
    const walk = (n: Node): void => {
      if (n.nodeType === 3) out.push(n as Text)
      else if (n.nodeType === 1 && !isHelper(n)) {
        for (let c = n.firstChild; c; c = c.nextSibling) walk(c)
      }
    }
    walk(root)
    return out
  }

  function visibleLength(s: string): number {
    return s.split(ZW).join('').length
  }

  function caretOffset(): number {
    const sel = doc.getSelection()
    const body = doc.body
    if (!sel || !sel.rangeCount || !body) return -1
    const r = sel.getRangeAt(0)
    const node = r.startContainer
    if (!body.contains(node)) return -1
    let count = 0
    const nodes = textNodes(body)
    if (node.nodeType === 3) {
      for (const t of nodes) {
        if (t === node) return count + visibleLength((t.data || '').slice(0, r.startOffset))
        count += visibleLength(t.data || '')
      }
      return count
    }
    // Curseur entre deux nœuds : nombre de caractères avant le nœud qui suit
    const after = node.childNodes[r.startOffset] || null
    for (const t of nodes) {
      const pos = after ? after.compareDocumentPosition(t) : node.compareDocumentPosition(t)
      const reached = after
        ? t === after || (pos & 4) !== 0 || (pos & 16) !== 0
        : (pos & 4) !== 0 && (pos & 16) === 0
      if (reached) return count
      count += visibleLength(t.data || '')
    }
    return count
  }

  function placeCaret(offset: number): void {
    const sel = doc.getSelection()
    const body = doc.body
    if (!sel || !body || offset < 0) return
    let count = 0
    const nodes = textNodes(body)
    for (const t of nodes) {
      const len = visibleLength(t.data || '')
      if (count + len >= offset) {
        // Position réelle dans le nœud (en sautant les espaces de largeur nulle)
        let real = 0
        let seen = 0
        const data = t.data || ''
        while (real < data.length && seen < offset - count) {
          if (data.charAt(real) !== ZW) seen++
          real++
        }
        const r = doc.createRange()
        r.setStart(t, real)
        r.collapse(true)
        sel.removeAllRanges()
        sel.addRange(r)
        return
      }
      count += len
    }
    const r = doc.createRange()
    r.selectNodeContents(body)
    r.collapse(false)
    sel.removeAllRanges()
    sel.addRange(r)
  }

  function serialize(): string {
    const body = doc.body
    if (!body) return ''
    const clone = body.cloneNode(true) as HTMLElement
    const helpers = clone.querySelectorAll(HELPERS)
    for (let i = 0; i < helpers.length; i++) helpers[i].remove()
    // Marqueurs de champ de snippet : le texte reste, le marqueur non (la session ne survit pas)
    const markers = clone.querySelectorAll('[data-nf-field]')
    for (let i = 0; i < markers.length; i++) {
      const m = markers[i]
      const parent = m.parentNode
      if (!parent) continue
      while (m.firstChild) parent.insertBefore(m.firstChild, m)
      m.remove()
    }
    return clone.innerHTML
  }

  function snapshot(): Snapshot {
    return { html: serialize(), caret: caretOffset() }
  }

  function restore(s: Snapshot): void {
    const body = doc.body
    if (!body) return
    // L'interface ajoutée par l'aperçu (menus, poignées) est gardée telle quelle
    const kept: Element[] = []
    for (let c = body.firstElementChild; c; c = c.nextElementSibling) {
      if (c.matches(HELPERS)) kept.push(c)
    }
    body.innerHTML = s.html
    kept.forEach((el) => body.appendChild(el))
    placeCaret(s.caret)
  }

  function record(kind?: 'typing' | 'deleting' | 'edit', data?: string): void {
    const k = kind || 'edit'
    const t = now()
    // Frappe continue : une seule étape par mot ; effacements à la suite (Retour arrière maintenu) :
    // une seule étape
    const typingGroup =
      k === 'typing' && lastKind === 'typing' && !(lastData === ' ' && data !== ' ')
    const deletingGroup = k === 'deleting' && lastKind === 'deleting'
    if ((typingGroup || deletingGroup) && t - lastTime < 1000 && undoStack.length) {
      lastTime = t
      lastData = data || ''
      return
    }
    const s = snapshot()
    const top = undoStack[undoStack.length - 1]
    lastKind = k
    lastTime = t
    lastData = data || ''
    if (top && top.html === s.html) return
    undoStack.push(s)
    if (undoStack.length > limit) undoStack.shift()
    redoStack.length = 0
  }

  function undo(): boolean {
    const prev = undoStack.pop()
    if (!prev) return false
    const current = snapshot()
    // Un instantané identique à l'état actuel (rien n'a changé depuis) : on remonte d'un cran
    if (current.html === prev.html) {
      const older = undoStack.pop()
      if (!older) {
        undoStack.push(prev)
        return false
      }
      redoStack.push(current)
      restore(older)
    } else {
      redoStack.push(current)
      restore(prev)
    }
    lastKind = ''
    return true
  }

  function redo(): boolean {
    const next = redoStack.pop()
    if (!next) return false
    undoStack.push(snapshot())
    restore(next)
    lastKind = ''
    return true
  }

  function breakGroup(): void {
    lastKind = ''
  }

  return {
    record,
    undo,
    redo,
    breakGroup,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0
  }
}
