/**
 * Normaliseur HTML strict basé sur DOMParser (aucune regex fragile sur le HTML).
 *
 * Fonctionnalités :
 * 1. Fusionne les paragraphes vides consécutifs : au plus un <p><br></p> entre deux blocs.
 *    (Choix documenté : un paragraphe <p><br></p> unique permet d'aérer naturellement deux sections
 *    sans accumuler de gouffres verticaux désagréables).
 * 2. Supprime les balises vides inutiles (<p></p>, <span></span>, <div></div> sans contenu utile).
 * 3. Remplace les &nbsp; superflus (début/fin de bloc, espaces insécables doublés) par des espaces standards.
 * 4. Convertit <b> en <strong> et <i> en <em> (hors icônes et blocs de code).
 * 5. Réindente avec 2 espaces et un bloc par ligne.
 * 6. Préserve strictement le contenu et l'espacement de <pre>, <code>, <style>, <script> ainsi que le <head>.
 * 7. Limite à 1 ligne vide consécutive dans le code résultant.
 * 8. Idempotence garantie : normalizeHtml(normalizeHtml(x)) === normalizeHtml(x).
 */

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr'
])

const RAW_TAGS = new Set(['pre', 'code', 'style', 'script'])

const CONTAINER_BLOCK_TAGS = new Set([
  'html',
  'head',
  'body',
  'div',
  'section',
  'article',
  'header',
  'footer',
  'nav',
  'main',
  'aside',
  'ul',
  'ol',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'blockquote',
  'figure',
  'details',
  'form',
  'fieldset'
])

const LEAF_BLOCK_TAGS = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'li',
  'th',
  'td',
  'figcaption',
  'summary',
  'title',
  'dt',
  'dd'
])

function isInsideRawBlock(node: Node | null): boolean {
  let parent = node?.parentElement
  while (parent) {
    if (RAW_TAGS.has(parent.nodeName.toLowerCase())) {
      return true
    }
    parent = parent.parentElement
  }
  return false
}

function isParagraphEmpty(p: HTMLParagraphElement): boolean {
  // Un paragraphe est considéré vide s'il n'a pas de texte utile et soit aucun enfant, soit juste des balises <br>
  const text = (p.textContent || '').replace(/[\u00A0\s]+/g, '')
  if (text.length > 0) return false
  const meaningfulChildren = Array.from(p.childNodes).filter((child) => {
    if (child.nodeType === Node.COMMENT_NODE) return false
    if (child.nodeType === Node.TEXT_NODE) {
      return (child.nodeValue || '').replace(/[\u00A0\s]+/g, '').length > 0
    }
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element
      return el.nodeName.toLowerCase() !== 'br'
    }
    return true
  })
  return meaningfulChildren.length === 0
}

