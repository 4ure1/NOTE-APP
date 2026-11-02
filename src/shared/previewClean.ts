/**
 * HTML à enregistrer depuis l'aperçu éditable (iframe de CodeWorkspace) : le document de l'utilisateur,
 * sans rien de ce que l'aperçu y a ajouté.
 */

export interface PreviewCleanOptions {
  // La note d'origine contient <html> : on renvoie le document complet, sinon le contenu du <body>
  hadHtmlTag: boolean
  // La note d'origine commence par un doctype
  hadDoctype: boolean
  // Attribut style du <body> d'origine (null s'il n'y en avait pas), remis tel quel
  originalBodyStyle: string | null
}

/**
 * Retire de la copie du document : helpers injectés (menus, thème, scripts, zoom, MathJax),
 * attributs d'édition (contenteditable, spellcheck, data-source-line), paragraphes ajoutés par un clic
 * et restés vides (data-nf-pending). Ne supprime aucun élément de la note elle-même.
 *
 * Fonction autonome (aucun import, aucune constante externe) : sa source est injectée telle quelle
 * dans l'iframe d'aperçu via toString().
 */
export function cleanPreviewDocument(doc: Document, options: PreviewCleanOptions): string {
  // Blocs dont les blancs comptent à l'affichage (inline-block, enfant d'un conteneur en white-space: pre…) :
  // marqués le temps de la copie, pour que la mise en forme du code ne leur ajoute aucun saut de ligne
  const KEEP_SPACE = 'data-nf-keep-space'
  const view = doc.defaultView
  const marked: Element[] = []
  if (view && typeof view.getComputedStyle === 'function' && doc.body) {
    const candidates = doc.body.querySelectorAll(
      'div, p, h1, h2, h3, h4, h5, h6, ul, ol, li, table, pre, blockquote, section, article, aside, ' +
        'figure, figcaption, details, hr, footer, header, nav, main, form, svg'
    )
    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i]
      const display = view.getComputedStyle(el).display || ''
      const parent = el.parentElement
      const space = parent ? view.getComputedStyle(parent).whiteSpace || '' : ''
      if (
        display.indexOf('inline') === 0 ||
        space.indexOf('pre') === 0 ||
        space === 'break-spaces'
      ) {
        el.setAttribute(KEEP_SPACE, '')
        marked.push(el)
      }
    }
  }
  const clone = doc.documentElement.cloneNode(true) as HTMLElement
  marked.forEach((el) => el.removeAttribute(KEEP_SPACE))

  const helpers = clone.querySelectorAll(
    '#preview-snippet-menu, [data-injected-theme], [data-injected-preview-helpers], ' +
      'script[src*="mathjax"], style#mathjax-styles'
  )
  for (let i = 0; i < helpers.length; i++) helpers[i].remove()

  // Feuilles de style que MathJax ajoute à l'exécution (rendu CHTML, menu contextuel) : jamais enregistrées
  const styles = clone.querySelectorAll('style')
  for (let i = 0; i < styles.length; i++) {
    const style = styles[i]
    if (
      style.id === 'MJX-CHTML-styles' ||
      (style.textContent || '').trim().indexOf('.CtxtMenu_') === 0
    ) {
      style.remove()
    }
  }

  const tagged = clone.querySelectorAll('[data-source-line]')
  for (let i = 0; i < tagged.length; i++) tagged[i].removeAttribute('data-source-line')

  const editable = clone.querySelectorAll('[contenteditable]')
  for (let i = 0; i < editable.length; i++) editable[i].removeAttribute('contenteditable')

  // Champs d'un snippet en cours de saisie (snippetFields.ts) : on garde le texte saisi, jamais le
  // marqueur ; un champ resté vide disparaît. Les espaces de largeur nulle qui tiennent le curseur aussi.
  const zeroWidth = String.fromCharCode(8203)
  const markers = clone.querySelectorAll('[data-nf-field]')
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i]
    const parent = marker.parentNode
    if (!parent) continue
    if (!(marker.textContent || '').split(zeroWidth).join('')) {
      marker.remove()
      continue
    }
    while (marker.firstChild) {
      const child = marker.firstChild
      if (child.nodeType === 3) child.nodeValue = (child.nodeValue || '').split(zeroWidth).join('')
      parent.insertBefore(child, marker)
    }
    marker.remove()
  }

  // Fond des champs (rgba(79, 193, 255, 0.12 / 0.22)) que Chrome recopiait en style inline quand on
  // tapait par-dessus un champ : retiré ; un <span> resté sans aucun attribut est déballé
  const fieldBackgrounds = [
    'background-color:rgba(79,193,255,0.22)',
    'background-color:rgba(79,193,255,0.12)'
  ]
  const inlineStyled = clone.querySelectorAll('body [style]')
  for (let i = 0; i < inlineStyled.length; i++) {
    const el = inlineStyled[i]
    const decls = (el.getAttribute('style') || '').split(';').filter((d) => d.trim() !== '')
    const kept = decls.filter(
      (d) => fieldBackgrounds.indexOf(d.split(' ').join('').trim().toLowerCase()) === -1
    )
    if (kept.length === decls.length) continue
    if (kept.length) el.setAttribute('style', kept.map((d) => d.trim()).join('; ') + ';')
    else el.removeAttribute('style')
    const parent = el.parentNode
    if (el.localName === 'span' && el.attributes.length === 0 && parent) {
      while (el.firstChild) parent.insertBefore(el.firstChild, el)
      el.remove()
    }
  }

  // Paragraphe créé par un clic dans le vide : retiré s'il est resté vide, gardé sinon
  const pending = clone.querySelectorAll('[data-nf-pending]')
  for (let i = 0; i < pending.length; i++) {
    const el = pending[i]
    const onlyBreaks = Array.prototype.every.call(el.childNodes, (child: Node) => {
      if (child.nodeType === 3) return !(child.nodeValue || '').replace(/\u00A0/g, '').trim()
      return child.nodeType === 1 && (child as Element).localName === 'br'
    })
    if (onlyBreaks) el.remove()
    else el.removeAttribute('data-nf-pending')
  }

  // Structure saine (seulement à l'enregistrement d'une vraie saisie), sans rien changer à l'affichage :
  // - un <p> ou un titre qui contient un bloc (<div>, <ul>, <table>…) est coupé autour du bloc, comme le
  //   ferait le navigateur au rechargement, mais sans laisser de <p></p> vides ;
  // - un <br> final après du contenu (invisible) est retiré ; une ligne vide <p><br></p> reste.
  const STRUCT_BLOCKS = [
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
    'UL'
  ]
  const isStructBlock = (n: Node): boolean =>
    n.nodeType === 1 && STRUCT_BLOCKS.indexOf(n.nodeName.toUpperCase()) !== -1
  const paragraphs = Array.prototype.slice.call(
    clone.querySelectorAll('p, h1, h2, h3, h4, h5, h6')
  ) as Element[]
  // Les plus profonds d'abord
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const para = paragraphs[i]
    const parent = para.parentNode
    if (!parent || !Array.prototype.some.call(para.childNodes, isStructBlock)) continue
    const runs: Element[] = []
    let run: Element | null = null
    while (para.firstChild) {
      const child = para.firstChild
      if (isStructBlock(child)) {
        run = null
        parent.insertBefore(child, para)
      } else {
        if (!run) {
          run = para.cloneNode(false) as Element
          parent.insertBefore(run, para)
          runs.push(run)
        }
        run.appendChild(child)
      }
    }
    para.remove()
    // Morceaux de paragraphe sans rien de visible (blancs de mise en page) : pas de <p></p> vide
    const nbsp = String.fromCharCode(160)
    runs.forEach((r) => {
      const text = (r.textContent || '').split(nbsp).join(' ').trim()
      if (!text && !r.querySelector('img, br, input, svg, video, iframe')) {
        const prev = r.previousSibling
        if (prev && prev.nodeType === 3 && !(prev.nodeValue || '').trim()) prev.remove()
        r.remove()
      }
    })
  }
  const lastBreaks = clone.querySelectorAll('br')
  for (let i = 0; i < lastBreaks.length; i++) {
    const br = lastBreaks[i]
    const holder = br.parentElement
    // Seulement à la fin d'un bloc : à la fin d'un <span>, le <br> sépare du texte qui suit
    const blockHolders = [
      'P',
      'H1',
      'H2',
      'H3',
      'H4',
      'H5',
      'H6',
      'LI',
      'TD',
      'TH',
      'DIV',
      'BLOCKQUOTE',
      'DD',
      'DT'
    ]
    if (
      !holder ||
      holder.closest('pre') ||
      blockHolders.indexOf(holder.nodeName.toUpperCase()) === -1
    )
      continue
    let next = br.nextSibling
    while (next && next.nodeType === 3 && !(next.nodeValue || '').trim()) next = next.nextSibling
    if (next) continue
    let prev = br.previousSibling
    while (prev && prev.nodeType === 3 && !(prev.nodeValue || '').trim())
      prev = prev.previousSibling
    // Rien avant : c'est une ligne vide voulue ; un autre <br> avant : il compte, celui-ci aussi
    if (!prev || prev.nodeName === 'BR') continue
    br.remove()
  }

  // Code lisible après une modification dans l'aperçu (seulement à l'enregistrement d'une vraie saisie) :
  // - deux blocs collés (</div><p>, </h2><table>…) sont séparés par un saut de ligne à l'indentation de
  //   leurs voisins. Le contenu des <pre>, <script>, <style>, <textarea> n'est jamais touché, ni le texte.
  const NL = String.fromCharCode(10)
  const RAW = ['PRE', 'SCRIPT', 'STYLE', 'TEXTAREA']
  const BLOCK_TAGS = [
    'P',
    'DIV',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'UL',
    'OL',
    'LI',
    'TABLE',
    'THEAD',
    'TBODY',
    'TFOOT',
    'TR',
    'PRE',
    'BLOCKQUOTE',
    'SECTION',
    'ARTICLE',
    'ASIDE',
    'FIGURE',
    'FIGCAPTION',
    'DETAILS',
    'HR',
    'FOOTER',
    'HEADER',
    'NAV',
    'MAIN',
    'FORM',
    'SVG',
    'STYLE',
    'SCRIPT',
    'LINK',
    'META',
    'TITLE'
  ]
  const isBlockEl = (n: Node | null): boolean =>
    !!n && n.nodeType === 1 && BLOCK_TAGS.indexOf(n.nodeName.toUpperCase()) !== -1
  const lineIndent = (el: Node): string | null => {
    const prev = el.previousSibling
    if (!prev || prev.nodeType !== 3) return null
    const data = prev.nodeValue || ''
    const nl = data.lastIndexOf(NL)
    if (nl === -1) return null
    const tail = data.slice(nl + 1)
    return tail.trim() ? null : tail
  }
  const tidy = (el: Element): void => {
    if (RAW.indexOf(el.nodeName.toUpperCase()) !== -1) return
    let indent: string | null = null
    for (let c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 1 && lineIndent(c) !== null) {
        indent = lineIndent(c)
        break
      }
    }
    if (indent === null) {
      const own = lineIndent(el)
      indent = own === null ? '' : own + '  '
    }
    const children = Array.prototype.slice.call(el.childNodes) as Node[]
    for (let i = 1; i < children.length; i++) {
      const a = children[i - 1]
      const b = children[i]
      const keep = (n: Node): boolean => (n as Element).hasAttribute(KEEP_SPACE)
      if (isBlockEl(b) && isBlockEl(a) && !keep(a) && !keep(b)) {
        el.insertBefore(el.ownerDocument.createTextNode(NL + indent), children[i])
      }
    }
    for (let c = el.firstElementChild; c; c = c.nextElementSibling) tidy(c)
  }
  tidy(clone)
  const keptSpace = clone.querySelectorAll('[' + KEEP_SPACE + ']')
  for (let i = 0; i < keptSpace.length; i++) keptSpace[i].removeAttribute(KEEP_SPACE)

  const body = clone.querySelector('body')
  if (body) {
    body.removeAttribute('contenteditable')
    body.removeAttribute('spellcheck')
    if (options.originalBodyStyle === null) body.removeAttribute('style')
    else body.setAttribute('style', options.originalBodyStyle)
  }

  if (!options.hadHtmlTag) {
    return body ? body.innerHTML.trim() : clone.innerHTML.trim()
  }

  let doctype = ''
  if (options.hadDoctype) {
    const dt = doc.doctype
    if (dt) {
      doctype = '<!DOCTYPE ' + (dt.name || 'html')
      if (dt.publicId) doctype += ' PUBLIC "' + dt.publicId + '"'
      if (dt.systemId) doctype += (dt.publicId ? '' : ' SYSTEM') + ' "' + dt.systemId + '"'
      doctype += '>\n'
    } else {
      doctype = '<!DOCTYPE html>\n'
    }
  }
  return doctype + clone.outerHTML
}
