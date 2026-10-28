import * as monaco from 'monaco-editor'
import { Snippet } from '../types/snippets'
import { getSnippetBodyText } from './snippetEngine'

// Liste exhaustive des balises HTML5 avec snippets d'expansion intelligents
const HTML_TAGS: Array<{ tag: string; desc: string; snippet?: string; void?: boolean }> = [
  { tag: 'div', desc: 'Conteneur générique bloc', snippet: '<div class="${1:container}">\n\t$0\n</div>' },
  { tag: 'span', desc: 'Conteneur générique inline', snippet: '<span class="${1:badge}">$0</span>' },
  { tag: 'p', desc: 'Paragraphe de texte', snippet: '<p>$0</p>' },
  { tag: 'a', desc: 'Lien hypertexte', snippet: '<a href="${1:#}">$0</a>' },
  { tag: 'img', desc: 'Image responsive', snippet: '<img src="${1:url}" alt="${2:description}" />', void: true },
  { tag: 'h1', desc: 'Titre principal de niveau 1', snippet: '<h1>$0</h1>' },
  { tag: 'h2', desc: 'Titre de section niveau 2', snippet: '<h2>$0</h2>' },
  { tag: 'h3', desc: 'Sous-titre niveau 3', snippet: '<h3>$0</h3>' },
  { tag: 'h4', desc: 'Titre de niveau 4', snippet: '<h4>$0</h4>' },
  { tag: 'h5', desc: 'Titre de niveau 5', snippet: '<h5>$0</h5>' },
  { tag: 'h6', desc: 'Titre de niveau 6', snippet: '<h6>$0</h6>' },
  { tag: 'ul', desc: 'Liste à puces non ordonnée', snippet: '<ul>\n\t<li>$1</li>\n\t<li>$2</li>\n</ul>' },
  { tag: 'ol', desc: 'Liste numérotée ordonnée', snippet: '<ol>\n\t<li>$1</li>\n\t<li>$2</li>\n</ol>' },
  { tag: 'li', desc: 'Élément de liste', snippet: '<li>$0</li>' },
  { tag: 'section', desc: 'Section thématique du document', snippet: '<section class="${1:section}">\n\t<h2>${2:Titre}</h2>\n\t$0\n</section>' },
  { tag: 'article', desc: 'Article autonome ou composition', snippet: '<article>\n\t$0\n</article>' },
  { tag: 'header', desc: 'En-tête de page ou de section', snippet: '<header>\n\t<h1>${1:Titre}</h1>\n\t$0\n</header>' },
  { tag: 'footer', desc: 'Pied de page', snippet: '<footer>\n\t<p>$0</p>\n</footer>' },
  { tag: 'nav', desc: 'Section de navigation', snippet: '<nav>\n\t$0\n</nav>' },
  { tag: 'main', desc: 'Contenu principal de la page', snippet: '<main>\n\t$0\n</main>' },
  { tag: 'aside', desc: 'Contenu connexe ou barre latérale', snippet: '<aside>\n\t$0\n</aside>' },
  { tag: 'table', desc: 'Tableau structuré de données', snippet: '<table>\n\t<thead>\n\t\t<tr>\n\t\t\t<th>${1:Colonne 1}</th>\n\t\t\t<th>${2:Colonne 2}</th>\n\t\t</tr>\n\t</thead>\n\t<tbody>\n\t\t<tr>\n\t\t\t<td>$3</td>\n\t\t\t<td>$4</td>\n\t\t</tr>\n\t</tbody>\n</table>' },
  { tag: 'tr', desc: 'Ligne de tableau', snippet: '<tr>\n\t<td>$0</td>\n</tr>' },
  { tag: 'th', desc: 'Cellule d\'en-tête de tableau', snippet: '<th>$0</th>' },
  { tag: 'td', desc: 'Cellule de données de tableau', snippet: '<td>$0</td>' },
  { tag: 'button', desc: 'Bouton interactif', snippet: '<button type="${1|button,submit|}">$0</button>' },
  { tag: 'input', desc: 'Champ de saisie de formulaire', snippet: '<input type="${1|text,number,checkbox,radio,email,password|}" placeholder="${2:Texte...}" />', void: true },
  { tag: 'form', desc: 'Formulaire de saisie', snippet: '<form action="${1:#}" method="${2|POST,GET|}">\n\t$0\n</form>' },
  { tag: 'label', desc: 'Étiquette pour champ de formulaire', snippet: '<label for="${1:id}">$0</label>' },
  { tag: 'select', desc: 'Menu déroulant de sélection', snippet: '<select name="${1:nom}">\n\t<option value="${2:val1}">${3:Option 1}</option>\n</select>' },
  { tag: 'option', desc: 'Option de menu déroulant', snippet: '<option value="${1:valeur}">$0</option>' },
  { tag: 'textarea', desc: 'Zone de texte multi-lignes', snippet: '<textarea rows="${1:4}" placeholder="${2:Texte...}">$0</textarea>' },
  { tag: 'details', desc: 'Bloc repliable interactif', snippet: '<details>\n\t<summary>${1:Cliquez pour afficher}</summary>\n\t<p>$0</p>\n</details>' },
  { tag: 'summary', desc: 'Titre visible d\'un bloc details', snippet: '<summary>$0</summary>' },
  { tag: 'blockquote', desc: 'Citation mise en valeur', snippet: '<blockquote cite="${1:source}">\n\t<p>$0</p>\n</blockquote>' },
  { tag: 'pre', desc: 'Texte pré-formaté (code)', snippet: '<pre><code>$0</code></pre>' },
  { tag: 'code', desc: 'Fragment de code informatique', snippet: '<code>$0</code>' },
  { tag: 'kbd', desc: 'Touche de raccourci clavier', snippet: '<kbd>$0</kbd>' },
  { tag: 'mark', desc: 'Texte surligné', snippet: '<mark>$0</mark>' },
  { tag: 'strong', desc: 'Texte en gras (importance forte)', snippet: '<strong>$0</strong>' },
  { tag: 'em', desc: 'Texte en italique (emphase)', snippet: '<em>$0</em>' },
  { tag: 'small', desc: 'Texte secondaire ou discret', snippet: '<small>$0</small>' },
  { tag: 'hr', desc: 'Ligne de séparation horizontale', snippet: '<hr />', void: true },
  { tag: 'br', desc: 'Saut de ligne simple', snippet: '<br />', void: true },
  { tag: 'style', desc: 'Feuille de styles CSS interne', snippet: '<style>\n\t$0\n</style>' },
  { tag: 'script', desc: 'Script JavaScript exécutable', snippet: '<script>\n\t$0\n</script>' },
  { tag: 'figure', desc: 'Illustration ou média avec légende', snippet: '<figure>\n\t<img src="${1:url}" alt="${2:desc}" />\n\t<figcaption>${3:Légende}</figcaption>\n</figure>' },
  { tag: 'figcaption', desc: 'Légende pour figure', snippet: '<figcaption>$0</figcaption>' }
]

