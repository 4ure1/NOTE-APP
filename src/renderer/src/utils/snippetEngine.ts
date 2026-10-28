import { Snippet, SnippetExpansion, SnippetTabstop } from '../types/snippets'

/**
 * Normalise le corps d'un snippet (array de lignes ou chaîne)
 */
export function getSnippetBodyText(body: string[] | string): string {
  if (Array.isArray(body)) {
    return body.join('\n')
  }
  return String(body || '')
}

/**
 * Développe un snippet pour un champ textarea :
 * 1. Remplace les variables contextuelles (${TM_SELECTED_TEXT}, ${CURRENT_YEAR}, etc.)
 * 2. Parse les tabstops ($1, ${1:def}, ${1|a,b|}, $0)
 * 3. Calcule les offsets absolus de chaque zone de saut pour la navigation par Tab
 */
export function expandSnippet(
  body: string[] | string,
  selectedText: string = '',
  now: Date = new Date()
): SnippetExpansion {
  let template = getSnippetBodyText(body)

  // 1. Remplacement des variables temporelles
  const year = now.getFullYear().toString()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const date = String(now.getDate()).padStart(2, '0')

  template = template.replace(/\$\{CURRENT_YEAR\}/g, year)
  template = template.replace(/\$\{CURRENT_MONTH\}/g, month)
  template = template.replace(/\$\{CURRENT_DATE\}/g, date)

  // 2. Traitement de ${TM_SELECTED_TEXT:$1} et ${TM_SELECTED_TEXT}
  // Si du texte est sélectionné, il remplace ${TM_SELECTED_TEXT:...} et ${TM_SELECTED_TEXT}
  if (selectedText && selectedText.length > 0) {
    template = template.replace(/\$\{TM_SELECTED_TEXT(?::([^}]*))?\}/g, selectedText)
    template = template.replace(/\$TM_SELECTED_TEXT\b/g, selectedText)
  } else {
    // Si aucun texte sélectionné, ${TM_SELECTED_TEXT:$1} se replie sur $1
    template = template.replace(/\$\{TM_SELECTED_TEXT(?::([^}]*))?\}/g, (_m, fallback) => {
      return fallback !== undefined ? fallback : ''
    })
    template = template.replace(/\$TM_SELECTED_TEXT\b/g, '')
  }

  // 3. Analyse lexicale des tabstops et construction du texte final avec offsets
  const tabstops: SnippetTabstop[] = []
  let resultText = ''
  let i = 0

  while (i < template.length) {
    // Échappement \$, \\
    if (template[i] === '\\' && i + 1 < template.length) {
      const nextChar = template[i + 1]
      if (nextChar === '$' || nextChar === '\\' || nextChar === '}') {
        resultText += nextChar
        i += 2
        continue
      }
    }

    if (template[i] === '$') {
      // Cas 1 : $0, $1, $2, ...
      const simpleMatch = template.substring(i).match(/^\$([0-9]+)/)
      if (simpleMatch) {
        const index = parseInt(simpleMatch[1], 10)
        const start = resultText.length
        const end = start
        tabstops.push({
          index,
          start,
          end,
          defaultValue: ''
        })
        i += simpleMatch[0].length
        continue
      }

      // Cas 2 : ${1:défaut} ou ${1|a,b,c|} ou ${0}
      if (template[i + 1] === '{') {
        const closeIdx = findClosingBrace(template, i + 1)
        if (closeIdx !== -1) {
          const content = template.substring(i + 2, closeIdx)
          i = closeIdx + 1

          // Forme choix : 1|optionA,optionB|
          const choiceMatch = content.match(/^([0-9]+)\|([^|]*)\|$/)
          if (choiceMatch) {
            const index = parseInt(choiceMatch[1], 10)
            const choices = choiceMatch[2].split(',')
            const defaultValue = choices[0] || ''
            const start = resultText.length
            resultText += defaultValue
            const end = resultText.length
            tabstops.push({
              index,
              start,
              end,
              defaultValue,
              choices
            })
            continue
          }

          // Forme placeholder : 1:valeur par défaut
          const placeholderMatch = content.match(/^([0-9]+)(?::(.*))?$/s)
          if (placeholderMatch) {
            const index = parseInt(placeholderMatch[1], 10)
            let defaultValue = placeholderMatch[2] !== undefined ? placeholderMatch[2] : ''
            // Nettoyage d'éventuels marqueurs simples
            defaultValue = defaultValue.replace(/\$[0-9]+/g, '')
            const start = resultText.length
            resultText += defaultValue
            const end = resultText.length
            tabstops.push({
              index,
              start,
              end,
              defaultValue
            })
            continue
          }

          // Forme simple ${0}
          const plainIndexMatch = content.match(/^([0-9]+)$/)
          if (plainIndexMatch) {
            const index = parseInt(plainIndexMatch[1], 10)
            const start = resultText.length
            const end = start
            tabstops.push({
              index,
              start,
              end,
              defaultValue: ''
            })
            continue
          }
        }
      }
    }

    resultText += template[i]
    i++
  }

  // 4. Organisation de l'ordre de navigation par Tab
  // Les tabstops sont ordonnés : 1, 2, 3, ... puis 0 à la fin
  const uniqueIndices = Array.from(new Set(tabstops.map((t) => t.index)))
  const positiveIndices = uniqueIndices.filter((idx) => idx > 0).sort((a, b) => a - b)
  const hasZero = uniqueIndices.includes(0)

  let tabstopIndices: number[] = []
  if (positiveIndices.length > 0) {
    tabstopIndices = [...positiveIndices]
    if (hasZero) {
      tabstopIndices.push(0)
    }
  } else if (hasZero) {
    tabstopIndices = [0]
  } else {
    // Si aucun tabstop n'est défini, le curseur final se place à la fin du texte
    tabstops.push({
      index: 0,
      start: resultText.length,
      end: resultText.length,
      defaultValue: ''
    })
    tabstopIndices = [0]
  }

  return {
    text: resultText,
    tabstops,
    tabstopIndices
  }
}

