/**
 * Snippets de l'aperçu éditable : construit le fragment HTML d'un snippet en gardant ses champs
 * (${1:défaut}, $1, ${1|a,b|}, $0) au lieu de les aplatir, pour qu'on puisse les remplir dans le rendu.
 *
 * - Champ dans le texte : <span data-nf-field="n"> visible (contenu = valeur par défaut, ou indication
 *   « texte » s'il est vide).
 * - Champ dans un attribut (class="step ${1|purple,orange|}", style="color: var(--${1|…|})") : pas de
 *   marqueur possible, setValue() recalcule l'attribut (changement de couleur en direct).
 * - $0 : marqueur final (position du curseur à la fin).
 * Les marqueurs ne sont jamais enregistrés : cleanPreviewDocument (previewClean.ts) les retire.
 *
 * Fonction autonome (aucun import, aucune constante externe) : sa source est injectée telle quelle
 * dans l'iframe d'aperçu (CodeWorkspace.tsx) via toString().
 */

export interface SnippetFieldOccurrence {
  index: number
  kind: 'text' | 'attribute'
  // Marqueur <span data-nf-field> (texte) ou élément qui porte l'attribut
  element: Element
  attribute: string | null
  defaultValue: string
  choices: string[] | null
  setValue: (value: string) => void
  getValue: () => string
}

export interface SnippetFieldGroup {
  // Numéro du champ ; plusieurs occurrences d'un même numéro : la première est éditée, les autres
  // reçoivent sa valeur en fin de session
  index: number
  occurrences: SnippetFieldOccurrence[]
}

export interface SnippetBuild {
  fragment: DocumentFragment
  groups: SnippetFieldGroup[]
  finalMarker: Element | null
}

