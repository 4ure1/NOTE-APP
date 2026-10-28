import { useState, useRef, useEffect, useMemo } from 'react'
import { notifyApiError } from '../utils/apiError'
import {
  YouTubeIcon,
  PlusIcon,
  XIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  RefreshCwIcon,
  HomeIcon,
  ExternalLinkIcon,
  CopyIcon,
  CheckIcon,
  StarIcon,
  ClockIcon,
  SearchIcon,
  TrashIcon,
  MusicIcon,
  HeadphonesIcon,
  BookOpenIcon,
  CoffeeIcon,
  CalendarIcon,
  ZapIcon,
  PlayCircleIcon,
  MicrophoneIcon
} from './Icons'

export interface YouTubeTab {
  id: string
  title: string
  url: string
  canGoBack?: boolean
  canGoForward?: boolean
  isLoading?: boolean
}

export interface YouTubeShortcut {
  id: string
  label: string
  urlOrQuery: string
}

export interface YouTubeHistoryItem {
  id: string
  title: string
  url: string
  timestamp: number
}

const DEFAULT_URL = 'https://www.youtube.com'

const DEFAULT_SHORTCUTS: YouTubeShortcut[] = [
  { id: '1', label: 'Lofi Girl (Focus)', urlOrQuery: 'lofi girl live' },
  { id: '2', label: 'Musique pour coder', urlOrQuery: 'music for coding chill beats' },
  { id: '3', label: 'Cours & Dev', urlOrQuery: 'tutoriel programmation informatique' },
  { id: '4', label: 'Podcasts Tech', urlOrQuery: 'podcast tech intelligence artificielle' },
  { id: '5', label: 'Café Jazz Ambience', urlOrQuery: 'coffee shop jazz relaxing music' }
]

// Map for shortcut icon rendering — indexed by default shortcut id
const SHORTCUT_ICON_MAP: Record<string, React.ReactElement> = {
  '1': <MusicIcon size={13} />,
  '2': <HeadphonesIcon size={13} />,
  '3': <BookOpenIcon size={13} />,
  '4': <MicrophoneIcon size={13} />,
  '5': <CoffeeIcon size={13} />
}