/**
 * Session active de navigation par Tab / Shift+Tab dans un textarea
 */
export class SnippetSession {
  tabstopIndices: number[]
  currentStep: number
  baseOffset: number
  tabstops: SnippetTabstop[]
  lastSelectionEnd: number

  constructor(expansion: SnippetExpansion, baseOffset: number) {
    this.tabstopIndices = expansion.tabstopIndices
    this.currentStep = 0
    this.baseOffset = baseOffset
    this.tabstops = expansion.tabstops.map((t) => ({ ...t }))
    const initial = this.getCurrentTarget()
    this.lastSelectionEnd = initial ? initial.end : baseOffset
  }

  getCurrentTarget(): { start: number; end: number } | null {
    if (this.currentStep >= this.tabstopIndices.length) return null
    const targetIdx = this.tabstopIndices[this.currentStep]
    const tabstop = this.tabstops.find((t) => t.index === targetIdx)
    if (!tabstop) return null
    return {
      start: this.baseOffset + tabstop.start,
      end: this.baseOffset + tabstop.end
    }
  }

  /**
   * Ajuste les offsets suivants si l'utilisateur a tapé du texte modifiant la longueur du placeholder
   */
  adjustForEdit(actualStart: number, actualEnd: number) {
    const current = this.getCurrentTarget()
    if (!current) return
    const originalLength = current.end - current.start
    const newLength = actualEnd - actualStart
    const delta = newLength - originalLength
    if (delta === 0) return

    const currentIdx = this.tabstopIndices[this.currentStep]
    const tabstop = this.tabstops.find((t) => t.index === currentIdx)
    if (tabstop) {
      tabstop.end += delta
    }

    // Décaler tous les tabstops qui démarraient après
    for (const t of this.tabstops) {
      if (t.index !== currentIdx && t.start >= (tabstop ? tabstop.start : current.start)) {
        t.start += delta
        t.end += delta
      }
    }
  }

  next(): { start: number; end: number } | null {
    if (this.currentStep < this.tabstopIndices.length - 1) {
      this.currentStep++
      const target = this.getCurrentTarget()
      if (target) this.lastSelectionEnd = target.end
      return target
    }
    return null
  }

  previous(): { start: number; end: number } | null {
    if (this.currentStep > 0) {
      this.currentStep--
      const target = this.getCurrentTarget()
      if (target) this.lastSelectionEnd = target.end
      return target
    }
    return this.getCurrentTarget()
  }

  isFinished(): boolean {
    return this.currentStep >= this.tabstopIndices.length - 1 && this.tabstopIndices[this.currentStep] === 0
  }
}

/**
 * Trouve l'accolade fermante correspondante en gérant les imbrications
 */
function findClosingBrace(str: string, openBraceIdx: number): number {
  let depth = 0
  for (let idx = openBraceIdx; idx < str.length; idx++) {
    if (str[idx] === '\\') {
      idx++
      continue
    }
    if (str[idx] === '{') {
      depth++
    } else if (str[idx] === '}') {
      depth--
      if (depth === 0) {
        return idx
      }
    }
  }
  return -1
}

/**
 * Recherche floue simple et rapide sur une chaîne cible
 */
export function fuzzyMatch(pattern: string, target: string): boolean {
  if (!pattern) return true
  const p = pattern.toLowerCase()
  const t = target.toLowerCase()
  if (t.includes(p)) return true

  let pIdx = 0
  for (let tIdx = 0; tIdx < t.length && pIdx < p.length; tIdx++) {
    if (t[tIdx] === p[pIdx]) {
      pIdx++
    }
  }
  return pIdx === p.length
}

/**
 * Filtre les snippets selon le scope du fichier et la requête de recherche
 */
export function filterSnippets(
  snippets: Snippet[],
  query: string,
  scope: 'html' | 'markdown'
): Snippet[] {
  const cleanQuery = query.trim().toLowerCase()

  return snippets.filter((s) => {
    // 1. Vérification du scope
    // 'html' : uniquement dans .html/.htm
    // 'markdown' : uniquement dans .md
    // 'all' : partout
    if (s.scope !== 'all' && s.scope !== scope) {
      return false
    }

    // 2. Recherche floue sur prefix et name
    if (!cleanQuery) return true

    return fuzzyMatch(cleanQuery, s.prefix) || fuzzyMatch(cleanQuery, s.name)
  })
}

/**
 * Groupe les snippets filtrés par catégorie ordonnée
 */
export function groupSnippetsByCategory(snippets: Snippet[]): Record<string, Snippet[]> {
  const groups: Record<string, Snippet[]> = {}
  for (const s of snippets) {
    const cat = s.category || 'Autres'
    if (!groups[cat]) {
      groups[cat] = []
    }
    groups[cat].push(s)
  }
  return groups
}