// Attributs HTML courants
const HTML_ATTRIBUTES: Array<{ attr: string; desc: string; snippet: string }> = [
  { attr: 'class', desc: 'Classe CSS pour le stylage', snippet: 'class="$1"' },
  { attr: 'id', desc: 'Identifiant unique de l\'élément', snippet: 'id="$1"' },
  { attr: 'style', desc: 'Styles CSS inline', snippet: 'style="$1"' },
  { attr: 'src', desc: 'Chemin ou URL de la ressource', snippet: 'src="$1"' },
  { attr: 'href', desc: 'Cible du lien hypertexte', snippet: 'href="$1"' },
  { attr: 'alt', desc: 'Texte alternatif pour image', snippet: 'alt="$1"' },
  { attr: 'title', desc: 'Info-bulle au survol de la souris', snippet: 'title="$1"' },
  { attr: 'target', desc: 'Cible d\'ouverture du lien (_blank, _self)', snippet: 'target="${1|_blank,_self|}' },
  { attr: 'type', desc: 'Type d\'élément (text, button, submit, etc.)', snippet: 'type="${1|text,button,submit,checkbox,number|}' },
  { attr: 'placeholder', desc: 'Texte d\'aide indicatif du champ', snippet: 'placeholder="$1"' },
  { attr: 'value', desc: 'Valeur de l\'élément de formulaire', snippet: 'value="$1"' },
  { attr: 'name', desc: 'Nom du champ pour formulaire', snippet: 'name="$1"' },
  { attr: 'onclick', desc: 'Gestionnaire d\'événement JavaScript au clic', snippet: 'onclick="$1"' },
  { attr: 'data-', desc: 'Attribut de données personnalisé', snippet: 'data-${1:name}="${2:value}"' },
  { attr: 'disabled', desc: 'Désactive l\'élément interactif', snippet: 'disabled' },
  { attr: 'checked', desc: 'Case cochée par défaut', snippet: 'checked' },
  { attr: 'required', desc: 'Champ requis avant validation', snippet: 'required' }
]

