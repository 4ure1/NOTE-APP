import React, { useState, useEffect, useMemo } from 'react'
import { askConfirm } from './ConfirmDialog'
import Modal from './Modal'
import { APP_THEMES } from '../../../shared/appThemes'
import { savedAppThemeId, setAppTheme } from '../utils/appTheme'
import { Snippet } from '../types/snippets'
import { getSnippetBodyText } from '../utils/snippetEngine'
import { notifyApiError } from '../utils/apiError'
import { findConflict } from '../../../shared/shortcuts'
import { APP_NAME, AUTHOR, AUTHOR_GITHUB, COPYRIGHT } from '../utils/credits'
import {
  BrainIcon,
  ChatGPTIcon,
  CheckIcon,
  ClaudeIcon,
  CodeIcon,
  FolderIcon,
  GeminiIcon,
  InfoIcon,
  KeyboardIcon,
  PaletteIcon,
  SearchIcon,
  SettingsIcon,
  SlashSquareIcon,
  SparklesIcon,
  XIcon
} from './Icons'

export interface ShortcutMapping {
  uuid: string
  actionId: string
  key: string
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  snippets: Snippet[]
  shortcuts: ShortcutMapping[]
  setShortcuts: React.Dispatch<React.SetStateAction<ShortcutMapping[]>>
  defaultShortcuts: ShortcutMapping[]
  actions: Record<string, string>
  formatShortcut: (s: ShortcutMapping) => string
  activeAI: string
  onSelectAI: (ai: 'agent' | 'claude' | 'chatgpt' | 'gemini') => void
  editorMode: 'preview' | 'live' | 'edit'
  onChangeEditorMode: (mode: 'preview' | 'live' | 'edit') => void
  zoomLevel: number
  onSetZoomLevel: (zoom: number) => void
  notesCount: number
  onEmptyTrash: () => Promise<boolean>
}

type SettingsTab =
  | 'general'
  | 'appearance'
  | 'editor'
  | 'vault'
  | 'snippets'
  | 'shortcuts'
  | 'ai'
  | 'about'

const APP_VERSION = '1.0.0'

type NavIcon = (props: { size?: number }) => React.ReactNode

// Rubriques de la fenêtre ; `keywords` sert à la recherche « Rechercher un réglage »
const NAV_GROUPS: {
  label: string
  items: { id: SettingsTab; label: string; icon: NavIcon; keywords: string }[]
}[] = [
  {
    label: 'Application',
    items: [
      {
        id: 'general',
        label: 'Général',
        icon: SettingsIcon,
        keywords: 'version visite aide github'
      },
      {
        id: 'appearance',
        label: 'Apparence',
        icon: PaletteIcon,
        keywords: 'thème couleur police zoom texte'
      },
      {
        id: 'editor',
        label: 'Éditeur',
        icon: CodeIcon,
        keywords: 'disposition code aperçu côte à côte'
      },
      {
        id: 'vault',
        label: 'Dossier de notes',
        icon: FolderIcon,
        keywords: 'coffre corbeille historique emplacement'
      }
    ]
  },
  {
    label: 'Outils',
    items: [
      { id: 'snippets', label: 'Snippets', icon: SlashSquareIcon, keywords: 'aide blocs insérer' },
      {
        id: 'shortcuts',
        label: 'Raccourcis clavier',
        icon: KeyboardIcon,
        keywords: 'touches clavier'
      },
      {
        id: 'ai',
        label: 'Intelligence artificielle',
        icon: SparklesIcon,
        keywords: 'ia claude chatgpt gemini ollama agent modèle'
      }
    ]
  },
  {
    label: APP_NAME,
    items: [{ id: 'about', label: 'À propos', icon: InfoIcon, keywords: 'auteur licence' }]
  }
]

