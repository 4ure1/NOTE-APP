/**
 * Barre de mise en forme de l'aperçu éditable : apparaît au-dessus d'un texte sélectionné (hors code)
 * et pose des classes du thème des notes, jamais de style en ligne :
 * - couleur du texte : .b .t .y .o .l .g .p .a .r (et .base pour la couleur normale) ;
 * - surlignage : .hl-yellow .hl-green .hl-blue .hl-pink .hl-orange ;
 * - police : .ff-serif .ff-sans .ff-mono ; taille : .fs-small .fs-large .fs-xlarge ;
 * - gras, italique, souligné : <strong>, <em>, <u> (bascule).
 * Le texte mis en forme est un <span> que le halo bleu de l'aperçu entoure quand le curseur y est,
 * et dont Tab fait sortir (CodeWorkspace.tsx). Un texte déjà mis en forme sélectionné en entier est
 * modifié sur place au lieu d'être emballé une deuxième fois.
 *
 * Fonction autonome (aucun import ni constante externe) : sa source est injectée dans l'iframe
 * d'aperçu (CodeWorkspace.tsx) via toString().
 */

export type FormatKind = 'color' | 'highlight' | 'font' | 'size' | 'bold' | 'italic' | 'underline'

export interface FormatToolbarOptions {
  onChange: () => void
  beforeChange?: () => void
  isEnabled: () => boolean
}

export interface FormatToolbar {
  /** Applique une mise en forme à la sélection ; renvoie les éléments touchés. */
  apply(kind: FormatKind, value: string): Element[]
  /** Barre affichée ou cachée selon la sélection actuelle. */
  refresh(): void
  hide(): void
}