// Propriétés CSS clés avec valeurs suggérées
const CSS_PROPERTIES: Array<{ prop: string; desc: string; snippet: string }> = [
  { prop: 'display', desc: 'Mode d\'affichage (flex, grid, block, none...)', snippet: 'display: ${1|flex,grid,block,inline-block,inline-flex,none|};' },
  { prop: 'flex-direction', desc: 'Direction des axes flexbox', snippet: 'flex-direction: ${1|column,row,column-reverse,row-reverse|};' },
  { prop: 'align-items', desc: 'Alignement sur l\'axe secondaire', snippet: 'align-items: ${1|center,flex-start,flex-end,stretch,baseline|};' },
  { prop: 'justify-content', desc: 'Alignement sur l\'axe principal', snippet: 'justify-content: ${1|center,space-between,space-around,space-evenly,flex-start,flex-end|};' },
  { prop: 'gap', desc: 'Espacement entre enfants (grid ou flex)', snippet: 'gap: ${1:12px};' },
  { prop: 'grid-template-columns', desc: 'Colonnes de la grille CSS', snippet: 'grid-template-columns: ${1|repeat(auto-fit, minmax(250px, 1fr)),1fr 1fr,1fr 1fr 1fr,250px 1fr|};' },
  { prop: 'color', desc: 'Couleur du texte', snippet: 'color: ${1:#f4f4f5};' },
  { prop: 'background', desc: 'Arrière-plan complet', snippet: 'background: ${1:#18181b};' },
  { prop: 'background-color', desc: 'Couleur de fond', snippet: 'background-color: ${1:#18181b};' },
  { prop: 'padding', desc: 'Marge intérieure', snippet: 'padding: ${1:12px};' },
  { prop: 'margin', desc: 'Marge extérieure', snippet: 'margin: ${1:0};' },
  { prop: 'border', desc: 'Bordure complète', snippet: 'border: ${1:1px solid rgba(255,255,255,0.1)};' },
  { prop: 'border-radius', desc: 'Rayon des coins arrondis', snippet: 'border-radius: ${1:8px};' },
  { prop: 'font-size', desc: 'Taille de la police', snippet: 'font-size: ${1:14px};' },
  { prop: 'font-weight', desc: 'Épaisseur de la police', snippet: 'font-weight: ${1|600,bold,500,normal|};' },
  { prop: 'font-family', desc: 'Famille de typographie', snippet: 'font-family: ${1:inherit};' },
  { prop: 'line-height', desc: 'Hauteur de ligne (interlignage)', snippet: 'line-height: ${1:1.6};' },
  { prop: 'text-align', desc: 'Alignement du texte', snippet: 'text-align: ${1|left,center,right,justify|};' },
  { prop: 'width', desc: 'Largeur de l\'élément', snippet: 'width: ${1:100%};' },
  { prop: 'height', desc: 'Hauteur de l\'élément', snippet: 'height: ${1:auto};' },
  { prop: 'max-width', desc: 'Largeur maximale', snippet: 'max-width: ${1:800px};' },
  { prop: 'min-height', desc: 'Hauteur minimale', snippet: 'min-height: ${1:100vh};' },
  { prop: 'position', desc: 'Mode de positionnement CSS', snippet: 'position: ${1|relative,absolute,fixed,sticky|};' },
  { prop: 'top', desc: 'Décalage depuis le haut', snippet: 'top: ${1:0};' },
  { prop: 'bottom', desc: 'Décalage depuis le bas', snippet: 'bottom: ${1:0};' },
  { prop: 'left', desc: 'Décalage depuis la gauche', snippet: 'left: ${1:0};' },
  { prop: 'right', desc: 'Décalage depuis la droite', snippet: 'right: ${1:0};' },
  { prop: 'z-index', desc: 'Ordre d\'empilement visuel', snippet: 'z-index: ${1:10};' },
  { prop: 'overflow', desc: 'Comportement de débordement', snippet: 'overflow: ${1|hidden,auto,scroll,visible|};' },
  { prop: 'overflow-y', desc: 'Débordement vertical', snippet: 'overflow-y: ${1|auto,hidden,scroll|};' },
  { prop: 'cursor', desc: 'Apparence du curseur de la souris', snippet: 'cursor: ${1|pointer,default,not-allowed,grab|};' },
  { prop: 'box-shadow', desc: 'Ombre portée de la boîte', snippet: 'box-shadow: ${1:0 4px 14px rgba(0,0,0,0.3)};' },
  { prop: 'box-sizing', desc: 'Modèle de calcul de boîte', snippet: 'box-sizing: ${1|border-box,content-box|};' },
  { prop: 'opacity', desc: 'Opacité ou transparence (0 à 1)', snippet: 'opacity: ${1:0.85};' },
  { prop: 'transition', desc: 'Transition fluide des changements', snippet: 'transition: ${1:all 0.2s ease};' },
  { prop: 'transform', desc: 'Transformation 2D/3D (translate, scale...)', snippet: 'transform: ${1:translateY(0)};' },
  { prop: 'white-space', desc: 'Gestion des retours à la ligne et espaces', snippet: 'white-space: ${1|nowrap,pre-wrap,normal|};' },
  { prop: 'word-break', desc: 'Coupure des mots longs', snippet: 'word-break: ${1|break-word,keep-all|};' }
]

