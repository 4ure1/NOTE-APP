import { getAppTheme, previewThemeCss, themeVariables } from '../../../shared/appThemes'

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
  const vars = themeVariables(getAppTheme(id))
  for (const [name, value] of Object.entries(vars)) {
    document.documentElement.style.setProperty(name, value)
  }
}

/** Au démarrage, avant le premier rendu : pas de flash de l'autre thème. */
export function applySavedAppTheme(): void {
  applyVariables(savedAppThemeId())
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

/** Message à envoyer à une iframe d'aperçu pour qu'elle suive le thème. */
export function previewThemeMessage(): { type: 'SET_PREVIEW_THEME'; css: string } {
  return { type: 'SET_PREVIEW_THEME', css: previewThemeCss(getAppTheme(savedAppThemeId())) }
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
