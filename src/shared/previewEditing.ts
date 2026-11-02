/**
 * Saisie dans l'aperçu éditable (iframe) : ce que le navigateur fait mal tout seul.
 *
 * - Entrée : de vrais paragraphes <p> (jamais de <br> ni de <div>), le texte après le curseur passe dans
 *   le nouveau bloc, la coloration en cours (<span class="o">…) ne déborde pas sur une ligne vide,
 *   et le nouveau bloc reprend l'indentation de son voisin dans le code.
 * - Sortie d'une coloration : la frappe juste après un <span>/<strong>… s'écrit hors de lui ;
 *   Flèche droite au bout d'un texte coloré « sort » de la coloration.
 * - Après un effacement, les <span style="…"> / <font> que Chrome invente en fusionnant deux blocs
 *   sont retirés (leur texte reste).
 *
 * Fonction autonome (aucun import, aucune constante externe) : sa source est injectée dans l'iframe
 * d'aperçu (CodeWorkspace.tsx) via toString().
 */

export interface PreviewEditing {
  /** Entrée sans modificateur : true si géré (l'appelant annule l'action du navigateur et enregistre). */
  handleEnter(doc: Document): boolean
  /** Saisie d'un texte : true si le texte a été écrit hors d'une coloration (à enregistrer). */
  insertTextOutside(doc: Document, text: string): boolean
  /** Entrée dans un <pre> : vrai saut de ligne dans le même bloc, indentation de la ligne reprise. */
  insertCodeNewline(doc: Document): boolean
  /** Insère un fragment au curseur ; un bloc n'est jamais posé dans un <p> (le paragraphe est coupé). */
  insertFragment(doc: Document, fragment: DocumentFragment): Node[]
  /** Collage de texte sur plusieurs lignes en paragraphes ; false si le collage normal suffit. */
  pasteText(doc: Document, text: string): boolean
  /** Flèche droite : true si le curseur était au bout d'un texte coloré (la frappe suivante en sort). */
  armExit(doc: Document): boolean
  /** Oublie la sortie armée (autre touche, clic, déplacement du curseur). */
  disarm(): void
  /** Éléments stylés présents avant un effacement. */
  snapshotStyled(doc: Document): Set<Element>
  /** Retire les éléments stylés apparus depuis snapshotStyled ; renvoie leur nombre. */
  unwrapNewStyled(doc: Document, before: Set<Element>): number
}

