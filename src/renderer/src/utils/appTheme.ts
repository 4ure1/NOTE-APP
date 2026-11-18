import { getAppTheme, previewThemeCss, themeVariables } from '../../../shared/appThemes'
import { getNoteFont, noteFontCss } from '../../../shared/noteFonts'

const STORAGE_KEY = 'app_theme'
export const APP_THEME_EVENT = 'nf-theme-change'
export const MONACO_THEME = 'nf-app'

export function savedAppThemeId(): string {
  try {
    return getAppTheme(localStorage.getItem(STORAGE_KEY)).id
  } catch {
    return getAppTheme(null).id
  }
}

function applyVariables(id: string): void {
  const theme = getAppTheme(id)
  const vars = themeVariables(theme)
  for (const [name, value] of Object.entries(vars)) {
    document.documentElement.style.setProperty(name, value)
  }
}

/** Au démarrage, avant le premier rendu : pas de flash de l'autre thème. */
export function applySavedAppTheme(): void {
  applyVariables(savedAppThemeId())
  applySavedNoteFont()
}

export function setAppTheme(id: string): void {
  applyVariables(id)
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch (err) {
    console.error('[Thème] Choix non enregistré', err)
  }
  window.dispatchEvent(new Event(APP_THEME_EVENT))
}

const NOTE_FONT_KEY = 'note_font'

/** Police du texte des notes choisie dans les Paramètres (src/shared/noteFonts.ts). */
export function savedNoteFontId(): string {
  try {
    return getNoteFont(localStorage.getItem(NOTE_FONT_KEY)).id
  } catch {
    return getNoteFont(null).id
  }
}

function applyNoteFont(id: string): void {
  // Aperçu Markdown (même document que l'app) ; l'aperçu HTML la reçoit par previewThemeMessage
  document.documentElement.style.setProperty('--note-font', getNoteFont(id).stack)
}

export function applySavedNoteFont(): void {
  applyNoteFont(savedNoteFontId())
}

export function setNoteFont(id: string): void {
  applyNoteFont(id)
  try {
    localStorage.setItem(NOTE_FONT_KEY, getNoteFont(id).id)
  } catch (err) {
    console.error('[Police des notes] Choix non enregistré', err)
  }
  // Même événement que le thème : les aperçus ouverts reçoivent la nouvelle feuille d'aide
  window.dispatchEvent(new Event(APP_THEME_EVENT))
}

/** Message à envoyer à une iframe d'aperçu pour qu'elle suive le thème et la police des notes. */
export function previewThemeMessage(): { type: 'SET_PREVIEW_THEME'; css: string } {
  return {
    type: 'SET_PREVIEW_THEME',
    css: previewThemeCss(getAppTheme(savedAppThemeId())) + noteFontCss(savedNoteFontId())
  }
}

/** Thème Monaco : coloration de VS Code sombre, fond du thème de l'app. */
export function monacoThemeData(): {
  base: 'vs-dark'
  inherit: boolean
  rules: []
  colors: Record<string, string>
} {
  const { code } = getAppTheme(savedAppThemeId()).colors
  return {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: { 'editor.background': code, 'editorGutter.background': code }
  }
}
