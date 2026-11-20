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
  { id: 'consolas', label: 'Consolas (chasse fixe)', stack: "Consolas, 'Courier New', monospace" },
  // Autres polices livrées avec Windows 11
  { id: 'arial', label: 'Arial', stack: 'Arial, Helvetica, sans-serif' },
  { id: 'times', label: 'Times New Roman', stack: "'Times New Roman', Times, serif" },
  { id: 'garamond', label: 'Garamond', stack: "Garamond, 'Book Antiqua', Georgia, serif" },
  { id: 'book-antiqua', label: 'Book Antiqua', stack: "'Book Antiqua', Palatino, Georgia, serif" },
  {
    id: 'palatino',
    label: 'Palatino Linotype',
    stack: "'Palatino Linotype', 'Book Antiqua', Palatino, serif"
  },
  { id: 'constantia', label: 'Constantia', stack: 'Constantia, Cambria, Georgia, serif' },
  { id: 'sitka', label: 'Sitka Text', stack: "'Sitka Text', Cambria, Georgia, serif" },
  {
    id: 'century-gothic',
    label: 'Century Gothic',
    stack: "'Century Gothic', 'Segoe UI', sans-serif"
  },
  { id: 'tahoma', label: 'Tahoma', stack: "Tahoma, 'Segoe UI', sans-serif" },
  { id: 'candara', label: 'Candara', stack: "Candara, 'Segoe UI', sans-serif" },
  { id: 'corbel', label: 'Corbel', stack: "Corbel, 'Segoe UI', sans-serif" },
  {
    id: 'franklin',
    label: 'Franklin Gothic',
    stack: "'Franklin Gothic Medium', 'Franklin Gothic', 'Segoe UI', sans-serif"
  },
  { id: 'bahnschrift', label: 'Bahnschrift', stack: "Bahnschrift, 'Segoe UI', sans-serif" },
  { id: 'lucida', label: 'Lucida Sans', stack: "'Lucida Sans Unicode', 'Lucida Sans', sans-serif" },
  { id: 'comic', label: 'Comic Sans MS', stack: "'Comic Sans MS', 'Segoe Print', cursive" },
  { id: 'segoe-print', label: 'Segoe Print (manuscrite)', stack: "'Segoe Print', cursive" },
  {
    id: 'cascadia',
    label: 'Cascadia Code (chasse fixe)',
    stack: "'Cascadia Code', Consolas, monospace"
  },
  { id: 'courier', label: 'Courier New (chasse fixe)', stack: "'Courier New', Courier, monospace" }
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
