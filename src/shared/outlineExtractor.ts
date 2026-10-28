/**
 * Module d'extraction et de structuration du plan de document (Outline).
 * Supporte le HTML (h1 à h6) et le Markdown (# à ######).
 * Préserve strictement les numéros de ligne pour la synchronisation Monaco / Preview.
 * Ignore rigoureusement les blocs protégés (<pre>, <code>, ```, <style>, <script>).
 */

export interface OutlineHeading {
  id: string
  text: string
  level: number // 1 à 6
  line: number // Numéro de ligne 1-based dans le texte source
}

export interface OutlineTreeNode extends OutlineHeading {
  children: OutlineTreeNode[]
}

/**
 * Génère un identifiant URL-friendly (slug) stable à partir d'un texte.
 */
export function slugifyHeading(text: string): string {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Supprime les diacritiques / accents
    .replace(/[^a-z0-9]+/g, '-') // Remplace tout caractère non alphanumérique par un tiret
    .replace(/^-+|-+$/g, '') // Supprime les tirets de début et de fin

  return normalized || 'section'
}

/**
 * Nettoie le balisage HTML d'un texte pour n'en conserver que le texte visible.
 */
export function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim()
}

/**
 * Supprime le formatage Markdown inline pour afficher un titre propre.
 */
export function stripMarkdownFormatting(md: string): string {
  return md
    .replace(/!\[.*?\]\(.*?\)/g, '') // Images ![alt](url)
    .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Liens [texte](url)
    .replace(/\[\[(.*?)(?:\|(.*?))?\]\]/g, (_m, target, alias) => alias || target) // WikiLinks [[note|alias]]
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // Gras **texte** ou __texte__
    .replace(/(\*|_)(.*?)\1/g, '$2') // Italique *texte* ou _texte_
    .replace(/`([^`]+)`/g, '$1') // Code inline `code`
    .replace(/~~(.*?)~~/g, '$1') // Barré ~~texte~~
    .trim()
}

/**
 * Masque les zones de code, script, style et commentaires en remplaçant les caractères
 * par des espaces tout en conservant scrupuleusement les sauts de ligne (\n).
 * Garantit ainsi que les numéros de ligne restent 100 % exacts.
 */
function maskProtectedHtml(content: string): string {
  return content.replace(
    /(<!--[\s\S]*?-->|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>)/gi,
    (match) => match.replace(/[^\n]/g, ' ')
  )
}

function maskProtectedMarkdown(content: string): string {
  return content.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)/g, (match) =>
    match.replace(/[^\n]/g, ' ')
  )
}

/**
 * Extrait les titres depuis un document HTML (<h1-6>).
 */
export function extractOutlineFromHtml(html: string): OutlineHeading[] {
  if (!html || !html.trim()) return []

  const masked = maskProtectedHtml(html)
  const headings: OutlineHeading[] = []
  const idCounts = new Map<string, number>()

  // Regex pour capturer les balises de titre h1 à h6
  const headingRegex = /<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/gi
  let match: RegExpExecArray | null

  while ((match = headingRegex.exec(masked)) !== null) {
    const level = parseInt(match[1], 10)
    const attributes = match[2]
    // Récupérer le contenu original non masqué correspondant à la plage de capture
    const innerHtml = html.slice(
      match.index + match[0].indexOf('>') + 1,
      match.index + match[0].lastIndexOf('<')
    )
    const rawText = stripHtmlTags(innerHtml)
    if (!rawText) continue

    // Numéro de ligne 1-based calculé à partir de l'index dans le texte
    const prefix = html.slice(0, match.index)
    const line = prefix.split('\n').length

    // Récupérer un ID existant s'il existe dans les attributs
    const idMatch = attributes.match(/\bid=["']([^"']+)["']/i)
    let id: string
    if (idMatch && idMatch[1].trim()) {
      id = idMatch[1].trim()
    } else {
      const baseSlug = slugifyHeading(rawText)
      const count = (idCounts.get(baseSlug) || 0) + 1
      idCounts.set(baseSlug, count)
      id = count === 1 ? baseSlug : `${baseSlug}-${count}`
    }

    headings.push({
      id,
      text: rawText,
      level,
      line
    })
  }

  return headings
}

/**
 * Extrait les titres depuis un document Markdown (# à ######).
 */
export function extractOutlineFromMarkdown(markdown: string): OutlineHeading[] {
  if (!markdown || !markdown.trim()) return []

  const masked = maskProtectedMarkdown(markdown)
  const lines = masked.split('\n')
  const originalLines = markdown.split('\n')
  const headings: OutlineHeading[] = []
  const idCounts = new Map<string, number>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Titres Markdown conventionnels : 0 à 3 espaces max, 1 à 6 dièses, au moins un espace
    const match = line.match(/^ {0,3}(#{1,6})\s+(.+)$/)
    if (!match) continue

    const level = match[1].length
    const rawContent = originalLines[i].replace(/^ {0,3}#{1,6}\s+/, '')
    // Retirer les dièses de clôture éventuels (ex. ## Mon Titre ##)
    const cleanedEnd = rawContent.replace(/\s+#+\s*$/, '')
    const text = stripMarkdownFormatting(cleanedEnd)
    if (!text) continue

    const baseSlug = slugifyHeading(text)
    const count = (idCounts.get(baseSlug) || 0) + 1
    idCounts.set(baseSlug, count)
    const id = count === 1 ? baseSlug : `${baseSlug}-${count}`

    headings.push({
      id,
      text,
      level,
      line: i + 1
    })
  }

  return headings
}

/**
 * Extrait le plan d'un document selon son type.
 */
export function extractOutline(
  content: string,
  type: 'html' | 'md' | 'auto' = 'auto'
): OutlineHeading[] {
  if (!content) return []

  let resolvedType = type
  if (resolvedType === 'auto') {
    resolvedType =
      content.toLowerCase().includes('<html') ||
      content.toLowerCase().includes('<body') ||
      /<h[1-6]\b/i.test(content)
        ? 'html'
        : 'md'
  }

  if (resolvedType === 'html') {
    return extractOutlineFromHtml(content)
  }

  return extractOutlineFromMarkdown(content)
}

/**
 * Construit un arbre hiérarchique pliable à partir de la liste plate des titres.
 */
export function buildOutlineTree(headings: OutlineHeading[]): OutlineTreeNode[] {
  const root: OutlineTreeNode[] = []
  const stack: { node: OutlineTreeNode; level: number }[] = []

  for (const h of headings) {
    const node: OutlineTreeNode = { ...h, children: [] }
    while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
      stack.pop()
    }
    if (stack.length === 0) {
      root.push(node)
    } else {
      stack[stack.length - 1].node.children.push(node)
    }
    stack.push({ node, level: h.level })
  }

  return root
}