export function installFormatToolbar(doc: Document, options: FormatToolbarOptions): FormatToolbar {
  const HELPER = 'data-injected-preview-helpers'
  const GROUPS: Record<string, string[]> = {
    color: ['b', 't', 'y', 'o', 'l', 'g', 'p', 'a', 'r', 'base'],
    highlight: ['hl-yellow', 'hl-green', 'hl-blue', 'hl-pink', 'hl-orange'],
    font: ['ff-serif', 'ff-sans', 'ff-mono'],
    size: ['fs-small', 'fs-large', 'fs-xlarge']
  }
  const SIZE_STEPS = ['fs-small', '', 'fs-large', 'fs-xlarge']
  const TOGGLE_TAGS: Record<string, string> = { bold: 'STRONG', italic: 'EM', underline: 'U' }
  const BLOCK_TAGS = [
    'P',
    'LI',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'TD',
    'TH',
    'DIV',
    'BLOCKQUOTE',
    'SECTION',
    'ARTICLE',
    'UL',
    'OL',
    'TABLE',
    'BODY',
    'HTML',
    'DETAILS',
    'SUMMARY',
    'FIGCAPTION'
  ]
  const view = doc.defaultView
  let bar: HTMLElement | null = null

  const isElement = (n: Node | null): n is Element => !!n && n.nodeType === 1

  /** Texte qu'on ne met pas en forme : code, SVG, zones non éditables, interface de l'aperçu. */
  function isExcluded(node: Node): boolean {
    let n: Node | null = node
    while (n && n !== doc.body) {
      if (isElement(n)) {
        const tag = n.nodeName.toUpperCase()
        if (
          tag === 'PRE' ||
          tag === 'CODE' ||
          tag === 'SVG' ||
          tag === 'SCRIPT' ||
          tag === 'STYLE'
        ) {
          return true
        }
        if (n.getAttribute('contenteditable') === 'false' || n.hasAttribute(HELPER)) return true
      }
      n = n.parentNode
    }
    return !n
  }

  /** Morceaux de texte de la sélection, chacun réduit à sa partie sélectionnée (nœud découpé). */
  function selectedTexts(range: Range): Text[] {
    const root = range.commonAncestorContainer
    const texts: Text[] = []
    if (root.nodeType === 3) {
      texts.push(root as Text)
    } else {
      const walker = doc.createTreeWalker(root, 4)
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        if (range.intersectsNode(t)) texts.push(t as Text)
      }
    }
    const out: Text[] = []
    for (const t of texts) {
      if (isExcluded(t)) continue
      let node = t
      let start = node === range.startContainer ? range.startOffset : 0
      let end = node === range.endContainer ? range.endOffset : node.data.length
      if (start >= end) continue
      if (start > 0) {
        node = node.splitText(start)
        end -= start
        start = 0
      }
      if (end < node.data.length) node.splitText(end)
      // Blancs de mise en page entre deux blocs : jamais emballés
      if (texts.length > 1 && node.data.trim() === '') continue
      out.push(node)
    }
    return out
  }

  /** Élément de mise en forme dont `text` est tout le contenu visible (on le modifie sur place). */
  function wholeWrapper(text: Text, tag: string): Element | null {
    let n: Node = text
    while (n.parentNode && isElement(n.parentNode)) {
      const parent: Element = n.parentNode
      if (BLOCK_TAGS.indexOf(parent.nodeName.toUpperCase()) !== -1) return null
      if ((parent.textContent || '') !== (text.textContent || '')) return null
      if (parent.nodeName.toUpperCase() === tag && !parent.hasAttribute('data-nf-field'))
        return parent
      n = parent
    }
    return null
  }

  function unwrap(el: Element): void {
    const parent = el.parentNode
    if (!parent) return
    while (el.firstChild) parent.insertBefore(el.firstChild, el)
    parent.removeChild(el)
  }

  function wrap(text: Text, tag: string, cls?: string): Element {
    const el = doc.createElement(tag.toLowerCase())
    if (cls) el.className = cls
    text.parentNode!.insertBefore(el, text)
    el.appendChild(text)
    return el
  }

  function setGroupClass(el: Element, group: string[], cls: string): void {
    group.forEach((c) => el.classList.remove(c))
    if (cls) el.classList.add(cls)
    if (el.getAttribute('class') === '') el.removeAttribute('class')
  }

  function nextSize(el: Element | null, direction: string): string {
    const current = el ? SIZE_STEPS.find((c) => c && el.classList.contains(c)) || '' : ''
    const i = SIZE_STEPS.indexOf(current)
    const j = Math.max(0, Math.min(SIZE_STEPS.length - 1, direction === 'down' ? i - 1 : i + 1))
    return SIZE_STEPS[j]
  }

  function apply(kind: FormatKind, value: string): Element[] {
    const sel = doc.getSelection()
    if (!sel || !sel.rangeCount || sel.isCollapsed) return []
    const range = sel.getRangeAt(0)
    if (!doc.body || !doc.body.contains(range.commonAncestorContainer)) return []
    // Découper les nœuds de texte ne change pas la note ; l'instantané d'annulation vient ensuite
    const texts = selectedTexts(range)
    if (!texts.length) return []
    if (options.beforeChange) options.beforeChange()
    const touched: Element[] = []

    if (TOGGLE_TAGS[kind]) {
      const tag = TOGGLE_TAGS[kind]
      const wrappers = texts.map((t) => wholeWrapper(t, tag))
      const allOn = wrappers.length > 0 && wrappers.every((w) => w)
      texts.forEach((t, i) => {
        if (allOn) {
          const w = wrappers[i]!
          const parent = w.parentNode
          unwrap(w)
          if (isElement(parent)) touched.push(parent)
        } else if (!wrappers[i]) {
          touched.push(wrap(t, tag))
        }
      })
    } else {
      const group = GROUPS[kind]
      if (!group) return []
      texts.forEach((t) => {
        const span = wholeWrapper(t, 'SPAN')
        const cls = kind === 'size' ? nextSize(span, value) : value === 'none' ? '' : value
        if (cls && group.indexOf(cls) === -1) return
        if (span) {
          setGroupClass(span, group, cls)
          if (!span.attributes.length) {
            const parent = span.parentNode
            unwrap(span)
            if (isElement(parent)) touched.push(parent)
          } else {
            touched.push(span)
          }
        } else if (cls) {
          touched.push(wrap(t, 'SPAN', cls))
        }
      })
    }

    // La sélection couvre de nouveau le texte mis en forme, pour enchaîner les réglages
    if (texts.length) {
      const first = texts[0]
      const last = texts[texts.length - 1]
      if (first.parentNode && last.parentNode) {
        const r = doc.createRange()
        r.setStart(first, 0)
        r.setEnd(last, last.data.length)
        sel.removeAllRanges()
        sel.addRange(r)
      }
    }
    if (touched.length) options.onChange()
    return touched
  }

  // ---------- Interface ----------
  function ensureStyle(): void {
    if (!doc.head || doc.getElementById('nf-format-toolbar-style')) return
    const style = doc.createElement('style')
    style.id = 'nf-format-toolbar-style'
    style.setAttribute(HELPER, 'true')
    style.textContent = [
      '.nf-fmt{position:fixed;z-index:2147483600;display:flex;align-items:center;gap:2px;padding:4px;',
      'border-radius:8px;background:#26292e;border:1px solid #3a3f46;box-shadow:0 10px 26px rgba(0,0,0,.45);',
      "font:13px/1 'Segoe UI',system-ui,sans-serif;color:#d4d4d8;user-select:none;}",
      '.nf-fmt button{display:grid;place-items:center;min-width:24px;height:24px;padding:0 4px;border:none;',
      'border-radius:4px;background:transparent;color:inherit;font:inherit;cursor:pointer;}',
      '.nf-fmt button:hover{background:rgba(255,255,255,.1);}',
      '.nf-fmt .nf-sep{width:1px;height:18px;margin:0 3px;background:#3a3f46;}',
      '.nf-fmt .nf-a{font-weight:700;}',
      '.nf-fmt .nf-hl{width:16px;height:16px;min-width:0;padding:0;border-radius:3px;}'
    ].join('')
    doc.head.appendChild(style)
  }

  function button(label: string, title: string, run: () => void, cls?: string): HTMLButtonElement {
    const b = doc.createElement('button')
    b.type = 'button'
    b.title = title
    b.setAttribute('aria-label', title)
    if (cls) b.className = cls
    b.innerHTML = label
    b.addEventListener('mousedown', (e) => {
      // Garde la sélection du texte
      e.preventDefault()
      e.stopPropagation()
      run()
    })
    return b
  }

  function separator(container: HTMLElement): void {
    const s = doc.createElement('span')
    s.className = 'nf-sep'
    container.appendChild(s)
  }

  function build(): HTMLElement {
    ensureStyle()
    const b = doc.createElement('div')
    b.className = 'nf-fmt'
    b.setAttribute(HELPER, 'true')
    b.setAttribute('contenteditable', 'false')
    b.setAttribute('role', 'toolbar')
    b.setAttribute('aria-label', 'Mise en forme du texte')
    const colors: [string, string][] = [
      ['b', 'Bleu'],
      ['t', 'Turquoise'],
      ['y', 'Jaune'],
      ['o', 'Orange'],
      ['l', 'Vert clair'],
      ['g', 'Vert'],
      ['p', 'Violet'],
      ['a', 'Bleu clair'],
      ['r', 'Rouge']
    ]
    colors.forEach(([cls, name]) =>
      b.appendChild(
        button(
          '<span class="' + cls + '">A</span>',
          'Texte ' + name.toLowerCase(),
          () => apply('color', cls),
          'nf-a'
        )
      )
    )
    b.appendChild(button('A', 'Couleur normale', () => apply('color', 'none'), 'nf-a'))
    separator(b)
    const marks: [string, string][] = [
      ['hl-yellow', 'jaune'],
      ['hl-green', 'vert'],
      ['hl-blue', 'bleu'],
      ['hl-pink', 'rose'],
      ['hl-orange', 'orange']
    ]
    marks.forEach(([cls, name]) =>
      b.appendChild(
        button(
          '<span class="' +
            cls +
            '" style="display:block;width:16px;height:16px;border-radius:3px"></span>',
          'Surligner en ' + name,
          () => apply('highlight', cls),
          'nf-hl'
        )
      )
    )
    b.appendChild(button('&#10005;', 'Retirer le surlignage', () => apply('highlight', 'none')))
    separator(b)
    b.appendChild(
      button('<span class="ff-serif">Ag</span>', 'Police serif', () => apply('font', 'ff-serif'))
    )
    b.appendChild(
      button('<span class="ff-sans">Ag</span>', 'Police sans serif', () => apply('font', 'ff-sans'))
    )
    b.appendChild(
      button('<span class="ff-mono">Ag</span>', 'Police à chasse fixe', () =>
        apply('font', 'ff-mono')
      )
    )
    b.appendChild(button('Ag', 'Police normale', () => apply('font', 'none')))
    separator(b)
    b.appendChild(button('A&#8722;', 'Texte plus petit', () => apply('size', 'down')))
    b.appendChild(button('A+', 'Texte plus grand', () => apply('size', 'up')))
    separator(b)
    b.appendChild(button('<b>G</b>', 'Gras', () => apply('bold', '')))
    b.appendChild(button('<i>I</i>', 'Italique', () => apply('italic', '')))
    b.appendChild(button('<u>S</u>', 'Souligné', () => apply('underline', '')))
    return b
  }

  function hide(): void {
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar)
    bar = null
  }

  function refresh(): void {
    if (!options.isEnabled()) return hide()
    const sel = doc.getSelection()
    if (!sel || !sel.rangeCount || sel.isCollapsed) return hide()
    const range = sel.getRangeAt(0)
    if (!doc.body || !doc.body.contains(range.commonAncestorContainer)) return hide()
    if (isExcluded(range.startContainer) && isExcluded(range.endContainer)) return hide()
    if (range.toString().replace(/\s/g, '') === '') return hide()
    const rect = range.getBoundingClientRect()
    if (!rect || (rect.width === 0 && rect.height === 0)) return hide()
    if (!bar) {
      bar = build()
      // Repère en coordonnées d'écran : dans <html>, jamais dans le <body> zoomé
      doc.documentElement.appendChild(bar)
    }
    const vw = view ? view.innerWidth : 1000
    const w = bar.offsetWidth || 560
    const h = bar.offsetHeight || 34
    const left = Math.max(6, Math.min(rect.left + rect.width / 2 - w / 2, vw - w - 6))
    const top = rect.top - h - 8 >= 6 ? rect.top - h - 8 : rect.bottom + 8
    bar.style.left = left + 'px'
    bar.style.top = top + 'px'
  }

  if (view) {
    view.addEventListener('mouseup', () => setTimeout(refresh, 0), true)
    view.addEventListener(
      'keyup',
      (e: KeyboardEvent) => {
        if (e.key === 'Escape') hide()
        else if (e.shiftKey || e.key === 'a') refresh()
      },
      true
    )
    view.addEventListener(
      'mousedown',
      (e: MouseEvent) => {
        if (bar && e.target instanceof Node && bar.contains(e.target)) return
        hide()
      },
      true
    )
    view.addEventListener('scroll', hide, true)
    doc.addEventListener('selectionchange', () => {
      const sel = doc.getSelection()
      if (bar && (!sel || sel.isCollapsed)) hide()
    })
  }

  return { apply, refresh, hide }
}
