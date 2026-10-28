/**
 * Module d'assistance aux cours et séances :
 * - Détection automatique de la séance suivante dans un dossier (ex: poo-seance-03 -> poo-seance-04).
 * - Moteur d'expansion des modèles de notes avec variables contextuelles.
 */

import { slugifyHeading } from './outlineExtractor'

export interface SessionSuggestion {
  nextSessionNumber: number
  suggestedFileName: string
  suggestedTitle: string
  patternPrefix: string
  padding: number
  extension: string
}

export interface TemplateContext {
  noteTitle?: string
  folderName?: string
  sessionNumber?: number | string
  tags?: string[]
  currentDate?: string
  currentTime?: string
  [key: string]: string | number | string[] | undefined
}

export interface NoteTemplate {
  name: string
  fileName: string
  extension: 'html' | 'md'
  content: string
}

/**
 * Analyse les fichiers existants dans un dossier pour détecter le motif de séance et suggérer la séance suivante.
 */
export function detectNextSession(
  folderPath: string,
  filesInFolder: string[] = []
): SessionSuggestion {
  const folderName = folderPath.includes('/')
    ? folderPath.split('/').pop() || folderPath
    : folderPath || 'cours'

  // Motifs courants de nommage de séances / cours
  const sessionRegexes = [
    // ex: poo-seance-03.html, algo-seance_02.md, seance-1.html, seance5.html
    /^(.*?)(?:seance|séance|session|cours|lecture|tp|td|s)[-_ ]?(\d+)(.*?)\.(html|htm|md)$/i,
    // ex: note-04.html, chap-2.md, 03-cours.html
    /^(.*?[_\-\s])(\d+)(.*?)\.(html|htm|md)$/i,
    // ex: 01.html, 02.md
    /^()(\d+)()\.(html|htm|md)$/i
  ]

  let maxNum = 0
  let bestPadding = 2
  let detectedPrefix = ''
  let detectedExt = 'html'

  for (const rawName of filesInFolder) {
    const fileName = rawName.includes('/') ? rawName.split('/').pop() || rawName : rawName
    for (const regex of sessionRegexes) {
      const match = fileName.match(regex)
      if (match) {
        const numStr = match[2]
        const num = parseInt(numStr, 10)
        const ext = match[4].toLowerCase()

        if (!isNaN(num) && num > maxNum) {
          maxNum = num
          bestPadding = Math.max(numStr.length, 2)
          detectedPrefix = fileName.slice(0, fileName.lastIndexOf(numStr))
          detectedExt = ext === 'htm' ? 'html' : ext
        }
        break
      }
    }
  }

  const nextNum = maxNum > 0 ? maxNum + 1 : 1
  const paddedNum = String(nextNum).padStart(bestPadding, '0')

  let suggestedFileName = ''
  if (detectedPrefix) {
    suggestedFileName = `${detectedPrefix}${paddedNum}.${detectedExt}`
  } else {
    const slug = slugifyHeading(folderName)
    suggestedFileName = `${slug}-seance-${paddedNum}.html`
  }

  // Construction d'un titre naturel et lisible (ex: "POO - Séance 04")
  const cleanFolder = folderName.replace(/[-_]/g, ' ').trim()
  const capitalizedFolder = cleanFolder
    ? cleanFolder.charAt(0).toUpperCase() + cleanFolder.slice(1)
    : 'Cours'
  const suggestedTitle = `${capitalizedFolder} - Séance ${paddedNum}`

  return {
    nextSessionNumber: nextNum,
    suggestedFileName,
    suggestedTitle,
    patternPrefix: detectedPrefix,
    padding: bestPadding,
    extension: detectedExt
  }
}

/**
 * Développe un modèle en remplaçant toutes les variables contextuelles et en nettoyant les tabstops.
 */
export function expandTemplate(
  template: string,
  context: TemplateContext = {},
  now: Date = new Date()
): string {
  if (!template) return ''

  const year = now.getFullYear().toString()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const date = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')

  const formattedDate = context.currentDate || `${year}-${month}-${date}`
  const formattedTime = context.currentTime || `${hours}:${minutes}`

  const sessionNum = context.sessionNumber !== undefined ? Number(context.sessionNumber) : 1
  const sessionPad = !isNaN(sessionNum)
    ? String(sessionNum).padStart(2, '0')
    : String(context.sessionNumber || '01')

  const folderName = context.folderName || ''
  const noteTitle =
    context.noteTitle || (folderName ? `${folderName} - Séance ${sessionPad}` : 'Nouvelle Séance')
  const tagsStr = context.tags
    ? Array.isArray(context.tags)
      ? context.tags.join(', ')
      : String(context.tags)
    : ''

  let result = template
    .replace(/\$\{NOTE_TITLE\}/g, noteTitle)
    .replace(/\$\{FOLDER_NAME\}/g, folderName)
    .replace(/\$\{SESSION_NUMBER\}/g, String(context.sessionNumber ?? 1))
    .replace(/\$\{SESSION_NUMBER_PAD\}/g, sessionPad)
    .replace(/\$\{TAGS\}/g, tagsStr)
    .replace(/\$\{CURRENT_DATE\}/g, formattedDate)
    .replace(/\$\{CURRENT_TIME\}/g, formattedTime)
    .replace(/\$\{CURRENT_YEAR\}/g, year)
    .replace(/\$\{CURRENT_MONTH\}/g, month)
    .replace(/\$\{CURRENT_DAY\}/g, date)

  // Nettoyage des tabstops TextMate/VSCode pour obtenir un fichier propre et immédiatement exploitable
  result = result
    .replace(/\$\{[0-9]+:([^}]*)\}/g, '$1')
    .replace(/\$\{[0-9]+\|([^|]*)\|/g, (_m, choices) => choices.split(',')[0] || '')
    .replace(/\$[0-9]+/g, '')

  return result
}
