/**
 * Module pur et partagé pour les types et helpers d'annotations PDF
 */

import { parsePdfHref } from './pdfLink'

export type HighlightColor = 'yellow' | 'green' | 'pink' | 'cyan' | 'purple'

export interface HighlightRect {
  /** Coordonnée X normalisée (0..1) relative à la largeur de la page */
  x: number
  /** Coordonnée Y normalisée (0..1) relative à la hauteur de la page */
  y: number
  /** Largeur normalisée (0..1) */
  width: number
  /** Hauteur normalisée (0..1) */
  height: number
}

export interface PdfAnnotation {
  id: string
  pageNumber: number
  text: string
  color: HighlightColor
  rects: HighlightRect[]
  createdAt: string
  comment?: string
}

export interface PdfAnnotationsFile {
  pdfFilePath: string
  version: 1
  updatedAt: string
  annotations: PdfAnnotation[]
}

export interface ColorDef {
  id: HighlightColor
  name: string
  bg: string
  border: string
  dot: string
}

export const HIGHLIGHT_COLORS: Record<HighlightColor, ColorDef> = {
  yellow: {
    id: 'yellow',
    name: 'Jaune',
    bg: 'rgba(253, 224, 71, 0.40)',
    border: 'rgba(234, 179, 8, 0.75)',
    dot: '#facc15'
  },
  green: {
    id: 'green',
    name: 'Vert',
    bg: 'rgba(74, 222, 128, 0.40)',
    border: 'rgba(34, 197, 94, 0.75)',
    dot: '#4ade80'
  },
  pink: {
    id: 'pink',
    name: 'Rose',
    bg: 'rgba(244, 114, 182, 0.40)',
    border: 'rgba(236, 72, 153, 0.75)',
    dot: '#f472b6'
  },
  cyan: {
    id: 'cyan',
    name: 'Cyan',
    bg: 'rgba(56, 189, 248, 0.40)',
    border: 'rgba(14, 165, 233, 0.75)',
    dot: '#38bdf8'
  },
  purple: {
    id: 'purple',
    name: 'Violet',
    bg: 'rgba(192, 132, 252, 0.40)',
    border: 'rgba(168, 85, 247, 0.75)',
    dot: '#c084fc'
  }
}

/**
 * Calcule le chemin relatif POSIX entre deux fichiers dans la vault.
 */
export function computeRelativePath(fromFilePath: string, toFilePath: string): string {
  const normFrom = fromFilePath.replace(/\\/g, '/').replace(/^\/+/, '')
  const normTo = toFilePath.replace(/\\/g, '/').replace(/^\/+/, '')

  const fromDir = normFrom.includes('/') ? normFrom.substring(0, normFrom.lastIndexOf('/')) : ''
  const toDir = normTo.includes('/') ? normTo.substring(0, normTo.lastIndexOf('/')) : ''
  const toBase = normTo.includes('/') ? normTo.substring(normTo.lastIndexOf('/') + 1) : normTo

  if (fromDir === toDir) {
    return toBase
  }

  const fromParts = fromDir ? fromDir.split('/') : []
  const toParts = toDir ? toDir.split('/') : []

  let common = 0
  while (
    common < fromParts.length &&
    common < toParts.length &&
    fromParts[common] === toParts[common]
  ) {
    common++
  }

  const upCount = fromParts.length - common
  const downParts = toParts.slice(common)

  const parts: string[] = []
  for (let i = 0; i < upCount; i++) {
    parts.push('..')
  }
  parts.push(...downParts)
  parts.push(toBase)

  return parts.join('/')
}

/**
 * Extrait le chemin PDF et le numéro de page d'un lien (ex: "cours.pdf#page=12")
 */
export function parsePdfLink(href: string): { pdfPath: string; pageNumber: number } | null {
  const parsed = parsePdfHref(href)
  return parsed ? { pdfPath: parsed.path, pageNumber: parsed.page } : null
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Formate un bloc citation/callout pour note HTML ou Markdown avec lien de retour.
 */
export function formatPdfQuoteBlock(params: {
  quoteText: string
  pdfRelativePath: string
  targetNotePath: string
  pageNumber: number
  isHtml: boolean
  comment?: string
}): string {
  const relPath = computeRelativePath(params.targetNotePath, params.pdfRelativePath)
  const pdfBaseName = params.pdfRelativePath.split('/').pop() || params.pdfRelativePath
  const linkHref = `${relPath}#page=${params.pageNumber}`
  const linkText = `${pdfBaseName} (p. ${params.pageNumber})`

  if (params.isHtml) {
    const escapedText = escapeHtml(params.quoteText)
    const commentHtml = params.comment
      ? `\n  <p><em>Note : ${escapeHtml(params.comment)}</em></p>`
      : ''
    return `<div class="callout callout-info" data-pdf-quote="true">
  <div class="callout-title">📌 Extrait PDF — <a href="${linkHref}">${escapeHtml(linkText)}</a></div>
  <p>${escapedText}</p>${commentHtml}
</div>`
  } else {
    const quoteLines = params.quoteText
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')
    const commentMd = params.comment ? `\n>\n> *Note : ${params.comment}*` : ''
    return `> [!NOTE] Extrait PDF — [${linkText}](${linkHref})\n${quoteLines}${commentMd}`
  }
}

/**
 * Fusionne ou ajoute une annotation dans la liste
 */
export function upsertAnnotation(
  list: PdfAnnotation[],
  annotation: PdfAnnotation
): PdfAnnotation[] {
  const index = list.findIndex((a) => a.id === annotation.id)
  if (index >= 0) {
    const next = [...list]
    next[index] = annotation
    return next
  }
  return [...list, annotation]
}

/**
 * Supprime une annotation de la liste par ID
 */
export function removeAnnotation(list: PdfAnnotation[], id: string): PdfAnnotation[] {
  return list.filter((a) => a.id !== id)
}

/**
 * Insère un bloc citation dans le contenu d'une note (HTML ou Markdown)
 */
export function insertQuoteIntoNoteContent(
  existingContent: string,
  quoteBlock: string,
  isHtml: boolean
): string {
  if (isHtml) {
    const bodyIdx = existingContent.lastIndexOf('</body>')
    if (bodyIdx !== -1) {
      return (
        existingContent.substring(0, bodyIdx) +
        `  ${quoteBlock}\n` +
        existingContent.substring(bodyIdx)
      )
    }
    const containerIdx = existingContent.lastIndexOf('</div>\n</body>')
    if (containerIdx !== -1) {
      return (
        existingContent.substring(0, containerIdx) +
        `  ${quoteBlock}\n` +
        existingContent.substring(containerIdx)
      )
    }
    return `${existingContent.trimEnd()}\n\n${quoteBlock}\n`
  }

  return `${existingContent.trimEnd()}\n\n${quoteBlock}\n`
}