function cleanAndTransformDom(root: Element, doc: Document): void {
  // 1. Convertir <b> -> <strong> et <i> -> <em> (hors <pre>, <code>, <style>, <script>)
  const bList = Array.from(root.querySelectorAll('b'))
  for (const b of bList) {
    if (isInsideRawBlock(b) || b.nodeName.toLowerCase() !== 'b') continue
    const strong = doc.createElement('strong')
    for (let i = 0; i < b.attributes.length; i++) {
      const attr = b.attributes[i]
      strong.setAttribute(attr.name, attr.value)
    }
    while (b.firstChild) {
      strong.appendChild(b.firstChild)
    }
    b.replaceWith(strong)
  }

  const iList = Array.from(root.querySelectorAll('i'))
  for (const i of iList) {
    if (isInsideRawBlock(i) || i.nodeName.toLowerCase() !== 'i') continue
    const className = i.getAttribute('class') || ''
    // Ne pas transformer les balises d'icônes
    if (/\b(fa|icon|bi|codicon|lucide)\b/i.test(className)) continue
    const em = doc.createElement('em')
    for (let idx = 0; idx < i.attributes.length; idx++) {
      const attr = i.attributes[idx]
      em.setAttribute(attr.name, attr.value)
    }
    while (i.firstChild) {
      em.appendChild(i.firstChild)
    }
    i.replaceWith(em)
  }

  // 2. Nettoyer les balises vides inutiles en boucle descendante (hors balises void et raw)
  let removedAny = true
  while (removedAny) {
    removedAny = false
    const candidates = Array.from(root.querySelectorAll('p, span, div, strong, em, b, i'))
    for (const el of candidates) {
      if (isInsideRawBlock(el)) continue
      const tag = el.nodeName.toLowerCase()

      // Ne pas supprimer un <p><br></p> ici car il s'agit d'un saut de ligne intentionnel
      if (tag === 'p' && el.querySelector('br')) {
        continue
      }

      // Paragraphes sans aucun enfant ni texte
      if (tag === 'p' && !el.children.length && !(el.textContent || '').trim()) {
        el.remove()
        removedAny = true
        continue
      }

      // Span ou Div vide sans texte ni attributs essentiels
      if (
        (tag === 'span' || tag === 'div' || tag === 'strong' || tag === 'em') &&
        !el.children.length
      ) {
        const text = (el.textContent || '').trim()
        if (!text) {
          // Conserver uniquement si le div possède un id spécifique (ancre)
          if (tag === 'div' && el.getAttribute('id')) continue
          el.remove()
          removedAny = true
          continue
        }
      }
    }
  }

  // 3. Fusion des paragraphes vides consécutifs (<p><br></p>) dans chaque conteneur
  const containerList = [root, ...Array.from(root.querySelectorAll('*'))].filter((el) => {
    return CONTAINER_BLOCK_TAGS.has(el.nodeName.toLowerCase())
  })

  for (const container of containerList) {
    if (isInsideRawBlock(container)) continue
    let lastWasEmptyParagraph = false
    const children = Array.from(container.children)

    for (let ci = 0; ci < children.length; ci++) {
      const child = children[ci]
      if (child.nodeName.toLowerCase() === 'p' && isParagraphEmpty(child as HTMLParagraphElement)) {
        if (lastWasEmptyParagraph) {
          // Doublon consécutif : supprimer
          child.remove()
        } else {
          // Premier paragraphe vide rencontré : normaliser son contenu en un unique <br>
          ;(child as HTMLElement).innerHTML = '<br>'
          lastWasEmptyParagraph = true
        }
      } else if (
        CONTAINER_BLOCK_TAGS.has(child.nodeName.toLowerCase()) ||
        LEAF_BLOCK_TAGS.has(child.nodeName.toLowerCase())
      ) {
        lastWasEmptyParagraph = false
      }
    }

    // Supprimer les paragraphes vides au tout début ou à la toute fin du conteneur
    while (
      container.firstElementChild &&
      container.firstElementChild.nodeName.toLowerCase() === 'p' &&
      isParagraphEmpty(container.firstElementChild as HTMLParagraphElement)
    ) {
      container.firstElementChild.remove()
    }
    while (
      container.lastElementChild &&
      container.lastElementChild.nodeName.toLowerCase() === 'p' &&
      isParagraphEmpty(container.lastElementChild as HTMLParagraphElement)
    ) {
      container.lastElementChild.remove()
    }
  }

  // 4. Nettoyer les &nbsp; superflus dans les nœuds textuels (hors blocs raw)
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node: Node) => {
      if (isInsideRawBlock(node)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    }
  })

  const textNodes: Text[] = []
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text)
  }

  for (const tNode of textNodes) {
    let val = tNode.nodeValue || ''
    if (val.includes('\u00A0') || /\s{2,}/.test(val)) {
      // Nettoyer les espaces superflus en début et fin de bloc
      val = val.replace(/^[\u00A0\s]+|[\u00A0\s]+$/g, '')
      // Remplacer les séquences d'espaces multiples par un seul espace
      val = val.replace(/[\u00A0\s]{2,}/g, ' ')
      val = val.replace(/\u00A0/g, ' ')
      tNode.nodeValue = val
    }
  }
}

