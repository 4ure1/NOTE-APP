/**
 * Police du texte des notes (réglage Paramètres › Apparence). Polices livrées avec Windows : rien à
 * télécharger, l'app reste hors ligne. Appliquée à l'aperçu par la feuille d'aide du thème (jamais
 * écrite dans la note) ; les titres et le code gardent la police du thème des notes.
 */

export interface NoteFont {
  id: string
  label: string
  stack: string
}

export const DEFAULT_NOTE_FONT = 'georgia'

export const NOTE_FONTS: NoteFont[] = [
  {
    id: 'georgia',
    label: 'Georgia (par défaut)',
    stack: "Georgia, Cambria, 'Times New Roman', serif"
  },
  { id: 'cambria', label: 'Cambria', stack: 'Cambria, Georgia, serif' },
  { id: 'segoe', label: 'Segoe UI', stack: "'Segoe UI', system-ui, sans-serif" },
  { id: 'calibri', label: 'Calibri', stack: "Calibri, 'Segoe UI', sans-serif" },
  { id: 'trebuchet', label: 'Trebuchet MS', stack: "'Trebuchet MS', 'Segoe UI', sans-serif" },
  { id: 'verdana', label: 'Verdana', stack: "Verdana, 'Segoe UI', sans-serif" },
  { id: 'consolas', label: 'Consolas (chasse fixe)', stack: "Consolas, 'Courier New', monospace" }
]

export function getNoteFont(id: string | null | undefined): NoteFont {
  return NOTE_FONTS.find((f) => f.id === id) || NOTE_FONTS[0]
}

/** Règle ajoutée à la feuille d'aide de l'aperçu ; vide pour la police par défaut du thème. */
export function noteFontCss(id: string | null | undefined): string {
  const font = getNoteFont(id)
  if (font.id === DEFAULT_NOTE_FONT) return ''
  return `\nbody { font-family: ${font.stack} !important; }\n`
}
