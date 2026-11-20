import React, { useState, useEffect, useMemo } from 'react'
import { askConfirm } from './ConfirmDialog'
import Modal from './Modal'
import VaultManager from './VaultManager'
import { APP_THEMES } from '../../../shared/appThemes'
import { savedAppThemeId, savedNoteFontId, setAppTheme, setNoteFont } from '../utils/appTheme'
import { NOTE_FONTS } from '../../../shared/noteFonts'
import { Snippet } from '../types/snippets'
import { getSnippetBodyText } from '../utils/snippetEngine'
import { notifyApiError } from '../utils/apiError'
import {
  SHORTCUT_ACTIONS,
  SHORTCUT_GROUPS,
  findConflict,
  formatShortcut as formatShortcutLabel,
  sameCombo
} from '../../../shared/shortcuts'
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
        label: 'Coffres',
        icon: FolderIcon,
        keywords: 'coffre coffres dossier de notes corbeille historique emplacement'
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

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  snippets,
  shortcuts,
  setShortcuts,
  defaultShortcuts,
  actions,
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
      if (e.key === 'Escape') {
        setShortcuts((prev) => {
          const item = prev.find((m) => m.uuid === recordingUuid)
          if (!item || item.key) return prev
          const updated = prev.filter((m) => m.uuid !== recordingUuid)
          localStorage.setItem('note-app-shortcuts', JSON.stringify(updated))
          return updated
        })
        setRecordingUuid(null)
        return
      }

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

  const filteredSnippets = useMemo(() => {
    const q = snippetSearch.trim().toLowerCase()
    return snippets.filter((s) => {
      // Filtre scope
      if (snippetScopeFilter !== 'all') {
        if (snippetScopeFilter === 'html' && s.scope !== 'html' && s.scope !== 'all') return false
        if (snippetScopeFilter === 'markdown' && s.scope !== 'markdown' && s.scope !== 'all')
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
  }, [snippets, snippetSearch, snippetScopeFilter])

  // Snippets regroupés par catégorie, dans l'ordre du fichier
  const snippetGroups = useMemo(() => {
    const groups = new Map<string, Snippet[]>()
    filteredSnippets.forEach((sn) => {
      const category = sn.category || 'Autres'
      const list = groups.get(category)
      if (list) list.push(sn)
      else groups.set(category, [sn])
    })
    return Array.from(groups.entries())
  }, [filteredSnippets])

  // ---------- Raccourcis : modification ----------
  const [shortcutQuery, setShortcutQuery] = useState('')
  const persistShortcuts = (updated: ShortcutMapping[]): void => {
    setShortcuts(updated)
    try {
      localStorage.setItem('note-app-shortcuts', JSON.stringify(updated))
    } catch (err) {
      console.error('[Raccourcis]', err)
    }
  }
  const removeShortcut = (uuid: string): void => {
    if (recordingUuid === uuid) setRecordingUuid(null)
    persistShortcuts(shortcuts.filter((m) => m.uuid !== uuid))
  }
  const addShortcut = (actionId: string): void => {
    const uuid = 'u' + Date.now().toString(36)
    persistShortcuts([
      ...shortcuts,
      { uuid, actionId, key: '', ctrlKey: false, shiftKey: false, altKey: false }
    ])
    setRecordingUuid(uuid)
  }
  const resetShortcut = (actionId: string): void => {
    const kept = shortcuts.filter((m) => m.actionId !== actionId)
    const used = new Set(kept.map((m) => m.uuid))
    const defaults = defaultShortcuts
      .filter((m) => m.actionId === actionId)
      .map((m) => {
        let uuid = m.uuid
        while (used.has(uuid)) uuid += '-r'
        used.add(uuid)
        return { ...m, uuid }
      })
    persistShortcuts([...kept, ...defaults])
  }
  const resetAllShortcuts = async (): Promise<void> => {
    const ok = await askConfirm({
      title: 'Rétablir tous les raccourcis ?',
      message: 'Chaque action reprend son raccourci par défaut.',
      confirmLabel: 'Tout rétablir'
    })
    if (ok) persistShortcuts(defaultShortcuts.map((m) => ({ ...m })))
  }
  const sameCombos = (a: ShortcutMapping[], b: ShortcutMapping[]): boolean =>
    a.length === b.length && a.every((m) => b.some((d) => !!m.key && sameCombo(m, d)))

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
  const [noteFontId, setNoteFontId] = useState(savedNoteFontId)

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
                      'Police des notes',
                      'Texte courant de toutes les notes, dans l’aperçu. Vos fichiers ne sont pas modifiés ; titres et code gardent la police du thème.',
                      <select
                        className="st-input"
                        aria-label="Police des notes"
                        value={noteFontId}
                        onChange={(e) => {
                          setNoteFont(e.target.value)
                          setNoteFontId(e.target.value)
                        }}
                        style={{ fontFamily: NOTE_FONTS.find((f) => f.id === noteFontId)?.stack }}
                      >
                        {NOTE_FONTS.map((f) => (
                          <option key={f.id} value={f.id} style={{ fontFamily: f.stack }}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    )}
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
                  <h3>Coffre actif</h3>
                  <div className="st-card">
                    {row(
                      'Dossier de notes',
                      <>
                        {notesCount} note(s). Tout ce que l’app enregistre (corbeille, historique,
                        thème des notes) est rangé dans ce dossier.
                        {appSetup && <code className="st-path">{appSetup.notesDir}</code>}
                      </>
                    )}
                  </div>
                </div>
                <div className="st-section">
                  <h3>Coffres</h3>
                  <p className="vault-lead">
                    Chaque coffre est un dossier de notes. Changer de coffre redémarre l’app ;
                    retirer un coffre de la liste ne supprime aucun fichier.
                  </p>
                  <VaultManager />
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

            {/* ---------------- SNIPPETS ---------------- */}
            {activeTab === 'snippets' && (
              <div className="sk">
                <div className="sk-head">
                  <label className="st-search sk-search">
                    <SearchIcon size={14} />
                    <input
                      value={snippetSearch}
                      onChange={(e) => setSnippetSearch(e.target.value)}
                      placeholder="Filtrer les snippets"
                      aria-label="Filtrer les snippets"
                    />
                  </label>
                  <div className="st-seg" role="group" aria-label="Type de note">
                    {(
                      [
                        ['all', 'Tous'],
                        ['html', 'HTML'],
                        ['markdown', 'Markdown']
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        aria-pressed={snippetScopeFilter === id}
                        onClick={() => setSnippetScopeFilter(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="sk-lead">
                  Tapez <kbd className="sk-key">/</kbd> dans une note, puis{' '}
                  <kbd className="sk-key">Tab</kbd> pour passer d’un champ à l’autre. Les vôtres se
                  modifient dans <code>.snippets/snippets.json</code>
                  {window.api?.showItemInFolder && (
                    <button
                      className="sk-link"
                      onClick={() =>
                        window.api
                          .showItemInFolder('.snippets')
                          .catch((err) => notifyApiError('Affichage dans l’Explorateur', err))
                      }
                    >
                      Ouvrir le dossier
                    </button>
                  )}
                </p>
                {snippetGroups.length === 0 && (
                  <div className="st-empty">Aucun snippet ne correspond à ce filtre.</div>
                )}
                {snippetGroups.map(([category, items]) => (
                  <section key={category} aria-label={category}>
                    <div className="sk-group">
                      {category}
                      <span>{items.length}</span>
                    </div>
                    {items.map((s, i) => {
                      const open = expandedSnippetPrefix === s.prefix
                      return (
                        <React.Fragment key={`${s.prefix}-${i}`}>
                          <div
                            className={'sk-row' + (open ? ' open' : '')}
                            role="button"
                            tabIndex={0}
                            aria-expanded={open}
                            onClick={() => setExpandedSnippetPrefix(open ? null : s.prefix)}
                            onKeyDown={(e) => {
                              if (e.target !== e.currentTarget) return
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                setExpandedSnippetPrefix(open ? null : s.prefix)
                              }
                            }}
                          >
                            <code className="sk-prefix">/{s.prefix}</code>
                            <span className="sk-name">{s.name}</span>
                            <span className="sk-desc">{s.description}</span>
                            <span className="sk-kind">
                              {s.scope === 'markdown'
                                ? 'Markdown'
                                : s.scope === 'html'
                                  ? 'HTML'
                                  : 'Les deux'}
                            </span>
                            <span className="sk-tools">
                              <button
                                className="sk-mini"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleCopyPrefix(s.prefix)
                                }}
                              >
                                {copiedPrefix === s.prefix ? 'Copié' : 'Copier'}
                              </button>
                            </span>
                          </div>
                          {open && <pre className="sk-code">{getSnippetBodyText(s.body)}</pre>}
                        </React.Fragment>
                      )
                    })}
                  </section>
                ))}
              </div>
            )}

            {/* ---------------- RACCOURCIS CLAVIER ---------------- */}
            {activeTab === 'shortcuts' && (
              <div className="sk">
                <div className="sk-head">
                  <label className="st-search sk-search">
                    <SearchIcon size={14} />
                    <input
                      value={shortcutQuery}
                      onChange={(e) => setShortcutQuery(e.target.value)}
                      placeholder="Chercher une action ou une touche"
                      aria-label="Chercher une action ou une touche"
                    />
                  </label>
                  <button className="sk-text-btn" onClick={() => void resetAllShortcuts()}>
                    Tout rétablir
                  </button>
                </div>
                <p className="sk-lead">
                  Cliquez sur une combinaison pour la changer, Échap pour annuler. Ils marchent
                  aussi dans l’aperçu et les panneaux web ; <kbd className="sk-key">Ctrl</kbd>{' '}
                  <kbd className="sk-key">F</kbd> reste la recherche dans la note.
                </p>
                {SHORTCUT_GROUPS.map((group) => {
                  const q = shortcutQuery.trim().toLowerCase()
                  const items = SHORTCUT_ACTIONS.filter(
                    (a) =>
                      a.group === group &&
                      (!q ||
                        a.label.toLowerCase().includes(q) ||
                        shortcuts.some(
                          (m) =>
                            m.actionId === a.id && formatShortcutLabel(m).toLowerCase().includes(q)
                        ))
                  )
                  if (!items.length) return null
                  return (
                    <section key={group} aria-label={group}>
                      <div className="sk-group">{group}</div>
                      {items.map((a) => {
                        const maps = shortcuts.filter((m) => m.actionId === a.id)
                        const changed = !sameCombos(
                          maps,
                          defaultShortcuts.filter((m) => m.actionId === a.id)
                        )
                        return (
                          <div
                            key={a.id}
                            className={
                              'kb-row' +
                              (maps.some((m) => m.uuid === recordingUuid) ? ' recording' : '')
                            }
                          >
                            <span className="kb-label">
                              {a.label}
                              {changed && <i className="kb-dot" title="Modifié" />}
                            </span>
                            <span className="kb-combos">
                              {maps.length === 0 && <span className="kb-none">Aucun</span>}
                              {maps.map((m) => {
                                if (m.uuid === recordingUuid) {
                                  return (
                                    <span key={m.uuid} className="kb-rec" role="status">
                                      Appuyez sur une combinaison…<span>Échap pour annuler</span>
                                    </span>
                                  )
                                }
                                const other = findConflict(shortcuts, m)
                                return (
                                  <span key={m.uuid} className="kb-combo">
                                    <button
                                      className="kb-caps"
                                      title="Cliquer pour changer"
                                      aria-label={`${a.label} : ${formatShortcutLabel(m)}. Changer`}
                                      onClick={() => setRecordingUuid(m.uuid)}
                                    >
                                      {m.key ? (
                                        formatShortcutLabel(m)
                                          .split(' ')
                                          .map((k, i) => <kbd key={i}>{k}</kbd>)
                                      ) : (
                                        <span className="kb-none">Non défini</span>
                                      )}
                                    </button>
                                    <button
                                      className="kb-remove"
                                      aria-label={`Retirer ${formatShortcutLabel(m)}`}
                                      title="Retirer ce raccourci"
                                      onClick={() => removeShortcut(m.uuid)}
                                    >
                                      <XIcon size={11} />
                                    </button>
                                    {other && (
                                      <span className="st-conflict" role="note">
                                        Déjà pris par « {actions[other.actionId] || other.actionId}{' '}
                                        »
                                      </span>
                                    )}
                                  </span>
                                )
                              })}
                            </span>
                            <span className="kb-tools">
                              {changed && (
                                <button className="sk-mini" onClick={() => resetShortcut(a.id)}>
                                  Rétablir
                                </button>
                              )}
                              <button className="sk-mini" onClick={() => addShortcut(a.id)}>
                                Ajouter
                              </button>
                            </span>
                          </div>
                        )
                      })}
                    </section>
                  )
                })}
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