export default function YouTubeWorkspace() {
  // ── Refs anti-boucle infinie ──
  // Stocke l'URL initiale de chaque onglet pour ne jamais changer le `src` du webview de façon réactive
  const initialUrlsRef = useRef<Record<string, string>>({})
  // Évite d'attacher les event listeners plusieurs fois au même webview
  const attachedListenersRef = useRef<Set<string>>(new Set())

  // ── 1. GESTION PERSISTANTE DES ONGLETS (LOCALSTORAGE) ──
  const [tabs, setTabs] = useState<YouTubeTab[]>(() => {
    let loadedTabs: YouTubeTab[]
    try {
      const saved = localStorage.getItem('youtube_open_tabs')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          loadedTabs = parsed
        } else {
          loadedTabs = [{ id: 'yt-tab-1', title: 'YouTube', url: DEFAULT_URL }]
        }
      } else {
        loadedTabs = [{ id: 'yt-tab-1', title: 'YouTube', url: DEFAULT_URL }]
      }
    } catch {
      loadedTabs = [{ id: 'yt-tab-1', title: 'YouTube', url: DEFAULT_URL }]
    }
    // Nettoyer toute URL d'authentification expirée, rejetée ou en erreur
    loadedTabs = loadedTabs.map((t) => {
      if (!t.url || t.url.includes('signin/rejected') || t.url.includes('CookieMismatch')) {
        return { ...t, url: DEFAULT_URL, title: 'YouTube' }
      }
      return t
    })
    // Enregistrer les URLs initiales pour chaque onglet chargé
    loadedTabs.forEach((t) => {
      initialUrlsRef.current[t.id] = t.url
    })
    return loadedTabs
  })

  const [activeTabId, setActiveTabId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('youtube_active_tab_id')
      if (saved) return saved
    } catch {}
    return tabs[0]?.id || 'yt-tab-1'
  })

  const [inputUrl, setInputUrl] = useState<string>(DEFAULT_URL)
  const [copied, setCopied] = useState<boolean>(false)

  // ── 2. GESTION DES RACCOURCIS (LOCALSTORAGE) ──
  const [shortcuts, setShortcuts] = useState<YouTubeShortcut[]>(() => {
    try {
      const saved = localStorage.getItem('youtube_quick_shortcuts')
      if (saved !== null) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) return parsed
      }
    } catch {}
    return DEFAULT_SHORTCUTS
  })

  // ── 3. GESTION DE L'HISTORIQUE PAR DATE ET HEURE (LOCALSTORAGE) ──
  const [history, setHistory] = useState<YouTubeHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('youtube_browsing_history')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) return parsed
      }
    } catch {}
    return []
  })

  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState<boolean>(false)
  const [historySearchQuery, setHistorySearchQuery] = useState<string>('')

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false)
  const [newLabel, setNewLabel] = useState<string>('')
  const [newTarget, setNewTarget] = useState<string>('')



  // Map des refs de webview par id d'onglet
  const webviewRefs = useRef<Record<string, any>>({})

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0]

  // Synchroniser et sauvegarder les onglets dans le localStorage
  useEffect(() => {
    try {
      localStorage.setItem('youtube_open_tabs', JSON.stringify(tabs))
    } catch {}
  }, [tabs])

  useEffect(() => {
    try {
      localStorage.setItem('youtube_active_tab_id', activeTabId)
    } catch {}
  }, [activeTabId])

  // Synchroniser l'input d'URL avec l'onglet actif
  useEffect(() => {
    if (activeTab) {
      setInputUrl(activeTab.url)
    }
  }, [activeTabId, activeTab?.url])

  // Charger la configuration des raccourcis depuis le fichier disque .config.json au montage
  useEffect(() => {
    if (window.api?.getConfig) {
      window.api.getConfig().then((cfg) => {
        if (cfg && Array.isArray(cfg.youtubeShortcuts)) {
          setShortcuts(cfg.youtubeShortcuts)
          try {
            localStorage.setItem('youtube_quick_shortcuts', JSON.stringify(cfg.youtubeShortcuts))
          } catch {}
        }
      }).catch(() => {})
    }

    let unsubscribeGoogle: (() => void) | undefined
    if (window.api?.onGoogleLoginSuccess) {
      unsubscribeGoogle = window.api.onGoogleLoginSuccess((_service) => {
        console.log('[YouTubeWorkspace] Google login succeeded, reloading webview...')
        handleReload(true)
      })
    }

    return () => {
      if (unsubscribeGoogle) unsubscribeGoogle()
    }
  }, [activeTabId])

  // Sauvegarder les raccourcis sur localStorage ET dans .config.json sur disque
  const saveShortcuts = (updated: YouTubeShortcut[]) => {
    setShortcuts(updated)
    try {
      localStorage.setItem('youtube_quick_shortcuts', JSON.stringify(updated))
    } catch {}
    if (window.api?.getConfig && window.api?.saveConfig) {
      window.api.getConfig().then((cfg) => {
        window.api.saveConfig({ ...(cfg || {}), youtubeShortcuts: updated })
      }).catch(() => {})
    }
  }

  // Ajouter une entrée à l'historique de visionnage
  const addToHistory = (url: string, rawTitle?: string) => {
    if (
      !url ||
      url === 'about:blank' ||
      url === DEFAULT_URL ||
      url.includes('accounts.google.com') ||
      url.includes('signin') ||
      url.includes('ServiceLogin')
    ) return
    const cleanTitle = rawTitle && rawTitle !== 'YouTube' ? rawTitle.replace(' - YouTube', '').trim() : 'Vidéo YouTube'

    setHistory((prev) => {
      // Si la vidéo la plus récente est identique, on met juste à jour l'heure
      if (prev.length > 0 && prev[0].url === url) {
        const updated = [{ ...prev[0], title: cleanTitle, timestamp: Date.now() }, ...prev.slice(1)]
        try { localStorage.setItem('youtube_browsing_history', JSON.stringify(updated.slice(0, 500))) } catch {}
        return updated
      }

      const newItem: YouTubeHistoryItem = {
        id: `h-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title: cleanTitle,
        url,
        timestamp: Date.now()
      }

      // Évite les doublons multiples et conserve jusqu'à 500 entrées
      const filtered = prev.filter((item) => item.url !== url)
      const updated = [newItem, ...filtered].slice(0, 500)
      try { localStorage.setItem('youtube_browsing_history', JSON.stringify(updated)) } catch {}
      return updated
    })
  }

  const handleDeleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setHistory((prev) => {
      const updated = prev.filter((item) => item.id !== id)
      try { localStorage.setItem('youtube_browsing_history', JSON.stringify(updated)) } catch {}
      return updated
    })
  }

  const handleClearHistory = () => {
    setHistory([])
    try { localStorage.removeItem('youtube_browsing_history') } catch {}
  }

  // Grouper l'historique par date
  const groupedHistory = useMemo(() => {
    const filtered = history.filter((item) => {
      if (!historySearchQuery.trim()) return true
      const q = historySearchQuery.toLowerCase()
      return item.title.toLowerCase().includes(q) || item.url.toLowerCase().includes(q)
    })

    const groups: { dateLabel: string; items: YouTubeHistoryItem[] }[] = []
    const map = new Map<string, YouTubeHistoryItem[]>()

    const todayStr = new Date().toDateString()
    const yesterdayDate = new Date()
    yesterdayDate.setDate(yesterdayDate.getDate() - 1)
    const yesterdayStr = yesterdayDate.toDateString()

    filtered.forEach((item) => {
      const itemDate = new Date(item.timestamp)
      const dStr = itemDate.toDateString()
      let label = ''

      if (dStr === todayStr) {
        label = "Aujourd'hui"
      } else if (dStr === yesterdayStr) {
        label = 'Hier'
      } else {
        label = itemDate.toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        })
        label = label.charAt(0).toUpperCase() + label.slice(1)
      }

      if (!map.has(label)) {
        map.set(label, [])
      }
      map.get(label)!.push(item)
    })

    map.forEach((items, dateLabel) => {
      groups.push({ dateLabel, items })
    })

    return groups
  }, [history, historySearchQuery])

  // Supprimer un raccourci
  const handleDeleteShortcut = (id: string) => {
    const next = shortcuts.filter((s) => s.id !== id)
    saveShortcuts(next)
  }

  // Ouvrir un raccourci
  const handleOpenShortcut = (shortcut: YouTubeShortcut) => {
    let finalUrl = shortcut.urlOrQuery.trim()
    if (
      !finalUrl.startsWith('http://') &&
      !finalUrl.startsWith('https://') &&
      !finalUrl.includes('youtube.com') &&
      !finalUrl.includes('youtu.be')
    ) {
      finalUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(finalUrl)}`
    } else if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = `https://${finalUrl}`
    }
    handleAddTab(finalUrl, shortcut.label)
  }

  // Enregistrer le nouveau raccourci
  const handleSubmitNewShortcut = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newLabel.trim()) return

    const target = newTarget.trim() || activeTab?.url || DEFAULT_URL
    const newShortcut: YouTubeShortcut = {
      id: `sc-${Date.now()}`,
      label: newLabel.trim(),
      urlOrQuery: target
    }

    const updated = [...shortcuts, newShortcut]
    saveShortcuts(updated)
    setIsAddModalOpen(false)
    setNewLabel('')
    setNewTarget('')
  }

  // Ouvrir la modal d'ajout pré-remplie avec la vidéo courante
  const handleOpenAddModal = () => {
    const currentTitle = activeTab?.title && activeTab.title !== 'YouTube' ? activeTab.title : ''
    setNewLabel(currentTitle)
    setNewTarget(activeTab?.url || DEFAULT_URL)
    setIsAddModalOpen(true)
  }



  // Ouvrir un nouvel onglet
  const handleAddTab = (initialUrl: string = DEFAULT_URL, initialTitle: string = 'Nouvel onglet') => {
    const newId = `yt-tab-${Date.now()}`
    const newTab: YouTubeTab = {
      id: newId,
      title: initialTitle,
      url: initialUrl
    }
    // Stocker l'URL initiale pour ce nouvel onglet (le src du webview ne changera plus)
    initialUrlsRef.current[newId] = initialUrl
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(newId)
    setInputUrl(initialUrl)
  }

  // Fermer un onglet
  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (tabs.length === 1) {
      // S'il n'en reste qu'un, on le réinitialise sur YouTube accueil
      const oldId = tabs[0].id
      delete webviewRefs.current[oldId]
      delete initialUrlsRef.current[oldId]
      attachedListenersRef.current.delete(oldId)

      const resetId = `yt-tab-${Date.now()}`
      initialUrlsRef.current[resetId] = DEFAULT_URL
      setTabs([{ id: resetId, title: 'YouTube', url: DEFAULT_URL }])
      setActiveTabId(resetId)
      return
    }

    const nextTabs = tabs.filter((t) => t.id !== id)
    setTabs(nextTabs)
    if (activeTabId === id) {
      const newActive = nextTabs[nextTabs.length - 1]
      setActiveTabId(newActive.id)
    }
    delete webviewRefs.current[id]
    delete initialUrlsRef.current[id]
    attachedListenersRef.current.delete(id)
  }

  // Navigation: Valider la barre d'adresse
  const handleSubmitUrl = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!inputUrl.trim()) return

    let finalUrl = inputUrl.trim()

    if (
      !finalUrl.startsWith('http://') &&
      !finalUrl.startsWith('https://') &&
      !finalUrl.includes('youtube.com') &&
      !finalUrl.includes('youtu.be')
    ) {
      finalUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(finalUrl)}`
    } else if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = `https://${finalUrl}`
    }

    const wv = webviewRefs.current[activeTabId]
    if (wv && typeof wv.loadURL === 'function') {
      wv.loadURL(finalUrl)
    }

    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, url: finalUrl } : t))
    )
    setInputUrl(finalUrl)
  }

  // Navigation controls
  const handleGoBack = () => {
    const wv = webviewRefs.current[activeTabId]
    if (wv && typeof wv.goBack === 'function' && wv.canGoBack()) {
      wv.goBack()
    }
  }

  const handleGoForward = () => {
    const wv = webviewRefs.current[activeTabId]
    if (wv && typeof wv.goForward === 'function' && wv.canGoForward()) {
      wv.goForward()
    }
  }

  const handleReload = (forceHomeParam?: boolean | React.MouseEvent) => {
    const forceHome = typeof forceHomeParam === 'boolean' ? forceHomeParam : false
    const wv = webviewRefs.current[activeTabId]
    if (!wv) return

    let currentUrl = ''
    try {
      currentUrl = typeof wv.getURL === 'function' ? wv.getURL() : (activeTab?.url || '')
    } catch (_) {}

    // Si on force l'accueil ou si l'onglet était bloqué sur un rejet de connexion
    if (forceHome || !currentUrl || currentUrl.includes('signin/rejected')) {
      console.log('[YouTubeWorkspace] Navigation vers DEFAULT_URL (accueil YouTube)...')
      if (typeof wv.loadURL === 'function') {
        wv.loadURL(DEFAULT_URL)
      }
      setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, url: DEFAULT_URL, title: 'YouTube' } : t)))
      setInputUrl(DEFAULT_URL)
      return
    }

    if (typeof wv.reloadIgnoringCache === 'function') {
      wv.reloadIgnoringCache()
    } else if (typeof wv.loadURL === 'function') {
      wv.loadURL(currentUrl)
    } else if (typeof wv.reload === 'function') {
      wv.reload()
    }
  }

  const handleGoHome = () => {
    const wv = webviewRefs.current[activeTabId]
    if (wv && typeof wv.loadURL === 'function') {
      wv.loadURL(DEFAULT_URL)
    }
    setInputUrl(DEFAULT_URL)
  }

  const handleCopyUrl = () => {
    if (activeTab?.url) {
      navigator.clipboard.writeText(activeTab.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  const handleOpenExternal = () => {
    if (activeTab?.url && window.api?.openExternalUrl) {
      window.api
        .openExternalUrl(activeTab.url)
        .catch((err) => notifyApiError('Ouverture dans le navigateur', err))
    } else if (activeTab?.url) {
      window.open(activeTab.url, '_blank')
    }
  }

  // Attacher les écouteurs sur le webview (UNE SEULE FOIS par onglet)
  const attachWebviewListeners = (id: string, el: any) => {
    if (!el) return
    webviewRefs.current[id] = el

    // ── Guard : ne jamais attacher les listeners deux fois sur le même onglet ──
    if (attachedListenersRef.current.has(id)) return
    attachedListenersRef.current.add(id)

    const handleTitle = (e: any) => {
      const title = e.title?.replace(' - YouTube', '') || 'YouTube'
      setTabs((prev) => {
        const cur = prev.find((t) => t.id === id)
        if (cur && cur.title === title) return prev
        return prev.map((t) => (t.id === id ? { ...t, title } : t))
      })
      if (el.getURL) {
        addToHistory(el.getURL(), title)
      }
    }

    const handleNavigate = (e: any) => {
      const url = e.url || ''
      if (!url) return
      const canGoBack = typeof el.canGoBack === 'function' ? el.canGoBack() : false
      const canGoForward = typeof el.canGoForward === 'function' ? el.canGoForward() : false

      setTabs((prev) => {
        const cur = prev.find((t) => t.id === id)
        if (cur && cur.url === url && cur.canGoBack === canGoBack && cur.canGoForward === canGoForward) {
          return prev
        }
        return prev.map((t) =>
          t.id === id
            ? {
                ...t,
                url,
                canGoBack,
                canGoForward
              }
            : t
        )
      })
      if (id === activeTabId) {
        setInputUrl(url)
      }
      addToHistory(url, el.getTitle ? el.getTitle() : '')
    }

    el.addEventListener('page-title-updated', handleTitle)
    el.addEventListener('did-navigate', handleNavigate)
    el.addEventListener('did-navigate-in-page', handleNavigate)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: 'var(--editor-bg)',
        color: 'var(--text-primary)',
        overflow: 'hidden',
        userSelect: 'none',
        position: 'relative'
      }}
    >
      {/* ── BARRE SUPÉRIEURE D'ONGLETS MULTI-YOUTUBE ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          backgroundColor: 'var(--sidebar-bg)',
          borderBottom: '1px solid var(--border-color)',
          height: '42px',
          padding: '0 8px',
          gap: '4px',
          overflowX: 'auto',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 10px 0 4px', borderRight: '1px solid var(--border-color)', marginRight: '4px' }}>
          <YouTubeIcon size={18} />
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#f4f4f5', letterSpacing: '-0.2px' }}>
            YouTube
          </span>
        </div>

        {/* Liste des onglets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, minWidth: 0, overflowX: 'auto' }}>
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  height: '32px',
                  padding: '0 10px',
                  borderRadius: '6px',
                  backgroundColor: isActive ? 'var(--element-active)' : 'transparent',
                  border: `1px solid ${isActive ? 'rgba(239, 68, 68, 0.45)' : 'transparent'}`,
                  color: isActive ? '#fff' : 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                  maxWidth: '220px',
                  minWidth: '120px',
                  transition: 'all 0.15s ease',
                  flexShrink: 0
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'var(--element-bg-hover)'
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: isActive ? '#ef4444' : '#6b7280', flexShrink: 0 }} />
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1
                  }}
                  title={tab.title}
                >
                  {tab.title}
                </span>

                <button
                  onClick={(e) => handleCloseTab(tab.id, e)}
                  title="Fermer l'onglet"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '18px',
                    height: '18px',
                    borderRadius: '4px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: 0
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#fff'
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--text-muted)'
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <XIcon size={11} />
                </button>
              </div>
            )
          })}

          {/* Bouton Nouvel Onglet (+) */}
          <button
            onClick={() => handleAddTab()}
            title="Ouvrir un nouvel onglet YouTube"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--element-bg-hover)'
              e.currentTarget.style.color = '#fff'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }}
          >
            <PlusIcon size={14} />
          </button>
        </div>
      </div>

      {/* ── BARRE DE CONTRÔLES & ADRESSE / RECHERCHE ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          backgroundColor: 'var(--sidebar-bg)',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0
        }}
      >
        {/* Navigation : Précédent, Suivant, Recharger, Accueil */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={handleGoBack}
            title="Page précédente"
            style={{
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              borderRadius: '6px',
              color: 'var(--text-secondary)',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            <ArrowLeftIcon size={14} />
          </button>

          <button
            onClick={handleGoForward}
            title="Page suivante"
            style={{
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              borderRadius: '6px',
              color: 'var(--text-secondary)',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            <ArrowRightIcon size={14} />
          </button>

          <button
            onClick={handleReload}
            title="Recharger la vidéo"
            style={{
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              borderRadius: '6px',
              color: 'var(--text-secondary)',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            <RefreshCwIcon size={13} />
          </button>

          <button
            onClick={handleGoHome}
            title="Accueil YouTube"
            style={{
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              borderRadius: '6px',
              color: 'var(--text-secondary)',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            <HomeIcon size={14} />
          </button>
        </div>

        {/* Formulaire URL / Recherche */}
        <form
          onSubmit={handleSubmitUrl}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--editor-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '20px',
            padding: '3px 12px',
            gap: '8px'
          }}
        >
          <SearchIcon size={13} style={{ color: '#ef4444', flexShrink: 0 }} />
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="Collez un lien YouTube ou tapez une recherche..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#fff',
              fontSize: '12.5px',
              fontFamily: 'inherit'
            }}
          />
        </form>

        {/* Actions rapides droite : Connexion Chrome, Cookies, Historique, Raccourci, Copier, Externe */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>


          {/* Bouton Historique avec badge */}
          <button
            onClick={() => setIsHistoryDrawerOpen((prev) => !prev)}
            title="Historique de visionnage par date et heure"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              height: '28px',
              padding: '0 8px',
              background: isHistoryDrawerOpen ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
              border: `1px solid ${isHistoryDrawerOpen ? 'rgba(56, 189, 248, 0.45)' : 'var(--border-color)'}`,
              borderRadius: '6px',
              color: isHistoryDrawerOpen ? '#38bdf8' : 'var(--text-secondary)',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <ClockIcon size={13} style={{ color: isHistoryDrawerOpen ? '#38bdf8' : 'inherit' }} />
            <span>Historique</span>
            {history.length > 0 && (
              <span style={{ fontSize: '9.5px', padding: '1px 4px', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.1)', color: '#fff' }}>
                {history.length}
              </span>
            )}
          </button>

          {/* Bouton bookmark / enregistrer cette page comme raccourci */}
          <button
            onClick={handleOpenAddModal}
            title="Enregistrer cette vidéo ou recherche en raccourci"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              height: '28px',
              padding: '0 8px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '6px',
              color: '#f87171',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.25)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.12)')}
          >
            <StarIcon size={12} filled />
            <span>Raccourci</span>
          </button>

          <button
            onClick={handleCopyUrl}
            title="Copier le lien"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              height: '28px',
              padding: '0 8px',
              background: 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              color: copied ? '#4ade80' : 'var(--text-secondary)',
              fontSize: '11px',
              cursor: 'pointer'
            }}
          >
            {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
            <span>{copied ? 'Copié !' : 'Copier'}</span>
          </button>

          <button
            onClick={handleOpenExternal}
            title="Ouvrir dans le navigateur externe"
            style={{
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              color: 'var(--text-secondary)',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            <ExternalLinkIcon size={12} />
          </button>
        </div>
      </div>



      {/* ── BARRE DE RACCOURCIS YOUTUBE (AJOUTABLES & SUPPRIMABLES) ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 14px',
          backgroundColor: 'var(--editor-bg)',
          borderBottom: '1px solid var(--border-subtle)',
          overflowX: 'auto',
          flexShrink: 0
        }}
      >
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
          Raccourcis :
        </span>

        {/* Bouton Ajouter un raccourci (+) */}
        <button
          onClick={handleOpenAddModal}
          title="Ajouter un nouveau raccourci YouTube"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 8px',
            borderRadius: '12px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            color: '#f87171',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.3)'
            e.currentTarget.style.color = '#fff'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)'
            e.currentTarget.style.color = '#f87171'
          }}
        >
          <PlusIcon size={11} />
          <span>Ajouter</span>
        </button>

        {/* Liste des raccourcis modifiables et supprimables */}
        {shortcuts.map((chip) => (
          <div
            key={chip.id}
            onClick={() => handleOpenShortcut(chip)}
            title={`Ouvrir "${chip.label}" (${chip.urlOrQuery})`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 6px 3px 10px',
              borderRadius: '12px',
              backgroundColor: 'var(--element-bg)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              fontSize: '11px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'background-color 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--element-bg-hover)'
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
              e.currentTarget.style.color = '#fff'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--element-bg)'
              e.currentTarget.style.borderColor = 'var(--border-color)'
              e.currentTarget.style.color = 'var(--text-primary)'
            }}
          >
            {SHORTCUT_ICON_MAP[chip.id] ?? <PlayCircleIcon size={12} />}
            <span>{chip.label}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleDeleteShortcut(chip.id)
              }}
              title={`Supprimer "${chip.label}"`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: 0,
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#ef4444'
                e.currentTarget.style.color = '#fff'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'
                e.currentTarget.style.color = 'var(--text-secondary)'
              }}
            >
              <XIcon size={9} />
            </button>
          </div>
        ))}
      </div>



      {/* ── VOLET / TIROIR HISTORIQUE DE VISIONNAGE (PAR DATE ET HEURE) ── */}
      {isHistoryDrawerOpen && (
        <div
          style={{
            position: 'absolute',
            top: '84px',
            right: 0,
            bottom: 0,
            width: '380px',
            maxWidth: '100%',
            backgroundColor: '#131318',
            borderLeft: '1px solid var(--border-color)',
            zIndex: 900,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-10px 0 30px rgba(0, 0, 0, 0.65)'
          }}
        >
          {/* Header de l'historique */}
          <div
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#16161d'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ClockIcon size={16} style={{ color: '#38bdf8' }} />
              <div>
                <h3 style={{ fontSize: '13.5px', fontWeight: 600, color: '#fff', margin: 0 }}>
                  Historique YouTube
                </h3>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Classé par heure et par date
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {history.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  title="Effacer tout l'historique"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    color: '#f87171',
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  <TrashIcon size={12} />
                  <span>Vider</span>
                </button>
              )}

              <button
                onClick={() => setIsHistoryDrawerOpen(false)}
                title="Fermer l'historique"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <XIcon size={14} />
              </button>
            </div>
          </div>

          {/* Recherche dans l'historique */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', backgroundColor: '#131318' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 10px',
                backgroundColor: 'var(--editor-bg)',
                borderRadius: '8px',
                border: '1px solid var(--border-color)'
              }}
            >
              <SearchIcon size={13} style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Filtrer l'historique..."
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#fff',
                  fontSize: '12px',
                  width: '100%'
                }}
              />
              {historySearchQuery && (
                <button
                  onClick={() => setHistorySearchQuery('')}
                  style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: 0 }}
                >
                  <XIcon size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Liste chronologique par date et heure */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
            {groupedHistory.map((group) => (
              <div key={group.dateLabel} style={{ marginBottom: '18px' }}>
                {/* En-tête de date (Aujourd'hui, Hier, Date complète) */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '8px',
                    paddingBottom: '4px',
                    borderBottom: '1px solid var(--border-subtle)'
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <CalendarIcon size={13} style={{ color: '#38bdf8' }} /> {group.dateLabel}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    ({group.items.length} vidéo{group.items.length > 1 ? 's' : ''})
                  </span>
                </div>

                {/* Éléments avec heure */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {group.items.map((item) => {
                    const timeStr = new Date(item.timestamp).toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          const wv = webviewRefs.current[activeTabId]
                          if (wv && typeof wv.loadURL === 'function') {
                            wv.loadURL(item.url)
                          }
                          setTabs((prev) =>
                            prev.map((t) => (t.id === activeTabId ? { ...t, url: item.url, title: item.title } : t))
                          )
                          setIsHistoryDrawerOpen(false)
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 10px',
                          backgroundColor: 'var(--element-bg)',
                          borderRadius: '8px',
                          border: '1px solid var(--border-color)',
                          cursor: 'pointer',
                          gap: '8px',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--element-bg-hover)'
                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--element-bg)'
                          e.currentTarget.style.borderColor = 'var(--border-color)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                          {/* Heure précise */}
                          <span
                            style={{
                              fontSize: '10.5px',
                              fontWeight: 600,
                              fontFamily: 'monospace',
                              padding: '2px 5px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(255, 255, 255, 0.06)',
                              color: 'var(--text-secondary)',
                              flexShrink: 0
                            }}
                          >
                            {timeStr}
                          </span>

                          {/* Titre & Lien */}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                fontSize: '12px',
                                fontWeight: 500,
                                color: '#f4f4f5',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                              title={item.title}
                            >
                              {item.title}
                            </div>
                            <div
                              style={{
                                fontSize: '10px',
                                color: 'var(--text-muted)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {item.url}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleAddTab(item.url, item.title)
                              setIsHistoryDrawerOpen(false)
                            }}
                            title="Ouvrir dans un nouvel onglet"
                            style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(255, 255, 255, 0.08)',
                              border: 'none',
                              color: 'var(--text-secondary)',
                              fontSize: '10px',
                              cursor: 'pointer'
                            }}
                          >
                            + Onglet
                          </button>

                          <button
                            onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                            title="Supprimer de l'historique"
                            style={{
                              width: '18px',
                              height: '18px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '4px',
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              padding: 0
                            }}
                          >
                            <XIcon size={10} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {groupedHistory.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)', fontSize: '12.5px' }}>
                {historySearchQuery ? 'Aucun résultat trouvé pour cette recherche.' : 'Aucun historique de visionnage pour le moment.'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL : AJOUTER UN RACCOURCI YOUTUBE ── */}
      {isAddModalOpen && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={() => setIsAddModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '420px',
              maxWidth: '95%',
              backgroundColor: '#18181b',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <YouTubeIcon size={20} />
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#fff', margin: 0 }}>
                  Ajouter un raccourci YouTube
                </h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <XIcon size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitNewShortcut} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#d4d4d8', marginBottom: '6px' }}>
                  Nom du raccourci
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  placeholder="Ex: Synthwave Relax, Tutos Node.js..."
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--editor-bg)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#d4d4d8', marginBottom: '6px' }}>
                  Lien YouTube ou recherche
                </label>
                <input
                  type="text"
                  placeholder="URL YouTube (https://...) ou mots-clés"
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--editor-bg)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Si vous entrez des mots-clés, la recherche YouTube s'ouvrira directement.
                </div>
              </div>

              {activeTab && activeTab.url !== DEFAULT_URL && (
                <button
                  type="button"
                  onClick={() => {
                    setNewLabel(activeTab.title || 'Ma vidéo')
                    setNewTarget(activeTab.url)
                  }}
                  style={{
                    padding: '6px 10px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px dashed rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#38bdf8',
                    fontSize: '11.5px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <ZapIcon size={12} style={{ flexShrink: 0 }} /> Remplir avec la vidéo actuellement ouverte : <strong>{activeTab.title.slice(0, 35)}...</strong>
                </button>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '6px',
                    backgroundColor: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: 'var(--text-secondary)',
                    fontSize: '12.5px',
                    cursor: 'pointer'
                  }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '7px 16px',
                    borderRadius: '6px',
                    backgroundColor: '#ef4444',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: '12.5px',
                    cursor: 'pointer'
                  }}
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}



      {/* ── ZONE DE RENDU DES ONGLETS WEBVIEW (LECTURE CONTINUE SANS COUPURE EN ARRIÈRE-PLAN) ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {tabs.map((tab) => {
          const isCurrent = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              style={
                isCurrent
                  ? {
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      zIndex: 10
                    }
                  : {
                      position: 'absolute',
                      left: '-99999px',
                      top: '-99999px',
                      width: '1280px',
                      height: '720px',
                      opacity: 0.001,
                      pointerEvents: 'none',
                      zIndex: -1
                    }
              }
            >
              <webview
                ref={(el) => attachWebviewListeners(tab.id, el)}
                src={initialUrlsRef.current[tab.id] || tab.url}
                allowpopups={"true" as any}
                partition="persist:claude"
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none'
                }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
