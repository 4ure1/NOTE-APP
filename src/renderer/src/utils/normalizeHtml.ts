/**
 * Formateur HTML de Shift+Alt+F : réindentation seule, sans jamais changer le sens du document.
 *
 * - Recopiés à l'octet près depuis la source : <pre>, <textarea>, <script>, <style>, <code>,
 *   les commentaires et le doctype.
 * - Seuls les conteneurs dont tous les enfants sont des blocs sont réindentés (un bloc par ligne,
 *   2 espaces). Un élément qui mêle texte et balises en ligne est recopié tel que le navigateur le
 *   sérialise : &amp; &lt; &gt; &nbsp; restent des entités ; une entité nommée comme &eacute;
 *   devient le caractère lui-même (même sens).
 * - Aucun élément supprimé, ajouté ni renommé ; attributs inconnus conservés. Idempotent.
 *
 * Réservé à l'action explicite de l'utilisateur : jamais à l'ouverture, au focus ni au blur.
 */

// Zones recopiées telles quelles : commentaires et éléments à contenu brut ou sensible aux espaces
const RAW_SOURCE =
  /<!--[\s\S]*?-->|<(pre|textarea|script|style|code)(?=[\s/>])[^>]*>[\s\S]*?<\/\1\s*>/gi
const INLINE_RAW = new Set(['code'])

// Conteneurs réindentés quand tous leurs enfants sont des blocs
const CONTAINER_TAGS = new Set([
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
  'li',
  'dl',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'blockquote',
  'figure',
  'details',
  'form',
  'fieldset'
])

// Blocs recopiés sur une ligne (contenu tel que sérialisé par le navigateur)
const LEAF_BLOCK_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'title',
  'figcaption',
  'summary',
  'caption',
  'legend',
  'dt',
  'dd',
  'hr',
  'meta',
  'link',
  'base',
  'template'
])

const INDENT = '  '

interface RawZones {
  token: string
  zones: string[]
  inline: Set<number>
}

function protectRawZones(source: string): { html: string; raw: RawZones } {
  const token = `nf-raw-${Math.random().toString(36).slice(2, 10)}`
  const raw: RawZones = { token, zones: [], inline: new Set() }
  const html = source.replace(RAW_SOURCE, (match, tag: string | undefined) => {
    const index = raw.zones.push(match) - 1
    if (tag && INLINE_RAW.has(tag.toLowerCase())) raw.inline.add(index)
    return `<!--${token}-${index}-->`
  })
  return { html, raw }
}

function restoreRawZones(html: string, raw: RawZones): string {
  const placeholder = new RegExp(`<!--${raw.token}-(\\d+)-->`, 'g')
  return html.replace(placeholder, (_m, index: string) => raw.zones[Number(index)])
}

function rawIndexOf(node: Node, raw: RawZones): number | null {
  if (node.nodeType !== Node.COMMENT_NODE) return null
  const match = new RegExp(`^${raw.token}-(\\d+)$`).exec(node.nodeValue || '')
  return match ? Number(match[1]) : null
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/\u00A0/g, '&nbsp;')
}

function openingTag(el: Element): string {
  let attrs = ''
  for (let i = 0; i < el.attributes.length; i++) {
    const attr = el.attributes[i]
    attrs += ` ${attr.name}="${escapeAttribute(attr.value)}"`
  }
  return `<${el.localName}${attrs}>`
}

function isBlockChild(node: Node, raw: RawZones): boolean {
  if (node.nodeType === Node.TEXT_NODE) return !(node.nodeValue || '').trim()
  if (node.nodeType === Node.COMMENT_NODE) {
    const index = rawIndexOf(node, raw)
    return index === null || !raw.inline.has(index)
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const tag = (node as Element).localName
    return CONTAINER_TAGS.has(tag) || LEAF_BLOCK_TAGS.has(tag)
  }
  return false
}

function serializeNode(node: Node, level: number, raw: RawZones, lines: string[]): void {
  const indent = INDENT.repeat(level)
  if (node.nodeType === Node.COMMENT_NODE) {
    lines.push(`${indent}<!--${node.nodeValue}-->`)
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return

  const el = node as Element
  const children = Array.from(el.childNodes)
  const formattable =
    CONTAINER_TAGS.has(el.localName) && children.every((child) => isBlockChild(child, raw))
  if (!formattable) {
    lines.push(`${indent}${el.outerHTML}`)
    return
  }

  const blockChildren = children.filter((child) => child.nodeType !== Node.TEXT_NODE)
  if (blockChildren.length === 0) {
    lines.push(`${indent}${openingTag(el)}</${el.localName}>`)
    return
  }
  lines.push(`${indent}${openingTag(el)}`)
  for (const child of blockChildren) serializeNode(child, level + 1, raw, lines)
  lines.push(`${indent}</${el.localName}>`)
}

// Nœuds de premier niveau d'un fragment, y compris ce que le parseur a rangé ailleurs : commentaires
// du tout début (au niveau du document, avant <html>) et éléments de <head> (<meta>, <style>…)
function serializeFragment(doc: Document, raw: RawZones, lines: string[]): void {
  const leadingComments = Array.from(doc.childNodes).filter(
    (node) => node.nodeType === Node.COMMENT_NODE
  )
  const nodes = [
    ...leadingComments,
    ...Array.from(doc.head.childNodes),
    ...Array.from(doc.body.childNodes)
  ]
  if (!nodes.every((node) => isBlockChild(node, raw))) {
    const serializeInline = (node: Node): string =>
      node.nodeType === Node.COMMENT_NODE ? `<!--${node.nodeValue}-->` : ''
    lines.push(
      leadingComments.map(serializeInline).join('') + doc.head.innerHTML + doc.body.innerHTML
    )
    return
  }
  for (const node of nodes) serializeNode(node, 0, raw, lines)
}

export function normalizeHtml(html: string): string {
  if (!html || typeof html !== 'string') return ''
  if (!html.trim()) return ''

  const source = html.trim()
  const doctype = /^(<!doctype[^>]*>)/i.exec(source)?.[1] ?? null
  const isFullDoc = doctype !== null || /^(?:<!--[\s\S]*?-->\s*)*<html[\s>]/i.test(source)

  const { html: protectedHtml, raw } = protectRawZones(source)
  const doc = new DOMParser().parseFromString(protectedHtml, 'text/html')
  const lines: string[] = []

  if (isFullDoc) {
    if (doctype) lines.push(doctype)
    const hasHeadTag = /<head[\s>]/i.test(protectedHtml)
    for (const node of Array.from(doc.childNodes)) {
      if (node.nodeType === Node.COMMENT_NODE) {
        lines.push(`<!--${node.nodeValue}-->`)
      } else if (node === doc.documentElement) {
        const root = doc.documentElement
        // <head> implicite et vide : on ne l'ajoute pas
        if (!hasHeadTag && doc.head.childNodes.length === 0) doc.head.remove()
        serializeNode(root, 0, raw, lines)
      }
    }
  } else {
    serializeFragment(doc, raw, lines)
  }

  const result = restoreRawZones(lines.join('\n'), raw)
  return /\n\s*$/.test(html) ? `${result}\n` : result
}
