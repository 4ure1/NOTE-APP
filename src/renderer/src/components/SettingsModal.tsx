import React, { useState, useEffect, useMemo } from 'react'
import { useModalA11y } from '../utils/useModalA11y'
import { Snippet } from '../types/snippets'
import { getSnippetBodyText } from '../utils/snippetEngine'
import { notifyApiError } from '../utils/apiError'
import { APP_NAME, AUTHOR, AUTHOR_GITHUB, COPYRIGHT } from '../utils/credits'

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

type SettingsTab = 'snippets' | 'shortcuts' | 'ai' | 'editor' | 'about'

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
  const [activeTab, setActiveTab] = useState<SettingsTab>('snippets')

  // État onglet Snippets
  const [snippetSearch, setSnippetSearch] = useState('')
  const [snippetScopeFilter, setSnippetScopeFilter] = useState<'all' | 'html' | 'markdown'>('all')
  const [snippetCategoryFilter, setSnippetCategoryFilter] = useState<string>('all')
  const [expandedSnippetPrefix, setExpandedSnippetPrefix] = useState<string | null>(null)
  const [copiedPrefix, setCopiedPrefix] = useState<string | null>(null)

  // État onglet Raccourcis
  const [recordingUuid, setRecordingUuid] = useState<string | null>(null)

  // État onglet IA
  const [ollamaStatus, setOllamaStatus] = useState<{ online: boolean; models: string[]; defaultModel: string | null } | null>(null)
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
        if (snippetScopeFilter === 'markdown' && s.scope !== 'markdown' && s.scope !== 'all') return false
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

  // Échap ferme (sauf pendant l'enregistrement d'un raccourci : la capture de la touche l'intercepte avant)
  const dialogRef = useModalA11y(
    isOpen,
    () => {
      setRecordingUuid(null)
      onClose()
    },
    { initialFocus: 'first' }
  )

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'var(--overlay-bg)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 99999,
        fontFamily: 'var(--font-ui)'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setRecordingUuid(null)
          onClose()
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        tabIndex={-1}
        style={{
          backgroundColor: 'var(--surface-raised)',
          border: '1px solid var(--border-strong)',
          borderRadius: '14px',
          width: '900px',
          maxWidth: '94vw',
          height: '660px',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          color: 'var(--text-strong)',
          overflow: 'hidden'
        }}
      >
        {/* HEADER */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--surface-panel)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                backgroundColor: 'color-mix(in srgb, var(--accent-color) 15%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent-color) 30%, transparent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-color)'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <div>
              <h2
                id="settings-modal-title"
                style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}
              >
                Paramètres & Aide
              </h2>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                Personnalisation de l'application, raccourcis et guide des snippets
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setRecordingUuid(null)
              onClose()
            }}
            aria-label="Fermer"
            title="Fermer (Échap)"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: '20px',
              cursor: 'pointer',
              borderRadius: '6px',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'
              e.currentTarget.style.color = 'var(--text-strong)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        {/* BODY: SIDEBAR + CONTENT */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* SIDEBAR TABS */}
          <div
            style={{
              width: '210px',
              borderRight: '1px solid var(--border-color)',
              backgroundColor: 'var(--surface-panel)',
              padding: '12px 8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
          >
            {[
              { id: 'snippets', label: 'Aide & Snippets', icon: '💡', badge: snippets.length },
              { id: 'shortcuts', label: 'Raccourcis clavier', icon: '⌨️', badge: shortcuts.length },
              { id: 'ai', label: 'Intelligence Artificielle', icon: '🤖' },
              { id: 'editor', label: 'Éditeur & Coffre', icon: '🎨' },
              { id: 'about', label: 'À propos', icon: 'ℹ️' }
            ].map((tab) => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as SettingsTab)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    background: isActive
                      ? 'color-mix(in srgb, var(--accent-color) 12%, transparent)'
                      : 'transparent',
                    border: 'none',
                    color: isActive ? 'var(--accent-color)' : 'var(--text-secondary)',
                    fontWeight: isActive ? 600 : 500,
                    fontSize: '13px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.12s'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{tab.icon}</span>
                    <span>{tab.label}</span>
                  </span>
                  {tab.badge !== undefined && (
                    <span
                      style={{
                        fontSize: '11px',
                        background: isActive
                          ? 'color-mix(in srgb, var(--accent-color) 25%, transparent)'
                          : 'var(--surface-input)',
                        color: isActive ? 'var(--accent-color)' : 'var(--text-muted)',
                        padding: '1px 6px',
                        borderRadius: '10px'
                      }}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* MAIN TAB CONTENT */}
          <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto', minHeight: 0 }}>
            {/* ---------------- ONGLET 1 : AIDE & SNIPPETS ---------------- */}
            {activeTab === 'snippets' && (
              <div>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3
                      style={{ margin: '0 0 4px', fontSize: '16px', color: 'var(--accent-color)' }}
                    >
                      Catalogue des Snippets ({snippets.length})
                    </h3>
                    <span
                      style={{
                        fontSize: '11px',
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
                      fontSize: '12.5px',
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
                    dans l'éditeur pour ouvrir la palette instantanée. Utilisez{' '}
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
                      fontSize: '12px',
                      color: '#bae6fd',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '16px'
                    }}
                  >
                    <span>
                      📁 Fichier personnalisable : <strong>.snippets/snippets.json</strong> dans votre coffre Notes (rechargement à chaud automatique).
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
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontWeight: 500
                        }}
                      >
                        Ouvrir le dossier
                      </button>
                    )}
                  </div>

                  {/* BARRE DE RECHERCHE ET FILTRES */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
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
                        fontSize: '12.5px',
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
                            fontSize: '11.5px',
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
                        fontSize: '12px',
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '380px', overflowY: 'auto' }}>
                  {filteredSnippets.length === 0 ? (
                    <div
                      style={{
                        textAlign: 'center',
                        padding: '30px',
                        color: 'var(--text-muted)',
                        fontSize: '13px'
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
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
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
                                  fontSize: '12px',
                                  fontWeight: 'bold',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                /{s.prefix}
                                {isCopied && <span style={{ fontSize: '10px' }}>✓</span>}
                              </button>

                              {/* Nom et description */}
                              <div style={{ minWidth: 0 }}>
                                <div
                                  style={{
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: 'var(--text-strong)'
                                  }}
                                >
                                  {s.name}
                                </div>
                                <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                                  {s.description}
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {/* Badge catégorie */}
                              <span
                                style={{
                                  fontSize: '10.5px',
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
                                  fontSize: '10.5px',
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
                                onClick={() => setExpandedSnippetPrefix(isExpanded ? null : s.prefix)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--text-secondary)',
                                  fontSize: '11px',
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
                                fontSize: '11px',
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
                  <h3 style={{ margin: '0 0 4px', fontSize: '16px', color: 'var(--accent-color)' }}>
                    Raccourcis clavier
                  </h3>
                  <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                    Configurez vos touches d'accès rapide. Cliquez sur Modifier puis appuyez sur la combinaison souhaitée.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
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
                            const updated = prev.map((m) => (m.uuid === s.uuid ? { ...m, actionId: newAction } : m))
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
                          fontSize: '12.5px',
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
                            fontSize: '12px',
                            fontWeight: 'bold',
                            minWidth: '120px',
                            textAlign: 'center'
                          }}
                        >
                          {recordingUuid === s.uuid ? 'Appuyez...' : formatShortcut(s)}
                        </span>

                        <button
                          onClick={() => setRecordingUuid(s.uuid)}
                          style={{
                            backgroundColor: 'var(--surface-input)',
                            color: 'var(--text-strong)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            padding: '6px 12px',
                            fontSize: '12px',
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
                            fontSize: '12px',
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

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
                  <button
                    onClick={() => {
                      const newUuid = Math.random().toString()
                      setShortcuts((prev) => {
                        const updated = [
                          ...prev,
                          { uuid: newUuid, actionId: 'create-note', key: '', ctrlKey: false, shiftKey: false, altKey: false }
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
                      fontSize: '12.5px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    + Ajouter un raccourci
                  </button>

                  <button
                    onClick={() => {
                      if (window.confirm('Réinitialiser tous les raccourcis aux valeurs par défaut ?')) {
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
                      fontSize: '12.5px',
                      cursor: 'pointer'
                    }}
                  >
                    Réinitialiser par défaut
                  </button>
                </div>
              </div>
            )}

            {/* ---------------- ONGLET 3 : IA & MODÈLES ---------------- */}
            {activeTab === 'ai' && (
              <div>
                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ margin: '0 0 4px', fontSize: '16px', color: 'var(--accent-color)' }}>
                    Intelligence Artificielle
                  </h3>
                  <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                    Configurez l'IA principale et les paramètres de votre agent local Ollama.
                  </p>
                </div>

                {/* Sélecteur d'IA principale */}
                <div
                  style={{
                    background: 'var(--surface-control)',
                    padding: '16px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      marginBottom: '8px',
                      color: 'var(--text-strong)'
                    }}
                  >
                    Assistant IA actif par défaut
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                    {[
                      { id: 'agent', label: 'Agent Local', desc: 'Ollama Autonome' },
                      { id: 'claude', label: 'Claude', desc: 'Anthropic Webview' },
                      { id: 'chatgpt', label: 'ChatGPT', desc: 'OpenAI Webview' },
                      { id: 'gemini', label: 'Gemini', desc: 'Google Webview' }
                    ].map((item) => (
                      <button
                        key={item.id}
                        onClick={() => onSelectAI(item.id as any)}
                        style={{
                          background:
                            activeAI === item.id
                              ? 'color-mix(in srgb, var(--accent-color) 15%, transparent)'
                              : 'var(--surface-raised)',
                          border: `1px solid ${activeAI === item.id ? 'var(--accent-color)' : 'var(--border-color)'}`,
                          borderRadius: '8px',
                          padding: '10px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          color:
                            activeAI === item.id ? 'var(--accent-color)' : 'var(--text-primary)'
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>{item.label}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {item.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Configuration Ollama */}
                <div
                  style={{
                    background: 'var(--surface-control)',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <h4 style={{ margin: 0, fontSize: '14px', color: 'var(--text-strong)' }}>
                      Backend Local Ollama
                    </h4>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        background: ollamaStatus?.online
                          ? 'color-mix(in srgb, var(--success-strong) 15%, transparent)'
                          : 'color-mix(in srgb, var(--danger-strong) 15%, transparent)',
                        color: ollamaStatus?.online
                          ? 'var(--success-color)'
                          : 'var(--danger-color)',
                        border: `1px solid ${ollamaStatus?.online ? 'var(--success-strong)' : 'var(--danger-strong)'}`
                      }}
                    >
                      {ollamaStatus?.online ? '● Connecté (localhost:11434)' : '○ Non détecté'}
                    </span>
                  </div>

                  {/* Modèle configuré */}
                  <div style={{ marginBottom: '12px' }}>
                    <label
                      htmlFor="settings-ollama-model"
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        color: 'var(--text-secondary)',
                        marginBottom: '4px'
                      }}
                    >
                      Modèle local pour l'Agent :
                    </label>
                    <input
                      id="settings-ollama-model"
                      type="text"
                      value={ollamaModel}
                      onChange={(e) => setOllamaModel(e.target.value)}
                      placeholder="qwen2.5:7b-instruct, qwen3:8b, hermes3:8b..."
                      style={{
                        width: '100%',
                        background: 'var(--surface-raised)',
                        border: '1px solid var(--border-strong)',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        color: 'var(--text-strong)',
                        fontSize: '13px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  {/* Clé API Web pour recherche en direct */}
                  <div style={{ marginBottom: '12px' }}>
                    <label
                      htmlFor="settings-ollama-key"
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        color: 'var(--text-secondary)',
                        marginBottom: '4px'
                      }}
                    >
                      Clé API Web Ollama (optionnelle, stockée de manière sécurisée) :
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        id="settings-ollama-key"
                        type="password"
                        value={ollamaApiKey}
                        onChange={(e) => setOllamaApiKey(e.target.value)}
                        placeholder="dbe4d585..."
                        style={{
                          flex: 1,
                          background: 'var(--surface-raised)',
                          border: '1px solid var(--border-strong)',
                          borderRadius: '6px',
                          padding: '8px 12px',
                          color: 'var(--text-strong)',
                          fontSize: '13px',
                          outline: 'none'
                        }}
                      />
                      <button
                        onClick={handleSaveApiKey}
                        style={{
                          background: isApiKeySaved
                            ? 'var(--success-strong)'
                            : 'var(--accent-color)',
                          color: 'var(--surface-sunken)',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '8px 16px',
                          fontWeight: 600,
                          fontSize: '12.5px',
                          cursor: 'pointer',
                          transition: 'background 0.15s'
                        }}
                      >
                        {isApiKeySaved ? 'Enregistré ✓' : 'Sauvegarder'}
                      </button>
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        marginTop: '4px',
                        display: 'block'
                      }}
                    >
                      Note : Si la clé n'a plus de crédits (code 402), l'agent bascule automatiquement sur le moteur web public sans bloquer.
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ---------------- ONGLET 4 : ÉDITEUR & COFFRE ---------------- */}
            {activeTab === 'editor' && (
              <div>
                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ margin: '0 0 4px', fontSize: '16px', color: 'var(--accent-color)' }}>
                    Éditeur & Coffre
                  </h3>
                  <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                    Préférences d'affichage et gestion des notes.
                  </p>
                </div>

                {/* Mode d'affichage par défaut */}
                <div
                  style={{
                    background: 'var(--surface-control)',
                    padding: '16px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      marginBottom: '8px',
                      color: 'var(--text-strong)'
                    }}
                  >
                    Disposition de l'éditeur
                  </label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {[
                      { id: 'live', label: 'Split (Code + Aperçu)' },
                      { id: 'edit', label: 'Code seul' },
                      { id: 'preview', label: 'Aperçu seul' }
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => onChangeEditorMode(mode.id as any)}
                        style={{
                          flex: 1,
                          padding: '10px',
                          background:
                            editorMode === mode.id
                              ? 'color-mix(in srgb, var(--accent-color) 15%, transparent)'
                              : 'var(--surface-raised)',
                          border: `1px solid ${editorMode === mode.id ? 'var(--accent-color)' : 'var(--border-color)'}`,
                          borderRadius: '6px',
                          color:
                            editorMode === mode.id
                              ? 'var(--accent-color)'
                              : 'var(--text-secondary)',
                          fontSize: '12.5px',
                          fontWeight: editorMode === mode.id ? 600 : 500,
                          cursor: 'pointer'
                        }}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Zoom */}
                <div
                  style={{
                    background: 'var(--surface-control)',
                    padding: '16px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div
                        style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}
                      >
                        Niveau de zoom de l’éditeur
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                        Actuel : {zoomLevel}%
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => onSetZoomLevel(Math.max(50, zoomLevel - 10))}
                        style={{
                          background: 'var(--surface-input)',
                          border: 'none',
                          color: 'var(--text-strong)',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        -
                      </button>
                      <button
                        onClick={() => onSetZoomLevel(100)}
                        style={{
                          background: 'var(--surface-input)',
                          border: 'none',
                          color: 'var(--accent-color)',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        100%
                      </button>
                      <button
                        onClick={() => onSetZoomLevel(Math.min(250, zoomLevel + 10))}
                        style={{
                          background: 'var(--surface-input)',
                          border: 'none',
                          color: 'var(--text-strong)',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Gestion du coffre */}
                <div
                  style={{
                    background: 'var(--surface-control)',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--text-strong)',
                      marginBottom: '4px'
                    }}
                  >
                    Dossier Vault / Notes
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      marginBottom: '12px'
                    }}
                  >
                    {notesCount} note(s) dans la base.
                  </div>
                  <button
                    onClick={async () => {
                      if (window.confirm('Voulez-vous vider définitivement tous les éléments de la corbeille (.trash) ?')) {
                        await onEmptyTrash()
                        alert('La corbeille a été vidée.')
                      }
                    }}
                    style={{
                      background: 'color-mix(in srgb, var(--danger-strong) 10%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--danger-strong) 30%, transparent)',
                      color: 'var(--danger-strong)',
                      padding: '8px 14px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontWeight: 500
                    }}
                  >
                    🗑️ Vider la corbeille (.trash)
                  </button>
                </div>
              </div>
            )}

            {/* ---------------- ONGLET 5 : À PROPOS ---------------- */}
            {activeTab === 'about' && (
              <div>
                <div style={{ textAlign: 'center', padding: '20px 0 10px' }}>
                  <div
                    style={{
                      width: '54px',
                      height: '54px',
                      borderRadius: '16px',
                      background: 'linear-gradient(135deg, var(--accent-color), #818cf8)',
                      margin: '0 auto 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '24px',
                      fontWeight: 'bold',
                      color: 'var(--surface-sunken)',
                      boxShadow: '0 8px 24px rgba(56, 189, 248, 0.35)'
                    }}
                  >
                    N
                  </div>
                  <h3 style={{ margin: '0 0 4px', fontSize: '18px' }}>NOTE-APP Desktop</h3>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Version 1.0.0 (Production)
                  </div>
                </div>

                <div
                  style={{
                    background: 'var(--surface-control)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '16px',
                    fontSize: '12.5px',
                    lineHeight: 1.6,
                    color: 'var(--text-primary)',
                    marginTop: '20px'
                  }}
                >
                  <p style={{ margin: '0 0 10px' }}>
                    <strong>NOTE-APP</strong> est un espace de travail personnel pour la prise de notes, l'étude et la programmation :
                  </p>
                  <ul
                    style={{
                      margin: '0 0 10px',
                      paddingLeft: '20px',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    <li>Éditeur bimodal : <strong>Monaco Editor</strong> pour l'HTML / CSS et <strong>Markdown</strong> avec aperçu synchronisé.</li>
                    <li>Moteur de snippets VS Code & Obsidian avec navigation complète au clavier (<kbd>Tab</kbd> / <kbd>Shift+Tab</kbd>).</li>
                    <li>Agent IA autonome local branché sur Ollama avec outil de recherche web direct et sécurité par sandbox.</li>
                    <li>Gestion fluide des fiches, cours, quiz QCM interactifs et coloration syntaxique ultra-lisible.</li>
                  </ul>
                  <div
                    style={{
                      borderTop: '1px solid var(--border-color)',
                      paddingTop: '10px',
                      fontSize: '11.5px',
                      color: 'var(--text-muted)'
                    }}
                  >
                    Stack : Electron 39 • React 19 • TypeScript • Monaco Editor • Vite
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* FOOTER */}
        <div
          style={{
            padding: '12px 22px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            backgroundColor: 'var(--surface-panel)'
          }}
        >
          {/* Auteur et lien GitHub (src/shared/credits.ts) */}
          <div
            style={{ fontSize: '11.5px', color: 'var(--text-muted)', display: 'flex', gap: '6px' }}
          >
            <span>
              {APP_NAME} · {COPYRIGHT}
            </span>
            <button
              onClick={() => {
                window.api.openExternalUrl(AUTHOR_GITHUB).catch((err: unknown) => {
                  console.error('[Settings]', err)
                })
              }}
              title={AUTHOR_GITHUB}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'var(--accent-color)',
                fontSize: '11.5px',
                cursor: 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: '2px'
              }}
            >
              github.com/{AUTHOR.toLowerCase()}
            </button>
            <span>·</span>
            <button
              onClick={() => {
                onClose()
                window.dispatchEvent(new Event('nf-open-tour'))
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'var(--accent-color)',
                fontSize: '11.5px',
                cursor: 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: '2px'
              }}
            >
              Visite guidée
            </button>
          </div>
          <button
            onClick={() => {
              setRecordingUuid(null)
              onClose()
            }}
            style={{
              backgroundColor: 'var(--surface-input)',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-primary)',
              borderRadius: '6px',
              padding: '7px 18px',
              fontWeight: 500,
              fontSize: '12.5px',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--border-strong)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-input)')}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