/**
 * Enregistre tous les fournisseurs de complétion enrichis (Snippets `/`, Balises HTML, CSS)
 */
export function registerEnhancedCompletions(snippets: Snippet[]): () => void {
  const disposables: monaco.IDisposable[] = []

  // 1. FOURNISSEUR DE SNIPPETS AVEC DÉCLENCHEUR '/' (HINTER EN DIRECT)
  const snippetProvider = monaco.languages.registerCompletionItemProvider('html', {
    triggerCharacters: ['/'],
    provideCompletionItems: (model, position) => {
      const lineContent = model.getLineContent(position.lineNumber)
      const textBefore = lineContent.substring(0, position.column - 1)

      // Détecter un slash au début de ligne ou après un espace
      const match = textBefore.match(/(?:^|\s)\/([a-zA-Z0-9_-]*)$/)
      if (!match) {
        return { suggestions: [] }
      }

      const typedPrefix = match[1] // ex: 'ca' dans '/ca'
      const slashCol = position.column - typedPrefix.length - 1

      const range = new monaco.Range(
        position.lineNumber,
        slashCol,
        position.lineNumber,
        position.column
      )

      const suggestions: monaco.languages.CompletionItem[] = snippets
        .filter((s) => s.scope === 'html' || s.scope === 'all')
        .map((s) => ({
          label: {
            label: '/' + s.prefix,
            description: s.name,
            detail: ` [${s.category}]`
          },
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: `[${s.category}] ${s.name}`,
          documentation: {
            value: `**${s.name}** (${s.category})\n\n${s.description}\n\n\`\`\`html\n${getSnippetBodyText(s.body)}\n\`\`\``
          },
          insertText: getSnippetBodyText(s.body),
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          filterText: '/' + s.prefix,
          sortText: '00_' + s.prefix,
          range
        }))

      return { suggestions }
    }
  })
  disposables.push(snippetProvider)

  // 2. FOURNISSEUR DE BALISES ET ATTRIBUTS HTML
  const htmlProvider = monaco.languages.registerCompletionItemProvider('html', {
    triggerCharacters: ['<', ' ', '=', '"'],
    provideCompletionItems: (model, position) => {
      const lineContent = model.getLineContent(position.lineNumber)
      const textBefore = lineContent.substring(0, position.column - 1)

      const suggestions: monaco.languages.CompletionItem[] = []

      // Cas A: Détection de balise ouverte avec '<' (ex: '<di' -> '<div>')
      const tagOpenMatch = textBefore.match(/<([a-zA-Z0-9_-]*)$/)
      if (tagOpenMatch) {
        const typedTag = tagOpenMatch[1]
        const startCol = position.column - typedTag.length - 1
        const range = new monaco.Range(position.lineNumber, startCol, position.lineNumber, position.column)

        for (const item of HTML_TAGS) {
          const body = item.snippet || (item.void ? `<${item.tag} />` : `<${item.tag}>$0</${item.tag}>`)
          suggestions.push({
            label: {
              label: `<${item.tag}>`,
              description: item.desc,
              detail: ' [HTML]'
            },
            kind: monaco.languages.CompletionItemKind.Property,
            detail: `Balise HTML5 <${item.tag}>`,
            documentation: {
              value: `**Balise HTML5 : \`<${item.tag}>\`**\n\n${item.desc}`
            },
            insertText: body,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            filterText: '<' + item.tag,
            sortText: '01_' + item.tag,
            range
          })
        }

        return { suggestions }
      }

      // Cas B: Détection d'attributs à l'intérieur d'une balise HTML (ex: '<div cla' ou '<button ')
      const insideTagMatch = textBefore.match(/<[a-zA-Z0-9_-]+(\s+[^>]*)?$/)
      if (insideTagMatch) {
        const word = model.getWordUntilPosition(position)
        const range = new monaco.Range(
          position.lineNumber,
          word.startColumn,
          position.lineNumber,
          word.endColumn
        )

        for (const attr of HTML_ATTRIBUTES) {
          suggestions.push({
            label: {
              label: attr.attr,
              description: attr.desc,
              detail: ' [Attribut]'
            },
            kind: monaco.languages.CompletionItemKind.Field,
            detail: `Attribut HTML: ${attr.attr}`,
            documentation: {
              value: `**Attribut HTML : \`${attr.attr}\`**\n\n${attr.desc}`
            },
            insertText: attr.snippet,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            filterText: attr.attr,
            sortText: '02_' + attr.attr,
            range
          })
        }
      }

      return { suggestions }
    }
  })
  disposables.push(htmlProvider)

  // 3. FOURNISSEUR DE PROPRIÉTÉS ET VALEURS CSS
  const cssProvider = monaco.languages.registerCompletionItemProvider('html', {
    triggerCharacters: [':', ';', '{', ' '],
    provideCompletionItems: (model, position) => {
      const fullText = model.getValue()
      const offset = model.getOffsetAt(position)

      // Vérifier si la position se trouve dans un bloc <style>...</style> ou dans un attribut style="..."
      const textBeforeCursor = fullText.substring(0, offset)
      const lastOpenStyle = textBeforeCursor.lastIndexOf('<style')
      const lastCloseStyle = textBeforeCursor.lastIndexOf('</style>')
      const isInsideStyleTag = lastOpenStyle !== -1 && lastOpenStyle > lastCloseStyle

      const lineContent = model.getLineContent(position.lineNumber)
      const textBeforeOnLine = lineContent.substring(0, position.column - 1)
      const isInsideStyleAttr = /style=["'][^"']*$/.test(textBeforeOnLine)

      if (!isInsideStyleTag && !isInsideStyleAttr) {
        return { suggestions: [] }
      }

      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn
      )

      const suggestions: monaco.languages.CompletionItem[] = CSS_PROPERTIES.map((css) => ({
        label: {
          label: css.prop,
          description: css.desc,
          detail: ' [CSS]'
        },
        kind: monaco.languages.CompletionItemKind.Property,
        detail: `Propriété CSS: ${css.prop}`,
        documentation: {
          value: `**Propriété CSS : \`${css.prop}\`**\n\n${css.desc}`
        },
        insertText: css.snippet,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        filterText: css.prop,
        sortText: '00_' + css.prop,
        range
      }))

      return { suggestions }
    }
  })
  disposables.push(cssProvider)

  return () => {
    disposables.forEach((d) => d.dispose())
  }
}

