/**
 * Thèmes de l'interface. Chaque thème remplace les tokens de base.css ; `graphite` reprend leurs
 * valeurs. Tous sont sombres : le thème des notes (theme.css) l'est aussi, et un thème clair
 * demanderait de le revoir. Dans l'aperçu, le fond et les cartes suivent le thème sans toucher aux
 * fichiers de notes (feuille d'aide retirée à l'enregistrement).
 */
export interface AppTheme {
  id: string
  label: string
  /** Couleurs de base : le reste des tokens en découle (voir themeVariables). */
  colors: {
    app: string
    panel: string
    code: string
    page: string
    raised: string
    hover: string
    active: string
    sunken: string
    border: string
    text: string
    textSecondary: string
    textMuted: string
    marge: string
    accent: string
    accentHover: string
    accentStrong: string
  }
}

export const DEFAULT_APP_THEME = 'graphite'

export const APP_THEMES: AppTheme[] = [
  {
    id: 'graphite',
    label: 'Graphite',
    colors: {
      app: '#19191a',
      panel: '#1f1f20',
      code: '#1e1e1e',
      page: '#252526',
      raised: '#252526',
      hover: '#2a2a2c',
      active: '#303033',
      sunken: '#161617',
      border: '#3e3e42',
      text: '#e6e4df',
      textSecondary: '#b0afab',
      textMuted: '#9a9995',
      marge: '#e45a6b',
      accent: '#84b4ff',
      accentHover: '#a9caff',
      accentStrong: '#3a6fd8'
    }
  },
  {
    id: 'nuit',
    label: 'Nuit',
    colors: {
      app: '#10131c',
      panel: '#151a27',
      code: '#131724',
      page: '#181d2c',
      raised: '#1b2133',
      hover: '#222a40',
      active: '#2a3350',
      sunken: '#0e111a',
      border: '#38425f',
      text: '#e8e6df',
      textSecondary: '#aeb4c4',
      textMuted: '#a3abc0',
      marge: '#ec5b73',
      accent: '#8fb4ff',
      accentHover: '#b0caff',
      accentStrong: '#3a6fd8'
    }
  },
  {
    id: 'foret',
    label: 'Forêt',
    colors: {
      app: '#121815',
      panel: '#171f1b',
      code: '#141b17',
      page: '#1a231e',
      raised: '#1f2a24',
      hover: '#26332c',
      active: '#2e3d34',
      sunken: '#0f1411',
      border: '#3c4f44',
      text: '#e4e8e1',
      textSecondary: '#b0bbb0',
      textMuted: '#a3b1a5',
      marge: '#e0a458',
      accent: '#7fcfa3',
      accentHover: '#a3e0bf',
      accentStrong: '#2a7d55'
    }
  },
  {
    id: 'sepia',
    label: 'Sépia',
    colors: {
      app: '#1a1613',
      panel: '#201b17',
      code: '#1d1815',
      page: '#241e19',
      raised: '#2b241e',
      hover: '#332b24',
      active: '#3c332a',
      sunken: '#15110e',
      border: '#4d4236',
      text: '#ece4d6',
      textSecondary: '#bdb09c',
      textMuted: '#b3a692',
      marge: '#e0795a',
      accent: '#e3b27a',
      accentHover: '#f0cb9f',
      accentStrong: '#a8622c'
    }
  },
  {
    id: 'aubergine',
    label: 'Aubergine',
    colors: {
      app: '#17131c',
      panel: '#1d1824',
      code: '#1a1521',
      page: '#211b29',
      raised: '#272030',
      hover: '#2f273a',
      active: '#383045',
      sunken: '#120f16',
      border: '#4a4059',
      text: '#ebe6ef',
      textSecondary: '#b9afc4',
      textMuted: '#aea4ba',
      marge: '#ff7ab2',
      accent: '#c8a6ff',
      accentHover: '#dcc6ff',
      accentStrong: '#7c4ddb'
    }
  }
]

export function getAppTheme(id: string | null | undefined): AppTheme {
  return APP_THEMES.find((theme) => theme.id === id) ?? APP_THEMES[0]
}

/** Tokens CSS de base.css remplacés par ce thème. */
export function themeVariables(theme: AppTheme): Record<string, string> {
  const c = theme.colors
  return {
    '--app-bg': c.app,
    '--sidebar-bg': c.panel,
    '--editor-bg': c.code,
    '--page-bg': c.page,
    '--element-bg': c.raised,
    '--element-bg-hover': c.hover,
    '--element-active': c.active,
    '--surface-sunken': c.sunken,
    '--surface-panel': c.panel,
    '--surface-raised': c.raised,
    '--surface-control': c.hover,
    '--surface-input': c.active,
    '--border-strong': c.border,
    '--text-primary': c.text,
    '--text-secondary': c.textSecondary,
    '--text-muted': c.textMuted,
    '--accent-color': c.accent,
    '--accent-color-hover': c.accentHover,
    '--accent-marge': c.marge,
    '--accent-strong': c.accentStrong
  }
}

/** Feuille d'aide de l'aperçu ; vide pour le thème par défaut (la note garde son rendu d'origine). */
export function previewThemeCss(theme: AppTheme): string {
  if (theme.id === DEFAULT_APP_THEME) return ''
  const c = theme.colors
  return (
    `:root{--bg:${c.code};--card:${c.raised};--border:${c.border};}` +
    `body{background:${c.page} !important;}` +
    `pre{background:${c.code} !important;}`
  )
}