export function buildSnippetFragment(
  doc: Document,
  body: string[] | string,
  selectedText: string,
  now: Date,
  // Variables fournies par l'app, ex. { NOTES_THEME: '../.theme/notes.css' } pour /page
  variables?: Record<string, string>
): SnippetBuild {
  const OPEN = String.fromCharCode(0xe000)
  const CLOSE = String.fromCharCode(0xe001)
  const tokenRe = new RegExp(OPEN + '(\\d+)' + CLOSE, 'g')
  const RAW_PARENTS = ['style', 'script', 'textarea', 'title']

  const pad = (n: number): string => (n < 10 ? '0' : '') + n
  const escapeHtml = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  let text = Array.isArray(body) ? body.join('\n') : String(body || '')
  text = text
    .split('${CURRENT_YEAR}')
    .join(String(now.getFullYear()))
    .split('${CURRENT_MONTH}')
    .join(pad(now.getMonth() + 1))
    .split('${CURRENT_DATE}')
    .join(pad(now.getDate()))
  if (variables) {
    for (const name of Object.keys(variables)) {
      text = text.split('${' + name + '}').join(variables[name])
    }
  }

  // Texte sélectionné : texte brut, échappé avant d'entrer dans le HTML ; sinon valeur de repli ($1…)
  const selection = selectedText ? escapeHtml(selectedText) : ''
  text = text.replace(/\$\{TM_SELECTED_TEXT(?::([^}]*))?\}/g, (_m: string, fallback?: string) =>
    selectedText ? selection : fallback !== undefined ? fallback : ''
  )
  text = text.replace(/\$TM_SELECTED_TEXT\b/g, selection)

  // Chaque champ devient un jeton unique ; on retrouvera ensuite s'il est dans le texte ou un attribut
  const fields: Array<{ index: number; defaultValue: string; choices: string[] | null }> = []
  text = text.replace(
    /\$\{(\d+)\|([^|}]*)\|\}|\$\{(\d+):([^}]*)\}|\$(\d+)/g,
    (
      _m: string,
      choiceIndex?: string,
      choiceList?: string,
      defaultIndex?: string,
      defaultValue?: string,
      simpleIndex?: string
    ) => {
      if (choiceIndex !== undefined) {
        const choices = String(choiceList).split(',')
        fields.push({ index: Number(choiceIndex), defaultValue: choices[0] || '', choices })
      } else if (defaultIndex !== undefined) {
        fields.push({
          index: Number(defaultIndex),
          defaultValue: String(defaultValue),
          choices: null
        })
      } else {
        fields.push({ index: Number(simpleIndex), defaultValue: '', choices: null })
      }
      return OPEN + (fields.length - 1) + CLOSE
    }
  )

  const template = doc.createElement('template')
  template.innerHTML = text.trim()
  const fragment = template.content
  const occurrences: SnippetFieldOccurrence[] = []
  let finalMarker: Element | null = null

  // Relevé avant modification (le parcours ne doit pas voir les nœuds qu'on insère)
  const elements: Element[] = []
  const textNodes: Text[] = []
  const walker = doc.createTreeWalker(fragment, 5) // éléments et textes
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === 1) elements.push(node as Element)
    else if ((node.nodeValue || '').indexOf(OPEN) !== -1) textNodes.push(node as Text)
  }

  for (const el of elements) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.value.indexOf(OPEN) === -1) continue
      const name = attr.name
      const pattern = attr.value
      const values: Record<string, string> = {}
      const render = (): void => {
        el.setAttribute(
          name,
          pattern.replace(tokenRe, (_m: string, id: string) => values[id])
        )
      }
      pattern.replace(tokenRe, (_m: string, id: string) => {
        const field = fields[Number(id)]
        values[id] = field.defaultValue
        if (field.index !== 0) {
          occurrences.push({
            index: field.index,
            kind: 'attribute',
            element: el,
            attribute: name,
            defaultValue: field.defaultValue,
            choices: field.choices,
            setValue: (value: string) => {
              values[id] = value
              render()
            },
            getValue: () => values[id]
          })
        }
        return ''
      })
      render()
    }
  }

  for (const node of textNodes) {
    const value = node.nodeValue || ''
    const parentName =
      node.parentNode && node.parentNode.nodeType === 1
        ? (node.parentNode as Element).localName
        : ''
    // CSS, script, titre : pas de balise possible, on met la valeur par défaut
    if (RAW_PARENTS.indexOf(parentName) !== -1) {
      node.nodeValue = value.replace(
        tokenRe,
        (_m: string, id: string) => fields[Number(id)].defaultValue
      )
      continue
    }
    const pieces = doc.createDocumentFragment()
    let last = 0
    value.replace(tokenRe, (match: string, id: string, offset: number) => {
      if (offset > last) pieces.appendChild(doc.createTextNode(value.slice(last, offset)))
      last = offset + match.length
      const field = fields[Number(id)]
      const marker = doc.createElement('span')
      marker.setAttribute('data-nf-field', String(field.index))
      if (field.index === 0) {
        marker.setAttribute('data-nf-final', '')
        finalMarker = marker
      } else {
        // Indication grisée affichée quand le champ est vide (valeur par défaut effacée, ou $1)
        marker.setAttribute('data-nf-hint', field.defaultValue || 'texte')
        marker.textContent = field.defaultValue
        occurrences.push({
          index: field.index,
          kind: 'text',
          element: marker,
          attribute: null,
          defaultValue: field.defaultValue,
          choices: field.choices,
          setValue: (v: string) => {
            marker.textContent = v
          },
          getValue: () => marker.textContent || ''
        })
      }
      pieces.appendChild(marker)
      return match
    })
    if (last < value.length) pieces.appendChild(doc.createTextNode(value.slice(last)))
    node.parentNode?.replaceChild(pieces, node)
  }

  const byIndex: Record<number, SnippetFieldOccurrence[]> = {}
  const order: number[] = []
  for (const occurrence of occurrences) {
    if (!byIndex[occurrence.index]) {
      byIndex[occurrence.index] = []
      order.push(occurrence.index)
    }
    byIndex[occurrence.index].push(occurrence)
  }
  order.sort((a, b) => a - b)
  const groups = order.map((index) => ({ index, occurrences: byIndex[index] }))

  return { fragment, groups, finalMarker }
}
