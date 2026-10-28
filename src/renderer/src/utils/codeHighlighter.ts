import hljs from 'highlight.js'

/**
 * Échappe les caractères HTML spéciaux (&, <, >)
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Déséchappe les entités HTML
 */
export function unescapeHtml(html: string): string {
  return html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/**
 * Nettoie et transforme le HTML produit par highlight.js vers les classes du theme.css :
 * .k = mots-clés (#569cd6)
 * .t = types/classes (#4ec9b0)
 * .f = fonctions (#dcdcaa)
 * .s = chaînes de caractères (#ce9178)
 * .n = nombres (#b5cea8)
 * .c = commentaires (#6a9955)
 */
export function convertHljsToThemeClasses(hljsHtml: string): string {
  let res = hljsHtml
    // Commentaires
    .replace(/<span class="hljs-comment">/g, '<span class="c">')
    .replace(/<span class="hljs-doctag">/g, '<span class="c">')
    // Mots-clés & sélecteurs
    .replace(/<span class="hljs-keyword">/g, '<span class="k">')
    .replace(/<span class="hljs-selector-tag">/g, '<span class="k">')
    .replace(/<span class="hljs-built_in">/g, '<span class="k">')
    // Types & classes
    .replace(/<span class="hljs-type">/g, '<span class="t">')
    .replace(/<span class="hljs-title class_">/g, '<span class="t">')
    .replace(/<span class="hljs-title class_ hljs-title">/g, '<span class="t">')
    // Fonctions
    .replace(/<span class="hljs-function">/g, '<span class="f">')
    .replace(/<span class="hljs-title function_">/g, '<span class="f">')
    .replace(/<span class="hljs-title function_ hljs-title">/g, '<span class="f">')
    // Chaînes de caractères
    .replace(/<span class="hljs-string">/g, '<span class="s">')
    .replace(/<span class="hljs-regexp">/g, '<span class="s">')
    // Nombres & littéraux
    .replace(/<span class="hljs-number">/g, '<span class="n">')
    .replace(/<span class="hljs-literal">/g, '<span class="n">')
    // Supprimer les autres spans highlight.js superflus pour garder un HTML ultra-propre
    .replace(/<span class="hljs-[a-zA-Z0-9_-]+">/g, '<span>')

  return res
}

/**
 * Met en couleur un fragment de code avec détection automatique ou langage spécifié
 */
export function highlightCodeText(rawCode: string, lang?: string): string {
  try {
    let resultHtml = ''
    if (lang && hljs.getLanguage(lang)) {
      resultHtml = hljs.highlight(rawCode, { language: lang, ignoreIllegals: true }).value
    } else {
      resultHtml = hljs.highlightAuto(rawCode).value
    }
    return convertHljsToThemeClasses(resultHtml)
  } catch (err) {
    console.warn('Highlight failed, fallback to escaped text:', err)
    return escapeHtml(rawCode)
  }
}

/**
 * Parcourt tout un document HTML et convertit chaque bloc <pre> ou <pre><code> non encore coloré
 * en spans k/t/f/s/n/c stylés avec theme.css
 */
export function highlightAllCodeBlocksInHtml(html: string): { newHtml: string; count: number } {
  let count = 0
  const parser = /<pre(?:\s+[^>]*)?>([\s\S]*?)<\/pre>/gi

  const newHtml = html.replace(parser, (fullPre, innerContent) => {
    // Si le bloc contient déjà des spans de coloration, on évite la double coloration
    if (innerContent.includes('class="k"') || innerContent.includes('class="s"')) {
      return fullPre
    }

    // Détecter si un <code> est présent à l'intérieur
    const codeMatch = innerContent.match(/<code(?:\s+class="language-([a-zA-Z0-9_-]+)")?>([\s\S]*?)<\/code>/i)
    let lang: string | undefined
    let rawCode = ''

    if (codeMatch) {
      lang = codeMatch[1]
      rawCode = unescapeHtml(codeMatch[2])
    } else {
      rawCode = unescapeHtml(innerContent)
    }

    if (!rawCode.trim()) return fullPre

    count++
    const highlighted = highlightCodeText(rawCode, lang)
    return `<pre><code>${highlighted}</code></pre>`
  })

  return { newHtml, count }
}
