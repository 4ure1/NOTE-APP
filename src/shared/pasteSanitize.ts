/**
 * Collage de HTML riche dans l'aperçu (page web, Word, autre note) : on garde la structure utile, on
 * retire la mise en forme d'origine.
 *
 * - Gardés : paragraphes, titres, listes, tableaux, citations, code, gras / italique / souligné, liens,
 *   images, retours à la ligne ; et les classes du thème des notes (copier-coller d'une note à l'autre
 *   garde .step, .note, les couleurs .o / .g…, les cartes .node, les fonds bg-*…).
 * - Retirés : styles, polices, <span>/<font> sans classe du thème, <div> anonymes (devenus des
 *   paragraphes s'ils ne contiennent que du texte), scripts, styles, iframes, commentaires, attributs
 *   d'événement.
 *
 * Fonction autonome (aucun import ni constante externe) : sa source est injectée dans l'iframe
 * d'aperçu (CodeWorkspace.tsx) via toString().
 */
export function sanitizePastedHtml(doc: Document, html: string): DocumentFragment {
  const KEEP = [
    'P',
    'BR',
    'B',
    'STRONG',
    'I',
    'EM',
    'U',
    'S',
    'A',
    'CODE',
    'PRE',
    'UL',
    'OL',
    'LI',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'BLOCKQUOTE',
    'TABLE',
    'THEAD',
    'TBODY',
    'TFOOT',
    'TR',
    'TH',
    'TD',
    'HR',
    'IMG',
    'SUB',
    'SUP',
    'MARK',
    'KBD',
    'DETAILS',
    'SUMMARY',
    'FIGURE',
    'FIGCAPTION',
    'DIV',
    'SPAN'
  ]
  const DROP = [
    'SCRIPT',
    'STYLE',
    'META',
    'LINK',
    'TITLE',
    'IFRAME',
    'OBJECT',
    'EMBED',
    'NOSCRIPT',
    'TEMPLATE'
  ]
  // Classes du thème des notes (theme.css) : gardées
  const THEME_CLASSES = [
    'b',
    't',
    'y',
    'o',
    'l',
    'g',
    'p',
    'a',
    'r',
    'k',
    'f',
    's',
    'n',
    'c',
    'step',
    'purple',
    'orange',
    'green',
    'red',
    'yellow',
    'teal',
    'blue',
    'brown',
    'gray',
    'label',
    'note',
    'result',
    'warn',
    'bad',
    'value',
    'duo',
    'quiz-item',
    'q-title',
    'tag',
    'figure',
    'caption',
    'lang',
    'java',
    'py',
    'keyword',
    'divider',
    'node',
    'node-title',
    'nodes',
    'container',
    'bg-red',
    'bg-orange',
    'bg-yellow',
    'bg-green',
    'bg-purple',
    'bg-teal',
    'bg-blue',
    'bg-brown',
    'bg-gray'
  ]
  const ATTRS: Record<string, string[]> = {
    A: ['href', 'title'],
    IMG: ['src', 'alt', 'width', 'height'],
    TD: ['colspan', 'rowspan'],
    TH: ['colspan', 'rowspan'],
    OL: ['start'],
    DETAILS: ['open']
  }
  const INLINE = [
    'B',
    'STRONG',
    'I',
    'EM',
    'U',
    'S',
    'A',
    'CODE',
    'SUB',
    'SUP',
    'MARK',
    'KBD',
    'SPAN',
    'BR',
    'IMG'
  ]

  const template = doc.createElement('template')
  template.innerHTML = html
  const root = template.content

  function themeClasses(el: Element): string {
    const kept: string[] = []
    const list = (el.getAttribute('class') || '').split(' ')
    for (const c of list)
      if (c && THEME_CLASSES.indexOf(c) !== -1 && kept.indexOf(c) === -1) kept.push(c)
    return kept.join(' ')
  }

  function unwrap(el: Element): void {
    const parent = el.parentNode
    if (!parent) return
    while (el.firstChild) parent.insertBefore(el.firstChild, el)
    parent.removeChild(el)
  }

  function onlyInline(el: Element): boolean {
    for (let c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 1 && INLINE.indexOf(c.nodeName.toUpperCase()) === -1) return false
    }
    return true
  }

  function clean(node: Node): void {
    // Enfants d'abord (la liste change pendant le parcours)
    const children = Array.prototype.slice.call(node.childNodes) as Node[]
    children.forEach((child) => {
      if (child.nodeType === 8) {
        child.parentNode!.removeChild(child)
        return
      }
      if (child.nodeType !== 1) return
      const el = child as Element
      const tag = el.nodeName.toUpperCase()
      if (DROP.indexOf(tag) !== -1) {
        el.remove()
        return
      }
      clean(el)
      if (KEEP.indexOf(tag) === -1) {
        unwrap(el)
        return
      }
      const classes = themeClasses(el)
      // Attributs : seulement ceux qui ont un sens dans une note
      const allowed = ATTRS[tag] || []
      Array.prototype.slice.call(el.attributes).forEach((attr: Attr) => {
        if (allowed.indexOf(attr.name) === -1) el.removeAttribute(attr.name)
      })
      if (classes) el.setAttribute('class', classes)
      if (tag === 'A') {
        const href = (el.getAttribute('href') || '').trim().toLowerCase()
        if (href.indexOf('javascript:') === 0 || href.indexOf('data:') === 0)
          el.removeAttribute('href')
      }
      if (tag === 'SPAN' && !classes) {
        unwrap(el)
      } else if (tag === 'DIV' && !classes) {
        // <div> anonyme : un paragraphe s'il ne contient que du texte, sinon son contenu seul
        if (onlyInline(el) && (el.textContent || '').trim()) {
          const p = el.ownerDocument.createElement('p')
          while (el.firstChild) p.appendChild(el.firstChild)
          el.replaceWith(p)
        } else {
          unwrap(el)
        }
      }
    })
  }
  clean(root)

  // Texte nu au premier niveau à côté de blocs : regroupé en paragraphes
  const hasBlock = Array.prototype.some.call(
    root.childNodes,
    (n: Node) => n.nodeType === 1 && INLINE.indexOf(n.nodeName.toUpperCase()) === -1
  )
  if (hasBlock) {
    let run: Element | null = null
    const children = Array.prototype.slice.call(root.childNodes) as Node[]
    children.forEach((n) => {
      const inline =
        n.nodeType === 3 || (n.nodeType === 1 && INLINE.indexOf(n.nodeName.toUpperCase()) !== -1)
      if (!inline) {
        run = null
        return
      }
      if (n.nodeType === 3 && !(n.textContent || '').trim() && !run) {
        root.removeChild(n)
        return
      }
      if (!run) {
        run = doc.createElement('p')
        root.insertBefore(run, n)
      }
      run.appendChild(n)
    })
  }
  return root
}