/**
 * Enregistre le Copilote IA Inline (Ghostwriter Ollama) avec affichage en texte fantôme gris
 */
export function registerInlineCopilot(
  isCopilotEnabledRef: { current: boolean },
  copilotModelRef: { current: string }
): () => void {
  const disposables: monaco.IDisposable[] = []
  let lastDebounceTimer: any = null

  const provider: monaco.languages.InlineCompletionsProvider = {
    provideInlineCompletions: async (model, position, _context, token) => {
      if (!isCopilotEnabledRef.current) {
        return { items: [] }
      }

      // Attendre un temps de pause dans la frappe (debounce)
      await new Promise((resolve) => {
        clearTimeout(lastDebounceTimer)
        lastDebounceTimer = setTimeout(resolve, 650)
      })

      if (token.isCancellationRequested) {
        return { items: [] }
      }

      const offset = model.getOffsetAt(position)
      const fullText = model.getValue()
      // Récupérer le contexte récent (~1200 caractères avant le curseur)
      const textBefore = fullText.substring(Math.max(0, offset - 1200), offset)

      if (textBefore.trim().length < 15) {
        return { items: [] }
      }

      try {
        if (window.api?.aiOllamaInlineComplete) {
          const res = await window.api.aiOllamaInlineComplete(textBefore, copilotModelRef.current)
          if (!res || !res.text || token.isCancellationRequested) {
            return { items: [] }
          }

          return {
            items: [
              {
                insertText: res.text,
                range: new monaco.Range(
                  position.lineNumber,
                  position.column,
                  position.lineNumber,
                  position.column
                )
              }
            ]
          }
        }
      } catch (err) {
        console.warn('Copilot inline completion error:', err)
      }

      return { items: [] }
    },
    disposeInlineCompletions: () => {}
  }

  disposables.push(monaco.languages.registerInlineCompletionsProvider('html', provider))
  disposables.push(monaco.languages.registerInlineCompletionsProvider('markdown', provider))

  return () => {
    clearTimeout(lastDebounceTimer)
    disposables.forEach((d) => d.dispose())
  }
}