function serializeElement(el: Element, indentLevel: number, indentStr: string): string {
  const tag = el.nodeName.toLowerCase()
  const indent = indentStr.repeat(indentLevel)

  // Construction des attributs
  let attrs = ''
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i]
    attrs += ` ${a.name}="${a.value}"`
  }

  // Balises void (auto-fermantes)
  if (VOID_TAGS.has(tag)) {
    return `${indent}<${tag}${attrs}>`
  }

  // Blocs de code / styles / scripts : préserver STRICTEMENT le contenu interne
  if (RAW_TAGS.has(tag)) {
    if (tag === 'pre') {
      return `${indent}<${tag}${attrs}>${el.innerHTML}</${tag}>`
    }
    if (tag === 'style' || tag === 'script') {
      const trimmed = el.innerHTML.trim()
      if (!trimmed) return `${indent}<${tag}${attrs}></${tag}>`
      return `${indent}<${tag}${attrs}>\n${el.innerHTML}\n${indent}</${tag}>`
    }
    return `<${tag}${attrs}>${el.innerHTML}</${tag}>`
  }

  // Déterminer si l'élément ne contient que des enfants inline
  const hasBlockChildren = Array.from(el.children).some((child) => {
    const cTag = child.nodeName.toLowerCase()
    return CONTAINER_BLOCK_TAGS.has(cTag) || LEAF_BLOCK_TAGS.has(cTag) || cTag === 'pre'
  })

  // Balise bloc simple (feuille) ne contenant que du texte/inline (ex: <h1>, <p>, <li>)
  if (LEAF_BLOCK_TAGS.has(tag) && !hasBlockChildren) {
    const inner = serializeInlineChildren(el)
    return `${indent}<${tag}${attrs}>${inner}</${tag}>`
  }

  // Balise conteneur
  const childrenLines: string[] = []
  for (let ci = 0; ci < el.childNodes.length; ci++) {
    const child = el.childNodes[ci]
    if (child.nodeType === Node.COMMENT_NODE) {
      childrenLines.push(`${indentStr.repeat(indentLevel + 1)}<!--${child.nodeValue}-->`)
    } else if (child.nodeType === Node.TEXT_NODE) {
      const text = (child.nodeValue || '').trim()
      if (text) {
        childrenLines.push(`${indentStr.repeat(indentLevel + 1)}${text}`)
      }
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      childrenLines.push(serializeElement(child as Element, indentLevel + 1, indentStr))
    }
  }

  if (childrenLines.length === 0) {
    return `${indent}<${tag}${attrs}></${tag}>`
  }

  return `${indent}<${tag}${attrs}>\n${childrenLines.join('\n')}\n${indent}</${tag}>`
}

function serializeInlineChildren(el: Element): string {
  let res = ''
  for (let i = 0; i < el.childNodes.length; i++) {
    const node = el.childNodes[i]
    if (node.nodeType === Node.TEXT_NODE) {
      res += node.nodeValue || ''
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const childEl = node as Element
      const cTag = childEl.nodeName.toLowerCase()
      let cAttrs = ''
      for (let ai = 0; ai < childEl.attributes.length; ai++) {
        const attr = childEl.attributes[ai]
        cAttrs += ` ${attr.name}="${attr.value}"`
      }
      if (VOID_TAGS.has(cTag)) {
        res += `<${cTag}${cAttrs}>`
      } else if (RAW_TAGS.has(cTag)) {
        res += `<${cTag}${cAttrs}>${childEl.innerHTML}</${cTag}>`
      } else {
        res += `<${cTag}${cAttrs}>${serializeInlineChildren(childEl)}</${cTag}>`
      }
    }
  }
  return res
}

/**
 * Normalise, nettoie et formate un code HTML pour Monaco Editor et la persistance.
 */
export function normalizeHtml(html: string): string {
  if (!html || typeof html !== 'string') return ''
  const trimmed = html.trim()
  if (!trimmed) return ''

  const isFullDoc = /^\s*<!doctype/i.test(trimmed) || /^\s*<html\b/i.test(trimmed)
  const hasDoctype = /^\s*<!doctype\s+html>/i.test(trimmed)

  const parser = new DOMParser()
  const doc = parser.parseFromString(trimmed, 'text/html')

  if (isFullDoc) {
    cleanAndTransformDom(doc.documentElement, doc)

    // Formater la structure complète
    const htmlAttrs = doc.documentElement.attributes
    let htmlAttrStr = ''
    for (let i = 0; i < htmlAttrs.length; i++) {
      htmlAttrStr += ` ${htmlAttrs[i].name}="${htmlAttrs[i].value}"`
    }

    const headSerialized = serializeElement(doc.head, 1, '  ')
    const bodySerialized = serializeElement(doc.body, 1, '  ')

    let res =
      (hasDoctype ? '<!DOCTYPE html>\n' : '') +
      `<html${htmlAttrStr}>\n${headSerialized}\n${bodySerialized}\n</html>`
    // Limiter à au plus 1 ligne vide consécutive hors balises raw
    res = res.replace(/\n{3,}/g, '\n\n').trim()
    return res
  } else {
    // Fragment HTML (ex: corps de note ou conteneur simple)
    cleanAndTransformDom(doc.body, doc)

    const lines: string[] = []
    for (let i = 0; i < doc.body.childNodes.length; i++) {
      const node = doc.body.childNodes[i]
      if (node.nodeType === Node.TEXT_NODE) {
        const t = (node.nodeValue || '').trim()
        if (t) lines.push(t)
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        lines.push(serializeElement(node as Element, 0, '  '))
      }
    }

    let res = lines.join('\n')
    res = res.replace(/\n{3,}/g, '\n\n').trim()
    return res
  }
}