export function createPreviewEditing(): PreviewEditing {
  const INLINE_TAGS = [
    'A',
    'ABBR',
    'B',
    'BDI',
    'BDO',
    'BR',
    'CITE',
    'CODE',
    'DATA',
    'DFN',
    'EM',
    'FONT',
    'I',
    'IMG',
    'INPUT',
    'KBD',
    'LABEL',
    'MARK',
    'Q',
    'S',
    'SAMP',
    'SMALL',
    'SPAN',
    'STRONG',
    'SUB',
    'SUP',
    'TIME',
    'U',
    'VAR',
    'WBR'
  ]
  const FORMAT_TAGS = [
    'A',
    'B',
    'CODE',
    'EM',
    'FONT',
    'I',
    'KBD',
    'MARK',
    'S',
    'SMALL',
    'SPAN',
    'STRONG',
    'SUB',
    'SUP',
    'U'
  ]
  const TEXT_BLOCKS = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI']
  // Blocs titre du design system : Entrée crée un paragraphe après eux, dans leur carte
  const TITLE_CLASSES = ['node-title', 'q-title', 'label', 'caption']
  const CONTAINERS = [
    'DIV',
    'SECTION',
    'ARTICLE',
    'ASIDE',
    'MAIN',
    'HEADER',
    'NAV',
    'BLOCKQUOTE',
    'FIGURE',
    'BODY',
    'DETAILS'
  ]
  // Là où Entrée garde le comportement du navigateur (code, cellules, éléments non éditables)
  // (un <code> en ligne, hors <pre>, se coupe comme le paragraphe qui le contient)
  const NATIVE_TAGS = ['PRE', 'TD', 'TH', 'SUMMARY', 'svg', 'SVG', 'TEXTAREA', 'BUTTON']
  const ELEMENT = 1
  const TEXT = 3
  let armed: Element | null = null

  function isElement(n: Node | null): n is Element {
    return !!n && n.nodeType === ELEMENT
  }

  function displayOf(el: Element): string {
    const view = el.ownerDocument && el.ownerDocument.defaultView
    if (!view || !view.getComputedStyle) return ''
    try {
      return view.getComputedStyle(el).display || ''
    } catch {
      return ''
    }
  }

  function isInline(n: Node): boolean {
    if (n.nodeType === TEXT) return true
    if (!isElement(n)) return true // commentaires : suivent le texte
    if (INLINE_TAGS.indexOf(n.nodeName.toUpperCase()) === -1) return false
    const display = displayOf(n)
    return !display || display.indexOf('inline') === 0 || display === 'contents'
  }

  function isWhitespace(s: string): boolean {
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i)
      if (c !== 32 && c !== 9 && c !== 10 && c !== 13) return false
    }
    return true
  }

  /** Contenu sans texte visible ni élément qui s'affiche (image, champ…) : une ligne vide. */
  function isEmptyContent(root: Node): boolean {
    const text = (root.textContent || '').split(String.fromCharCode(8203)).join('')
    if (!isWhitespace(text)) return false
    if (isElement(root) || root.nodeType === 11) {
      const visible = (root as Element).querySelector
        ? (root as Element).querySelector('img, input, svg, video, iframe, canvas, hr, object')
        : null
      if (visible) return false
    }
    return true
  }

  /** Indentation du bloc dans le code : les espaces après le dernier saut de ligne qui le précède. */
  function indentBefore(node: Node): string | null {
    const prev = node.previousSibling
    if (!prev || prev.nodeType !== TEXT) return null
    const data = prev.textContent || ''
    const nl = data.lastIndexOf('\n')
    if (nl === -1) return null
    const tail = data.slice(nl + 1)
    return isWhitespace(tail) ? tail : null
  }

  function insertAfter(ref: Node, node: Node): void {
    const parent = ref.parentNode
    if (!parent) return
    const indent = indentBefore(ref)
    let anchor: Node = ref
    if (indent !== null) {
      const ws = ref.ownerDocument!.createTextNode('\n' + indent)
      parent.insertBefore(ws, ref.nextSibling)
      anchor = ws
    }
    parent.insertBefore(node, anchor.nextSibling)
  }

  function insertBefore(ref: Node, node: Node): void {
    const parent = ref.parentNode
    if (!parent) return
    parent.insertBefore(node, ref)
    const indent = indentBefore(node)
    if (indent !== null) parent.insertBefore(ref.ownerDocument!.createTextNode('\n' + indent), ref)
  }

  function firstCaretPosition(el: Node): { node: Node; offset: number } {
    let n: Node = el
    while (n.firstChild && isElement(n.firstChild) && n.firstChild.nodeName !== 'BR')
      n = n.firstChild
    if (n.firstChild && n.firstChild.nodeType === TEXT) return { node: n.firstChild, offset: 0 }
    return { node: n, offset: 0 }
  }

  function placeCaret(doc: Document, node: Node, offset: number): void {
    const sel = doc.getSelection()
    if (!sel) return
    const r = doc.createRange()
    r.setStart(node, offset)
    r.collapse(true)
    sel.removeAllRanges()
    sel.addRange(r)
  }

  function ensureNotEmpty(el: Element): void {
    if (isEmptyContent(el)) {
      while (el.firstChild) el.removeChild(el.firstChild)
      el.appendChild(el.ownerDocument.createElement('br'))
    }
  }

  function isNativeZone(n: Node | null, stop: Node): boolean {
    while (n && n !== stop) {
      if (isElement(n)) {
        if (
          NATIVE_TAGS.indexOf(n.nodeName) !== -1 ||
          NATIVE_TAGS.indexOf(n.nodeName.toUpperCase()) !== -1
        )
          return true
        if (n.getAttribute('contenteditable') === 'false') return true
        if (n.hasAttribute('data-injected-preview-helpers')) return true
      }
      n = n.parentNode
    }
    return false
  }

  /** Coupe le bloc au curseur : le texte qui suit passe dans newBlock (créé à côté). */
  function splitBlock(doc: Document, block: Element, range: Range, newTag: string): void {
    const before = doc.createRange()
    before.setStart(block, 0)
    before.setEnd(range.startContainer, range.startOffset)
    const atStart = isEmptyContent(before.cloneContents())

    const after = doc.createRange()
    after.setStart(range.startContainer, range.startOffset)
    after.setEnd(block, block.childNodes.length)
    const atEnd = isEmptyContent(after.cloneContents())

    const fresh = doc.createElement(newTag)
    if (atStart && !atEnd) {
      // Curseur au début d'un bloc rempli : ligne vide au-dessus, le curseur reste dans le bloc
      fresh.appendChild(doc.createElement('br'))
      insertBefore(block, fresh)
      const pos = firstCaretPosition(block)
      placeCaret(doc, pos.node, pos.offset)
      return
    }
    const moved = after.extractContents()
    if (isEmptyContent(moved)) fresh.appendChild(doc.createElement('br'))
    else fresh.appendChild(moved)
    ensureNotEmpty(block)
    insertAfter(block, fresh)
    const pos = firstCaretPosition(fresh)
    placeCaret(doc, pos.node, pos.offset)
  }

  /** Blancs de mise en page du code entre deux blocs (pas une espace entre deux mots colorés). */
  function isLayoutWhitespace(n: Node): boolean {
    if (n.nodeType !== TEXT || !isWhitespace(n.textContent || '')) return false
    const inlineElement = (s: Node | null): boolean => !!s && isElement(s) && isInline(s)
    return !inlineElement(n.previousSibling) && !inlineElement(n.nextSibling)
  }

  /** Enfant direct de parent qui contient node (ou null si node est parent). */
  function childOf(parent: Node, node: Node): Node | null {
    let n: Node | null = node
    while (n && n.parentNode !== parent) n = n.parentNode
    return n
  }

  /** Enveloppe dans un <p> la suite de texte et d'éléments en ligne autour de child. */
  function wrapInlineRun(doc: Document, container: Element, child: Node): Element {
    let first: Node = child
    let last: Node = child
    while (first.previousSibling && isInline(first.previousSibling)) first = first.previousSibling
    while (last.nextSibling && isInline(last.nextSibling)) last = last.nextSibling
    // Les blancs de mise en page du code restent hors du paragraphe
    while (first !== last && first.nodeType === TEXT && isWhitespace(first.textContent || '')) {
      first = first.nextSibling!
    }
    while (last !== first && last.nodeType === TEXT && isWhitespace(last.textContent || '')) {
      last = last.previousSibling!
    }
    if (first.nodeType === TEXT) {
      const data = first.textContent || ''
      let i = 0
      while (i < data.length && isWhitespace(data.charAt(i))) i++
      if (i > 0 && i < data.length) {
        first = (first as Text).splitText(i)
        if (last === first.previousSibling) last = first
      }
    }
    if (last.nodeType === TEXT) {
      const data = last.textContent || ''
      let j = data.length
      while (j > 0 && isWhitespace(data.charAt(j - 1))) j--
      if (j > 0 && j < data.length) (last as Text).splitText(j)
    }
    const p = doc.createElement('p')
    container.insertBefore(p, first)
    let n: Node | null = first
    while (n) {
      const next: Node | null = n === last ? null : n.nextSibling
      p.appendChild(n)
      n = next
    }
    return p
  }

  function insertCodeNewline(doc: Document): boolean {
    armed = null
    const sel = doc.getSelection()
    if (!sel || !sel.rangeCount || !doc.body) return false
    const range = sel.getRangeAt(0)
    let pre: Node | null = range.startContainer
    while (pre && pre !== doc.body && pre.nodeName !== 'PRE') pre = pre.parentNode
    if (!pre || pre === doc.body || !(pre as Element).contains(range.endContainer)) return false
    if (!range.collapsed) {
      range.deleteContents()
      range.collapse(true)
    }
    const before = doc.createRange()
    before.setStart(pre, 0)
    before.setEnd(range.startContainer, range.startOffset)
    const textBefore = before.toString()
    const NL = String.fromCharCode(10)
    const TAB = String.fromCharCode(9)
    let indent = ''
    for (let i = textBefore.lastIndexOf(NL) + 1; i < textBefore.length; i++) {
      const c = textBefore.charAt(i)
      if (c !== ' ' && c !== TAB) break
      indent += c
    }
    const after = doc.createRange()
    after.setStart(range.startContainer, range.startOffset)
    after.setEnd(pre, pre.childNodes.length)
    // Un saut de ligne final ne s'affiche pas dans un <pre> : on en met un second pour voir la ligne
    const atEnd = after.toString() === ''
    const typed = NL + indent
    const insert = typed + (atEnd ? NL : '')
    let node: Node = range.startContainer
    let offset = range.startOffset
    if (node.nodeType !== TEXT) {
      // <code><br></code> (bloc vide) : le <br> de remplissage n'a plus lieu d'être
      const holder = node as Element
      const only = holder.childNodes.length === 1 ? holder.firstChild : null
      if (only && only.nodeName === 'BR') {
        holder.removeChild(only)
        offset = 0
      }
      const text = doc.createTextNode('')
      holder.insertBefore(text, holder.childNodes[offset] || null)
      node = text
      offset = 0
    }
    const data = node.textContent || ''
    node.textContent = data.slice(0, offset) + insert + data.slice(offset)
    placeCaret(doc, node, offset + typed.length)
    return true
  }

  function handleEnter(doc: Document): boolean {
    armed = null
    const sel = doc.getSelection()
    if (!sel || !sel.rangeCount) return false
    const range = sel.getRangeAt(0)
    const body = doc.body
    if (!body || !body.contains(range.startContainer)) return false
    if (isNativeZone(range.startContainer, body)) return false
    if (!range.collapsed) {
      if (isNativeZone(range.endContainer, body)) return false
      range.deleteContents()
      range.collapse(true)
    }

    let n: Node | null = range.startContainer
    while (n && n !== body) {
      if (isElement(n)) {
        const tag = n.nodeName.toUpperCase()
        const isTitle = TITLE_CLASSES.some(
          (c) => n!.nodeType === ELEMENT && (n as Element).classList.contains(c)
        )
        if (isTitle && n.parentNode && isElement(n.parentNode)) {
          splitBlock(doc, n, range, 'p')
          return true
        }
        if (TEXT_BLOCKS.indexOf(tag) !== -1) {
          splitBlock(doc, n, range, tag === 'LI' ? 'li' : 'p')
          return true
        }
        if (CONTAINERS.indexOf(tag) !== -1) break
        // Élément en ligne affiché en bloc (ex. <span class="label">) : paragraphe après lui
        if (!isInline(n) && n.parentNode && isElement(n.parentNode)) {
          const parentTag = n.parentNode.nodeName.toUpperCase()
          if (CONTAINERS.indexOf(parentTag) !== -1) {
            splitBlock(doc, n, range, 'p')
            return true
          }
        }
      }
      n = n.parentNode
    }
    const container = (n && isElement(n) ? n : body) as Element

    // Curseur entre deux enfants du conteneur (pas dans du texte)
    let child: Node | null
    if (range.startContainer === container) {
      child =
        container.childNodes[range.startOffset] ||
        container.childNodes[range.startOffset - 1] ||
        null
    } else {
      child = childOf(container, range.startContainer)
    }
    if (!child || !isInline(child) || isLayoutWhitespace(child)) {
      // Rien à envelopper : un paragraphe vide à cet endroit
      const p = doc.createElement('p')
      p.appendChild(doc.createElement('br'))
      const ref = child && child.parentNode === container ? child : null
      if (ref && ref.nodeType === TEXT) {
        // Dans les blancs de mise en page : avant le bloc suivant, à son indentation
        const next = ref.nextSibling
        if (next) insertBefore(next, p)
        else container.appendChild(p)
      } else if (ref) {
        insertAfter(ref, p)
      } else {
        container.appendChild(p)
      }
      placeCaret(doc, p, 0)
      return true
    }
    // Retenir la position avant d'envelopper (les nœuds sont déplacés, pas recréés)
    const caretNode = range.startContainer
    const caretOffset = range.startOffset
    const p = wrapInlineRun(doc, container, child)
    const r = doc.createRange()
    if (caretNode === container) {
      r.setStart(p, p.childNodes.length)
    } else {
      r.setStart(
        caretNode,
        Math.min(
          caretOffset,
          caretNode.nodeType === TEXT
            ? (caretNode.textContent || '').length
            : caretNode.childNodes.length
        )
      )
    }
    r.collapse(true)
    splitBlock(doc, p, r, 'p')
    return true
  }

  function formatAncestorAtEnd(node: Node, offset: number, stop: Node): Element | null {
    // Le curseur est-il tout au bout du texte d'un élément de mise en forme ?
    if (node.nodeType === TEXT && offset < (node.textContent || '').length) return null
    if (isElement(node) && offset < node.childNodes.length) return null
    let n: Node = node
    let found: Element | null = null
    while (n.parentNode && n !== stop) {
      // Rien de visible après n dans son parent
      let sib = n.nextSibling
      while (sib && sib.nodeType === TEXT && (sib.textContent || '') === '') sib = sib.nextSibling
      if (sib) break
      const parent = n.parentNode
      if (!isElement(parent) || FORMAT_TAGS.indexOf(parent.nodeName.toUpperCase()) === -1) break
      if (!isInline(parent)) break
      found = parent
      n = parent
    }
    return found
  }

  function armExit(doc: Document): boolean {
    const sel = doc.getSelection()
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return false
    const r = sel.getRangeAt(0)
    if (!doc.body || isNativeZone(r.startContainer, doc.body)) return false
    const el = formatAncestorAtEnd(r.startContainer, r.startOffset, doc.body)
    if (!el || el === armed) return false
    armed = el
    return true
  }

  function disarm(): void {
    armed = null
  }

  function writeAfter(doc: Document, parent: Node, index: number, text: string): void {
    const next = parent.childNodes[index]
    if (next && next.nodeType === TEXT) {
      next.textContent = text + (next.textContent || '')
      placeCaret(doc, next, text.length)
    } else {
      const t = doc.createTextNode(text)
      parent.insertBefore(t, next || null)
      placeCaret(doc, t, text.length)
    }
  }

  function insertTextOutside(doc: Document, text: string): boolean {
    const sel = doc.getSelection()
    if (!sel || !sel.rangeCount || !sel.isCollapsed || !text) {
      armed = null
      return false
    }
    const r = sel.getRangeAt(0)
    const node = r.startContainer
    if (!doc.body || !doc.body.contains(node) || isNativeZone(node, doc.body)) {
      armed = null
      return false
    }
    // Sortie armée par Flèche droite : écrire juste après l'élément coloré si le curseur est à son bout
    if (armed && armed.isConnected && armed.contains(node) && armed.parentNode) {
      const rest = doc.createRange()
      rest.setStart(node, r.startOffset)
      rest.setEnd(armed, armed.childNodes.length)
      if (isEmptyContent(rest.cloneContents())) {
        const target = armed
        const parent = target.parentNode!
        armed = null
        writeAfter(doc, parent, Array.prototype.indexOf.call(parent.childNodes, target) + 1, text)
        return true
      }
    }
    armed = null
    // Curseur entre deux nœuds, juste après un élément en ligne : Chrome écrirait dedans
    if (isElement(node) && r.startOffset > 0) {
      const prev = node.childNodes[r.startOffset - 1]
      if (
        prev &&
        isElement(prev) &&
        prev.nodeName !== 'BR' &&
        prev.nodeName !== 'IMG' &&
        isInline(prev)
      ) {
        writeAfter(doc, node, r.startOffset, text)
        return true
      }
    }
    return false
  }

  const STYLED = 'span[style], font'

  function snapshotStyled(doc: Document): Set<Element> {
    const set = new Set<Element>()
    const found = doc.querySelectorAll(STYLED)
    for (let i = 0; i < found.length; i++) set.add(found[i])
    return set
  }

  function unwrapNewStyled(doc: Document, before: Set<Element>): number {
    const found = doc.querySelectorAll(STYLED)
    let count = 0
    for (let i = 0; i < found.length; i++) {
      const el = found[i]
      if (before.has(el)) continue
      if (el.closest('[data-injected-preview-helpers]')) continue
      // Seulement les éléments « de style » sans autre rôle (classe, id, attribut data…)
      let other = false
      for (let a = 0; a < el.attributes.length; a++) {
        const name = el.attributes[a].name
        if (
          name !== 'style' &&
          !(el.nodeName === 'FONT' && (name === 'color' || name === 'face' || name === 'size'))
        )
          other = true
      }
      if (other || !el.parentNode) continue
      const sel = doc.getSelection()
      const r = sel && sel.rangeCount ? sel.getRangeAt(0) : null
      const caretInside = !!r && el.contains(r.startContainer)
      const caretNode = r ? r.startContainer : null
      const caretOffset = r ? r.startOffset : 0
      const parent = el.parentNode
      const index = Array.prototype.indexOf.call(parent.childNodes, el)
      const moved = el.childNodes.length
      while (el.firstChild) parent.insertBefore(el.firstChild, el)
      parent.removeChild(el)
      count++
      if (sel && r && caretNode) {
        if (caretNode === el) placeCaret(doc, parent, index + Math.min(caretOffset, moved))
        else if (caretInside) placeCaret(doc, caretNode, caretOffset)
      }
    }
    return count
  }

  // Balises qui ne peuvent pas vivre dans un <p> ou un titre : le navigateur couperait le paragraphe
  // au rechargement (et laisserait des <p></p> vides)
  const BLOCK_TAGS = [
    'ADDRESS',
    'ARTICLE',
    'ASIDE',
    'BLOCKQUOTE',
    'DETAILS',
    'DIV',
    'DL',
    'FIELDSET',
    'FIGURE',
    'FOOTER',
    'FORM',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'HEADER',
    'HR',
    'MAIN',
    'NAV',
    'OL',
    'P',
    'PRE',
    'SECTION',
    'TABLE',
    'UL',
    'STYLE',
    'SCRIPT'
  ]
  const PARAGRAPHS = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']

  function isBlockNode(n: Node): boolean {
    return isElement(n) && BLOCK_TAGS.indexOf(n.nodeName.toUpperCase()) !== -1
  }

  /**
   * Insère un fragment au curseur. S'il contient des blocs et que le curseur est dans un paragraphe
   * ou un titre, le paragraphe est coupé : le début reste (supprimé s'il est vide), les blocs suivent,
   * puis la fin dans un nouveau paragraphe (s'il reste du texte). Jamais de bloc dans un <p>.
   */
  function insertFragment(doc: Document, fragment: DocumentFragment): Node[] {
    armed = null
    const sel = doc.getSelection()
    const nodes = Array.prototype.slice.call(fragment.childNodes) as Node[]
    if (!sel || !sel.rangeCount || !doc.body) return nodes
    const range = sel.getRangeAt(0)
    if (!range.collapsed) range.deleteContents()
    const hasBlock = nodes.some(isBlockNode)
    let para: Node | null = range.startContainer
    while (
      para &&
      para !== doc.body &&
      !(isElement(para) && PARAGRAPHS.indexOf(para.nodeName) !== -1)
    )
      para = para.parentNode
    if (!hasBlock || !para || para === doc.body || isNativeZone(range.startContainer, doc.body)) {
      range.insertNode(fragment)
      const last = nodes[nodes.length - 1]
      if (last && last.parentNode) {
        const r = doc.createRange()
        r.setStartAfter(last)
        r.collapse(true)
        sel.removeAllRanges()
        sel.addRange(r)
      }
      return nodes
    }
    const block = para as Element
    // Fin du paragraphe (après le curseur) mise de côté
    const after = doc.createRange()
    after.setStart(range.startContainer, range.startOffset)
    after.setEnd(block, block.childNodes.length)
    const rest = after.extractContents()
    // Blancs de mise en page en tête et en fin de fragment : remplacés par l'indentation du paragraphe
    while (nodes.length && nodes[0].nodeType === TEXT && isWhitespace(nodes[0].textContent || '')) {
      fragment.removeChild(nodes.shift()!)
    }
    while (
      nodes.length &&
      nodes[nodes.length - 1].nodeType === TEXT &&
      isWhitespace(nodes[nodes.length - 1].textContent || '')
    ) {
      fragment.removeChild(nodes.pop()!)
    }
    let anchorNode: Node = block
    const ownIndent = indentBefore(block)
    const indent = ownIndent === null ? '' : ownIndent
    const parent = block.parentNode!
    const placeAfter = (ref: Node, n: Node): Node => {
      if (ownIndent !== null && !(n.nodeType === TEXT && isWhitespace(n.textContent || ''))) {
        const ws = doc.createTextNode('\n' + indent)
        parent.insertBefore(ws, ref.nextSibling)
        ref = ws
      }
      parent.insertBefore(n, ref.nextSibling)
      return n
    }
    nodes.forEach((n) => {
      // Un texte nu entre deux blocs devient un paragraphe
      if (n.nodeType === TEXT && !isWhitespace(n.textContent || '')) {
        const p = doc.createElement('p')
        p.appendChild(n)
        anchorNode = placeAfter(anchorNode, p)
      } else if (n.nodeType === TEXT) {
        // blancs internes du fragment : remplacés par l'indentation
      } else {
        anchorNode = placeAfter(anchorNode, n)
      }
    })
    if (!isEmptyContent(rest)) {
      const tail = doc.createElement(block.nodeName === 'P' ? 'p' : 'p')
      tail.appendChild(rest)
      placeAfter(anchorNode, tail)
    }
    if (isEmptyContent(block)) {
      const prev = block.previousSibling
      if (prev && prev.nodeType === TEXT && isWhitespace(prev.textContent || '')) prev.remove()
      block.remove()
    }
    const last = nodes[nodes.length - 1]
    if (last && last.parentNode) {
      const r = doc.createRange()
      if (isElement(last) && last.nodeName !== 'HR') {
        r.selectNodeContents(last)
        r.collapse(false)
      } else {
        r.setStartAfter(last)
        r.collapse(true)
      }
      sel.removeAllRanges()
      sel.addRange(r)
    }
    return nodes.filter((n) => !!n.parentNode)
  }

  function insertPlainText(doc: Document, text: string): void {
    const sel = doc.getSelection()
    if (!sel || !sel.rangeCount) return
    const r = sel.getRangeAt(0)
    if (!r.collapsed) r.deleteContents()
    const node = r.startContainer
    if (node.nodeType === TEXT) {
      const t = node as Text
      const at = r.startOffset
      t.data = t.data.slice(0, at) + text + t.data.slice(at)
      placeCaret(doc, t, at + text.length)
      return
    }
    const holder = node as Element
    // Un <br> de remplissage (ligne vide) laisse la place au texte
    const only = holder.childNodes.length === 1 ? holder.firstChild : null
    if (only && only.nodeName === 'BR') holder.removeChild(only)
    const t = doc.createTextNode(text)
    holder.insertBefore(
      t,
      holder.childNodes[Math.min(r.startOffset, holder.childNodes.length)] || null
    )
    placeCaret(doc, t, text.length)
  }

  /**
   * Collage de texte brut sur plusieurs lignes : une ligne = un paragraphe (ou un élément de liste),
   * les lignes vides ne créent rien ; dans un bloc de code, le texte est collé tel quel.
   * false si une seule ligne ou zone laissée au navigateur (le collage normal suffit).
   */
  function pasteText(doc: Document, text: string): boolean {
    armed = null
    const sel = doc.getSelection()
    if (!sel || !sel.rangeCount || !doc.body) return false
    const normalized = text.split('\r\n').join('\n').split('\r').join('\n')
    const range = sel.getRangeAt(0)
    let pre: Node | null = range.startContainer
    while (pre && pre !== doc.body && pre.nodeName !== 'PRE') pre = pre.parentNode
    if (pre && pre !== doc.body) {
      insertPlainText(doc, normalized)
      return true
    }
    if (isNativeZone(range.startContainer, doc.body)) return false
    const lines = normalized.split('\n').filter((l) => l.trim() !== '')
    if (lines.length < 2) return false
    lines.forEach((line, i) => {
      if (i > 0) handleEnter(doc)
      insertPlainText(doc, line)
    })
    return true
  }

  return {
    insertFragment,
    pasteText,
    handleEnter,
    insertTextOutside,
    insertCodeNewline,
    armExit,
    disarm,
    snapshotStyled,
    unwrapNewStyled
  }
}