const CATEGORY_COLORS: Record<string, string> = {
  Structure: '#60a5fa',
  Blocs: '#34d399',
  'Mise en page': '#a78bfa',
  Code: '#f59e0b',
  Texte: '#38bdf8',
  Quiz: '#f43f5e',
  Markdown: '#fb923c',
  Divers: '#94a3b8'
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  snippets,
  shortcuts,
  setShortcuts,
  defaultShortcuts,
  actions,
  formatShortcut,
  activeAI,
  onSelectAI,
  editorMode,
  onChangeEditorMode,
  zoomLevel,
  onSetZoomLevel,
  notesCount,
  onEmptyTrash
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')

  const [navQuery, setNavQuery] = useState('')
  const [appSetup, setAppSetup] = useState<{ notesDir: string; fromEnv: boolean } | null>(null)

  // État onglet Snippets
  const [snippetSearch, setSnippetSearch] = useState('')
  const [snippetScopeFilter, setSnippetScopeFilter] = useState<'all' | 'html' | 'markdown'>('all')
  const [snippetCategoryFilter, setSnippetCategoryFilter] = useState<string>('all')
  const [expandedSnippetPrefix, setExpandedSnippetPrefix] = useState<string | null>(null)
  const [copiedPrefix, setCopiedPrefix] = useState<string | null>(null)

  // État onglet Raccourcis
  const [recordingUuid, setRecordingUuid] = useState<string | null>(null)

  // État onglet IA
  const [ollamaStatus, setOllamaStatus] = useState<{
    online: boolean
    models: string[]
    defaultModel: string | null
  } | null>(null)
  const [ollamaApiKey, setOllamaApiKey] = useState('')
  const [isApiKeySaved, setIsApiKeySaved] = useState(false)
  const [ollamaModel, setOllamaModel] = useState('qwen2.5:7b-instruct')

  // Chargement des configs enregistrées (Ollama API Key, etc.)
  useEffect(() => {
    if (isOpen) {
      ;(async () => {
        try {
          if (window.api?.getConfig) {
            const cfg = await window.api.getConfig()
            if (cfg?.ollamaApiKey) setOllamaApiKey(cfg.ollamaApiKey)
            if (cfg?.ollamaModel) setOllamaModel(cfg.ollamaModel)
          }
          const setup = await window.api.getAppSetup()
          setAppSetup({ notesDir: setup.notesDir, fromEnv: setup.fromEnv })
          if (window.api?.aiOllamaStatus) {
            const status = await window.api.aiOllamaStatus()
            setOllamaStatus(status)
          }
        } catch (err) {
          console.error('Error loading config in settings:', err)
        }
      })()
    }
  }, [isOpen])

  // Gestion des raccourcis clavier dans la modale
  useEffect(() => {
    if (!recordingUuid || !isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return

      let key = e.key
      if (key === ' ') key = 'Space'

      setShortcuts((prev) => {
        const updated = prev.map((m) =>
          m.uuid === recordingUuid
            ? {
                ...m,
                key,
                ctrlKey: e.ctrlKey || e.metaKey,
                shiftKey: e.shiftKey,
                altKey: e.altKey
              }
            : m
        )
        localStorage.setItem('note-app-shortcuts', JSON.stringify(updated))
        return updated
      })

      setRecordingUuid(null)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [recordingUuid, isOpen, setShortcuts])

  // Filtrage des snippets
  const allCategories = useMemo(() => {
    const set = new Set<string>()
    snippets.forEach((s) => set.add(s.category || 'Autres'))
    return Array.from(set).sort()
  }, [snippets])

  const filteredSnippets = useMemo(() => {
    const q = snippetSearch.trim().toLowerCase()
    return snippets.filter((s) => {
      // Filtre scope
      if (snippetScopeFilter !== 'all') {
        if (snippetScopeFilter === 'html' && s.scope !== 'html' && s.scope !== 'all') return false
        if (snippetScopeFilter === 'markdown' && s.scope !== 'markdown' && s.scope !== 'all')
          return false
      }
      // Filtre catégorie
      if (snippetCategoryFilter !== 'all' && s.category !== snippetCategoryFilter) {
        return false
      }
      // Filtre texte (prefix, nom, description)
      if (!q) return true
      return (
        s.prefix.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q))
      )
    })
  }, [snippets, snippetSearch, snippetScopeFilter, snippetCategoryFilter])

  const handleCopyPrefix = (prefix: string) => {
    navigator.clipboard.writeText('/' + prefix)
    setCopiedPrefix(prefix)
    setTimeout(() => setCopiedPrefix(null), 1800)
  }

  const handleSaveApiKey = async () => {
    try {
      const clean = ollamaApiKey.trim()
      localStorage.setItem('ollama_api_key', clean)
      if (window.api?.getConfig && window.api?.saveConfig) {
        const cfg = (await window.api.getConfig()) || {}
        await window.api.saveConfig({ ...cfg, ollamaApiKey: clean, ollamaModel })
      }
      setIsApiKeySaved(true)
      setTimeout(() => setIsApiKeySaved(false), 2200)
    } catch (err) {
      console.error('Error saving API key:', err)
    }
  }

  const [appThemeId, setAppThemeId] = useState(savedAppThemeId)

  // Échap ferme (sauf pendant l'enregistrement d'un raccourci : la capture de la touche l'intercepte avant)
  const handleDismiss = (): void => {
    setRecordingUuid(null)
    onClose()
  }

  if (!isOpen) return null

  const normalize = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const query = normalize(navQuery.trim())
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !query || normalize(item.label + ' ' + item.keywords).includes(query)
    )
  })).filter((group) => group.items.length > 0)
  const badges: Partial<Record<SettingsTab, number>> = {
    snippets: snippets.length,
    shortcuts: shortcuts.length
  }
  const activeLabel =
    NAV_GROUPS.flatMap((g) => g.items).find((item) => item.id === activeTab)?.label || ''

  const changeNotesFolder = async (): Promise<void> => {
    try {
      const picked = await window.api.chooseNotesFolder()
      if (!picked.success) {
        if (!picked.canceled && picked.error)
          notifyApiError('Dossier de notes', new Error(picked.error))
        return
      }
      const ok = await askConfirm({
        title: 'Changer de dossier de notes ?',
        message: `NOTE-APP va redémarrer sur ${picked.path}. Les notes de l’ancien dossier restent où elles sont.`,
        confirmLabel: 'Changer et redémarrer'
      })
      if (!ok) return
      const res = await window.api.finishAppSetup(picked.path)
      if (!res.success) notifyApiError('Dossier de notes', new Error(res.error))
    } catch (err) {
      notifyApiError('Dossier de notes', err)
    }
  }

  const row = (
    title: string,
    desc: React.ReactNode,
    control?: React.ReactNode
  ): React.ReactNode => (
    <div className="st-row">
      <div className="st-row-text">
        <div className="st-row-title">{title}</div>
        <div className="st-row-desc">{desc}</div>
      </div>
      {control}
    </div>
  )

  return (
    <Modal
      labelledBy="settings-modal-title"
      onClose={handleDismiss}
      initialFocus="first"
      panelStyle={{ maxWidth: '980px', height: '660px', maxHeight: '88vh' }}
    >
      <div className="st-layout">
        <nav className="st-nav" aria-label="Rubriques des paramètres">
          <label className="st-search">
            <SearchIcon size={15} />
            <input
              value={navQuery}
              onChange={(e) => setNavQuery(e.target.value)}
              placeholder="Rechercher un réglage"
              aria-label="Rechercher un réglage"
            />
          </label>
          {visibleGroups.map((group) => (
            <React.Fragment key={group.label}>
              <div className="st-group-label">{group.label}</div>
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    className="st-item"
                    aria-current={activeTab === item.id ? 'page' : undefined}
                    onClick={() => setActiveTab(item.id)}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                    {badges[item.id] !== undefined && (
                      <span className="st-badge">{badges[item.id]}</span>
                    )}
                  </button>
                )
              })}
            </React.Fragment>
          ))}
          {visibleGroups.length === 0 && <div className="st-empty">Aucun réglage trouvé.</div>}
          <div className="st-foot">
            Version {APP_VERSION}
            <br />
            Par {AUTHOR}
          </div>
        </nav>

        <section className="st-main">
          <header className="st-head">
            <h2 id="settings-modal-title">{activeLabel}</h2>
            <button
              className="st-close"
              onClick={handleDismiss}
              aria-label="Fermer"
              title="Fermer (Échap)"
            >
              <XIcon size={16} />
            </button>
          </header>
          <div className="st-scroll">
            {/* ---------------- GÉNÉRAL ---------------- */}
            {activeTab === 'general' && (
              <>
                <div className="st-section">
                  <h3>{APP_NAME}</h3>
                  <div className="st-card">
                    {row(
                      `Version ${APP_VERSION}`,
                      `Par ${AUTHOR}. Application locale : vos notes restent dans votre dossier, sans compte ni synchronisation.`,
                      <div className="st-actions">
                        <button
                          className="st-btn"
                          title={AUTHOR_GITHUB}
                          onClick={() => {
                            window.api.openExternalUrl(AUTHOR_GITHUB).catch((err: unknown) => {
                              console.error('[Settings]', err)
                            })
                          }}
                        >
                          GitHub
                        </button>
                        <button className="st-btn" onClick={() => setActiveTab('about')}>
                          À propos
                        </button>
                      </div>
                    )}
                    {row(
                      'Snippets',
                      'Tapez « / » dans une note pour insérer un bloc. La liste complète et leurs raccourcis sont ici.',
                      <button className="st-btn" onClick={() => setActiveTab('snippets')}>
                        Voir les snippets
                      </button>
                    )}
                    {row(
                      'Visite guidée',
                      'Revoir la présentation de l’app, comme au premier lancement.',
                      <button
                        className="st-btn"
                        onClick={() => {
                          handleDismiss()
                          window.dispatchEvent(new Event('nf-open-tour'))
                        }}
                      >
                        Relancer
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ---------------- APPARENCE ---------------- */}
            {activeTab === 'appearance' && (
              <>
                <div className="st-section">
                  <h3 id="settings-theme-label">Thème</h3>
                  <p className="st-lead">
                    S’applique à l’app et à l’aperçu. Vos notes et leurs exports ne changent pas.
                  </p>
                  <div className="st-card">
                    <div
                      className="st-themes"
                      role="radiogroup"
                      aria-labelledby="settings-theme-label"
                    >
                      {APP_THEMES.map((theme) => {
                        const active = theme.id === appThemeId
                        return (
                          <button
                            key={theme.id}
                            className="st-theme"
                            role="radio"
                            aria-checked={active}
                            onClick={() => {
                              setAppTheme(theme.id)
                              setAppThemeId(theme.id)
                            }}
                          >
                            <span
                              className="st-theme-mini"
                              aria-hidden="true"
                              style={{ background: theme.colors.app, color: theme.colors.text }}
                            >
                              <span style={{ background: theme.colors.panel }} />
                              <span className="st-theme-lines">
                                <i
                                  style={{
                                    background: theme.colors.marge,
                                    opacity: 1,
                                    width: '60%'
                                  }}
                                />
                                <i />
                                <i style={{ width: '80%' }} />
                                <i style={{ width: '50%' }} />
                              </span>
                            </span>
                            <span className="st-theme-name">
                              {theme.label}
                              {active && <CheckIcon size={14} />}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
                <div className="st-section">
                  <h3>Texte</h3>
                  <div className="st-card">
                    {row(
                      'Police de l’interface',
                      'Inter, embarquée dans l’app. Le contenu des notes garde la police de son thème, le code reste en Consolas.'
                    )}
                    {row(
                      'Zoom de l’éditeur',
                      'Taille du texte dans l’éditeur et l’aperçu. Un clic sur la valeur revient à 100 %.',
                      <div className="st-stepper">
                        <button
                          onClick={() => onSetZoomLevel(Math.max(50, zoomLevel - 10))}
                          aria-label="Réduire le zoom"
                        >
                          −
                        </button>
                        <button
                          className="st-value"
                          onClick={() => onSetZoomLevel(100)}
                          title="Revenir à 100 %"
                        >
                          {zoomLevel} %
                        </button>
                        <button
                          onClick={() => onSetZoomLevel(Math.min(250, zoomLevel + 10))}
                          aria-label="Augmenter le zoom"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ---------------- ÉDITEUR ---------------- */}
            {activeTab === 'editor' && (
              <div className="st-section">
                <h3>Disposition</h3>
                <div className="st-card">
                  {row(
                    'Disposition des notes HTML',
                    'Code seul, code et aperçu côte à côte, ou aperçu seul. Les notes Markdown ont leur propre éditeur.',
                    <div className="st-seg" role="group" aria-label="Disposition">
                      {(
                        [
                          { id: 'edit', label: 'Code' },
                          { id: 'live', label: 'Côte à côte' },
                          { id: 'preview', label: 'Aperçu' }
                        ] as const
                      ).map((mode) => (
                        <button
                          key={mode.id}
                          aria-pressed={editorMode === mode.id}
                          onClick={() => onChangeEditorMode(mode.id)}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {row(
                    'Raccourcis clavier',
                    `${shortcuts.length} raccourcis, tous modifiables.`,
                    <button className="st-btn" onClick={() => setActiveTab('shortcuts')}>
                      Modifier
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ---------------- DOSSIER DE NOTES ---------------- */}
            {activeTab === 'vault' && (
              <>
                <div className="st-section">
                  <h3>Emplacement</h3>
                  <div className="st-card">
                    {row(
                      'Dossier de notes',
                      <>
                        {notesCount} note(s). Tout ce que l’app enregistre (corbeille, historique,
                        thème des notes) est rangé dans ce dossier.
                        {appSetup && <code className="st-path">{appSetup.notesDir}</code>}
                      </>,
                      <button
                        className="st-btn"
                        onClick={changeNotesFolder}
                        disabled={!appSetup || appSetup.fromEnv}
                        title={
                          appSetup?.fromEnv
                            ? 'Mode test : le dossier est imposé par NOTE_APP_NOTES_DIR'
                            : undefined
                        }
                      >
                        Changer de dossier…
                      </button>
                    )}
                  </div>
                </div>
                <div className="st-section">
                  <h3>Sauvegarde</h3>
                  <div className="st-card">
                    {row(
                      'Historique des versions',
                      'Un instantané par note au plus toutes les 90 secondes, dans .history. Ouvrez-le avec le bouton Historique d’une note.'
                    )}
                    {row(
                      'Corbeille',
                      'Une note supprimée y reste jusqu’à ce que vous la vidiez.',
                      <button
                        className="st-btn danger"
                        onClick={async () => {
                          if (
                            await askConfirm({
                              title: 'Vider la corbeille ?',
                              message: 'Les notes seront supprimées définitivement.',
                              confirmLabel: 'Vider la corbeille',
                              danger: true
                            })
                          ) {
                            await onEmptyTrash()
                          }
                        }}
                      >
                        Vider la corbeille
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ---------------- ONGLET 1 : AIDE & SNIPPETS ---------------- */}
            {activeTab === 'snippets' && (
              <div>
                <div style={{ marginBottom: '16px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <h3
                      style={{
                        margin: '0 0 4px',
                        fontSize: 'var(--fs-md)',
                        fontWeight: 600,
                        color: 'var(--text-strong)'
                      }}
                    >
                      Catalogue des Snippets ({snippets.length})
                    </h3>
                    <span
                      style={{
                        fontSize: 'var(--fs-xs)',
                        background: 'var(--surface-input)',
                        color: 'var(--text-primary)',
                        padding: '3px 8px',
                        borderRadius: '6px'
                      }}
                    >
                      Déclencheur : <strong style={{ color: 'var(--accent-color)' }}>/</strong>
                    </span>
                  </div>
                  <p
                    style={{
                      margin: '0 0 12px',
                      fontSize: 'var(--fs-md)',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.5
                    }}
                  >
                    Tapez{' '}
                    <code
                      style={{
                        color: 'var(--accent-amber)',
                        background: 'var(--surface-input)',
                        padding: '1px 4px',
                        borderRadius: 3
                      }}
                    >
                      /
                    </code>{' '}
                    dans l’éditeur pour ouvrir la palette instantanée. Utilisez{' '}
                    <code
                      style={{
                        color: 'var(--accent-color)',
                        background: 'var(--surface-input)',
                        padding: '1px 4px',
                        borderRadius: 3
                      }}
                    >
                      Tab
                    </code>{' '}
                    pour naviguer entre les champs modifiables.
                  </p>

                  {/* ASTUCE SUR LE FICHIER DU COFFRE */}
                  <div
                    style={{
                      background: 'color-mix(in srgb, var(--accent-color) 8%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--accent-color) 20%, transparent)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      fontSize: 'var(--fs-sm)',
                      color: '#bae6fd',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '16px'
                    }}
                  >
                    <span>
                      📁 Fichier personnalisable : <strong>.snippets/snippets.json</strong> dans
                      votre coffre Notes (rechargement à chaud automatique).
                    </span>
                    {window.api?.showItemInFolder && (
                      <button
                        onClick={() =>
                          window.api
                            .showItemInFolder('.snippets')
                            .catch((err) => notifyApiError("Affichage dans l'Explorateur", err))
                        }
                        style={{
                          background: 'color-mix(in srgb, var(--accent-color) 20%, transparent)',
                          border: 'none',
                          color: 'var(--accent-color)',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: 'var(--fs-xs)',
                          cursor: 'pointer',
                          fontWeight: 500
                        }}
                      >
                        Ouvrir le dossier
                      </button>
                    )}
                  </div>

                  {/* BARRE DE RECHERCHE ET FILTRES */}
                  <div
                    style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}
                  >
                    <input
                      type="text"
                      aria-label="Filtrer les snippets"
                      value={snippetSearch}
                      onChange={(e) => setSnippetSearch(e.target.value)}
                      placeholder="Filtrer par préfixe, nom ou description..."
                      style={{
                        flex: 1,
                        minWidth: '220px',
                        background: 'var(--surface-control)',
                        border: '1px solid var(--border-strong)',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        color: 'var(--text-strong)',
                        fontSize: 'var(--fs-md)',
                        outline: 'none'
                      }}
                    />

                    {/* Filtre de Scope */}
                    <div
                      style={{
                        display: 'flex',
                        background: 'var(--surface-control)',
                        borderRadius: '6px',
                        padding: '2px',
                        border: '1px solid var(--border-strong)'
                      }}
                    >
                      {(['all', 'html', 'markdown'] as const).map((sc) => (
                        <button
                          key={sc}
                          onClick={() => setSnippetScopeFilter(sc)}
                          style={{
                            background:
                              snippetScopeFilter === sc ? 'var(--accent-color)' : 'transparent',
                            color:
                              snippetScopeFilter === sc
                                ? 'var(--surface-sunken)'
                                : 'var(--text-secondary)',
                            border: 'none',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: 'var(--fs-sm)',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          {sc === 'all' ? 'Tous' : sc.toUpperCase()}
                        </button>
                      ))}
                    </div>

                    {/* Filtre de Catégorie */}
                    <select
                      aria-label="Catégorie de snippets"
                      value={snippetCategoryFilter}
                      onChange={(e) => setSnippetCategoryFilter(e.target.value)}
                      style={{
                        background: 'var(--surface-control)',
                        border: '1px solid var(--border-strong)',
                        borderRadius: '6px',
                        color: 'var(--text-secondary)',
                        fontSize: 'var(--fs-sm)',
                        padding: '6px 10px',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="all">Toutes catégories</option>
                      {allCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* LISTE DES SNIPPETS */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    maxHeight: '380px',
                    overflowY: 'auto'
                  }}
                >
                  {filteredSnippets.length === 0 ? (
                    <div
                      style={{
                        textAlign: 'center',
                        padding: '30px',
                        color: 'var(--text-muted)',
                        fontSize: 'var(--fs-md)'
                      }}
                    >
                      Aucun snippet ne correspond aux filtres.
                    </div>
                  ) : (
                    filteredSnippets.map((s) => {
                      const isExpanded = expandedSnippetPrefix === s.prefix
                      const catColor = CATEGORY_COLORS[s.category] || '#94a3b8'
                      const isCopied = copiedPrefix === s.prefix

                      return (
                        <div
                          key={s.prefix + s.name}
                          style={{
                            background: 'var(--surface-control)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            padding: '10px 14px',
                            transition: 'border-color 0.15s'
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '10px'
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                flex: 1,
                                minWidth: 0
                              }}
                            >
                              {/* Préfixe à copier */}
                              <button
                                onClick={() => handleCopyPrefix(s.prefix)}
                                title="Cliquer pour copier le préfixe"
                                style={{
                                  background: isCopied
                                    ? 'var(--success-strong)'
                                    : 'var(--surface-input)',
                                  color: isCopied ? 'var(--text-strong)' : 'var(--accent-amber)',
                                  border: '1px solid var(--border-color)',
                                  borderRadius: '4px',
                                  padding: '3px 8px',
                                  fontFamily: 'Consolas, monospace',
                                  fontSize: 'var(--fs-sm)',
                                  fontWeight: 'bold',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                /{s.prefix}
                                {isCopied && <span style={{ fontSize: 'var(--fs-xs)' }}>✓</span>}
                              </button>

                              {/* Nom et description */}
                              <div style={{ minWidth: 0 }}>
                                <div
                                  style={{
                                    fontSize: 'var(--fs-md)',
                                    fontWeight: 600,
                                    color: 'var(--text-strong)'
                                  }}
                                >
                                  {s.name}
                                </div>
                                <div
                                  style={{
                                    fontSize: 'var(--fs-sm)',
                                    color: 'var(--text-secondary)'
                                  }}
                                >
                                  {s.description}
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {/* Badge catégorie */}
                              <span
                                style={{
                                  fontSize: 'var(--fs-xs)',
                                  color: catColor,
                                  background: `${catColor}18`,
                                  border: `1px solid ${catColor}40`,
                                  padding: '2px 7px',
                                  borderRadius: '12px',
                                  fontWeight: 600
                                }}
                              >
                                {s.category}
                              </span>

                              {/* Badge scope */}
                              <span
                                style={{
                                  fontSize: 'var(--fs-xs)',
                                  color:
                                    s.scope === 'html'
                                      ? '#60a5fa'
                                      : s.scope === 'markdown'
                                        ? '#fb923c'
                                        : 'var(--text-secondary)',
                                  background: 'var(--surface-input)',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontWeight: 500
                                }}
                              >
                                {s.scope.toUpperCase()}
                              </span>

                              {/* Bouton déplier code */}
                              <button
                                onClick={() =>
                                  setExpandedSnippetPrefix(isExpanded ? null : s.prefix)
                                }
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--text-secondary)',
                                  fontSize: 'var(--fs-xs)',
                                  cursor: 'pointer',
                                  padding: '3px 6px',
                                  borderRadius: '4px'
                                }}
                              >
                                {isExpanded ? '▲ Masquer' : '▼ Code'}
                              </button>
                            </div>
                          </div>

                          {/* Aperçu du code / body */}
                          {isExpanded && (
                            <pre
                              style={{
                                marginTop: '10px',
                                background: 'var(--surface-panel)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '6px',
                                padding: '10px',
                                fontSize: 'var(--fs-xs)',
                                color: 'var(--text-primary)',
                                overflowX: 'auto',
                                maxHeight: '180px',
                                whiteSpace: 'pre-wrap'
                              }}
                            >
                              {getSnippetBodyText(s.body)}
                            </pre>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}

            {/* ---------------- ONGLET 2 : RACCOURCIS CLAVIER ---------------- */}
            {activeTab === 'shortcuts' && (
              <div>
                <div style={{ marginBottom: '16px' }}>
                  <p
                    style={{ margin: 0, fontSize: 'var(--fs-md)', color: 'var(--text-secondary)' }}
                  >
                    Cliquez sur Modifier puis appuyez sur la combinaison voulue. Ils marchent aussi
                    dans l’aperçu et dans les panneaux Claude, ChatGPT, Gemini et YouTube. Ctrl+F
                    reste la recherche dans la note.
                  </p>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    maxHeight: '420px',
                    overflowY: 'auto'
                  }}
                >
                  {shortcuts.map((s) => (
                    <div
                      key={s.uuid}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        backgroundColor: 'var(--surface-control)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px'
                      }}
                    >
                      <select
                        aria-label="Action du raccourci"
                        value={s.actionId}
                        onChange={(e) => {
                          const newAction = e.target.value
                          setShortcuts((prev) => {
                            const updated = prev.map((m) =>
                              m.uuid === s.uuid ? { ...m, actionId: newAction } : m
                            )
                            localStorage.setItem('note-app-shortcuts', JSON.stringify(updated))
                            return updated
                          })
                        }}
                        style={{
                          backgroundColor: 'var(--surface-raised)',
                          color: 'var(--text-strong)',
                          border: '1px solid var(--border-strong)',
                          borderRadius: '6px',
                          padding: '6px 10px',
                          fontSize: 'var(--fs-md)',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        {Object.entries(actions).map(([id, label]) => (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        ))}
                      </select>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span
                          style={{
                            backgroundColor:
                              recordingUuid === s.uuid
                                ? 'var(--accent-color)'
                                : 'var(--surface-panel)',
                            color:
                              recordingUuid === s.uuid
                                ? 'var(--surface-sunken)'
                                : 'var(--text-strong)',
                            border: `1px solid ${recordingUuid === s.uuid ? 'var(--accent-color)' : 'var(--border-strong)'}`,
                            borderRadius: '6px',
                            padding: '5px 12px',
                            fontFamily: 'monospace',
                            fontSize: 'var(--fs-sm)',
                            fontWeight: 'bold',
                            minWidth: '120px',
                            textAlign: 'center'
                          }}
                        >
                          {recordingUuid === s.uuid ? 'Appuyez...' : formatShortcut(s)}
                        </span>
                        {(() => {
                          // Même combinaison qu'un autre raccourci : le premier de la liste l'emporte
                          const other =
                            recordingUuid === s.uuid ? undefined : findConflict(shortcuts, s)
                          return other ? (
                            <span className="st-conflict" role="note">
                              Déjà pris par « {actions[other.actionId] || other.actionId} »
                            </span>
                          ) : null
                        })()}

                        <button
                          onClick={() => setRecordingUuid(s.uuid)}
                          style={{
                            backgroundColor: 'var(--surface-input)',
                            color: 'var(--text-strong)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            padding: '6px 12px',
                            fontSize: 'var(--fs-sm)',
                            cursor: 'pointer'
                          }}
                        >
                          Modifier
                        </button>

                        <button
                          onClick={() => {
                            if (recordingUuid === s.uuid) setRecordingUuid(null)
                            setShortcuts((prev) => {
                              const updated = prev.filter((m) => m.uuid !== s.uuid)
                              localStorage.setItem('note-app-shortcuts', JSON.stringify(updated))
                              return updated
                            })
                          }}
                          style={{
                            backgroundColor: 'transparent',
                            color: 'var(--danger-strong)',
                            border:
                              '1px solid color-mix(in srgb, var(--danger-strong) 30%, transparent)',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            fontSize: 'var(--fs-sm)',
                            cursor: 'pointer'
                          }}
                          aria-label="Supprimer ce raccourci"
                          title="Supprimer ce raccourci"
                        >
                          <span aria-hidden="true">✕</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}
                >
                  <button
                    onClick={() => {
                      const newUuid = Math.random().toString()
                      setShortcuts((prev) => {
                        const updated = [
                          ...prev,
                          {
                            uuid: newUuid,
                            actionId: 'create-note',
                            key: '',
                            ctrlKey: false,
                            shiftKey: false,
                            altKey: false
                          }
                        ]
                        localStorage.setItem('note-app-shortcuts', JSON.stringify(updated))
                        return updated
                      })
                      setRecordingUuid(newUuid)
                    }}
                    style={{
                      backgroundColor: 'var(--surface-input)',
                      color: 'var(--accent-color)',
                      border: '1px solid color-mix(in srgb, var(--accent-color) 30%, transparent)',
                      borderRadius: '6px',
                      padding: '8px 14px',
                      fontSize: 'var(--fs-md)',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    + Ajouter un raccourci
                  </button>

                  <button
                    onClick={async () => {
                      if (
                        await askConfirm({
                          title: 'Réinitialiser les raccourcis ?',
                          message: 'Tous les raccourcis reprendront leurs valeurs par défaut.',
                          confirmLabel: 'Réinitialiser'
                        })
                      ) {
                        setShortcuts(defaultShortcuts)
                        localStorage.setItem('note-app-shortcuts', JSON.stringify(defaultShortcuts))
                      }
                    }}
                    style={{
                      backgroundColor: 'transparent',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border-strong)',
                      borderRadius: '6px',
                      padding: '8px 14px',
                      fontSize: 'var(--fs-md)',
                      cursor: 'pointer'
                    }}
                  >
                    Réinitialiser par défaut
                  </button>
                </div>
              </div>
            )}

            {/* ---------------- INTELLIGENCE ARTIFICIELLE ---------------- */}
            {activeTab === 'ai' && (
              <>
                <div className="st-section">
                  <h3 id="settings-ai-label">Assistant ouvert par défaut</h3>
                  <p className="st-lead">
                    Les sites gardent votre connexion. L’agent local tourne sur votre machine avec
                    Ollama.
                  </p>
                  <div className="st-card">
                    <div
                      className="st-providers"
                      role="radiogroup"
                      aria-labelledby="settings-ai-label"
                    >
                      {(
                        [
                          { id: 'claude', label: 'Claude', desc: 'claude.ai', Icon: ClaudeIcon },
                          {
                            id: 'chatgpt',
                            label: 'ChatGPT',
                            desc: 'chatgpt.com',
                            Icon: ChatGPTIcon
                          },
                          {
                            id: 'gemini',
                            label: 'Gemini',
                            desc: 'gemini.google.com',
                            Icon: GeminiIcon
                          },
                          {
                            id: 'agent',
                            label: 'Agent local',
                            desc: 'Ollama, hors ligne',
                            Icon: BrainIcon
                          }
                        ] as const
                      ).map(({ id, label, desc, Icon }) => (
                        <button
                          key={id}
                          className="st-provider"
                          role="radio"
                          aria-checked={activeAI === id}
                          onClick={() => onSelectAI(id)}
                        >
                          <span className="st-provider-name">
                            <Icon size={16} />
                            {label}
                          </span>
                          <span className="st-provider-desc">{desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="st-section">
                  <h3>Agent local (Ollama)</h3>
                  <div className="st-card">
                    {row(
                      'État du serveur',
                      'http://localhost:11434',
                      <span className="st-status">
                        <span className={'st-dot' + (ollamaStatus?.online ? ' ok' : '')} />
                        {ollamaStatus === null
                          ? 'Vérification…'
                          : ollamaStatus.online
                            ? `En marche, ${ollamaStatus.models.length} modèle(s) installé(s)`
                            : 'Non détecté'}
                      </span>
                    )}
                    {row(
                      'Modèle',
                      'Utilisé par l’agent. Enregistré avec la clé ci-dessous.',
                      <input
                        id="settings-ollama-model"
                        className="st-input"
                        aria-label="Modèle Ollama"
                        value={ollamaModel}
                        onChange={(e) => setOllamaModel(e.target.value)}
                        placeholder="qwen2.5:7b-instruct"
                        style={{ width: '220px' }}
                      />
                    )}
                    {row(
                      'Clé API web Ollama',
                      'Facultative, pour la recherche web de l’agent. Sans crédit, l’agent passe au moteur web public.',
                      <div className="st-actions">
                        <input
                          id="settings-ollama-key"
                          className="st-input"
                          type="password"
                          aria-label="Clé API web Ollama"
                          value={ollamaApiKey}
                          onChange={(e) => setOllamaApiKey(e.target.value)}
                          placeholder="Clé API"
                          style={{ width: '160px' }}
                        />
                        <button className="st-btn" onClick={handleSaveApiKey}>
                          {isApiKeySaved ? 'Enregistré' : 'Enregistrer'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ---------------- À PROPOS ---------------- */}
            {activeTab === 'about' && (
              <>
                <div className="st-section">
                  <h3>{APP_NAME}</h3>
                  <div className="st-card">
                    {row(
                      `Version ${APP_VERSION}`,
                      COPYRIGHT,
                      <button
                        className="st-btn"
                        title={AUTHOR_GITHUB}
                        onClick={() => {
                          window.api.openExternalUrl(AUTHOR_GITHUB).catch((err: unknown) => {
                            console.error('[Settings]', err)
                          })
                        }}
                      >
                        github.com/{AUTHOR.toLowerCase()}
                      </button>
                    )}
                  </div>
                </div>
                <div className="st-section">
                  <h3>Ce que fait l’app</h3>
                  <div className="st-card">
                    <ul className="st-about-list">
                      <li>Notes HTML et Markdown, éditées dans Monaco avec un aperçu éditable.</li>
                      <li>Snippets « / » avec champs à remplir au clavier (Tab, Maj+Tab).</li>
                      <li>PDF importés, surlignés et cités dans les notes.</li>
                      <li>YouTube, tableau de suivi, historique des versions et corbeille.</li>
                      <li>
                        Claude, ChatGPT, Gemini et un agent local Ollama, à côté de vos notes.
                      </li>
                    </ul>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </Modal>
  )
}
