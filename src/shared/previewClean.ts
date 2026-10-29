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
  const clone = doc.documentElement.cloneNode(true) as HTMLElement

  const helpers = clone.querySelectorAll(
    '#preview-snippet-menu, [data-injected-theme], [data-injected-preview-helpers], ' +
      'script[src*="mathjax"], style#mathjax-styles'
  )
  for (let i = 0; i < helpers.length; i++) helpers[i].remove()

  const tagged = clone.querySelectorAll('[data-source-line]')
  for (let i = 0; i < tagged.length; i++) tagged[i].removeAttribute('data-source-line')

  const editable = clone.querySelectorAll('[contenteditable]')
  for (let i = 0; i < editable.length; i++) editable[i].removeAttribute('contenteditable')

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
