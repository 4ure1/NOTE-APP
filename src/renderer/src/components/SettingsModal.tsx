import React, { useState, useEffect, useMemo } from 'react'
import { Snippet } from '../types/snippets'
import { getSnippetBodyText } from '../utils/snippetEngine'

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

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 99999,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setRecordingUuid(null)
          onClose()
        }
      }}
    >
      <div
        style={{
          backgroundColor: '#18181b',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '14px',
          width: '900px',
          maxWidth: '94vw',
          height: '660px',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          color: '#ffffff',
          overflow: 'hidden'
        }}
      >
        {/* HEADER */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#141417'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38bdf8'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Paramètres & Aide</h2>
              <p style={{ margin: 0, fontSize: '12px', color: '#a1a1aa' }}>
                Personnalisation de l'application, raccourcis et guide des snippets
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setRecordingUuid(null)
              onClose()
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#a1a1aa',
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
              e.currentTarget.style.color = '#fff'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = '#a1a1aa'
            }}
          >
            ✕
          </button>
        </div>

        {/* BODY: SIDEBAR + CONTENT */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* SIDEBAR TABS */}
          <div
            style={{
              width: '210px',
              borderRight: '1px solid rgba(255, 255, 255, 0.08)',
              backgroundColor: '#141416',
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
                    background: isActive ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                    border: 'none',
                    color: isActive ? '#38bdf8' : '#a1a1aa',
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
                        background: isActive ? 'rgba(56, 189, 248, 0.25)' : '#27272a',
                        color: isActive ? '#38bdf8' : '#71717a',
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
                    <h3 style={{ margin: '0 0 4px', fontSize: '16px', color: '#38bdf8' }}>
                      Catalogue des Snippets ({snippets.length})
                    </h3>
                    <span
                      style={{
                        fontSize: '11px',
                        background: '#27272a',
                        color: '#d4d4d8',
                        padding: '3px 8px',
                        borderRadius: '6px'
                      }}
                    >
                      Déclencheur : <strong style={{ color: '#38bdf8' }}>/</strong>
                    </span>
                  </div>
                  <p style={{ margin: '0 0 12px', fontSize: '12.5px', color: '#a1a1aa', lineHeight: 1.5 }}>
                    Tapez <code style={{ color: '#f59e0b', background: '#27272a', padding: '1px 4px', borderRadius: 3 }}>/</code>{' '}
                    dans l'éditeur pour ouvrir la palette instantanée. Utilisez{' '}
                    <code style={{ color: '#38bdf8', background: '#27272a', padding: '1px 4px', borderRadius: 3 }}>Tab</code>{' '}
                    pour naviguer entre les champs modifiables.
                  </p>

                  {/* ASTUCE SUR LE FICHIER DU COFFRE */}
                  <div
                    style={{
                      background: 'rgba(56, 189, 248, 0.08)',
                      border: '1px solid rgba(56, 189, 248, 0.2)',
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
                        onClick={() => window.api.showItemInFolder('.snippets')}
                        style={{
                          background: 'rgba(56, 189, 248, 0.2)',
                          border: 'none',
                          color: '#38bdf8',
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
                      value={snippetSearch}
                      onChange={(e) => setSnippetSearch(e.target.value)}
                      placeholder="Filtrer par préfixe, nom ou description..."
                      style={{
                        flex: 1,
                        minWidth: '220px',
                        background: '#202024',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        color: '#fff',
                        fontSize: '12.5px',
                        outline: 'none'
                      }}
                    />

                    {/* Filtre de Scope */}
                    <div style={{ display: 'flex', background: '#202024', borderRadius: '6px', padding: '2px', border: '1px solid rgba(255,255,255,0.1)' }}>
                      {(['all', 'html', 'markdown'] as const).map((sc) => (
                        <button
                          key={sc}
                          onClick={() => setSnippetScopeFilter(sc)}
                          style={{
                            background: snippetScopeFilter === sc ? '#38bdf8' : 'transparent',
                            color: snippetScopeFilter === sc ? '#09090b' : '#a1a1aa',
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
                      value={snippetCategoryFilter}
                      onChange={(e) => setSnippetCategoryFilter(e.target.value)}
                      style={{
                        background: '#202024',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '6px',
                        color: '#a1a1aa',
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
                    <div style={{ textAlign: 'center', padding: '30px', color: '#71717a', fontSize: '13px' }}>
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
                            background: '#202024',
                            border: '1px solid rgba(255, 255, 255, 0.06)',
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
                                  background: isCopied ? '#22c55e' : '#27272a',
                                  color: isCopied ? '#fff' : '#f59e0b',
                                  border: '1px solid rgba(255, 255, 255, 0.08)',
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
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#f4f4f5' }}>
                                  {s.name}
                                </div>
                                <div style={{ fontSize: '11.5px', color: '#a1a1aa' }}>
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
                                  color: s.scope === 'html' ? '#60a5fa' : s.scope === 'markdown' ? '#fb923c' : '#a1a1aa',
                                  background: '#27272a',
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
                                  color: '#a1a1aa',
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
                                background: '#121214',
                                border: '1px solid rgba(255,255,255,0.06)',
                                borderRadius: '6px',
                                padding: '10px',
                                fontSize: '11px',
                                color: '#d4d4d8',
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
                  <h3 style={{ margin: '0 0 4px', fontSize: '16px', color: '#38bdf8' }}>Raccourcis clavier</h3>
                  <p style={{ margin: 0, fontSize: '12.5px', color: '#a1a1aa' }}>
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
                        backgroundColor: '#202024',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '8px'
                      }}
                    >
                      <select
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
                          backgroundColor: '#18181b',
                          color: '#f4f4f5',
                          border: '1px solid rgba(255,255,255,0.1)',
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
                            backgroundColor: recordingUuid === s.uuid ? '#38bdf8' : '#141416',
                            color: recordingUuid === s.uuid ? '#09090b' : '#f4f4f5',
                            border: `1px solid ${recordingUuid === s.uuid ? '#38bdf8' : 'rgba(255,255,255,0.1)'}`,
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
                            backgroundColor: '#27272a',
                            color: '#fff',
                            border: '1px solid rgba(255,255,255,0.08)',
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
                            color: '#ef4444',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          ✕
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
                      backgroundColor: '#27272a',
                      color: '#38bdf8',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
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
                      color: '#a1a1aa',
                      border: '1px solid rgba(255,255,255,0.1)',
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
                  <h3 style={{ margin: '0 0 4px', fontSize: '16px', color: '#38bdf8' }}>Intelligence Artificielle</h3>
                  <p style={{ margin: 0, fontSize: '12.5px', color: '#a1a1aa' }}>
                    Configurez l'IA principale et les paramètres de votre agent local Ollama.
                  </p>
                </div>

                {/* Sélecteur d'IA principale */}
                <div style={{ background: '#202024', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: '#f4f4f5' }}>
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
                          background: activeAI === item.id ? 'rgba(56, 189, 248, 0.15)' : '#18181b',
                          border: `1px solid ${activeAI === item.id ? '#38bdf8' : 'rgba(255,255,255,0.08)'}`,
                          borderRadius: '8px',
                          padding: '10px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          color: activeAI === item.id ? '#38bdf8' : '#e4e4e7'
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>{item.label}</div>
                        <div style={{ fontSize: '11px', color: '#71717a' }}>{item.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Configuration Ollama */}
                <div style={{ background: '#202024', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <h4 style={{ margin: 0, fontSize: '14px', color: '#f4f4f5' }}>Backend Local Ollama</h4>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        background: ollamaStatus?.online ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: ollamaStatus?.online ? '#4ade80' : '#f87171',
                        border: `1px solid ${ollamaStatus?.online ? '#22c55e' : '#ef4444'}`
                      }}
                    >
                      {ollamaStatus?.online ? '● Connecté (localhost:11434)' : '○ Non détecté'}
                    </span>
                  </div>

                  {/* Modèle configuré */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: '#a1a1aa', marginBottom: '4px' }}>
                      Modèle local pour l'Agent :
                    </label>
                    <input
                      type="text"
                      value={ollamaModel}
                      onChange={(e) => setOllamaModel(e.target.value)}
                      placeholder="qwen2.5:7b-instruct, qwen3:8b, hermes3:8b..."
                      style={{
                        width: '100%',
                        background: '#18181b',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        color: '#fff',
                        fontSize: '13px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  {/* Clé API Web pour recherche en direct */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: '#a1a1aa', marginBottom: '4px' }}>
                      Clé API Web Ollama (optionnelle, stockée de manière sécurisée) :
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="password"
                        value={ollamaApiKey}
                        onChange={(e) => setOllamaApiKey(e.target.value)}
                        placeholder="dbe4d585..."
                        style={{
                          flex: 1,
                          background: '#18181b',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '6px',
                          padding: '8px 12px',
                          color: '#fff',
                          fontSize: '13px',
                          outline: 'none'
                        }}
                      />
                      <button
                        onClick={handleSaveApiKey}
                        style={{
                          background: isApiKeySaved ? '#22c55e' : '#38bdf8',
                          color: '#09090b',
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
                    <span style={{ fontSize: '11px', color: '#71717a', marginTop: '4px', display: 'block' }}>
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
                  <h3 style={{ margin: '0 0 4px', fontSize: '16px', color: '#38bdf8' }}>Éditeur & Coffre</h3>
                  <p style={{ margin: 0, fontSize: '12.5px', color: '#a1a1aa' }}>
                    Préférences d'affichage et gestion des notes.
                  </p>
                </div>

                {/* Mode d'affichage par défaut */}
                <div style={{ background: '#202024', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: '#f4f4f5' }}>
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
                          background: editorMode === mode.id ? 'rgba(56, 189, 248, 0.15)' : '#18181b',
                          border: `1px solid ${editorMode === mode.id ? '#38bdf8' : 'rgba(255,255,255,0.08)'}`,
                          borderRadius: '6px',
                          color: editorMode === mode.id ? '#38bdf8' : '#a1a1aa',
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
                <div style={{ background: '#202024', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#f4f4f5' }}>Niveau de zoom de l'éditeur</div>
                      <div style={{ fontSize: '11.5px', color: '#71717a' }}>Actuel : {zoomLevel}%</div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => onSetZoomLevel(Math.max(50, zoomLevel - 10))}
                        style={{ background: '#27272a', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' }}
                      >
                        -
                      </button>
                      <button
                        onClick={() => onSetZoomLevel(100)}
                        style={{ background: '#27272a', border: 'none', color: '#38bdf8', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                      >
                        100%
                      </button>
                      <button
                        onClick={() => onSetZoomLevel(Math.min(250, zoomLevel + 10))}
                        style={{ background: '#27272a', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Gestion du coffre */}
                <div style={{ background: '#202024', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#f4f4f5', marginBottom: '4px' }}>
                    Dossier Vault / Notes
                  </div>
                  <div style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '12px' }}>
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
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#ef4444',
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
                      background: 'linear-gradient(135deg, #38bdf8, #818cf8)',
                      margin: '0 auto 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '24px',
                      fontWeight: 'bold',
                      color: '#09090b',
                      boxShadow: '0 8px 24px rgba(56, 189, 248, 0.35)'
                    }}
                  >
                    N
                  </div>
                  <h3 style={{ margin: '0 0 4px', fontSize: '18px' }}>NOTE-APP Desktop</h3>
                  <div style={{ fontSize: '12px', color: '#71717a' }}>Version 1.0.0 (Production)</div>
                </div>

                <div
                  style={{
                    background: '#202024',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '8px',
                    padding: '16px',
                    fontSize: '12.5px',
                    lineHeight: 1.6,
                    color: '#d4d4d8',
                    marginTop: '20px'
                  }}
                >
                  <p style={{ margin: '0 0 10px' }}>
                    <strong>NOTE-APP</strong> est un espace de travail personnel pour la prise de notes, l'étude et la programmation :
                  </p>
                  <ul style={{ margin: '0 0 10px', paddingLeft: '20px', color: '#a1a1aa' }}>
                    <li>Éditeur bimodal : <strong>Monaco Editor</strong> pour l'HTML / CSS et <strong>Markdown</strong> avec aperçu synchronisé.</li>
                    <li>Moteur de snippets VS Code & Obsidian avec navigation complète au clavier (<kbd>Tab</kbd> / <kbd>Shift+Tab</kbd>).</li>
                    <li>Agent IA autonome local branché sur Ollama avec outil de recherche web direct et sécurité par sandbox.</li>
                    <li>Gestion fluide des fiches, cours, quiz QCM interactifs et coloration syntaxique ultra-lisible.</li>
                  </ul>
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '10px', fontSize: '11.5px', color: '#71717a' }}>
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
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'flex-end',
            backgroundColor: '#141416'
          }}
        >
          <button
            onClick={() => {
              setRecordingUuid(null)
              onClose()
            }}
            style={{
              backgroundColor: '#27272a',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#e4e4e7',
              borderRadius: '6px',
              padding: '7px 18px',
              fontWeight: 500,
              fontSize: '12.5px',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#3f3f46')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#27272a')}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
