import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Sidebar from '@renderer/components/Sidebar'
import EditorHeader from '@renderer/components/EditorHeader'
import PdfViewer from '@renderer/components/PdfViewer'
import WorkflowView, { WorkflowStatus } from '@renderer/components/WorkflowView'
import YouTubeWorkspace from '@renderer/components/YouTubeWorkspace'
import MDEditor from '@uiw/react-md-editor'
import { modernCommands } from '@renderer/components/editorCommands'
import CodeWorkspace, { prepareHtmlPreview } from '@renderer/components/CodeWorkspace'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import wikiLinkPlugin from 'remark-wiki-link'
import { TreeNode, DeletedNote } from './types'
import {
  getFileIcon,
  DownloadIcon,
  MessageSquareIcon,
  ClaudeIcon,
  ChatGPTIcon,
  GeminiIcon,
  OfflineHtmlIcon,
  RotateCwIcon,
  HomeIcon,
  TrashIcon,
  FolderIcon,
  SparklesIcon,
  ZoomInIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  OutlineIcon
} from '@renderer/components/Icons'
import AutonomousAgentWorkspace from './components/AutonomousAgentWorkspace'
import defaultSnippetsJson from '@renderer/assets/snippets.default.json'
import { Snippet } from './types/snippets'
import { expandSnippet, SnippetSession } from './utils/snippetEngine'
import { SnippetPalette } from './components/SnippetPalette'
import { SettingsModal } from './components/SettingsModal'
import { HistoryModal } from './components/HistoryModal'
import { ExportModal } from './components/ExportModal'
import LinkRenameModal from './components/LinkRenameModal'
import OutlinePanel, { OutlinePosition } from './components/OutlinePanel'
import NewSessionModal from './components/NewSessionModal'
import { extractOutline, OutlineHeading, slugifyHeading } from './utils/outlineExtractor'
import { detectNextSession, SessionSuggestion, NoteTemplate } from './utils/sessionDetector'
import { RenameOperationPlan } from './utils/linkUpdater'
import { highlightAllCodeBlocksInHtml } from './utils/codeHighlighter'
import { formatHtml } from './utils/formatHtml'
import { parsePdfLink } from './utils/pdfAnnotations'
import getCaretCoordinates from 'textarea-caret'
import { describeApiError, isAccessDenied, notifyApiError } from './utils/apiError'

// TypeScript definition to support non-standard webview tag in JSX
declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLWebViewElement>,
        HTMLWebViewElement
      > & {
        src?: string
        id?: string
        ref?: React.RefObject<any> | ((el: any) => void)
        style?: React.CSSProperties
        allowpopups?: string | boolean
        partition?: string
        useragent?: string
      }
    }
  }
}

interface ShortcutMapping {
  uuid: string
  actionId: string
  key: string
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

const ACTIONS: Record<string, string> = {
  'create-note': 'Créer une nouvelle note',
  'delete-note': 'Supprimer la note actuelle',
  'open-settings': 'Ouvrir les paramètres',
  'toggle-sidebar': 'Afficher/masquer la barre latérale',
  'toggle-claude': "Afficher/masquer l'assistant IA",
  'toggle-fullscreen': 'Basculer en plein écran',
  'switch-ai': "Changer d'IA (Claude, ChatGPT, Gemini)",
  'open-recent': 'Afficher les notes récentes (Ctrl+R)'
}

const DEFAULT_MAPPINGS: ShortcutMapping[] = [
  { uuid: '1', actionId: 'create-note', key: 'n', ctrlKey: true, shiftKey: false, altKey: false },
  {
    uuid: '2',
    actionId: 'delete-note',
    key: 'Delete',
    ctrlKey: false,
    shiftKey: false,
    altKey: false
  },
  { uuid: '3', actionId: 'open-settings', key: ',', ctrlKey: true, shiftKey: false, altKey: false },
  {
    uuid: '4',
    actionId: 'toggle-sidebar',
    key: 'b',
    ctrlKey: true,
    shiftKey: false,
    altKey: false
  },
  { uuid: '5', actionId: 'toggle-claude', key: 'j', ctrlKey: true, shiftKey: false, altKey: false },
  {
    uuid: '6',
    actionId: 'toggle-fullscreen',
    key: 'f',
    ctrlKey: true,
    shiftKey: false,
    altKey: false
  },
  { uuid: '7', actionId: 'switch-ai', key: 'i', ctrlKey: true, shiftKey: false, altKey: false },
  { uuid: '8', actionId: 'open-recent', key: 'r', ctrlKey: true, shiftKey: false, altKey: false }
]

const AI_SPY_SCRIPT = `(function() {
if (window.__aiSpyInjected) return;
window.__aiSpyInjected = true;

// Inject custom minimalist scrollbars to match the app
const style = document.createElement('style');
style.textContent = \`
  ::-webkit-scrollbar { width: 5px !important; height: 5px !important; background-color: transparent !important; }
  ::-webkit-scrollbar-track { background: transparent !important; }
  ::-webkit-scrollbar-thumb { background-color: rgba(255, 255, 255, 0.2) !important; border-radius: 9999px !important; border: none !important; }
  ::-webkit-scrollbar-thumb:hover { background-color: rgba(255, 255, 255, 0.45) !important; }
  ::-webkit-scrollbar-button { display: none !important; width: 0 !important; height: 0 !important; }
  ::-webkit-scrollbar-corner { background: transparent !important; }
\`;
document.head.appendChild(style);

// ── Intercepteur PDF downloads (laisse passer le téléchargement natif) ───
(function() {
  document.addEventListener('click', function(e) {
    const a = e.target && e.target.closest ? e.target.closest('a[download], a[href*=".pdf"]') : null;
    if (!a) return;
    const href = a.getAttribute('href') || '';
    const fname = a.getAttribute('download') || decodeURIComponent(href.split('/').pop()?.split('?')[0] || 'document.pdf');
    const safeName = fname.toLowerCase().endsWith('.pdf') ? fname : fname + '.pdf';
    console.log(JSON.stringify({ type: 'PDF_CLICK', filename: safeName, href: href.substring(0, 100) }));
  }, true);
})();

function scanCodeBlocks() {
  document.querySelectorAll('pre').forEach(pre => {
    if (pre.querySelector('.nf-save-btn') || !pre.querySelector('code')) return;
    
    if (window.getComputedStyle(pre).position === 'static') {
      pre.style.position = 'relative';
    }
    
    const btn = document.createElement('button');
    btn.className = 'nf-save-btn';
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> <span style="font-size:12px;margin-left:6px;font-weight:500;">Sauvegarder</span>';
    btn.style.cssText = 'position:absolute;bottom:8px;right:8px;padding:4px 8px;background:rgba(255,255,255,0.03);color:#a1a1aa;border:1px solid rgba(255,255,255,0.05);border-radius:4px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;cursor:pointer;z-index:9999;transition:all 0.2s ease;opacity:0.4;backdrop-filter:blur(4px);';
    
    btn.onmouseover = () => {
      btn.style.opacity = '1';
      btn.style.backgroundColor = 'rgba(255,255,255,0.1)';
      btn.style.borderColor = 'rgba(255,255,255,0.1)';
      btn.style.color = '#fff';
    };
    btn.onmouseout = () => {
      btn.style.opacity = '0.4';
      btn.style.backgroundColor = 'rgba(255,255,255,0.03)';
      btn.style.borderColor = 'rgba(255,255,255,0.05)';
      btn.style.color = '#a1a1aa';
    };
    
    btn.addEventListener('click', function(e) {
      e.preventDefault(); e.stopPropagation();
      const codeEl = pre.querySelector('code');
      const rawCode = (codeEl ? codeEl.textContent : pre.textContent || '').trim();
      const langMatch = codeEl ? (codeEl.className || '').match(/language-([a-zA-Z0-9]+)/) : null;
      console.log(JSON.stringify({ type: 'CLAUDE_CODE_SAVE', code: rawCode, language: langMatch ? langMatch[1] : 'text' }));
      
      const originalHtml = btn.innerHTML;
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> <span style="font-size:12px;margin-left:6px;color:#4ade80;font-weight:500;">Sauvegardé</span>';
      setTimeout(() => { 
        btn.innerHTML = originalHtml; 
      }, 2500);
    });
    
    pre.appendChild(btn);
  });
}

scanCodeBlocks();

// Debounced observer to prevent high CPU or React DOM collisions
let scanTimer = null;
const observer = new MutationObserver((mutations) => {
  let shouldScan = false;
  for (const m of mutations) {
    if (m.addedNodes.length > 0) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1 && !node.classList?.contains('nf-save-btn')) {
          shouldScan = true;
          break;
        }
      }
    }
    if (shouldScan) break;
  }
  if (!shouldScan) return;
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = setTimeout(scanCodeBlocks, 800);
});

observer.observe(document.body, { childList: true, subtree: true });
console.log(JSON.stringify({ type: 'SPY_ACTIVE' }));
})()`

function App() {
  const [selectedFiles, setSelectedFiles] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('app_last_selected_files')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {}
    return []
  })

  useEffect(() => {
    try {
      if (selectedFiles.length > 0) {
        localStorage.setItem('app_last_selected_files', JSON.stringify(selectedFiles))
      }
    } catch {}
  }, [selectedFiles])

  const [fileContent, setFileContent] = useState<string>('')
  const [files, setFiles] = useState<string[]>([])
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [deletedNotes, setDeletedNotes] = useState<DeletedNote[]>([])
  const [activeView, setActiveView] = useState<
    'all' | 'drafts' | 'deleted' | 'workflow' | 'recent' | 'youtube'
  >(() => {
    try {
      const saved = localStorage.getItem('app_last_active_view')
      if (saved && ['all', 'drafts', 'deleted', 'workflow', 'recent', 'youtube'].includes(saved)) {
        return saved as any
      }
    } catch {}
    return 'all'
  })

  useEffect(() => {
    try {
      localStorage.setItem('app_last_active_view', activeView)
    } catch {}
  }, [activeView])

  const [hasOpenedYouTube, setHasOpenedYouTube] = useState(() => {
    try {
      const savedView = localStorage.getItem('app_last_active_view')
      if (savedView === 'youtube') return true
      const saved = localStorage.getItem('youtube_open_tabs')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) return true
      }
    } catch {}
    return false
  })

  useEffect(() => {
    if (activeView === 'youtube') {
      setHasOpenedYouTube(true)
    }
  }, [activeView])
  const [noteWorkflowStatuses, setNoteWorkflowStatuses] = useState<Record<string, WorkflowStatus>>(
    () => {
      try {
        const saved = localStorage.getItem('note_workflow_statuses')
        return saved ? JSON.parse(saved) : {}
      } catch {
        return {}
      }
    }
  )

  const handleUpdateWorkflowStatus = (file: string, status: WorkflowStatus) => {
    setNoteWorkflowStatuses((prev) => {
      const updated = { ...prev, [file]: status }
      try {
        localStorage.setItem('note_workflow_statuses', JSON.stringify(updated))
      } catch {
        // ignore
      }
      return updated
    })
  }

  const [noteTags, setNoteTags] = useState<Record<string, string[]>>({})
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchFilter, setSearchFilter] = useState('')
  const [editorMode, setEditorMode] = useState<'preview' | 'live' | 'edit'>('live')

  // Autocomplete state
  const [autocompleteVisible, setAutocompleteVisible] = useState(false)
  const [autocompleteQuery, setAutocompleteQuery] = useState('')
  const [cursorPos, setCursorPos] = useState<number>(0)

  // Snippets system state (Obsidian style)
  const [snippets, setSnippets] = useState<Snippet[]>(
    (defaultSnippetsJson.snippets as Snippet[]) || []
  )
  const [snippetError, setSnippetError] = useState<string | null>(null)
  const [isSnippetPaletteOpen, setIsSnippetPaletteOpen] = useState(false)
  const [snippetPalettePos, setSnippetPalettePos] = useState<{ top: number; left: number } | null>(
    null
  )
  const [snippetQuery, setSnippetQuery] = useState('')
  const [snippetSelectedIndex, setSnippetSelectedIndex] = useState(0)
  const activeSnippetSessionRef = useRef<SnippetSession | null>(null)

  // Fonctionnalités avancées : Focus Zen, Typewriter, Copilote IA, Time Travel, Export
  const [isZenMode, setIsZenMode] = useState(false)
  const [isTypewriterMode, setIsTypewriterMode] = useState(false)
  const [isCopilotEnabled, setIsCopilotEnabled] = useState(() => {
    try {
      return localStorage.getItem('copilot_enabled') !== 'false'
    } catch {
      return true
    }
  })
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [pendingRenamePlan, setPendingRenamePlan] = useState<RenameOperationPlan | null>(null)
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false)
  const [isApplyingRename, setIsApplyingRename] = useState(false)
  const [undoRenameBanner, setUndoRenameBanner] = useState<{
    operationId: string
    message: string
    targetPath: string
  } | null>(null)
  const undoBannerTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Plan du document (Outline)
  const [isOutlineOpen, setIsOutlineOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('note_app_outline_open') === 'true'
    } catch {
      return false
    }
  })
  const [outlinePosition, setOutlinePosition] = useState<OutlinePosition>(() => {
    try {
      return (localStorage.getItem('note_app_outline_position') as OutlinePosition) || 'right'
    } catch {
      return 'right'
    }
  })
  const [headings, setHeadings] = useState<OutlineHeading[]>([])
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null)
  const [targetHeading, setTargetHeading] = useState<
    (OutlineHeading & { timestamp: number }) | null
  >(null)

  const handleToggleOutline = useCallback(() => {
    setIsOutlineOpen((prev) => {
      const next = !prev
      try {
        localStorage.setItem('note_app_outline_open', String(next))
      } catch {}
      return next
    })
  }, [])

  const handleChangeOutlinePosition = useCallback((pos: OutlinePosition) => {
    setOutlinePosition(pos)
    try {
      localStorage.setItem('note_app_outline_position', pos)
    } catch {}
  }, [])

  // Modèles de cours & Nouvelle séance
  const [isNewSessionModalOpen, setIsNewSessionModalOpen] = useState(false)
  const [newSessionTargetFolder, setNewSessionTargetFolder] = useState('')
  const [newSessionSuggestion, setNewSessionSuggestion] = useState<SessionSuggestion | null>(null)
  const [availableTemplates, setAvailableTemplates] = useState<NoteTemplate[]>([])
  const [isSubmittingNewSession, setIsSubmittingNewSession] = useState(false)

  // Navigation & Annotations PDF
  const [targetPdfPage, setTargetPdfPage] = useState<number | undefined>(undefined)
  const [lastActiveNote, setLastActiveNote] = useState<string | null>(null)

  // AI integration states
  type AIProvider = 'agent' | 'claude' | 'chatgpt' | 'gemini'
  const [activeAI, setActiveAI] = useState<AIProvider>(() => {
    try {
      const saved = localStorage.getItem('selected_ai_provider') as AIProvider
      if (saved === 'agent' || saved === 'chatgpt' || saved === 'gemini' || saved === 'claude')
        return saved
    } catch {}
    return 'claude'
  })

  // Synchronisation systématique de l'IA active dans localStorage pour persister entre chaque session
  useEffect(() => {
    try {
      localStorage.setItem('selected_ai_provider', activeAI)
    } catch {}
  }, [activeAI])

  const handleSelectAI = (ai: AIProvider) => {
    setActiveAI(ai)
    try {
      localStorage.setItem('selected_ai_provider', ai)
    } catch {}
    setShowAIWorkspace(true)
  }
  const [spyActive, setSpyActive] = useState(false)
  const [showAIWorkspace, setShowAIWorkspace] = useState(() => {
    try {
      return localStorage.getItem('show_ai_workspace') === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('show_ai_workspace', String(showAIWorkspace))
    } catch {}
  }, [showAIWorkspace])
  const claudeWebviewRef = useRef<any>(null)
  const chatgptWebviewRef = useRef<any>(null)
  const geminiWebviewRef = useRef<any>(null)

  const getActiveWebview = () => {
    if (activeAI === 'claude') return claudeWebviewRef.current
    if (activeAI === 'chatgpt') return chatgptWebviewRef.current
    return geminiWebviewRef.current
  }

  const webviewRef = {
    get current() {
      return getActiveWebview()
    }
  }
  const [aiWidth, setAiWidth] = useState<number>(() => {
    const saved = localStorage.getItem('claude_panel_width')
    return saved ? Math.max(380, parseInt(saved, 10)) : 460
  })
  const aiWidthRef = useRef(aiWidth)
  aiWidthRef.current = aiWidth
  const [isResizing, setIsResizing] = useState(false)

  // Sidebar resize & collapse states
  const [sidebarWidth, setSidebarWidth] = useState<number>(260)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isSidebarResizing, setIsSidebarResizing] = useState(false)
  const sidebarDragging = useRef(false)

  // Note editing & settings states
  const [editingFile, setEditingFile] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [notesToDelete, setNotesToDelete] = useState<string[]>([])

  // Zoom state
  const [zoomLevel, setZoomLevel] = useState<number>(100)
  const [showZoomIndicator, setShowZoomIndicator] = useState(false)
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const markdownEditorContainerRef = useRef<HTMLDivElement>(null)
  const fullscreenMarkdownRef = useRef<HTMLDivElement>(null)
  const fullscreenHtmlIframeRef = useRef<HTMLIFrameElement>(null)
  const lastFullscreenMutationTimeRef = useRef<number>(0)
  const lastFullscreenEmittedHtmlRef = useRef<string>('')
  const lastFullscreenSrcDocRef = useRef<string>('')
  const fullscreenNormalizeTimerRef = useRef<NodeJS.Timeout | null>(null)
  const latestFullscreenRawHtmlRef = useRef<string>('')

  const getMarkdownScrollElement = (container: HTMLElement | null) => {
    if (!container) return null
    return (
      container.querySelector<HTMLElement>('.w-md-editor-preview') ||
      container.querySelector<HTMLElement>('.w-md-editor-text-input') ||
      container.querySelector<HTMLElement>('.w-md-editor-text') ||
      container.querySelector<HTMLElement>('textarea') ||
      container.querySelector<HTMLElement>('.w-md-editor-content')
    )
  }

  const [shortcuts, setShortcuts] = useState<ShortcutMapping[]>(() => {
    const stored = localStorage.getItem('note-app-shortcuts')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          const merged = parsed.map((m: ShortcutMapping) => {
            if (m.actionId === 'toggle-fullscreen' && (m.key === 'F11' || !m.ctrlKey)) {
              return { ...m, key: 'f', ctrlKey: true, shiftKey: false, altKey: false }
            }
            return m
          })
          DEFAULT_MAPPINGS.forEach((def) => {
            if (!merged.find((m) => m.actionId === def.actionId)) {
              merged.push(def)
            }
          })
          return merged
        }
      } catch (e) {
        console.error(e)
      }
    }
    return DEFAULT_MAPPINGS
  })
  const [recordingUuid, setRecordingUuid] = useState<string | null>(null)

  // Claude Save Modal states
  const [codeToSave, setCodeToSave] = useState<{ code: string; language: string } | null>(null)
  const [saveActionType, setSaveActionType] = useState<'new' | 'append'>('new')
  const [newFileName, setNewFileName] = useState<string>('')
  const [selectedExistingFile, setSelectedExistingFile] = useState<string>('')
  const [saveAsCodeBlock, setSaveAsCodeBlock] = useState<boolean>(true)

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const activeLoadedFileRef = useRef<string | null>(null)
  const fileContentRef = useRef<string>('')

  // ── Side-by-side panel ──────────────────────────────────────────────────────
  const [sideBySideFile, setSideBySideFile] = useState<string | null>(null)
  const [sideBySideContent, setSideBySideContent] = useState<string>('')
  const [sideBySideRatio, setSideBySideRatio] = useState(50)
  const [isSideBySideDragging, setIsSideBySideDragging] = useState(false)

  const fetchFiles = async () => {
    try {
      const [tree, flat, config, deleted] = await Promise.all([
        window.api.getNotesTree(),
        window.api.listMarkdownFiles(),
        window.api.getConfig(),
        window.api.getDeletedNotes()
      ])
      setTreeNodes(tree || [])
      setFiles(flat || [])
      if (config?.favorites && Array.isArray(config.favorites)) {
        setFavorites(config.favorites)
      }
      if (config?.tags && typeof config.tags === 'object') {
        setNoteTags(config.tags)
      }
      setDeletedNotes(deleted || [])
      if (flat) {
        setSelectedFiles((prev) => {
          // Si le fichier sélectionné est valide dans flat, on le conserve
          const valid = prev.filter((f) => flat.includes(f) || f === '__claude_code__')
          if (valid.length === prev.length && valid.every((f, i) => f === prev[i])) return prev
          if (valid.length > 0) return valid

          // Sinon, tenter de restaurer depuis le localStorage
          try {
            const saved = localStorage.getItem('app_last_selected_files')
            if (saved) {
              const parsed = JSON.parse(saved)
              if (Array.isArray(parsed) && parsed.length > 0) {
                const validSaved = parsed.filter((f) => flat.includes(f) || f === '__claude_code__')
                if (validSaved.length > 0) return validSaved
              }
            }
          } catch {}

          if (flat.length > 0) {
            const showcase =
              'Equal. Product Design Agency/UX audit & Nav Architecture/The Essentials of Navigation Architecture.md'
            if (flat.includes(showcase)) return [showcase]
            return [flat[0]]
          }
          return []
        })
      }
    } catch (err) {
      console.error('Error fetching tree & files:', err)
    }
  }

  const handleOpenNewSession = useCallback(
    async (folderPath: string) => {
      // Lister les fichiers du dossier cible
      const filesInFolder = files.filter((f) => {
        const parent = f.includes('/') ? f.substring(0, f.lastIndexOf('/')) : ''
        return parent === folderPath
      })

      const suggestion = detectNextSession(folderPath, filesInFolder)
      setNewSessionTargetFolder(folderPath)
      setNewSessionSuggestion(suggestion)

      // Récupérer les modèles disponibles
      try {
        if (window.api?.getTemplates) {
          const tmpls = await window.api.getTemplates()
          setAvailableTemplates(tmpls)
        }
      } catch (err) {
        console.warn('Erreur chargement modèles:', err)
      }

      setIsNewSessionModalOpen(true)
    },
    [files]
  )

  const handleSubmitNewSession = useCallback(
    async (params: {
      folderPath: string
      fileName: string
      templateFileName: string
      noteTitle: string
      sessionNumber: number
      tags: string[]
    }) => {
      if (!window.api?.createNoteFromTemplate) return
      setIsSubmittingNewSession(true)

      try {
        const res = await window.api.createNoteFromTemplate({
          folderPath: params.folderPath,
          fileName: params.fileName,
          templateFileName: params.templateFileName,
          context: {
            noteTitle: params.noteTitle,
            folderName: params.folderPath.split('/').pop() || '',
            sessionNumber: params.sessionNumber,
            tags: params.tags
          }
        })

        if (res && res.success && res.relativePath) {
          setIsNewSessionModalOpen(false)
          await fetchFiles()
          setSelectedFiles([res.relativePath])
          setActiveView('all')
          showClaudeToast(`Séance "${params.noteTitle}" créée avec succès !`)
        } else {
          showClaudeToast('Erreur lors de la création de la séance.')
        }
      } catch (err: unknown) {
        console.error('Erreur createNoteFromTemplate:', err)
        showClaudeToast(`Erreur : ${describeApiError(err) || 'Impossible de créer la note'}`)
      } finally {
        setIsSubmittingNewSession(false)
      }
    },
    [fetchFiles]
  )

  // Helper: renvoie "il y a X" à partir d'un timestamp ms
  const timeAgo = (tsMs: number | undefined): string => {
    if (!tsMs) return ''
    const diff = Date.now() - tsMs
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    const weeks = Math.floor(days / 7)
    const months = Math.floor(days / 30)
    if (mins < 1) return "à l'instant"
    if (mins < 60) return `il y a ${mins} min`
    if (hours < 24) return `il y a ${hours}h`
    if (days < 7) return `il y a ${days} jour${days > 1 ? 's' : ''}`
    if (weeks < 5) return `il y a ${weeks} sem.`
    return `il y a ${months} mois`
  }

  const formatFileSize = (bytes?: number): string => {
    if (!bytes || bytes === 0) return ''
    const k = 1024
    const sizes = ['o', 'Ko', 'Mo', 'Go']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  // Cherche le nœud TreeNode correspondant au fichier courant pour ses vraies dates
  const findNode = (nodes: TreeNode[], relPath: string): TreeNode | null => {
    for (const n of nodes) {
      if (n.relativePath === relPath) return n
      if (n.children) {
        const found = findNode(n.children, relPath)
        if (found) return found
      }
    }
    return null
  }

  useEffect(() => {
    fetchFiles()

    // Surveillance automatique en direct du dossier Notes (fs.watch depuis Electron)
    const unsub = window.api?.onNotesUpdated?.(() => {
      fetchFiles()
    })

    // Rafraîchissement automatique dès que l'utilisateur revient dans l'application
    const handleWindowFocus = () => {
      fetchFiles()
    }
    window.addEventListener('focus', handleWindowFocus)

    // Polling de secours toutes les 5s — déclenche un vrai fetchFiles UNIQUEMENT
    // si la liste de fichiers a changé (évite les re-renders qui cassent les drags).
    const lastFlatRef = { current: [] as string[] }
    const pollInterval = setInterval(async () => {
      try {
        const flat: string[] = await window.api.listMarkdownFiles()
        const prev = lastFlatRef.current
        const changed = flat.length !== prev.length || flat.some((f, i) => f !== prev[i])
        if (changed) {
          lastFlatRef.current = flat
          fetchFiles()
        }
      } catch {
        // silencieux
      }
    }, 5000)

    // Surveillance des téléchargements terminés depuis l'IA ou le Webview
    const unsubDownload = window.api?.onDownloadCompleted?.((relPath, fileName) => {
      fetchFiles()
      showClaudeToast(`${fileName} téléchargé dans vos notes`)
      setSelectedFiles([relPath])
    })

    // Raccourci global Ctrl+R pour afficher les notes récentes
    const unsubRecent = window.api?.onShortcutRecent?.(() => {
      setActiveView((prev) => (prev === 'recent' ? 'all' : 'recent'))
    })

    return () => {
      unsub?.()
      unsubDownload?.()
      unsubRecent?.()
      window.removeEventListener('focus', handleWindowFocus)
      clearInterval(pollInterval)
    }
  }, [])

  // Side-by-side panel resize drag
  useEffect(() => {
    if (!isSideBySideDragging) return
    const handleMove = (e: MouseEvent) => {
      const totalW = document.documentElement.clientWidth
      const sideW = isSidebarCollapsed ? 0 : sidebarWidth
      const avail = totalW - sideW
      const ratio = ((e.clientX - sideW) / avail) * 100
      setSideBySideRatio(Math.min(Math.max(ratio, 20), 80))
    }
    const handleUp = () => setIsSideBySideDragging(false)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [isSideBySideDragging, isSidebarCollapsed, sidebarWidth])

  // Zoom logic universel pour tous les fichiers (Markdown, HTML, plein écran)
  const zoomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const applyZoom = useCallback((newZoomOrFn: number | ((prev: number) => number)) => {
    setZoomLevel((prev) => {
      const next = typeof newZoomOrFn === 'function' ? newZoomOrFn(prev) : newZoomOrFn
      const clamped = Math.min(Math.max(next, 50), 300)

      if (editorContainerRef.current) {
        editorContainerRef.current.style.setProperty('--editor-zoom', `${clamped}%`)
      }
      if (fullscreenMarkdownRef.current) {
        fullscreenMarkdownRef.current.style.setProperty('--editor-zoom', `${clamped}%`)
      }
      if (fullscreenHtmlIframeRef.current?.contentWindow) {
        fullscreenHtmlIframeRef.current.contentWindow.postMessage(
          { type: 'SET_HTML_ZOOM', zoom: clamped },
          '*'
        )
      }

      setShowZoomIndicator(true)
      if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current)
      zoomTimeoutRef.current = setTimeout(() => setShowZoomIndicator(false), 1400)

      return clamped
    })
  }, [])

  useEffect(() => {
    const handleGlobalWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        const target = e.target as HTMLElement | null
        if (
          isRenderFullscreenRef.current ||
          target?.closest('.w-md-editor') ||
          target?.closest('.wmde-markdown') ||
          target?.closest('iframe') ||
          editorContainerRef.current?.contains(target)
        ) {
          e.preventDefault()
          let zoomChange = 0
          if (Math.abs(e.deltaY) >= 40) {
            zoomChange = e.deltaY < 0 ? 5 : -5
          } else {
            const d = Math.round(-e.deltaY * 0.35)
            zoomChange = Math.max(Math.min(d === 0 ? (e.deltaY < 0 ? 1 : -1) : d, 6), -6)
          }
          applyZoom((prev) => prev + zoomChange)
        }
      }
    }

    window.addEventListener('wheel', handleGlobalWheel, { passive: false })
    return () => {
      window.removeEventListener('wheel', handleGlobalWheel)
      if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current)
    }
  }, [applyZoom])

  useEffect(() => {
    if (codeToSave) {
      const now = new Date()
      setNewFileName(
        `claude-${codeToSave.language}-${now.toISOString().slice(0, 10)}-${now.toTimeString().slice(0, 5).replace(':', 'h')}`
      )

      const isHtmlOrMd =
        codeToSave.language === 'html' ||
        codeToSave.language === 'xml' ||
        codeToSave.language === 'markdown'
      setSaveAsCodeBlock(!isHtmlOrMd)

      const realFiles = files.filter((f) => f !== '__claude_code__')
      if (realFiles.length > 0) {
        if (selectedFiles.length === 1 && selectedFiles[0] !== '__claude_code__') {
          setSelectedExistingFile(selectedFiles[0])
        } else {
          setSelectedExistingFile(realFiles[0])
        }
      }
    }
  }, [codeToSave, files, selectedFiles])

  const confirmSaveClaudeCode = async () => {
    if (!codeToSave) return
    const now = new Date()
    const contentBlock = saveAsCodeBlock
      ? `\n\n# Code ${codeToSave.language} — depuis Claude\n\n> ${now.toLocaleString('fr-FR')}\n\n\`\`\`${codeToSave.language}\n${codeToSave.code}\n\`\`\`\n`
      : `\n\n> *Extrait ajouté le ${now.toLocaleString('fr-FR')}*\n\n${codeToSave.code}\n`

    try {
      if (saveActionType === 'new') {
        const finalName = (newFileName || 'claude-code').trim()
        const finalFileName = finalName.endsWith('.md') ? finalName : finalName + '.md'
        await window.api.createNoteWithContent(finalFileName, contentBlock.trimStart())
        fetchFiles()
        setSelectedFiles([finalFileName])
        setEditingFile(finalFileName)
      } else {
        const targetFile = selectedExistingFile
        if (targetFile) {
          const existingContent = await window.api.readNote(targetFile)
          await window.api.writeNote(targetFile, existingContent + contentBlock)
          if (selectedFiles.length === 1 && selectedFiles[0] === targetFile) {
            setFileContent(existingContent + contentBlock)
          }
          fetchFiles()
          setSelectedFiles([targetFile])
        }
      }
    } catch (err) {
      notifyApiError('Sauvegarde du code', err)
      return
    }
    setCodeToSave(null)
  }

  useEffect(() => {
    const webviewList: { id: AIProvider; webview: any }[] = [
      { id: 'claude', webview: claudeWebviewRef.current },
      { id: 'chatgpt', webview: chatgptWebviewRef.current },
      { id: 'gemini', webview: geminiWebviewRef.current }
    ]

    const cleanups: (() => void)[] = []

    webviewList.forEach(({ id, webview }) => {
      if (!webview) return

      let injected = false
      const tryInject = () => {
        if (injected) return true
        if (webview && typeof webview.executeJavaScript === 'function') {
          try {
            webview
              .executeJavaScript(AI_SPY_SCRIPT)
              .then(() => {
                injected = true
              })
              .catch(() => {})
            return true
          } catch (e) {
            return false
          }
        }
        return false
      }

      const onLoad = () => {
        setTimeout(tryInject, 500)
      }

      const onConsole = (e: any) => {
        if (!e.message?.startsWith('{')) return
        try {
          const data = JSON.parse(e.message)
          if (data.type === 'SPY_ACTIVE') {
            if (activeAI === id) setSpyActive(true)
          }
          if (data.type === 'CLAUDE_CODE_SAVE' && data.code) {
            setCodeToSave({ code: data.code, language: data.language || 'text' })
          }
          if (data.type === 'PDF_DOWNLOAD' && data.base64 && data.filename) {
            ;(async () => {
              try {
                await window.api.savePdfBase64(data.filename, data.base64)
                showClaudeToast(`PDF sauvegardé : ${data.filename}`)
              } catch (err) {
                showClaudeToast(`Erreur lors de la sauvegarde du PDF : ${describeApiError(err)}`)
              }
            })()
          }
          if (data.type === 'PDF_URL_DOWNLOAD' && data.url && data.filename) {
            ;(async () => {
              try {
                await window.api.downloadPdfFromUrl(data.url, data.filename)
                showClaudeToast(`PDF sauvegardé : ${data.filename}`)
              } catch (err) {
                showClaudeToast(`Erreur lors du téléchargement du PDF : ${describeApiError(err)}`)
              }
            })()
          }
        } catch {}
      }

      webview.addEventListener('dom-ready', onLoad)
      webview.addEventListener('did-finish-load', onLoad)
      webview.addEventListener('console-message', onConsole)

      let pollInterval: NodeJS.Timeout | null = null
      if (!tryInject()) {
        pollInterval = setInterval(() => {
          if (tryInject() && pollInterval) {
            clearInterval(pollInterval)
            pollInterval = null
          }
        }, 1000)
      }

      cleanups.push(() => {
        if (pollInterval) clearInterval(pollInterval)
        webview.removeEventListener('dom-ready', onLoad)
        webview.removeEventListener('did-finish-load', onLoad)
        webview.removeEventListener('console-message', onConsole)
      })
    })

    return () => {
      cleanups.forEach((c) => c())
    }
  }, [claudeWebviewRef.current, chatgptWebviewRef.current, geminiWebviewRef.current, activeAI])

  useEffect(() => {
    const target =
      selectedFiles.length === 1 && selectedFiles[0] !== '__claude_code__' ? selectedFiles[0] : null

    // Si le fichier cible est déjà celui actuellement chargé en mémoire, NE JAMAIS relire depuis le disque !
    // Cela protège à 100% la saisie de l'utilisateur contre les écrasements intempestifs.
    if (target && activeLoadedFileRef.current === target) {
      return
    }

    // Si on change de fichier et qu'une sauvegarde était en attente pour l'ancien fichier, on la flush immédiatement
    if (saveTimeoutRef.current && activeLoadedFileRef.current && fileContentRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
      window.api
        .writeNote(activeLoadedFileRef.current, fileContentRef.current)
        .catch((err) => notifyApiError('Sauvegarde de la note', err))
    }

    activeLoadedFileRef.current = target

    if (target) {
      if (target.toLowerCase().endsWith('.pdf')) {
        setFileContent('')
        fileContentRef.current = ''
        return
      }
      window.api
        .readNote(target)
        .then((content) => {
          if (activeLoadedFileRef.current === target) {
            setFileContent(content)
            fileContentRef.current = content
          }
        })
        .catch((err) => notifyApiError('Lecture de la note', err))
    } else {
      setFileContent('')
      fileContentRef.current = ''
    }
  }, [selectedFiles])

  const handleContentChange = (value?: string) => {
    const newContent = value || ''
    setFileContent(newContent)
    fileContentRef.current = newContent

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    if (
      selectedFiles.length === 1 &&
      selectedFiles[0] !== '__claude_code__' &&
      !selectedFiles[0].toLowerCase().endsWith('.pdf')
    ) {
      const fileToSave = selectedFiles[0]
      saveTimeoutRef.current = setTimeout(() => {
        saveTimeoutRef.current = null
        window.api
          .writeNote(fileToSave, newContent)
          .catch((err) => notifyApiError('Sauvegarde de la note', err))
      }, 700)
    }
  }

  useEffect(() => {
    const fetchSnippets = async () => {
      try {
        if (window.api?.getSnippets) {
          const res = await window.api.getSnippets()
          if (res) {
            if (Array.isArray(res.snippets) && res.snippets.length > 0) {
              setSnippets(res.snippets)
            }
            if (res.error) {
              setSnippetError(res.error)
            } else {
              setSnippetError(null)
            }
          }
        }
      } catch (err: any) {
        console.error('Error fetching snippets in App:', err)
      }
    }
    fetchSnippets()
    let cleanup: (() => void) | undefined
    if (window.api?.onSnippetsUpdated) {
      cleanup = window.api.onSnippetsUpdated(fetchSnippets)
    }
    return () => {
      cleanup?.()
    }
  }, [])

  const updateCursorAndCheckAutocomplete = (target: HTMLTextAreaElement) => {
    const position = target.selectionStart
    setCursorPos(position)

    const textBeforeCursor = target.value.substring(0, position)
    const match = textBeforeCursor.match(/\[\[([^\]]*)$/)

    if (match) {
      setAutocompleteQuery(match[1])
      setAutocompleteVisible(true)
    } else {
      setAutocompleteVisible(false)
    }

    // Détection de la commande de snippets '/'
    const slashMatch = textBeforeCursor.match(/(?:^|[\s\n])\/([a-zA-Z0-9_-]*)$/)
    if (slashMatch) {
      setSnippetQuery(slashMatch[1])
      setSnippetSelectedIndex(0)
      try {
        const coords = getCaretCoordinates(target, position)
        const rect = target.getBoundingClientRect()
        setSnippetPalettePos({
          top: Math.max(20, rect.top + coords.top + 22 - target.scrollTop),
          left: Math.max(10, rect.left + coords.left - target.scrollLeft)
        })
        setIsSnippetPaletteOpen(true)
      } catch {
        setSnippetPalettePos(null)
        setIsSnippetPaletteOpen(true)
      }
    } else {
      if (isSnippetPaletteOpen) {
        setIsSnippetPaletteOpen(false)
      }
    }
  }

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLTextAreaElement
    if (target && target.tagName === 'TEXTAREA' && isSnippetPaletteOpen) {
      const filtered = snippets.filter(
        (s) =>
          (s.scope === 'markdown' || s.scope === 'all') &&
          s.prefix.toLowerCase().includes(snippetQuery.toLowerCase())
      )
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        setSnippetSelectedIndex((prev) => (filtered.length > 0 ? (prev + 1) % filtered.length : 0))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        setSnippetSelectedIndex((prev) =>
          filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0
        )
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (filtered.length > 0 && filtered[snippetSelectedIndex]) {
          e.preventDefault()
          e.stopPropagation()
          handleSelectMarkdownSnippet(filtered[snippetSelectedIndex])
          return
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setIsSnippetPaletteOpen(false)
        return
      }
    }

    if (target && target.tagName === 'TEXTAREA' && activeSnippetSessionRef.current) {
      const session = activeSnippetSessionRef.current
      if (e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        session.adjustForEdit(target.selectionStart, target.selectionEnd)
        const nextTarget = e.shiftKey ? session.previous() : session.next()
        if (nextTarget) {
          target.setSelectionRange(nextTarget.start, nextTarget.end)
        } else {
          activeSnippetSessionRef.current = null
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        activeSnippetSessionRef.current = null
        return
      }
    }
  }

  const handleSelectMarkdownSnippet = (snippet: Snippet) => {
    setIsSnippetPaletteOpen(false)
    const container = fullscreenMarkdownRef.current || markdownEditorContainerRef.current
    const textarea =
      container?.querySelector<HTMLTextAreaElement>('textarea') ||
      document.querySelector<HTMLTextAreaElement>('textarea')
    if (!textarea) return

    const pos = textarea.selectionStart
    const textBefore = fileContent.substring(0, pos)
    const slashMatch = textBefore.match(/(?:^|[\s\n])\/([a-zA-Z0-9_-]*)$/)
    const slashOffset = slashMatch ? slashMatch[0].lastIndexOf('/') : -1
    const replaceStart =
      slashMatch && slashOffset !== -1
        ? textBefore.length - slashMatch[0].length + slashOffset
        : pos

    // Texte sélectionné (pour ${TM_SELECTED_TEXT})
    const selStart = textarea.selectionStart
    const selEnd = textarea.selectionEnd
    const selectedText = selEnd > selStart ? fileContent.substring(selStart, selEnd) : ''

    // Expansion du snippet
    const expanded = expandSnippet(snippet.body, selectedText)

    const newContent =
      fileContent.substring(0, replaceStart) + expanded.text + fileContent.substring(pos)
    setFileContent(newContent)
    fileContentRef.current = newContent
    handleContentChange(newContent)

    // Initialisation de la session de navigation par Tab
    const session = new SnippetSession(expanded, replaceStart)
    activeSnippetSessionRef.current = session

    setTimeout(() => {
      textarea.focus()
      const targetRange = session.getCurrentTarget()
      if (targetRange) {
        textarea.setSelectionRange(targetRange.start, targetRange.end)
      }
    }, 40)
  }

  const handleKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLTextAreaElement
    if (target.tagName === 'TEXTAREA') {
      updateCursorAndCheckAutocomplete(target)
    }
  }

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLTextAreaElement
    if (target.tagName === 'TEXTAREA') {
      updateCursorAndCheckAutocomplete(target)
    }
  }

  const insertLink = (linkName: string) => {
    const textBeforeCursor = fileContent.substring(0, cursorPos)
    const textAfterCursor = fileContent.substring(cursorPos)

    const lastBracketIndex = textBeforeCursor.lastIndexOf('[[')
    if (lastBracketIndex !== -1) {
      const newBefore = textBeforeCursor.substring(0, lastBracketIndex)
      const newContent = newBefore + `[[${linkName}]] ` + textAfterCursor
      setFileContent(newContent)
      fileContentRef.current = newContent
      setAutocompleteVisible(false)

      if (selectedFiles.length === 1 && selectedFiles[0] !== '__claude_code__') {
        window.api
          .writeNote(selectedFiles[0], newContent)
          .catch((err) => notifyApiError('Sauvegarde de la note', err))
      }
    }
  }

  // Side-by-side: ouvrir un fichier dans un 2e panneau
  const handleOpenSideBySide = async (filePath: string) => {
    setSideBySideFile(filePath)
    if (!filePath.toLowerCase().endsWith('.pdf')) {
      try {
        const content = await window.api.readNote(filePath)
        setSideBySideContent(content)
      } catch (err) {
        notifyApiError('Lecture de la note', err)
        setSideBySideContent('')
      }
    } else {
      setSideBySideContent('')
      if (false) closeSideBySide()
    }
  }

  const closeSideBySide = () => {
    if (false) console.log(sideBySideContent, sideBySideRatio)
    setSideBySideFile(null)
    setSideBySideContent('')
  }

  // Note Action Handlers
  const currentFile =
    selectedFiles.length === 1 && selectedFiles[0] !== '__claude_code__' ? selectedFiles[0] : ''
  const isHtml = currentFile.endsWith('.html') || currentFile.endsWith('.htm')
  const isPdf = currentFile.toLowerCase().endsWith('.pdf')

  // Synchroniser le dossier actif pour que les téléchargements (HTML, PDF, etc.) y aillent automatiquement
  useEffect(() => {
    if (window.api?.setActiveFolder) {
      let folder = ''
      if (currentFile && currentFile.includes('/')) {
        folder = currentFile.substring(0, currentFile.lastIndexOf('/'))
      }
      window.api.setActiveFolder(folder).catch((err) => notifyApiError('Dossier actif', err))
    }
    if (
      currentFile &&
      !currentFile.toLowerCase().endsWith('.pdf') &&
      currentFile !== '__claude_code__'
    ) {
      setLastActiveNote(currentFile)
    }
  }, [currentFile])

  // Navigation vers un document PDF à une page donnée
  const handleOpenPdfLink = useCallback(
    (href: string) => {
      const parsed = parsePdfLink(href)
      if (!parsed) return

      let resolvedPath = parsed.pdfPath
      if (currentFile && currentFile.includes('/')) {
        const currentDir = currentFile.substring(0, currentFile.lastIndexOf('/'))
        const combined = `${currentDir}/${parsed.pdfPath}`
        const parts = combined.split('/')
        const norm: string[] = []
        for (const p of parts) {
          if (!p || p === '.') continue
          if (p === '..') norm.pop()
          else norm.push(p)
        }
        const candidate = norm.join('/')
        if (files.includes(candidate)) {
          resolvedPath = candidate
        }
      }

      if (!files.includes(resolvedPath)) {
        const match = files.find(
          (f) =>
            f.toLowerCase() === parsed.pdfPath.toLowerCase() ||
            f.toLowerCase().endsWith(`/${parsed.pdfPath.toLowerCase()}`)
        )
        if (match) resolvedPath = match
      }

      try {
        localStorage.setItem('pdf_page_' + resolvedPath, String(parsed.pageNumber))
      } catch {}

      setTargetPdfPage(parsed.pageNumber)
      setSelectedFiles([resolvedPath])
      showClaudeToast(`Ouverture du PDF à la page ${parsed.pageNumber}`)
    },
    [currentFile, files]
  )

  const handleGlobalDrop = async (e: React.DragEvent) => {
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      e.preventDefault()
      e.stopPropagation()
      const droppedFiles = Array.from(e.dataTransfer.files)
      let targetFolder = ''
      if (currentFile && currentFile.includes('/')) {
        targetFolder = currentFile.substring(0, currentFile.lastIndexOf('/'))
      }
      let firstImported = ''
      for (const file of droppedFiles) {
        try {
          const rel = await window.api.importDroppedFile(file, targetFolder)
          if (rel && !firstImported) {
            firstImported = rel
          }
        } catch (err) {
          notifyApiError(`Import de « ${file.name} »`, err)
        }
      }
      if (firstImported) {
        await fetchFiles()
        setSelectedFiles([firstImported])
      }
    }
  }

  const draftFiles = files.filter((f) => {
    const lower = f.toLowerCase()
    return (
      lower.startsWith('draft') ||
      lower.includes('/draft') ||
      lower.includes('untitled') ||
      lower.includes('sans titre') ||
      noteTags[f]?.some((t) => t.toLowerCase() === 'draft' || t.toLowerCase() === 'brouillon')
    )
  })

  const getNoteTitle = () => {
    if (!currentFile) return ''
    if (!isHtml) {
      const firstLine = fileContent.split('\n')[0]
      if (firstLine && firstLine.startsWith('# ')) {
        return firstLine.replace('# ', '').trim()
      }
    } else {
      const match = fileContent.match(/<title>([^<]*)<\/title>/i)
      if (match && match[1].trim()) {
        return match[1].trim()
      }
    }
    return (
      currentFile
        .split('/')
        .pop()
        ?.replace(/\.(md|html|htm)$/, '') || ''
    )
  }

  const handleTitleChange = (newTitle: string) => {
    if (isHtml) {
      let updated = fileContent
      if (/<title>([^<]*)<\/title>/i.test(updated)) {
        updated = updated.replace(/<title>([^<]*)<\/title>/i, `<title>${newTitle}</title>`)
      } else if (/<head>/i.test(updated)) {
        updated = updated.replace(/<head>/i, `<head>\n  <title>${newTitle}</title>`)
      } else {
        updated = `<title>${newTitle}</title>\n` + updated
      }
      handleContentChange(updated)
      return
    }
    const lines = fileContent.split('\n')
    if (lines.length > 0 && lines[0].startsWith('# ')) {
      lines[0] = `# ${newTitle}`
    } else {
      lines.unshift(`# ${newTitle}`, '')
    }
    const updated = lines.join('\n')
    handleContentChange(updated)
  }

  const handleToggleFavorite = async (filePath: string) => {
    const newFavs = favorites.includes(filePath)
      ? favorites.filter((f) => f !== filePath)
      : [...favorites, filePath]
    setFavorites(newFavs)
    await window.api.saveConfig({ favorites: newFavs, tags: noteTags })
  }

  const handleAddTag = async (tag: string) => {
    if (!currentFile) return
    const currentTags = noteTags[currentFile] || []
    const updated = { ...noteTags, [currentFile]: [...currentTags, tag] }
    setNoteTags(updated)
    await window.api.saveConfig({ favorites, tags: updated })
  }

  const handleRemoveTag = async (tag: string) => {
    if (!currentFile) return
    const currentTags = noteTags[currentFile] || []
    const updated = { ...noteTags, [currentFile]: currentTags.filter((t) => t !== tag) }
    setNoteTags(updated)
    await window.api.saveConfig({ favorites, tags: updated })
  }

  const handleCreateNote = async (
    parentFolder = '',
    title = '',
    templateType: 'html' | 'md' = 'md'
  ) => {
    let newFile: string
    try {
      newFile = await window.api.createNote(parentFolder, title, templateType)
    } catch (err) {
      notifyApiError('Création de la note', err)
      return
    }
    await fetchFiles()
    setSelectedFiles([newFile])
    if (!title) {
      setEditingFile(newFile)
      setEditValue('')
    } else {
      setEditingFile(null)
      setEditValue('')
    }
  }

  const handleCreateFolder = async (parentFolder: string, name: string) => {
    try {
      await window.api.createFolder(parentFolder, name)
    } catch (err) {
      notifyApiError('Création du dossier', err)
      return
    }
    await fetchFiles()
  }

  const handleApplyRenamePlan = async (plan: RenameOperationPlan) => {
    setIsApplyingRename(true)
    try {
      const res = await window.api.applyRenameOrMove(plan)
      if (res.success && res.newPath) {
        setIsRenameModalOpen(false)
        setPendingRenamePlan(null)

        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current)
          saveTimeoutRef.current = null
        }

        const sourcePath = plan.oldPath
        const newPath = res.newPath

        // Si le fichier actif a été renommé ou déplacé
        if (activeLoadedFileRef.current === sourcePath) {
          activeLoadedFileRef.current = newPath
        }

        // Si le contenu du fichier actif ou d'une note impactée a changé
        const activeFilePlan = plan.affectedFiles.find(
          (f) => f.relativePath === sourcePath || f.relativePath === activeLoadedFileRef.current
        )
        if (activeFilePlan) {
          fileContentRef.current = activeFilePlan.newContent
          setFileContent(activeFilePlan.newContent)
        }

        // Mettre à jour la sélection
        if (selectedFiles.includes(sourcePath)) {
          setSelectedFiles((prev) => prev.map((f) => (f === sourcePath ? newPath : f)))
        }

        // Mettre à jour les favoris
        if (favorites.includes(sourcePath)) {
          const updatedFavs = favorites.map((f) => (f === sourcePath ? newPath : f))
          setFavorites(updatedFavs)
          await window.api.saveConfig({ favorites: updatedFavs, tags: noteTags })
        }

        // Mettre à jour les tags
        if (noteTags[sourcePath]) {
          const updatedTags = { ...noteTags, [newPath]: noteTags[sourcePath] }
          delete updatedTags[sourcePath]
          setNoteTags(updatedTags)
          await window.api.saveConfig({ favorites, tags: updatedTags })
        }

        // Mettre à jour le statut workflow
        if (noteWorkflowStatuses[sourcePath]) {
          const status = noteWorkflowStatuses[sourcePath]
          handleUpdateWorkflowStatus(newPath, status)
          setNoteWorkflowStatuses((prev) => {
            const copy = { ...prev, [newPath]: status }
            delete copy[sourcePath]
            try {
              localStorage.setItem('note_workflow_statuses', JSON.stringify(copy))
            } catch {
              // ignore
            }
            return copy
          })
        }

        await fetchFiles()

        // Afficher la bannière d'annulation
        const msg = plan.isFolder
          ? `Dossier déplacé (${plan.totalChanges} lien${plan.totalChanges > 1 ? 's' : ''} actualisé${plan.totalChanges > 1 ? 's' : ''})`
          : `Note renommée (${plan.totalChanges} lien${plan.totalChanges > 1 ? 's' : ''} actualisé${plan.totalChanges > 1 ? 's' : ''})`

        setUndoRenameBanner({
          operationId: res.operationId || '',
          message: msg,
          targetPath: newPath
        })

        if (undoBannerTimerRef.current) clearTimeout(undoBannerTimerRef.current)
        undoBannerTimerRef.current = setTimeout(() => {
          setUndoRenameBanner(null)
        }, 15000)
      } else {
        alert(res.error || 'Erreur lors du renommage.')
      }
    } catch (err) {
      notifyApiError('Renommage', err)
    } finally {
      setIsApplyingRename(false)
    }
  }

  const handleUndoRename = async (operationId?: string) => {
    try {
      const res = await window.api.undoRenameOrMove(operationId)
      if (res.success) {
        setUndoRenameBanner(null)
        await fetchFiles()
        if (res.restoredPath) {
          if (activeLoadedFileRef.current) {
            const restoredContent = await window.api
              .readNote(activeLoadedFileRef.current)
              .catch(() => null)
            if (restoredContent !== null) {
              fileContentRef.current = restoredContent
              setFileContent(restoredContent)
            }
          }
        }
      } else {
        alert(res.error || 'Impossible d’annuler le renommage.')
      }
    } catch (err) {
      notifyApiError('Annulation du renommage', err)
    }
  }

  const handleMoveItem = async (sourcePath: string, targetFolderPath: string) => {
    try {
      console.log('[MoveItem] Moving:', sourcePath, '->', targetFolderPath)
      const plan = await window.api.prepareRenameOrMove(sourcePath, targetFolderPath, false, true)
      if (plan.hasCollision) {
        alert(plan.collisionError || 'Un élément du même nom existe déjà dans le dossier cible.')
        return
      }

      if (plan.totalChanges > 0) {
        setPendingRenamePlan(plan)
        setIsRenameModalOpen(true)
      } else {
        await handleApplyRenamePlan(plan)
      }
    } catch (err) {
      // Un refus de chemin ne doit pas être contourné par le déplacement simple
      if (isAccessDenied(err) || !window.api?.moveItem) {
        notifyApiError('Déplacement', err)
        return
      }
      console.error('Error moving item:', err)
      try {
        const newPath = await window.api.moveItem(sourcePath, targetFolderPath)
        if (newPath) await fetchFiles()
      } catch (fallbackErr) {
        notifyApiError('Déplacement', fallbackErr)
      }
    }
  }

  const handleRestoreDeleted = async (trashId: string) => {
    let restored: string | null = null
    try {
      restored = await window.api.restoreDeletedNote(trashId)
    } catch (err) {
      notifyApiError('Restauration depuis la corbeille', err)
    }
    await fetchFiles()
    if (restored) setSelectedFiles([restored])
  }

  const handleEmptyTrash = async () => {
    if (deletedNotes.length === 0) return
    const confirmed = window.confirm(
      'Êtes-vous sûr de vouloir vider définitivement la corbeille ? Tous les fichiers seront supprimés sans retour possible.'
    )
    if (!confirmed) return
    await window.api.emptyTrash()
    await fetchFiles()
  }

  const handleDeletePermanently = async (trashId: string) => {
    const confirmed = window.confirm('Supprimer définitivement cette note de la corbeille ?')
    if (!confirmed) return
    try {
      await window.api.deletePermanently(trashId)
    } catch (err) {
      notifyApiError('Suppression définitive', err)
    }
    await fetchFiles()
  }

  const submitRename = async () => {
    if (editingFile && editValue) {
      const parts = editingFile.split('/')
      const oldBase = parts.pop()?.replace(/\.(html|htm|md|markdown)$/i, '')
      if (editValue.trim() !== oldBase) {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current)
          saveTimeoutRef.current = null
        }
        try {
          const plan = await window.api.prepareRenameOrMove(
            editingFile,
            editValue.trim(),
            false,
            false
          )
          if (plan.hasCollision) {
            alert(plan.collisionError || 'Un élément du même nom existe déjà.')
            setEditingFile(null)
            setEditValue('')
            return
          }

          if (plan.totalChanges > 0) {
            setPendingRenamePlan(plan)
            setIsRenameModalOpen(true)
          } else {
            await handleApplyRenamePlan(plan)
          }
        } catch (err) {
          console.error('[submitRename] Erreur:', err)
          // Un nom ou un chemin refusé ne doit pas être contourné par le renommage simple
          if (isAccessDenied(err)) {
            notifyApiError('Renommage', err)
          } else {
            try {
              const newFileName = await window.api.renameNote(editingFile, editValue.trim())
              if (newFileName) {
                if (activeLoadedFileRef.current === editingFile) {
                  activeLoadedFileRef.current = newFileName
                }
                await fetchFiles()
                if (selectedFiles.includes(editingFile)) {
                  setSelectedFiles(selectedFiles.map((f) => (f === editingFile ? newFileName : f)))
                }
              }
            } catch (fallbackErr) {
              notifyApiError('Renommage', fallbackErr)
            }
          }
        }
      }
    }
    setEditingFile(null)
    setEditValue('')
  }

  const handleDeleteNotes = (fileNames: string[]) => {
    const toDelete = fileNames.filter((f) => f !== '__claude_code__')
    if (toDelete.length > 0) {
      setNotesToDelete(toDelete)
    }
  }

  const confirmDeleteNotes = async () => {
    if (notesToDelete.length === 0) return
    if (activeLoadedFileRef.current && notesToDelete.includes(activeLoadedFileRef.current)) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
      }
      activeLoadedFileRef.current = null
      fileContentRef.current = ''
      setFileContent('')
    }
    let anySuccess = false
    for (const file of notesToDelete) {
      let success = false
      try {
        success = await window.api.deleteNote(file)
      } catch (err) {
        notifyApiError(`Suppression de « ${file} »`, err)
      }
      if (success) {
        anySuccess = true
        if (editingFile === file) {
          setEditingFile(null)
        }
      }
    }
    if (anySuccess) {
      fetchFiles()
      setSelectedFiles((prev) => prev.filter((f) => !notesToDelete.includes(f)))
    }
    setNotesToDelete([])
  }

  // État du plein écran du rendu (aperçu immersif sans forcer le plein écran OS Windows)
  const [isRenderFullscreen, setIsRenderFullscreen] = useState(false)
  const isRenderFullscreenRef = useRef(false)
  useEffect(() => {
    isRenderFullscreenRef.current = isRenderFullscreen
  }, [isRenderFullscreen])

  // Panneau IA spécifique au mode plein écran (fermé par défaut pour que le rendu soit 100% plein écran sans se rétracter !)
  const [showAIInFullscreen, setShowAIInFullscreen] = useState(false)

  // Sortie du plein écran du rendu (inconditionnelle)
  const exitRenderFullscreen = useCallback(() => {
    isRenderFullscreenRef.current = false
    setIsRenderFullscreen(false)
    setShowAIInFullscreen(false)
  }, [])

  // Bascule du plein écran du rendu (Ctrl+F)
  const handleToggleRenderFullscreen = useCallback(() => {
    setIsRenderFullscreen((prev) => {
      const next = !prev
      isRenderFullscreenRef.current = next
      if (next) {
        setShowAIInFullscreen(false) // 100% pleine largeur à l'entrée, ne se rétracte jamais !
      }
      return next
    })
  }, [])

  // Bascule unifiée et intelligente de l'IA (en plein écran, dans un fichier ou à l'accueil)
  // L'anti-rebond de 250ms empêche les doubles déclenchements simultanés (IPC Electron + événement DOM)
  const lastToggleAiRef = useRef<number>(0)
  const handleToggleAi = useCallback(() => {
    const now = Date.now()
    if (now - lastToggleAiRef.current < 250) {
      return
    }
    lastToggleAiRef.current = now

    if (isRenderFullscreenRef.current) {
      setShowAIInFullscreen((prev) => !prev)
    } else {
      setShowAIWorkspace((prev) => !prev)
    }
  }, [])

  // Écouteur global pour raccourcis plein écran (Ctrl+F), sortie (Échap) et bascule IA (Ctrl+J)
  useEffect(() => {
    const captureCurrentFullscreenScroll = () => {
      if (!currentFile) return
      if (isHtml && fullscreenHtmlIframeRef.current?.contentWindow) {
        try {
          const w = fullscreenHtmlIframeRef.current.contentWindow
          const scrollY =
            w.scrollY ||
            (w.document?.documentElement ? w.document.documentElement.scrollTop : 0) ||
            (w.document?.body ? w.document.body.scrollTop : 0)
          const docHeight = Math.max(
            w.document?.documentElement?.scrollHeight || 0,
            w.document?.body?.scrollHeight || 0
          )
          const max = docHeight - w.innerHeight
          const ratio = max > 0 ? scrollY / max : 0
          localStorage.setItem('html_scroll_' + currentFile, JSON.stringify({ scrollY, ratio }))
        } catch {}
      } else if (!isPdf && !isHtml && fullscreenMarkdownRef.current) {
        try {
          const el = fullscreenMarkdownRef.current
          const max = el.scrollHeight - el.clientHeight
          const ratio = max > 0 ? el.scrollTop / max : 0
          localStorage.setItem(
            'markdown_scroll_' + currentFile,
            JSON.stringify({ ratio, scrollTop: el.scrollTop })
          )
        } catch {}
      }
    }

    const handleKeyDownCapture = (e: KeyboardEvent) => {
      // Échap : sort du plein écran immédiatement, priorité absolue !
      if (e.key === 'Escape' || e.keyCode === 27) {
        if (isRenderFullscreenRef.current) {
          e.preventDefault()
          e.stopPropagation()
          captureCurrentFullscreenScroll()
          exitRenderFullscreen()
          return
        }
      }
      // Ctrl+F / Cmd+F : Basculer en plein écran
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'f' || e.code === 'KeyF')) {
        e.preventDefault()
        e.stopPropagation()
        if (isRenderFullscreenRef.current) {
          captureCurrentFullscreenScroll()
        }
        handleToggleRenderFullscreen()
        return
      }
      // Ctrl+J / Cmd+J : Basculer l'IA
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'j' || e.code === 'KeyJ')) {
        e.preventDefault()
        e.stopPropagation()
        handleToggleAi()
        return
      }
      // Ctrl+Shift+O / Cmd+Shift+O : Basculer le plan du document
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        (e.key.toLowerCase() === 'o' || e.code === 'KeyO')
      ) {
        e.preventDefault()
        e.stopPropagation()
        handleToggleOutline()
        return
      }
      // Raccourcis clavier universels de zoom dans le fichier : Ctrl+Plus, Ctrl+Moins, Ctrl+0
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd' || e.code === 'Equal') {
          e.preventDefault()
          e.stopPropagation()
          applyZoom((prev) => prev + 10)
          return
        }
        if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract' || e.code === 'Minus') {
          e.preventDefault()
          e.stopPropagation()
          applyZoom((prev) => prev - 10)
          return
        }
        if (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') {
          e.preventDefault()
          e.stopPropagation()
          applyZoom(100)
          return
        }
      }
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'HTML_EXIT_FULLSCREEN') {
        if (currentFile && event.data?.ratio !== undefined) {
          try {
            localStorage.setItem(
              'html_scroll_' + currentFile,
              JSON.stringify({
                scrollY: event.data.scrollY,
                ratio: event.data.ratio
              })
            )
          } catch {}
        } else {
          captureCurrentFullscreenScroll()
        }
        exitRenderFullscreen()
      } else if (event.data?.type === 'HTML_TOGGLE_FULLSCREEN') {
        if (currentFile && event.data?.ratio !== undefined) {
          try {
            localStorage.setItem(
              'html_scroll_' + currentFile,
              JSON.stringify({
                scrollY: event.data.scrollY,
                ratio: event.data.ratio
              })
            )
          } catch {}
        } else if (isRenderFullscreenRef.current) {
          captureCurrentFullscreenScroll()
        }
        handleToggleRenderFullscreen()
      } else if (event.data?.type === 'TOGGLE_AI_WORKSPACE') {
        handleToggleAi()
      } else if (event.data?.type === 'TOGGLE_OUTLINE') {
        handleToggleOutline()
      } else if (event.data?.type === 'OUTLINE_ACTIVE_HEADING') {
        const id = event.data.id || (event.data.line ? String(event.data.line) : null)
        if (id) setActiveHeadingId(id)
      } else if (event.data?.type === 'REQUEST_ZOOM_CHANGE') {
        const change = typeof event.data?.zoomChange === 'number' ? event.data.zoomChange : 10
        applyZoom((prev) => prev + change)
      } else if (event.data?.type === 'REQUEST_ZOOM_RESET') {
        applyZoom(100)
      } else if (event.data?.type === 'HTML_SCROLL_UPDATE') {
        if (currentFile) {
          try {
            localStorage.setItem(
              'html_scroll_' + currentFile,
              JSON.stringify({
                scrollY: event.data.scrollY,
                ratio: event.data.ratio
              })
            )
          } catch {}
        }
      } else if (event.data?.type === 'PREVIEW_DOC_MUTATED') {
        const rawNewHtml = event.data.html
        if (!rawNewHtml) return
        const newHtml = rawNewHtml.replace(/\r\n/g, '\n')
        latestFullscreenRawHtmlRef.current = newHtml
        lastFullscreenMutationTimeRef.current = Date.now()
        lastFullscreenEmittedHtmlRef.current = newHtml
        handleContentChange(newHtml)

        // Déclencher la normalisation après ~800ms d'inactivité (JAMAIS pendant la frappe active)
        if (fullscreenNormalizeTimerRef.current) clearTimeout(fullscreenNormalizeTimerRef.current)
        fullscreenNormalizeTimerRef.current = setTimeout(() => {
          if (latestFullscreenRawHtmlRef.current) {
            const normalized = formatHtml(latestFullscreenRawHtmlRef.current)
            if (normalized && normalized !== latestFullscreenRawHtmlRef.current) {
              lastFullscreenEmittedHtmlRef.current = normalized
              handleContentChange(normalized)
            }
          }
        }, 800)
      } else if (event.data?.type === 'PREVIEW_DOC_BLUR') {
        if (event.data.html) {
          latestFullscreenRawHtmlRef.current = event.data.html.replace(/\r\n/g, '\n')
        }
        if (fullscreenNormalizeTimerRef.current) clearTimeout(fullscreenNormalizeTimerRef.current)
        if (latestFullscreenRawHtmlRef.current) {
          const normalized = formatHtml(latestFullscreenRawHtmlRef.current)
          if (normalized && normalized !== latestFullscreenRawHtmlRef.current) {
            lastFullscreenEmittedHtmlRef.current = normalized
            handleContentChange(normalized)
          }
        }
      } else if (event.data?.type === 'OPEN_PDF_PAGE') {
        if (event.data.href) {
          handleOpenPdfLink(event.data.href)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDownCapture, true)
    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('keydown', handleKeyDownCapture, true)
      window.removeEventListener('message', handleMessage)
    }
  }, [
    currentFile,
    isHtml,
    isPdf,
    exitRenderFullscreen,
    handleToggleRenderFullscreen,
    handleToggleAi,
    applyZoom,
    handleToggleOutline
  ])

  // Écouter directement les événements matériels globaux d'Electron (before-input-event)
  useEffect(() => {
    const unsubEscape = window.api?.onEscapePressed?.(() => {
      if (isRenderFullscreenRef.current) {
        if (currentFile) {
          if (isHtml && fullscreenHtmlIframeRef.current?.contentWindow) {
            try {
              const w = fullscreenHtmlIframeRef.current.contentWindow
              const scrollY =
                w.scrollY ||
                (w.document?.documentElement ? w.document.documentElement.scrollTop : 0) ||
                (w.document?.body ? w.document.body.scrollTop : 0)
              const docHeight = Math.max(
                w.document?.documentElement?.scrollHeight || 0,
                w.document?.body?.scrollHeight || 0
              )
              const max = docHeight - w.innerHeight
              const ratio = max > 0 ? scrollY / max : 0
              localStorage.setItem('html_scroll_' + currentFile, JSON.stringify({ scrollY, ratio }))
            } catch {}
          } else if (!isPdf && !isHtml && fullscreenMarkdownRef.current) {
            try {
              const el = fullscreenMarkdownRef.current
              const max = el.scrollHeight - el.clientHeight
              const ratio = max > 0 ? el.scrollTop / max : 0
              localStorage.setItem(
                'markdown_scroll_' + currentFile,
                JSON.stringify({ ratio, scrollTop: el.scrollTop })
              )
            } catch {}
          }
        }
        exitRenderFullscreen()
      }
    })
    const unsubToggleFs = window.api?.onShortcutToggleFullscreen?.(() => {
      handleToggleRenderFullscreen()
    })
    const unsubToggleAi = window.api?.onShortcutToggleAi?.(() => {
      handleToggleAi()
    })
    const unsubGoogle = window.api?.onGoogleLoginSuccess?.((service) => {
      if (service) {
        const wv = getActiveWebview()
        if (wv && typeof wv.reload === 'function') {
          try {
            console.log('[App] Connexion Google terminée, rechargement du webview IA...')
            wv.reload()
          } catch (_) {}
        }
      }
    })
    return () => {
      unsubEscape?.()
      unsubToggleFs?.()
      unsubToggleAi?.()
      unsubGoogle?.()
    }
  }, [exitRenderFullscreen, handleToggleRenderFullscreen])

  // Surveillance et persistance du défilement dans l'éditeur Markdown (mode normal)
  useEffect(() => {
    if (isPdf || isHtml || isRenderFullscreen) return
    const container = markdownEditorContainerRef.current
    if (!container) return

    let scrollTimeout: any = null
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement
      if (
        target &&
        (target.classList.contains('w-md-editor-preview') ||
          target.classList.contains('w-md-editor-text-input') ||
          target.classList.contains('w-md-editor-text') ||
          target.tagName === 'TEXTAREA' ||
          target.classList.contains('w-md-editor-content'))
      ) {
        clearTimeout(scrollTimeout)
        scrollTimeout = setTimeout(() => {
          const max = target.scrollHeight - target.clientHeight
          const ratio = max > 0 ? target.scrollTop / max : 0
          if (currentFile) {
            try {
              localStorage.setItem(
                'markdown_scroll_' + currentFile,
                JSON.stringify({ ratio, scrollTop: target.scrollTop })
              )
            } catch {}
          }
          // Scroll-spy pour le plan Markdown
          const domHeadings = container.querySelectorAll('h1, h2, h3, h4, h5, h6')
          let activeId: string | null = null
          for (let i = 0; i < domHeadings.length; i++) {
            const rect = domHeadings[i].getBoundingClientRect()
            if (rect.top <= 140) {
              const text = domHeadings[i].textContent || ''
              activeId = slugifyHeading(text)
            } else {
              break
            }
          }
          if (activeId) {
            setActiveHeadingId(activeId)
          }
        }, 50)
      }
    }

    container.addEventListener('scroll', handleScroll, true)
    return () => {
      container.removeEventListener('scroll', handleScroll, true)
      clearTimeout(scrollTimeout)
    }
  }, [currentFile, isPdf, isHtml, isRenderFullscreen, editorMode])

  // Restauration de la position de lecture Markdown en mode normal (au chargement ou en quittant le plein écran)
  useEffect(() => {
    if (isPdf || isHtml || isRenderFullscreen) return
    if (!currentFile) return

    let savedRatio = 0
    let savedTop = 0
    try {
      const raw = localStorage.getItem('markdown_scroll_' + currentFile)
      if (raw) {
        const parsed = JSON.parse(raw)
        savedRatio = parsed.ratio || 0
        savedTop = parsed.scrollTop || 0
      }
    } catch {}

    if (savedRatio <= 0 && savedTop <= 0) return

    let userHasScrolled = false
    const onUserInteract = () => {
      userHasScrolled = true
    }
    const container = markdownEditorContainerRef.current
    if (container) {
      container.addEventListener('wheel', onUserInteract, { passive: true })
      container.addEventListener('touchmove', onUserInteract, { passive: true })
      container.addEventListener('keydown', onUserInteract, { passive: true })
    }

    const restore = () => {
      if (userHasScrolled) return
      const currentContainer = markdownEditorContainerRef.current
      if (!currentContainer) return
      const scrollEl = getMarkdownScrollElement(currentContainer)
      if (scrollEl) {
        const max = scrollEl.scrollHeight - scrollEl.clientHeight
        const targetTop = savedRatio > 0 && max > 0 ? savedRatio * max : savedTop
        if (targetTop > 0) {
          scrollEl.scrollTop = targetTop
        }
      }
    }

    restore()
    const raf = requestAnimationFrame(restore)
    const t1 = setTimeout(restore, 40)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t1)
      if (container) {
        container.removeEventListener('wheel', onUserInteract)
        container.removeEventListener('touchmove', onUserInteract)
        container.removeEventListener('keydown', onUserInteract)
      }
    }
  }, [currentFile, isPdf, isHtml, isRenderFullscreen, editorMode])

  // Restauration de la position de lecture Markdown dans le conteneur plein écran
  useEffect(() => {
    if (!isRenderFullscreen || isPdf || isHtml) return
    if (!currentFile) return

    let savedRatio = 0
    let savedTop = 0
    try {
      const raw = localStorage.getItem('markdown_scroll_' + currentFile)
      if (raw) {
        const parsed = JSON.parse(raw)
        savedRatio = parsed.ratio || 0
        savedTop = parsed.scrollTop || 0
      }
    } catch {}

    if (savedRatio <= 0 && savedTop <= 0) return

    let userHasScrolled = false
    const onUserInteract = () => {
      userHasScrolled = true
    }
    const el = fullscreenMarkdownRef.current
    if (el) {
      el.addEventListener('wheel', onUserInteract, { passive: true })
      el.addEventListener('touchmove', onUserInteract, { passive: true })
      el.addEventListener('keydown', onUserInteract, { passive: true })
    }

    const restore = () => {
      if (userHasScrolled) return
      const currentEl = fullscreenMarkdownRef.current
      if (currentEl) {
        const max = currentEl.scrollHeight - currentEl.clientHeight
        const targetTop = savedRatio > 0 && max > 0 ? savedRatio * max : savedTop
        if (targetTop > 0) {
          currentEl.scrollTop = targetTop
        }
      }
    }

    restore()
    const raf = requestAnimationFrame(restore)
    const t1 = setTimeout(restore, 40)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t1)
      if (el) {
        el.removeEventListener('wheel', onUserInteract)
        el.removeEventListener('touchmove', onUserInteract)
        el.removeEventListener('keydown', onUserInteract)
      }
    }
  }, [isRenderFullscreen, currentFile, isPdf, isHtml])

  // Extraction en temps réel (debouncée) du plan de document (Outline)
  useEffect(() => {
    if (!currentFile || isPdf) {
      setHeadings([])
      setActiveHeadingId(null)
      return
    }

    const timer = setTimeout(() => {
      const extracted = extractOutline(fileContent, isHtml ? 'html' : 'md')
      setHeadings(extracted)
    }, 200)

    return () => clearTimeout(timer)
  }, [fileContent, currentFile, isHtml, isPdf])

  // Clic sur un titre dans le plan de document (Outline)
  const handleSelectHeading = useCallback(
    (heading: OutlineHeading) => {
      setActiveHeadingId(heading.id)
      setTargetHeading({ ...heading, timestamp: Date.now() })

      // Scroll dans le preview HTML en mode plein écran
      if (isHtml && isRenderFullscreen && fullscreenHtmlIframeRef.current?.contentWindow) {
        fullscreenHtmlIframeRef.current.contentWindow.postMessage(
          {
            type: 'SCROLL_TO_HEADING',
            id: heading.id,
            line: heading.line,
            text: heading.text
          },
          '*'
        )
      }

      // Navigation dans le document Markdown si actif
      if (!isHtml && !isPdf) {
        const container = isRenderFullscreen
          ? fullscreenMarkdownRef.current
          : markdownEditorContainerRef.current
        if (container) {
          const domHeadings = container.querySelectorAll('h1, h2, h3, h4, h5, h6')
          let targetEl: Element | null = null
          for (let i = 0; i < domHeadings.length; i++) {
            const hText = domHeadings[i].textContent?.trim() || ''
            if (slugifyHeading(hText) === heading.id || hText === heading.text.trim()) {
              targetEl = domHeadings[i]
              break
            }
          }
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        }
      }
    },
    [isHtml, isPdf, isRenderFullscreen]
  )

  // Global keyboard shortcuts logic
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (notesToDelete.length > 0) {
        if (e.key === 'Escape') {
          e.preventDefault()
          setNotesToDelete([])
        } else if (e.key === 'Enter') {
          e.preventDefault()
          confirmDeleteNotes()
        }
        return
      }

      if (recordingUuid || isSettingsOpen) return
      if (!Array.isArray(shortcuts)) return

      const activeEl = document.activeElement
      const isTyping =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable ||
          Boolean(activeEl.closest?.('.monaco-editor')))

      const match = shortcuts.find((s) => {
        if (!s.key) return false
        const keyMatches = e.key.toLowerCase() === s.key.toLowerCase()
        const ctrlMatches = e.ctrlKey === s.ctrlKey
        const shiftMatches = e.shiftKey === s.shiftKey
        const altMatches = e.altKey === s.altKey
        return keyMatches && ctrlMatches && shiftMatches && altMatches
      })

      if (match) {
        const hasModifiers = match.ctrlKey || match.altKey || match.shiftKey
        if (isTyping && !hasModifiers) {
          return
        }

        e.preventDefault()
        e.stopPropagation()

        if (match.actionId === 'create-note') {
          handleCreateNote()
        } else if (match.actionId === 'delete-note') {
          if (selectedFiles.length > 0) {
            handleDeleteNotes(selectedFiles)
          }
        } else if (match.actionId === 'open-settings') {
          setIsSettingsOpen((prev) => !prev)
        } else if (match.actionId === 'toggle-sidebar') {
          setIsSidebarCollapsed((prev) => !prev)
        } else if (match.actionId === 'toggle-claude') {
          handleToggleAi()
        } else if (match.actionId === 'toggle-fullscreen') {
          handleToggleRenderFullscreen()
        } else if (match.actionId === 'switch-ai') {
          const order: AIProvider[] = ['agent', 'claude', 'chatgpt', 'gemini']
          setActiveAI((prev) => {
            const idx = order.indexOf(prev)
            const next = order[(idx + 1) % order.length]
            try {
              localStorage.setItem('selected_ai_provider', next)
            } catch {}
            setShowAIWorkspace(true)
            const names: Record<AIProvider, string> = {
              agent: 'Agent IA',
              claude: 'Claude',
              chatgpt: 'ChatGPT',
              gemini: 'Gemini'
            }
            showClaudeToast(`IA → ${names[next]}`)
            return next
          })
        } else if (match.actionId === 'open-recent') {
          setActiveView((prev) => (prev === 'recent' ? 'all' : 'recent'))
        }
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.stopPropagation()
        setIsZenMode((prev) => !prev)
      } else if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        (e.key.toLowerCase() === 'o' || e.code === 'KeyO')
      ) {
        e.preventDefault()
        e.stopPropagation()
        handleToggleOutline()
      } else if (e.key === 'Escape' && isZenMode) {
        setIsZenMode(false)
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
        e.preventDefault()
        e.stopPropagation()
        setActiveView((prev) => (prev === 'recent' ? 'all' : 'recent'))
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [
    shortcuts,
    selectedFiles,
    isSettingsOpen,
    recordingUuid,
    notesToDelete,
    activeAI,
    activeView,
    isZenMode,
    handleToggleOutline
  ])

  // Recording shortcut combination keydown handler
  useEffect(() => {
    if (!recordingUuid || !isSettingsOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (e.key === 'Escape') {
        setRecordingUuid(null)
        setShortcuts((prev) => {
          const item = prev.find((m) => m.uuid === recordingUuid)
          if (item && !item.key) {
            return prev.filter((m) => m.uuid !== recordingUuid)
          }
          return prev
        })
        return
      }

      const key = e.key.toLowerCase()
      if (['control', 'shift', 'alt', 'meta'].includes(key)) {
        return
      }

      setShortcuts((prev) => {
        const updated = prev.map((m) => {
          if (m.uuid === recordingUuid) {
            return {
              ...m,
              key: e.key,
              ctrlKey: e.ctrlKey,
              shiftKey: e.shiftKey,
              altKey: e.altKey
            }
          }
          return m
        })
        localStorage.setItem('note-app-shortcuts', JSON.stringify(updated))
        return updated
      })

      setRecordingUuid(null)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [recordingUuid, isSettingsOpen])

  // Reset recording if settings panel is closed
  useEffect(() => {
    if (!isSettingsOpen) {
      setRecordingUuid(null)
    }
  }, [isSettingsOpen])

  const formatShortcut = (s: ShortcutMapping) => {
    if (!s.key) return 'Non configuré (cliquez pour enregistrer)'
    const parts: string[] = []
    if (s.ctrlKey) parts.push('Ctrl')
    if (s.altKey) parts.push('Alt')
    if (s.shiftKey) parts.push('Shift')

    let keyDisplay = s.key
    if (keyDisplay === ' ') keyDisplay = 'Espace'
    else if (keyDisplay.length === 1) keyDisplay = keyDisplay.toUpperCase()
    else if (keyDisplay === 'Delete') keyDisplay = 'Suppr'

    parts.push(keyDisplay)
    return parts.join(' + ')
  }

  const [isExportingClaude, setIsExportingClaude] = useState(false)
  const [isSavingClaudeOffline, setIsSavingClaudeOffline] = useState(false)
  const [isSendingToClaude, setIsSendingToClaude] = useState(false)
  const [claudeNotification, setClaudeNotification] = useState<string | null>(null)

  const showClaudeToast = (msg: string) => {
    setClaudeNotification(msg)
    setTimeout(() => setClaudeNotification(null), 3000)
  }

  const sendToClaude = async (prompt: string) => {
    const webview = webviewRef.current
    if (!webview) {
      console.error("La Webview Claude.ai n'est pas disponible.")
      return
    }

    setIsSendingToClaude(true)

    const script = `
      (async () => {
        const editor = document.querySelector('div[contenteditable="true"]') ||
                       document.querySelector('#prompt-textarea') ||
                       document.querySelector('textarea') ||
                       document.querySelector('.ql-editor');
        if (!editor) {
          console.error("Zone de saisie IA non trouvée");
          return false;
        }

        editor.focus();
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(editor);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }

        const inserted = document.execCommand('insertText', false, ${JSON.stringify(prompt)});
        if (!inserted) {
          if ('value' in editor) {
            (editor as any).value = ${JSON.stringify(prompt)};
          } else {
            editor.textContent = ${JSON.stringify(prompt)};
          }
        }

        try {
          editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(prompt)} }));
        } catch (_) {
          editor.dispatchEvent(new Event('input', { bubbles: true }));
        }
        editor.dispatchEvent(new Event('change', { bubbles: true }));

        await new Promise(resolve => setTimeout(resolve, 400));

        // Dispatch Enter keydown on editor
        const enterEvt = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
        editor.dispatchEvent(enterEvt);

        const selectors = [
          'button[aria-label*="Send Message" i]',
          'button[aria-label*="Send message" i]',
          'button[aria-label*="Send prompt" i]',
          'button[aria-label*="Send" i]',
          'button[aria-label*="Envoyer" i]',
          'button[aria-label*="Submit" i]',
          'button[type="submit"]',
          'fieldset button:not([disabled])'
        ];

        let sendButton = null;
        for (const selector of selectors) {
          try {
            const btn = document.querySelector(selector);
            if (btn && !btn.disabled) {
              sendButton = btn;
              break;
            }
          } catch (e) {}
        }

        if (!sendButton) {
          const buttons = Array.from(document.querySelectorAll('button'));
          sendButton = buttons.find(btn => {
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            const text = (btn.innerText || '').toLowerCase();
            return (label.includes('send') || label.includes('envoyer') || label.includes('submit') ||
                    text.includes('send') || text.includes('envoyer') || text.includes('submit')) && !btn.disabled;
          });
        }

        if (sendButton) {
          sendButton.focus();
          sendButton.click();
          return true;
        }

        return true;
      })()
    `

    try {
      const success = await webview.executeJavaScript(script)
      const currentAIName =
        activeAI === 'claude' ? 'Claude' : activeAI === 'chatgpt' ? 'ChatGPT' : 'Gemini'
      if (success) {
        showClaudeToast(`Note envoyée à ${currentAIName} ✓`)
      } else {
        showClaudeToast("Échec de l'envoi")
      }
    } catch (error) {
      console.error("Erreur d'exécution JavaScript dans la webview :", error)
      showClaudeToast("Erreur d'envoi")
    } finally {
      setTimeout(() => setIsSendingToClaude(false), 1200)
    }
  }

  // Enregistrer la page de Claude/ChatGPT/Gemini en HTML hors-ligne complet avec fidélité 100%
  const saveClaudePageOfflineHtml = async () => {
    const webview = webviewRef.current
    if (!webview) return
    setIsSavingClaudeOffline(true)
    const currentAIName =
      activeAI === 'claude' ? 'Claude' : activeAI === 'chatgpt' ? 'ChatGPT' : 'Gemini'

    const script = `
      (() => {
        try {
          const aiName = ${JSON.stringify(currentAIName)};

          // 1. Détection du titre de la conversation
          let title = '';
          const titleCandidates = [
            document.querySelector('[data-testid="chat-title"]'),
            document.querySelector('button[data-testid="chat-menu-trigger"]'),
            document.querySelector('h1'),
            document.querySelector('.font-tiempos'),
            document.querySelector('title')
          ];
          for (const el of titleCandidates) {
            if (el && el.innerText && el.innerText.trim()) {
              title = el.innerText.trim();
              break;
            }
          }
          if (!title) title = document.title || ('Discussion ' + aiName);
          title = title.replace(new RegExp(aiName, 'gi'), '').replace(/^[-–—\\s]+|[-–—\\s]+$/g, '').trim() || ('Discussion ' + aiName);

          // 2. Détection du thème
          const isDark = document.documentElement.classList.contains('dark') ||
                         document.body.classList.contains('dark') ||
                         document.documentElement.getAttribute('data-theme') === 'dark' ||
                         window.matchMedia('(prefers-color-scheme: dark)').matches;

          // 3. Extraction de TOUS les styles CSS de la page
          let stylesMarkup = '';
          document.querySelectorAll('style').forEach((s) => {
            stylesMarkup += s.outerHTML + '\\n';
          });
          document.querySelectorAll('link[rel="stylesheet"]').forEach((l) => {
            if (l.href) {
              stylesMarkup += '<link rel="stylesheet" href="' + l.href + '">\\n';
            }
          });

          // 4. Clonage du conteneur de discussion
          const mainEl = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
          const clone = mainEl.cloneNode(true);

          // Nettoyage complet : formulaires, sr-only, nav Claude, boutons parasites, MessageActions
          clone.querySelectorAll(
            'form, fieldset, textarea, ' +
            '[data-testid="chat-input"], [data-testid="prompt-textarea"], ' +
            '[contenteditable="true"], ' +
            'button[aria-label="Send message"], button[aria-label="Envoyer"], button[aria-label="Send prompt"], ' +
            'h2[data-find-omitted], span[data-find-omitted], .sr-only, h2.sr-only, ' +
            '[data-testid*="announcer"], [role="status"], [aria-live="polite"], ' +
            '[data-testid*="collapse-button"], ' +
            '[data-cds="MessageActions"], ' +
            '[data-testid="chat-header"], .dframe-header, ' +
            'button[aria-controls]'
          ).forEach((el) => el.remove());

          // Débloquer la troncature (clamp) des messages utilisateur
          clone.querySelectorAll('[style*="max-height"]').forEach((el) => {
            el.style.maxHeight = 'none';
            el.style.maskImage = 'none';
            el.style.webkitMaskImage = 'none';
          });

          // Supprimer les classes Tailwind de troncature sur les éléments clampés
          clone.querySelectorAll('[class*="mask-image"]').forEach((el) => {
            el.className = el.className.replace(/[mask-image:[^]]+]/g, '');
          });

          // URLs absolues pour les images
          clone.querySelectorAll('img').forEach((img) => {
            if (img.src) img.src = img.src;
          });

          const htmlClass = document.documentElement.className || (isDark ? 'dark' : '');
          const htmlTheme = document.documentElement.getAttribute('data-theme') || (isDark ? 'dark' : 'light');
          const bodyClass = document.body.className || '';
          const bodyBg = isDark ? '#1a1918' : '#faf9f5';
          const bodyColor = isDark ? '#f4f4f5' : '#18181b';

          const pillStyles = {
            Claude: { bg: 'rgba(217, 119, 87, 0.15)', border: 'rgba(217, 119, 87, 0.35)', color: '#e88d71' },
            ChatGPT: { bg: 'rgba(16, 163, 127, 0.12)', border: 'rgba(16, 163, 127, 0.3)', color: '#10a37f' },
            Gemini: { bg: 'rgba(66, 133, 244, 0.12)', border: 'rgba(66, 133, 244, 0.3)', color: '#4285f4' }
          }[aiName] || { bg: 'rgba(217, 119, 87, 0.15)', border: 'rgba(217, 119, 87, 0.35)', color: '#e88d71' };

          const now = new Date();
          const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
          const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

          const fullHtml = '<!DOCTYPE html>\\n' +
            '<html lang="fr" class="' + htmlClass + '" data-theme="' + htmlTheme + '">\\n' +
            '<head>\\n' +
            '  <meta charset="utf-8">\\n' +
            '  <meta name="viewport" content="width=device-width, initial-scale=1">\\n' +
            '  <title>' + title.replace(/</g, '&lt;').replace(/>/g, '&gt;') + ' - ' + aiName + '</title>\\n' +
            stylesMarkup +
            '  <style>\\n' +
            '    html, body {\\n' +
            '      margin: 0 !important;\\n' +
            '      padding: 0 !important;\\n' +
            '      background-color: ' + bodyBg + ' !important;\\n' +
            '      color: ' + bodyColor + ' !important;\\n' +
            '      min-height: 100vh;\\n' +
            '      overflow-y: auto !important;\\n' +
            '      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;\\n' +
            '    }\\n' +
            '    .sr-only, h2.sr-only, [data-find-omitted], [data-testid*="announcer"], [role="status"], [aria-live="polite"], span[hidden] {\\n' +
            '      display: none !important;\\n' +
            '    }\\n' +
            '    main {\\n' +
            '      max-width: 820px !important;\\n' +
            '      margin: 0 auto !important;\\n' +
            '      padding: 24px 20px 100px 20px !important;\\n' +
            '      box-sizing: border-box !important;\\n' +
            '    }\\n' +
            '    /* USER MESSAGE BUBBLE */\\n' +
            '    [data-perf-row="human"] {\\n' +
            '      display: flex !important;\\n' +
            '      flex-direction: column !important;\\n' +
            '      align-items: flex-end !important;\\n' +
            '      margin: 28px 0 !important;\\n' +
            '      width: 100% !important;\\n' +
            '    }\\n' +
            '    [data-user-scope] {\\n' +
            '      display: flex !important;\\n' +
            '      justify-content: flex-end !important;\\n' +
            '      width: 100% !important;\\n' +
            '      background: transparent !important;\\n' +
            '      border: none !important;\\n' +
            '      box-shadow: none !important;\\n' +
            '    }\\n' +
            '    [data-cds="UserMessage"] {\\n' +
            '      display: flex !important;\\n' +
            '      flex-direction: column !important;\\n' +
            '      align-items: flex-end !important;\\n' +
            '      max-width: 85% !important;\\n' +
            '      background: transparent !important;\\n' +
            '      border: none !important;\\n' +
            '    }\\n' +
            '    [data-cds="UserMessage"] > div, [data-testid="user-message"] {\\n' +
            '      background-color: ' + (isDark ? '#2b2a27' : '#f0eee6') + ' !important;\\n' +
            '      color: ' + (isDark ? '#ffffff' : '#18181b') + ' !important;\\n' +
            '      border: 1px solid ' + (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)') + ' !important;\\n' +
            '      border-radius: 1.25rem !important;\\n' +
            '      padding: 14px 20px !important;\\n' +
            '      box-shadow: 0 4px 14px ' + (isDark ? 'rgba(0, 0, 0, 0.25)' : 'rgba(0, 0, 0, 0.06)') + ' !important;\\n' +
            '      font-size: 14.5px !important;\\n' +
            '      line-height: 1.55 !important;\\n' +
            '      white-space: pre-wrap !important;\\n' +
            '      word-break: break-word !important;\\n' +
            '    }\\n' +
            '    [data-cds="UserMessage"] [style*="max-height"] {\\n' +
            '      max-height: none !important;\\n' +
            '      mask-image: none !important;\\n' +
            '      -webkit-mask-image: none !important;\\n' +
            '    }\\n' +
            '    /* ASSISTANT MESSAGE */\\n' +
            '    [data-perf-row="assistant"] {\\n' +
            '      display: flex !important;\\n' +
            '      flex-direction: column !important;\\n' +
            '      align-items: flex-start !important;\\n' +
            '      margin: 16px 0 36px 0 !important;\\n' +
            '      width: 100% !important;\\n' +
            '      color: ' + bodyColor + ' !important;\\n' +
            '    }\\n' +
            '    [data-cds="AssistantMessage"], .prose {\\n' +
            '      color: ' + bodyColor + ' !important;\\n' +
            '      font-size: 15px !important;\\n' +
            '      line-height: 1.68 !important;\\n' +
            '      width: 100% !important;\\n' +
            '    }\\n' +
            '    .offline-page-bar {\\n' +
            '      position: sticky !important;\\n' +
            '      top: 0 !important;\\n' +
            '      z-index: 9999 !important;\\n' +
            '      background: ' + (isDark ? 'rgba(26, 25, 24, 0.95)' : 'rgba(250, 249, 245, 0.95)') + ' !important;\\n' +
            '      backdrop-filter: blur(10px) !important;\\n' +
            '      border-bottom: 1px solid ' + (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)') + ' !important;\\n' +
            '      padding: 10px 24px !important;\\n' +
            '      display: flex !important;\\n' +
            '      align-items: center !important;\\n' +
            '      justify-content: space-between !important;\\n' +
            '      font-size: 12px !important;\\n' +
            '      color: ' + (isDark ? '#a1a1aa' : '#71717a') + ' !important;\\n' +
            '    }\\n' +
            '    .offline-pill {\\n' +
            '      display: inline-flex !important;\\n' +
            '      align-items: center !important;\\n' +
            '      gap: 6px !important;\\n' +
            '      padding: 3px 10px !important;\\n' +
            '      border-radius: 999px !important;\\n' +
            '      background: ' + pillStyles.bg + ' !important;\\n' +
            '      border: 1px solid ' + pillStyles.border + ' !important;\\n' +
            '      color: ' + pillStyles.color + ' !important;\\n' +
            '      font-weight: 600 !important;\\n' +
            '      font-size: 11.5px !important;\\n' +
            '    }\\n' +
            '    .offline-copy-code-btn {\\n' +
            '      position: absolute;\\n' +
            '      top: 8px;\\n' +
            '      right: 8px;\\n' +
            '      padding: 3px 8px;\\n' +
            '      font-size: 11px;\\n' +
            '      background: rgba(255, 255, 255, 0.1);\\n' +
            '      border: 1px solid rgba(255, 255, 255, 0.15);\\n' +
            '      border-radius: 4px;\\n' +
            '      color: #fff;\\n' +
            '      cursor: pointer;\\n' +
            '      z-index: 10;\\n' +
            '    }\\n' +
            '    .offline-copy-code-btn:hover { background: rgba(255, 255, 255, 0.2); }\\n' +
            '    pre { position: relative; }\\n' +
            '  </style>\\n' +
            '</head>\\n' +
            '<body class="' + bodyClass + '">\\n' +
            '  <header class="offline-page-bar">\\n' +
            '    <div style="display: flex; align-items: center; gap: 8px;">\\n' +
            '      <span class="offline-pill">Page Hors-Ligne • ' + aiName + '</span>\\n' +
            '      <strong style="color: ' + (isDark ? '#f4f4f5' : '#18181b') + ';">' + title.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</strong>\\n' +
            '    </div>\\n' +
            '    <div>Sauvegardée le ' + dateStr + ' à ' + timeStr + '</div>\\n' +
            '  </header>\\n' +
            '  <main>\\n' +
            clone.innerHTML +
            '  </main>\\n' +
            '  <script>\\n' +
            '    document.querySelectorAll("pre").forEach(function(p) {\\n' +
            '      var c = p.querySelector("code") || p;\\n' +
            '      var b = document.createElement("button");\\n' +
            '      b.className = "offline-copy-code-btn";\\n' +
            '      b.innerText = "Copier";\\n' +
            '      b.onclick = function() {\\n' +
            '        navigator.clipboard.writeText(c.innerText).then(function() {\\n' +
            '          b.innerText = "Copié !";\\n' +
            '          setTimeout(function() { b.innerText = "Copier"; }, 2000);\\n' +
            '        });\\n' +
            '      };\\n' +
            '      p.appendChild(b);\\n' +
            '    });\\n' +
            '  <\\/script>\\n' +
            '</body>\\n' +
            '</html>';

          return { success: true, title, html: fullHtml };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      })()
    `

    try {
      const res = await webview.executeJavaScript(script)
      if (res && res.success && res.html) {
        let folder = ''
        if (currentFile && currentFile.includes('/')) {
          folder = currentFile.substring(0, currentFile.lastIndexOf('/'))
        }

        const cleanTitle =
          res.title.replace(/[\\\\/:*?"<>|]/g, '-').trim() || `Page ${currentAIName}`
        const dateStr = new Date().toISOString().slice(0, 10)
        const baseName = folder
          ? `${folder}/${cleanTitle} (${dateStr})`
          : `${cleanTitle} (${dateStr})`
        let fileName = `${baseName}.html`
        let count = 1
        while (files.includes(fileName)) {
          fileName = `${baseName} (${count}).html`
          count++
        }

        await window.api.writeNote(fileName, res.html)
        await fetchFiles()
        setSelectedFiles([fileName])
        showClaudeToast(`Page ${currentAIName} sauvegardée en HTML hors-ligne`)
      } else {
        showClaudeToast('Impossible de capturer la page')
      }
    } catch (err) {
      console.error('Erreur sauvegarde hors-ligne:', err)
      showClaudeToast(`Erreur lors de la capture de la page : ${describeApiError(err)}`)
    } finally {
      setIsSavingClaudeOffline(false)
    }
  }

  // Exporter toute la discussion active vers une nouvelle note Markdown
  const exportClaudeDiscussion = async () => {
    const webview = webviewRef.current
    if (!webview) return
    setIsExportingClaude(true)
    const currentAIName =
      activeAI === 'claude' ? 'Claude' : activeAI === 'chatgpt' ? 'ChatGPT' : 'Gemini'

    const script = `
      (() => {
        try {
          const aiName = ${JSON.stringify(currentAIName)};
          let title = '';
          const titleCandidates = [
            document.querySelector('[data-testid="chat-title"]'),
            document.querySelector('button[data-testid="chat-menu-trigger"]'),
            document.querySelector('h1'),
            document.querySelector('.font-tiempos')
          ];
          for (const el of titleCandidates) {
            if (el && el.innerText && el.innerText.trim()) {
              title = el.innerText.trim();
              break;
            }
          }
          if (!title) title = document.title || ('Discussion ' + aiName);
          title = title.replace(new RegExp(aiName, 'gi'), '').replace(/^[-–—\\s]+|[-–—\\s]+$/g, '').trim() || ('Discussion ' + aiName);

          const chatContainer = document.querySelector('main') || document.body;
          const allElements = Array.from(chatContainer.querySelectorAll('.font-user-message, .font-claude-message, [data-testid="user-message"], [data-message-author-role="user"], [data-message-author-role="assistant"], user-query, model-response'));
          const genericMsgs = Array.from(document.querySelectorAll('.font-claude-message, [data-message-author-role="assistant"], model-response, .markdown'));

          let markdown = '# ' + title + '\\n\\n';
          markdown += '> *Discussion exportée depuis ' + aiName + ' le ' + new Date().toLocaleDateString('fr-FR') + ' à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + '*\\n\\n---\\n\\n';

          if (allElements.length > 0) {
            allElements.forEach((el) => {
              const isUser = el.classList.contains('font-user-message') ||
                             el.getAttribute('data-testid') === 'user-message' ||
                             el.getAttribute('data-message-author-role') === 'user' ||
                             el.tagName.toLowerCase() === 'user-query';
              const sender = isUser ? '**Vous**' : ('**' + aiName + '**');
              const text = (el.innerText || el.textContent || '').trim();
              if (text) {
                markdown += '### ' + sender + '\\n\\n' + text + '\\n\\n---\\n\\n';
              }
            });
          } else if (genericMsgs.length > 0) {
            genericMsgs.forEach((el, idx) => {
              const text = (el.innerText || el.textContent || '').trim();
              if (text) {
                markdown += '### **Réponse ' + aiName + ' ' + (idx + 1) + '**\\n\\n' + text + '\\n\\n---\\n\\n';
              }
            });
          } else {
            return { success: false, reason: 'Aucun message détecté dans la discussion' };
          }

          return { success: true, title, markdown };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      })()
    `

    try {
      const res = await webview.executeJavaScript(script)
      if (res && res.success && res.markdown) {
        let folder = ''
        if (currentFile && currentFile.includes('/')) {
          folder = currentFile.substring(0, currentFile.lastIndexOf('/'))
        }

        const cleanTitle =
          res.title.replace(/[\\\\/:*?"<>|]/g, '-').trim() || `Discussion ${currentAIName}`
        const dateStr = new Date().toISOString().slice(0, 10)
        const fileName = folder
          ? `${folder}/${cleanTitle} (${dateStr}).md`
          : `${cleanTitle} (${dateStr}).md`

        const createdPath = await window.api.createNoteWithContent(fileName, res.markdown)
        await fetchFiles()
        setSelectedFiles([createdPath || fileName])
        showClaudeToast(`Discussion exportée en note ✓`)
      } else {
        showClaudeToast('Aucun message détecté à exporter')
      }
    } catch (err) {
      console.error('Erreur export discussion:', err)
      showClaudeToast(`Erreur lors de l'exportation : ${describeApiError(err)}`)
    } finally {
      setIsExportingClaude(false)
    }
  }

  // Récupérer et insérer la dernière réponse de l'IA active directement dans la note courante
  const importLastClaudeMessage = async () => {
    const webview = webviewRef.current
    if (!webview) return
    const currentAIName =
      activeAI === 'claude' ? 'Claude' : activeAI === 'chatgpt' ? 'ChatGPT' : 'Gemini'

    const script = `
      (() => {
        try {
          const aiMsgs = Array.from(document.querySelectorAll('.font-claude-message, [data-message-author-role="assistant"], model-response, message-content, .response-container'));
          if (aiMsgs.length === 0) return { success: false };
          const lastMsg = aiMsgs[aiMsgs.length - 1];
          const text = (lastMsg.innerText || lastMsg.textContent || '').trim();
          return { success: true, text };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      })()
    `

    try {
      const res = await webview.executeJavaScript(script)
      if (res && res.success && res.text) {
        const separator = fileContent.trim() ? '\n\n---\n\n' : ''
        const updated = fileContent + separator + res.text
        setFileContent(updated)
        if (currentFile) {
          await window.api.writeNote(currentFile, updated)
        }
        showClaudeToast('Réponse insérée dans la note ✓')
      } else {
        showClaudeToast(`Aucune réponse ${currentAIName} trouvée`)
      }
    } catch (err) {
      console.error('Erreur récupération message:', err)
      showClaudeToast(`Erreur de récupération : ${describeApiError(err)}`)
    }
  }

  const isDragging = useRef(false)

  const handleResize = (e: MouseEvent | React.MouseEvent) => {
    if (!isDragging.current) return
    const clientX = 'clientX' in e ? e.clientX : 0
    const currentSidebarWidth = isSidebarCollapsed ? 0 : sidebarWidth
    const minEditorWidth = 180
    const minClaudeWidth = 360
    const availableForContent = window.innerWidth - currentSidebarWidth
    const maxClaudeWidth = Math.max(minClaudeWidth, availableForContent - minEditorWidth)

    const newWidth = window.innerWidth - clientX
    const clamped = Math.max(minClaudeWidth, Math.min(newWidth, maxClaudeWidth))
    setAiWidth(clamped)
  }

  const stopResize = () => {
    isDragging.current = false
    setIsResizing(false)
    try {
      localStorage.setItem('claude_panel_width', String(aiWidthRef.current))
    } catch {}
    document.removeEventListener('mousemove', handleResize as any)
    document.removeEventListener('mouseup', stopResize)
    window.removeEventListener('mouseup', stopResize)
  }

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    isDragging.current = true
    setIsResizing(true)
    document.addEventListener('mousemove', handleResize as any)
    document.addEventListener('mouseup', stopResize)
    window.addEventListener('mouseup', stopResize)
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-color-mode', 'dark')
  }, [])

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleResize)
      document.removeEventListener('mouseup', stopResize)
      window.removeEventListener('mouseup', stopResize)
    }
  }, [])

  // Sidebar resize handlers
  const handleSidebarResize = (e: MouseEvent) => {
    if (!sidebarDragging.current) return
    const newWidth = e.clientX
    if (newWidth > 150 && newWidth < 600) {
      setSidebarWidth(newWidth)
    }
  }

  const stopSidebarResize = () => {
    sidebarDragging.current = false
    setIsSidebarResizing(false)
    document.removeEventListener('mousemove', handleSidebarResize)
    document.removeEventListener('mouseup', stopSidebarResize)
    window.removeEventListener('mouseup', stopSidebarResize)
  }

  const startSidebarResize = (e: React.MouseEvent) => {
    e.preventDefault()
    sidebarDragging.current = true
    setIsSidebarResizing(true)
    document.addEventListener('mousemove', handleSidebarResize)
    document.addEventListener('mouseup', stopSidebarResize)
    window.addEventListener('mouseup', stopSidebarResize)
  }

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleSidebarResize)
      document.removeEventListener('mouseup', stopSidebarResize)
      window.removeEventListener('mouseup', stopSidebarResize)
    }
  }, [])

  // Écouteurs de sécurité globaux pour éviter que l'overlay de resize reste bloqué
  useEffect(() => {
    const handleSafetyRelease = () => {
      if (isResizing || isDragging.current) stopResize()
      if (isSidebarResizing || sidebarDragging.current) stopSidebarResize()
    }
    window.addEventListener('mouseup', handleSafetyRelease)
    window.addEventListener('blur', handleSafetyRelease)
    return () => {
      window.removeEventListener('mouseup', handleSafetyRelease)
      window.removeEventListener('blur', handleSafetyRelease)
    }
  }, [isResizing, isSidebarResizing])

  // Synchronisation des snippets vers l'iframe plein écran lors de mises à jour
  useEffect(() => {
    if (snippets.length === 0) return
    if (fullscreenHtmlIframeRef.current?.contentWindow) {
      fullscreenHtmlIframeRef.current.contentWindow.postMessage(
        {
          type: 'UPDATE_PREVIEW_SNIPPETS',
          snippets
        },
        '*'
      )
    }
  }, [snippets])

  // Préparation mémoïsée du HTML plein écran pour éviter tout rechargement d'iframe pendant le défilement et la frappe
  const fullscreenHtmlSrcDoc = useMemo(() => {
    // Si la modification provient directement de l'iframe plein écran, figer le srcDoc pour ne pas recharger l'iframe
    const isRecentlyEditedInFullscreen = Date.now() - lastFullscreenMutationTimeRef.current < 3000
    if (
      lastFullscreenSrcDocRef.current &&
      (isRecentlyEditedInFullscreen ||
        (lastFullscreenEmittedHtmlRef.current &&
          fileContent === lastFullscreenEmittedHtmlRef.current))
    ) {
      return lastFullscreenSrcDocRef.current
    }

    let savedRatio = 0
    let savedScrollY = 0
    try {
      const saved = localStorage.getItem('html_scroll_' + currentFile)
      if (saved) {
        const parsed = JSON.parse(saved)
        savedRatio = parsed.ratio || 0
        savedScrollY = parsed.scrollY || 0
      }
    } catch {}
    const prepared = prepareHtmlPreview(fileContent, savedRatio, savedScrollY, snippets, true)
    lastFullscreenSrcDocRef.current = prepared
    return prepared
  }, [fileContent, currentFile, snippets])

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        backgroundColor: 'var(--app-bg)',
        color: 'var(--text-primary)',
        fontFamily: 'inherit',
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {/* Overlay transparent global pendant le resize pour empêcher le webview et les iframes de bloquer la souris */}
      {(isResizing || isSidebarResizing) && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999999,
            cursor: 'col-resize',
            userSelect: 'none',
            backgroundColor: 'transparent'
          }}
          onMouseMove={(e) => {
            if (isResizing) handleResize(e.nativeEvent)
            else if (isSidebarResizing) handleSidebarResize(e.nativeEvent)
          }}
          onMouseUp={() => {
            stopResize()
            stopSidebarResize()
          }}
          onClick={() => {
            stopResize()
            stopSidebarResize()
          }}
        />
      )}

      {/* Sidebar wrapper with transition */}
      <div
        style={{
          width: isZenMode || isSidebarCollapsed ? '0px' : `${sidebarWidth}px`,
          minWidth: isZenMode || isSidebarCollapsed ? '0px' : `${sidebarWidth}px`,
          overflow: 'hidden',
          transition: isSidebarResizing
            ? 'none'
            : 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          display: isZenMode ? 'none' : 'flex',
          flexShrink: 0,
          position: 'relative'
        }}
      >
        <Sidebar
          onSelectFiles={(newFiles) => {
            setActiveView('all')
            setSelectedFiles(newFiles)
          }}
          selectedFiles={selectedFiles}
          files={files}
          fetchFiles={fetchFiles}
          treeNodes={treeNodes}
          editingFile={editingFile}
          setEditingFile={setEditingFile}
          editValue={editValue}
          setEditValue={setEditValue}
          onDeleteNotes={handleDeleteNotes}
          onCreateNote={handleCreateNote}
          onCreateFolder={handleCreateFolder}
          onMoveItem={handleMoveItem}
          onOpenSideBySide={handleOpenSideBySide}
          onOpenNewSession={handleOpenNewSession}
          submitRename={submitRename}
          favorites={favorites}
          onToggleFavorite={handleToggleFavorite}
          activeView={activeView}
          setActiveView={setActiveView}
          deletedCount={deletedNotes.length}
          onEmptyTrash={handleEmptyTrash}
          draftsCount={draftFiles.length}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenSearch={() => setIsSearchOpen(true)}
          onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          activeAI={activeAI}
          onSelectAI={handleSelectAI}
          width={sidebarWidth}
        />
      </div>

      {/* Sidebar resize handle */}
      {!isSidebarCollapsed && (
        <div
          onMouseDown={startSidebarResize}
          style={{
            width: '4px',
            cursor: 'col-resize',
            backgroundColor: isSidebarResizing ? '#00d2ff' : 'transparent',
            transition: 'background-color 0.15s ease',
            zIndex: 100,
            flexShrink: 0,
            position: 'relative'
          }}
          onMouseEnter={(e) => {
            if (!isSidebarResizing) e.currentTarget.style.backgroundColor = '#00d2ff55'
          }}
          onMouseLeave={(e) => {
            if (!isSidebarResizing) e.currentTarget.style.backgroundColor = 'transparent'
          }}
        />
      )}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#1e1e1e',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Floating Sidebar Toggle when sidebar is collapsed */}
        {isSidebarCollapsed && (
          <button
            onClick={() => setIsSidebarCollapsed(false)}
            title="Afficher la barre latérale (Ctrl+B)"
            style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              zIndex: 9999,
              backgroundColor: 'var(--element-bg)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              color: 'var(--text-secondary)',
              padding: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 3v18" />
            </svg>
          </button>
        )}
        {/* YouTube Workspace (avec support multi-onglets et lecture continue en arrière-plan) */}
        {hasOpenedYouTube && (
          <div
            style={
              activeView === 'youtube'
                ? {
                    display: 'flex',
                    flex: 1,
                    width: '100%',
                    height: '100%',
                    overflow: 'hidden'
                  }
                : {
                    position: 'absolute',
                    left: '-99999px',
                    top: '-99999px',
                    width: '1280px',
                    height: '720px',
                    opacity: 0.001,
                    pointerEvents: 'none',
                    zIndex: -9999
                  }
            }
          >
            <YouTubeWorkspace />
          </div>
        )}

        {activeView === 'youtube' ? null : (
          <div
            style={{ display: 'flex', flex: 1, width: '100%', height: '100%', overflow: 'hidden' }}
          >
            {/* Zone principale (masquée si Claude Code plein écran) */}
            <div
              style={{
                flex: 1,
                minWidth: 0,
                height: '100%',
                display:
                  selectedFiles.length === 1 && selectedFiles[0] === '__claude_code__'
                    ? 'none'
                    : 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                position: 'relative'
              }}
            >
              {activeView === 'workflow' ? (
                <WorkflowView
                  files={files}
                  onOpenNote={(file) => {
                    setSelectedFiles([file])
                    setActiveView('all')
                  }}
                  onCreateNote={handleCreateNote}
                  onDeleteNote={(file) => handleDeleteNotes([file])}
                />
              ) : activeView === 'deleted' ? (
                <div
                  style={{
                    flex: 1,
                    padding: '40px',
                    backgroundColor: 'var(--app-bg)',
                    color: '#fff',
                    overflowY: 'auto'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '8px',
                      maxWidth: '640px'
                    }}
                  >
                    <h2
                      style={{
                        fontSize: '24px',
                        fontWeight: 700,
                        margin: 0,
                        color: 'var(--text-primary)'
                      }}
                    >
                      Corbeille
                    </h2>
                    {deletedNotes.length > 0 && (
                      <button
                        onClick={handleEmptyTrash}
                        title="Supprimer définitivement toutes les notes de la corbeille"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          backgroundColor: 'rgba(239, 68, 68, 0.12)',
                          color: '#f87171',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          fontWeight: 600,
                          fontSize: '12px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.22)'
                          e.currentTarget.style.color = '#ffffff'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.12)'
                          e.currentTarget.style.color = '#f87171'
                        }}
                      >
                        <TrashIcon size={13} />
                        <span>Vider la corbeille</span>
                      </button>
                    )}
                  </div>
                  <p
                    style={{
                      color: 'var(--text-secondary)',
                      fontSize: '13px',
                      marginBottom: '24px'
                    }}
                  >
                    {deletedNotes.length} note(s) dans la corbeille. Vous pouvez les restaurer à
                    tout moment.
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      maxWidth: '640px'
                    }}
                  >
                    {deletedNotes.map((item) => (
                      <div
                        key={item.trashId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 18px',
                          backgroundColor: 'var(--element-bg)',
                          borderRadius: '8px',
                          border: '1px solid var(--border-color)',
                          gap: '12px'
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {getFileIcon(item.name, 15)}
                            <span
                              style={{
                                fontSize: '14px',
                                fontWeight: 500,
                                color: '#fff',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {item.name.replace(/\.(html|htm|md|markdown)$/i, '')}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-muted)',
                              marginTop: '3px'
                            }}
                          >
                            Supprimé le {new Date(item.deletedAt).toLocaleString('fr-FR')}
                          </div>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            flexShrink: 0
                          }}
                        >
                          <button
                            onClick={() => handleRestoreDeleted(item.trashId)}
                            style={{
                              padding: '6px 14px',
                              borderRadius: '6px',
                              backgroundColor: 'var(--accent-color)',
                              color: '#111',
                              border: 'none',
                              fontWeight: 600,
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                          >
                            Restaurer
                          </button>
                          <button
                            onClick={() => handleDeletePermanently(item.trashId)}
                            title="Supprimer définitivement"
                            style={{
                              padding: '6px 8px',
                              borderRadius: '6px',
                              backgroundColor: 'transparent',
                              color: '#a1a1aa',
                              border: '1px solid var(--border-color)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)'
                              e.currentTarget.style.color = '#f87171'
                              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent'
                              e.currentTarget.style.color = '#a1a1aa'
                              e.currentTarget.style.borderColor = 'var(--border-color)'
                            }}
                          >
                            <TrashIcon size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {deletedNotes.length === 0 && (
                      <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                        La corbeille est vide.
                      </div>
                    )}
                  </div>
                </div>
              ) : activeView === 'drafts' ? (
                <div
                  style={{
                    flex: 1,
                    padding: '40px',
                    backgroundColor: 'var(--app-bg)',
                    color: '#fff',
                    overflowY: 'auto'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '8px',
                      maxWidth: '700px'
                    }}
                  >
                    <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Brouillons & Drafts
                    </h2>
                    <button
                      onClick={() => handleCreateNote('Draft')}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '6px',
                        backgroundColor: 'var(--accent-color)',
                        color: '#111',
                        border: 'none',
                        fontWeight: 600,
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      + Nouveau brouillon
                    </button>
                  </div>
                  <p
                    style={{
                      color: 'var(--text-secondary)',
                      fontSize: '13px',
                      marginBottom: '24px'
                    }}
                  >
                    {draftFiles.length} brouillon(s) en attente. Notes en cours de réflexion ou sans
                    destination finale.
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      maxWidth: '700px'
                    }}
                  >
                    {draftFiles.map((file) => (
                      <div
                        key={file}
                        onClick={() => {
                          setActiveView('all')
                          setSelectedFiles([file])
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '14px 18px',
                          backgroundColor: 'var(--element-bg)',
                          borderRadius: '8px',
                          border: '1px solid var(--border-color)',
                          cursor: 'pointer',
                          transition: 'background-color 0.15s'
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor = 'var(--element-bg-hover)')
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor = 'var(--element-bg)')
                        }
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {getFileIcon(file, 16)}
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: 500, color: '#fff' }}>
                              {file
                                .split('/')
                                .pop()
                                ?.replace(/\.(html|htm|md|markdown)$/i, '')}
                            </div>
                            <div
                              style={{
                                fontSize: '11px',
                                color: 'var(--text-muted)',
                                marginTop: '3px'
                              }}
                            >
                              Dossier:{' '}
                              {file.includes('/')
                                ? file.substring(0, file.lastIndexOf('/'))
                                : 'Racine'}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setActiveView('all')
                            setSelectedFiles([file])
                          }}
                          style={{
                            padding: '5px 12px',
                            borderRadius: '6px',
                            backgroundColor: 'rgba(255, 255, 255, 0.08)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-color)',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          Ouvrir
                        </button>
                      </div>
                    ))}
                    {draftFiles.length === 0 && (
                      <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                        Aucun brouillon trouvé.
                      </div>
                    )}
                  </div>
                </div>
              ) : activeView === 'recent' ? (
                <div
                  style={{
                    flex: 1,
                    padding: '40px',
                    backgroundColor: 'var(--app-bg)',
                    color: '#fff',
                    overflowY: 'auto'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '8px',
                      maxWidth: '800px'
                    }}
                  >
                    <div>
                      <h2
                        style={{
                          fontSize: '24px',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px'
                        }}
                      >
                        <span>Notes & Documents récents</span>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '12px',
                            backgroundColor: 'rgba(56, 189, 248, 0.15)',
                            color: '#38bdf8',
                            border: '1px solid rgba(56, 189, 248, 0.3)'
                          }}
                        >
                          Ctrl+R
                        </span>
                      </h2>
                      <p
                        style={{
                          color: 'var(--text-secondary)',
                          fontSize: '13px',
                          marginTop: '4px'
                        }}
                      >
                        Fichiers classés par date de dernière modification.
                      </p>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      maxWidth: '800px',
                      marginTop: '20px'
                    }}
                  >
                    {[...files]
                      .filter((f) => f !== '__claude_code__')
                      .sort((a, b) => {
                        const nodeA = findNode(treeNodes, a)
                        const nodeB = findNode(treeNodes, b)
                        return (nodeB?.mtime || 0) - (nodeA?.mtime || 0)
                      })
                      .map((file) => {
                        const node = findNode(treeNodes, file)
                        const isPdfFile = file.toLowerCase().endsWith('.pdf')
                        const isHtmlFile =
                          file.toLowerCase().endsWith('.html') ||
                          file.toLowerCase().endsWith('.htm')
                        return (
                          <div
                            key={file}
                            onClick={() => {
                              setActiveView('all')
                              setSelectedFiles([file])
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '12px 18px',
                              backgroundColor: 'var(--element-bg)',
                              borderRadius: '8px',
                              border: '1px solid var(--border-color)',
                              cursor: 'pointer',
                              transition: 'background-color 0.15s, border-color 0.15s'
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
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                minWidth: 0
                              }}
                            >
                              {getFileIcon(file, 18)}
                              <div style={{ minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span
                                    style={{
                                      fontSize: '14px',
                                      fontWeight: 600,
                                      color: '#fff',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap'
                                    }}
                                  >
                                    {file
                                      .split('/')
                                      .pop()
                                      ?.replace(/\.(html|htm|md|markdown)$/i, '')}
                                  </span>
                                  {isPdfFile && (
                                    <span
                                      style={{
                                        fontSize: '9.5px',
                                        fontWeight: 700,
                                        padding: '1px 5px',
                                        borderRadius: '6px',
                                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                        color: '#f87171',
                                        border: '1px solid rgba(239, 68, 68, 0.3)'
                                      }}
                                    >
                                      PDF
                                    </span>
                                  )}
                                  {isHtmlFile && (
                                    <span
                                      style={{
                                        fontSize: '9.5px',
                                        fontWeight: 700,
                                        padding: '1px 5px',
                                        borderRadius: '6px',
                                        backgroundColor: 'rgba(249, 115, 22, 0.15)',
                                        color: '#fb923c',
                                        border: '1px solid rgba(249, 115, 22, 0.3)'
                                      }}
                                    >
                                      HTML
                                    </span>
                                  )}
                                </div>
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    fontSize: '11px',
                                    color: 'var(--text-muted)',
                                    marginTop: '3px'
                                  }}
                                >
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}
                                  >
                                    <FolderIcon size={11} />{' '}
                                    {file.includes('/')
                                      ? file.substring(0, file.lastIndexOf('/'))
                                      : 'Racine'}
                                  </span>
                                  {node?.mtime ? (
                                    <span>• Modifié {timeAgo(node.mtime)}</span>
                                  ) : null}
                                  {node?.size ? <span>• {formatFileSize(node.size)}</span> : null}
                                </div>
                              </div>
                            </div>

                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setActiveView('all')
                                setSelectedFiles([file])
                              }}
                              style={{
                                padding: '6px 14px',
                                borderRadius: '6px',
                                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border-color)',
                                fontSize: '12px',
                                fontWeight: 500,
                                cursor: 'pointer',
                                flexShrink: 0
                              }}
                            >
                              Ouvrir
                            </button>
                          </div>
                        )
                      })}
                    {files.filter((f) => f !== '__claude_code__').length === 0 && (
                      <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                        Aucun fichier récent trouvé.
                      </div>
                    )}
                  </div>
                </div>
              ) : selectedFiles.length > 0 ? (
                selectedFiles.length > 1 ? (
                  /* Multi-selection info screen */
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      alignItems: 'center',
                      backgroundColor: 'var(--app-bg)',
                      color: 'var(--text-secondary)',
                      gap: '16px'
                    }}
                  >
                    <svg
                      width="48"
                      height="48"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--accent-color)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ filter: 'drop-shadow(0 0 8px rgba(62, 166, 255, 0.4))' }}
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="9" y1="15" x2="15" y2="15" />
                      <line x1="9" y1="11" x2="15" y2="11" />
                    </svg>
                    <div
                      style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}
                    >
                      {selectedFiles.length} notes sélectionnées
                    </div>
                    <button
                      onClick={() => handleDeleteNotes(selectedFiles)}
                      style={{
                        backgroundColor: 'transparent',
                        color: 'var(--danger-color)',
                        border: '1px solid var(--danger-color)',
                        borderRadius: '8px',
                        padding: '8px 16px',
                        fontSize: '13px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--danger-color)'
                        e.currentTarget.style.color = '#fff'
                        e.currentTarget.style.boxShadow = '0 0 10px rgba(255, 85, 85, 0.4)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                        e.currentTarget.style.color = 'var(--danger-color)'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    >
                      Supprimer les {selectedFiles.length} notes
                    </button>
                  </div>
                ) : selectedFiles[0] === '__claude_code__' ? null : (
                  /* HTML or Markdown editor with resizable Claude panel */
                  <div
                    data-color-mode="dark"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      width: '100%',
                      height: '100%',
                      overflow: 'hidden',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'row'
                    }}
                    onKeyDownCapture={!isHtml && !isPdf ? handleEditorKeyDown : undefined}
                    onKeyUp={!isHtml && !isPdf ? handleKeyUp : undefined}
                    onClick={!isHtml && !isPdf ? handleClick : undefined}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'copy'
                    }}
                    onDrop={handleGlobalDrop}
                  >
                    {/* Panneau Plan du document (Outline) - position Gauche */}
                    {isOutlineOpen && !isPdf && outlinePosition === 'left' && (
                      <OutlinePanel
                        headings={headings}
                        activeHeadingId={activeHeadingId}
                        onSelectHeading={handleSelectHeading}
                        onClose={() => setIsOutlineOpen(false)}
                        position={outlinePosition}
                        onChangePosition={handleChangeOutlinePosition}
                      />
                    )}

                    {/* Center pane: Editor or PDF Viewer */}
                    <div
                      ref={editorContainerRef}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        position: 'relative'
                      }}
                    >
                      {snippetError && (
                        <div
                          style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
                            color: '#fca5a5',
                            padding: '6px 16px',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            zIndex: 20
                          }}
                        >
                          <span>⚠️ {snippetError}</span>
                          <button
                            onClick={() => setSnippetError(null)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#fca5a5',
                              cursor: 'pointer',
                              fontSize: '13px',
                              padding: '0 6px'
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      )}
                      {isPdf ? (
                        <PdfViewer
                          currentFilePath={currentFile}
                          fileSize={findNode(treeNodes, currentFile)?.size}
                          modifiedAt={timeAgo(findNode(treeNodes, currentFile)?.mtime)}
                          onDelete={() => handleDeleteNotes([currentFile])}
                          showAIWorkspace={showAIWorkspace}
                          onToggleAIWorkspace={() => setShowAIWorkspace(!showAIWorkspace)}
                          activeAI={activeAI}
                          isFullscreen={isRenderFullscreen}
                          onToggleFullscreen={handleToggleRenderFullscreen}
                          isResizing={isResizing}
                          initialPageNumber={targetPdfPage}
                          lastActiveNote={lastActiveNote}
                          allNotes={files}
                          onShowToast={showClaudeToast}
                        />
                      ) : (
                        <>
                          <EditorHeader
                            currentFilePath={currentFile}
                            isFavorite={favorites.includes(currentFile)}
                            onToggleFavorite={() => handleToggleFavorite(currentFile)}
                            showAIWorkspace={showAIWorkspace}
                            onToggleAIWorkspace={() => setShowAIWorkspace(!showAIWorkspace)}
                            activeAI={activeAI}
                            tags={noteTags[currentFile] || []}
                            onAddTag={handleAddTag}
                            onRemoveTag={handleRemoveTag}
                            createdAt={timeAgo(findNode(treeNodes, currentFile)?.birthtime)}
                            modifiedAt={timeAgo(findNode(treeNodes, currentFile)?.mtime)}
                            noteTitle={getNoteTitle()}
                            onTitleChange={handleTitleChange}
                            editorMode={editorMode}
                            onChangeEditorMode={(mode) => setEditorMode(mode)}
                            onToggleEditorMode={() =>
                              setEditorMode((prev) => (prev === 'preview' ? 'live' : 'preview'))
                            }
                            workflowStatus={noteWorkflowStatuses[currentFile] || 'todo'}
                            onStatusChange={(status) =>
                              handleUpdateWorkflowStatus(currentFile, status)
                            }
                            noteContent={fileContent}
                            onOpenSettings={() => setIsSettingsOpen(true)}
                            onDeleteNote={() => handleDeleteNotes([currentFile])}
                            onOpenInBrowser={
                              isHtml && window.api?.openInBrowser
                                ? () =>
                                    window.api
                                      .openInBrowser(currentFile)
                                      .catch((err) => notifyApiError('Ouverture externe', err))
                                : undefined
                            }
                            isFullscreen={isRenderFullscreen}
                            onToggleFullscreen={handleToggleRenderFullscreen}
                            onOpenSideBySide={
                              !sideBySideFile ? () => handleOpenSideBySide(currentFile) : undefined
                            }
                            isZenMode={isZenMode}
                            onToggleZenMode={() => setIsZenMode((prev) => !prev)}
                            isTypewriterMode={isTypewriterMode}
                            onToggleTypewriterMode={() => setIsTypewriterMode((prev) => !prev)}
                            onHighlightCode={() => {
                              if (isHtml) {
                                const { newHtml, count } = highlightAllCodeBlocksInHtml(fileContent)
                                if (count > 0) {
                                  handleContentChange(newHtml)
                                  showClaudeToast(`${count} bloc(s) de code colorié(s) !`)
                                } else {
                                  showClaudeToast('Aucun nouveau bloc <pre> à colorier.')
                                }
                              }
                            }}
                            onOpenHistory={() => setIsHistoryOpen(true)}
                            onOpenExport={() => setIsExportOpen(true)}
                            isCopilotEnabled={isCopilotEnabled}
                            onToggleCopilot={() => {
                              setIsCopilotEnabled((prev) => {
                                const next = !prev
                                try {
                                  localStorage.setItem('copilot_enabled', String(next))
                                } catch {}
                                showClaudeToast(
                                  next ? 'Copilote IA activé' : 'Copilote IA désactivé'
                                )
                                return next
                              })
                            }}
                            isOutlineOpen={isOutlineOpen}
                            onToggleOutline={handleToggleOutline}
                          />

                          {isHtml ? (
                            /* HTML Code Workspace: Monaco Editor + Live Sandboxed Preview */
                            <CodeWorkspace
                              value={fileContent}
                              onChange={handleContentChange}
                              currentFilePath={currentFile}
                              editorMode={editorMode}
                              onChangeEditorMode={(mode) => setEditorMode(mode)}
                              onOpenInBrowser={
                                window.api?.openInBrowser
                                  ? () =>
                                      window.api
                                        .openInBrowser(currentFile)
                                        .catch((err) => notifyApiError('Ouverture externe', err))
                                  : undefined
                              }
                              isHtmlFullscreen={isRenderFullscreen}
                              onToggleHtmlFullscreen={handleToggleRenderFullscreen}
                              zoomLevel={zoomLevel}
                              isZenMode={isZenMode}
                              isTypewriterMode={isTypewriterMode}
                              isCopilotEnabled={isCopilotEnabled}
                              copilotModel="qwen2.5:7b-instruct"
                              snippets={snippets}
                              targetHeading={targetHeading}
                              headings={headings}
                              onActiveHeadingChange={setActiveHeadingId}
                              onHighlightCode={() => {
                                const { newHtml, count } = highlightAllCodeBlocksInHtml(fileContent)
                                if (count > 0) {
                                  handleContentChange(newHtml)
                                  showClaudeToast(`${count} bloc(s) de code colorié(s) !`)
                                }
                              }}
                            />
                          ) : (
                            <>
                              {autocompleteVisible && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    top: '45px',
                                    right: '10px',
                                    width: '250px',
                                    backgroundColor: 'var(--element-bg)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '8px',
                                    zIndex: 1000,
                                    maxHeight: '300px',
                                    overflowY: 'auto',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                                  }}
                                >
                                  <div
                                    style={{
                                      padding: '8px',
                                      borderBottom: '1px solid var(--border-subtle)',
                                      fontSize: '12px',
                                      color: 'var(--text-secondary)'
                                    }}
                                  >
                                    Lier à une note...
                                  </div>
                                  {files
                                    .filter((f) =>
                                      f.toLowerCase().includes(autocompleteQuery.toLowerCase())
                                    )
                                    .map((f) => {
                                      const name = f.replace('.md', '')
                                      return (
                                        <div
                                          key={f}
                                          onClick={() => insertLink(name)}
                                          style={{
                                            padding: '8px',
                                            cursor: 'pointer',
                                            borderBottom: '1px solid var(--border-subtle)',
                                            transition: 'background-color 0.2s'
                                          }}
                                          onMouseEnter={(e) =>
                                            (e.currentTarget.style.backgroundColor =
                                              'var(--element-bg-hover)')
                                          }
                                          onMouseLeave={(e) =>
                                            (e.currentTarget.style.backgroundColor = 'transparent')
                                          }
                                        >
                                          {name}
                                        </div>
                                      )
                                    })}
                                  {files.filter((f) =>
                                    f.toLowerCase().includes(autocompleteQuery.toLowerCase())
                                  ).length === 0 && (
                                    <div
                                      onClick={() => insertLink(autocompleteQuery)}
                                      style={{
                                        padding: '8px',
                                        cursor: 'pointer',
                                        color: 'var(--accent-color)'
                                      }}
                                      onMouseEnter={(e) =>
                                        (e.currentTarget.style.backgroundColor =
                                          'var(--element-bg-hover)')
                                      }
                                      onMouseLeave={(e) =>
                                        (e.currentTarget.style.backgroundColor = 'transparent')
                                      }
                                    >
                                      Créer "{autocompleteQuery}"
                                    </div>
                                  )}
                                </div>
                              )}
                              <div
                                ref={markdownEditorContainerRef}
                                style={{ flex: 1, overflow: 'hidden', padding: '0 36px' }}
                              >
                                <MDEditor
                                  value={fileContent}
                                  onChange={handleContentChange}
                                  height="100%"
                                  style={{ height: '100%', borderRadius: 0, border: 'none' }}
                                  preview={
                                    editorMode === 'edit'
                                      ? 'edit'
                                      : editorMode === 'live'
                                        ? 'live'
                                        : 'preview'
                                  }
                                  commands={modernCommands}
                                  extraCommands={[]}
                                  hideToolbar={true}
                                  previewOptions={{
                                    remarkPlugins: [wikiLinkPlugin],
                                    components: {
                                      blockquote: ({ children }) => {
                                        return <div className="callout-box">{children}</div>
                                      },
                                      a: ({ node, href, children, ...props }) => {
                                        if (props.className?.includes('internal')) {
                                          const linkName =
                                            children && Array.isArray(children)
                                              ? String(children[0])
                                              : String(children || '')
                                          return (
                                            <a
                                              {...props}
                                              href="#"
                                              onClick={async (e) => {
                                                e.preventDefault()
                                                try {
                                                  const fileName =
                                                    await window.api.createSpecificNote(linkName)
                                                  fetchFiles()
                                                  setSelectedFiles([fileName])
                                                } catch (err) {
                                                  notifyApiError('Création de la note liée', err)
                                                }
                                              }}
                                              style={{
                                                color: 'var(--accent-color)',
                                                textDecoration: 'underline',
                                                cursor: 'pointer'
                                              }}
                                            >
                                              {children}
                                            </a>
                                          )
                                        }
                                        const isPdfLink = href && /\.pdf(#|\?|$)/i.test(href)
                                        if (isPdfLink) {
                                          return (
                                            <a
                                              {...props}
                                              href={href}
                                              onClick={(e) => {
                                                e.preventDefault()
                                                handleOpenPdfLink(href)
                                              }}
                                              style={{
                                                color: 'var(--accent-color)',
                                                textDecoration: 'underline',
                                                cursor: 'pointer'
                                              }}
                                            >
                                              {children}
                                            </a>
                                          )
                                        }
                                        return (
                                          <a href={href} {...props}>
                                            {children}
                                          </a>
                                        )
                                      }
                                    },
                                    rehypePlugins: [
                                      [
                                        rehypeSanitize,
                                        {
                                          ...defaultSchema,
                                          attributes: {
                                            ...defaultSchema.attributes,
                                            span: [
                                              ...(defaultSchema.attributes?.span || []),
                                              'style',
                                              'className'
                                            ],
                                            div: [
                                              ...(defaultSchema.attributes?.div || []),
                                              'style',
                                              'className'
                                            ],
                                            p: [
                                              ...(defaultSchema.attributes?.p || []),
                                              'style',
                                              'className'
                                            ]
                                          }
                                        }
                                      ]
                                    ]
                                  }}
                                />
                              </div>
                              {!isHtml && !isPdf && (
                                <SnippetPalette
                                  isOpen={isSnippetPaletteOpen}
                                  onClose={() => setIsSnippetPaletteOpen(false)}
                                  scope="markdown"
                                  snippets={snippets}
                                  initialQuery={snippetQuery}
                                  selectedIndex={snippetSelectedIndex}
                                  position={snippetPalettePos}
                                  onSelectSnippet={handleSelectMarkdownSnippet}
                                />
                              )}
                            </>
                          )}
                        </>
                      )}
                    </div>

                    {/* Panneau Plan du document (Outline) - position Droite */}
                    {isOutlineOpen && !isPdf && outlinePosition === 'right' && (
                      <OutlinePanel
                        headings={headings}
                        activeHeadingId={activeHeadingId}
                        onSelectHeading={handleSelectHeading}
                        onClose={() => setIsOutlineOpen(false)}
                        position={outlinePosition}
                        onChangePosition={handleChangeOutlinePosition}
                      />
                    )}
                  </div>
                )
              ) : (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    backgroundColor: 'var(--app-bg)',
                    color: 'var(--text-secondary)',
                    gap: '16px'
                  }}
                >
                  <div
                    style={{
                      fontSize: '22px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      letterSpacing: '-0.3px'
                    }}
                  >
                    NOTE-APP Studio
                  </div>
                  <div
                    style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}
                  >
                    Gestion de notes & Markdown pour développeurs et designers
                  </div>
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '280px' }}
                  >
                    <button
                      onClick={() => handleCreateNote()}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '9px 14px',
                        backgroundColor: 'var(--element-bg)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        fontSize: '13px',
                        transition: 'background-color 0.15s'
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor = 'var(--element-bg-hover)')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor = 'var(--element-bg)')
                      }
                    >
                      <span>Nouvelle note</span>
                      <kbd
                        style={{
                          fontFamily: 'monospace',
                          color: 'var(--text-muted)',
                          fontSize: '11px'
                        }}
                      >
                        Ctrl+N
                      </kbd>
                    </button>
                    <button
                      onClick={() => setIsSearchOpen(true)}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '9px 14px',
                        backgroundColor: 'var(--element-bg)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        fontSize: '13px',
                        transition: 'background-color 0.15s'
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor = 'var(--element-bg-hover)')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor = 'var(--element-bg)')
                      }
                    >
                      <span>Rechercher</span>
                      <kbd
                        style={{
                          fontFamily: 'monospace',
                          color: 'var(--text-muted)',
                          fontSize: '11px'
                        }}
                      >
                        Ctrl+S
                      </kbd>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Séparateur redimensionnable (affiché si panneau ouvert) */}
            {(isRenderFullscreen ? showAIInFullscreen : showAIWorkspace) &&
              !(selectedFiles.length === 1 && selectedFiles[0] === '__claude_code__') && (
                <div
                  onMouseDown={startResize}
                  style={
                    isRenderFullscreen
                      ? {
                          position: 'fixed',
                          top: 0,
                          bottom: 0,
                          right: `${aiWidth}px`,
                          width: '5px',
                          cursor: 'col-resize',
                          backgroundColor: isResizing ? 'var(--accent-color)' : 'transparent',
                          borderLeft: '1px solid var(--border-color)',
                          zIndex: 100000003,
                          userSelect: 'none'
                        }
                      : {
                          width: '5px',
                          cursor: 'col-resize',
                          backgroundColor: isResizing ? 'var(--accent-color)' : 'transparent',
                          borderLeft: '1px solid var(--border-color)',
                          zIndex: 100,
                          position: 'relative',
                          userSelect: 'none',
                          flexShrink: 0
                        }
                  }
                  onMouseEnter={(e) => {
                    if (!isResizing)
                      e.currentTarget.style.backgroundColor = 'rgba(217, 119, 87, 0.35)'
                  }}
                  onMouseLeave={(e) => {
                    if (!isResizing) e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: '-6px',
                      right: '-6px',
                      cursor: 'col-resize',
                      zIndex: 10
                    }}
                  />
                </div>
              )}

            {/* Panneau IA Omniprésent & Persistant (3 instances simultanées, ne recharge JAMAIS) */}
            <div
              style={
                isRenderFullscreen
                  ? {
                      position: 'fixed',
                      top: 0,
                      right: 0,
                      bottom: 0,
                      width: showAIInFullscreen ? `${aiWidth}px` : '0px',
                      maxWidth: 'calc(100% - 220px)',
                      display: 'flex',
                      flexDirection: 'column',
                      backgroundColor: 'var(--app-bg)',
                      zIndex: 100000002,
                      overflow: 'hidden',
                      transition: isResizing ? 'none' : 'width 0.2s ease',
                      flexShrink: 0,
                      visibility: showAIInFullscreen ? 'visible' : 'hidden',
                      pointerEvents: showAIInFullscreen ? 'auto' : 'none',
                      borderLeft: showAIInFullscreen ? '1px solid var(--border-color)' : 'none',
                      boxShadow: showAIInFullscreen ? '-4px 0 25px rgba(0,0,0,0.6)' : 'none'
                    }
                  : {
                      width:
                        selectedFiles.length === 1 && selectedFiles[0] === '__claude_code__'
                          ? '100%'
                          : showAIWorkspace
                            ? `${aiWidth}px`
                            : '0px',
                      maxWidth:
                        selectedFiles.length === 1 && selectedFiles[0] === '__claude_code__'
                          ? '100%'
                          : showAIWorkspace
                            ? 'calc(100% - 180px)'
                            : '0px',
                      display: 'flex',
                      flexDirection: 'column',
                      backgroundColor: 'var(--app-bg)',
                      zIndex: 10,
                      overflow: 'hidden',
                      transition: isResizing ? 'none' : 'width 0.2s ease',
                      flexShrink: 0,
                      visibility:
                        (selectedFiles.length === 1 && selectedFiles[0] === '__claude_code__') ||
                        showAIWorkspace
                          ? 'visible'
                          : 'hidden',
                      pointerEvents:
                        (selectedFiles.length === 1 && selectedFiles[0] === '__claude_code__') ||
                        showAIWorkspace
                          ? 'auto'
                          : 'none'
                    }
              }
            >
              {/* Header Toolbar */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0 10px',
                  backgroundColor: 'var(--sidebar-bg)',
                  borderBottom: '1px solid var(--border-color)',
                  height: '36px',
                  boxSizing: 'border-box',
                  width: '100%',
                  gap: '8px'
                }}
              >
                {/* Gauche: Switcher IA interactif (bascule instantanée 0ms) */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                    padding: '2px',
                    borderRadius: '6px'
                  }}
                >
                  {(['agent', 'claude', 'chatgpt', 'gemini'] as AIProvider[]).map((ai) => {
                    const isActive = activeAI === ai
                    return (
                      <button
                        key={ai}
                        onClick={() => handleSelectAI(ai)}
                        title={`Basculer vers ${ai === 'agent' ? 'Agent IA Autonome' : ai.charAt(0).toUpperCase() + ai.slice(1)} (Ctrl+I)`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 7px',
                          height: '24px',
                          borderRadius: '4px',
                          border: 'none',
                          backgroundColor: isActive
                            ? ai === 'agent'
                              ? 'rgba(16, 185, 129, 0.22)'
                              : 'rgba(255, 255, 255, 0.12)'
                            : 'transparent',
                          color: isActive
                            ? ai === 'agent'
                              ? '#34d399'
                              : '#ffffff'
                            : 'var(--text-muted)',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: isActive ? 600 : 400,
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {ai === 'agent' && (
                          <SparklesIcon size={12} color={isActive ? '#10b981' : 'currentColor'} />
                        )}
                        {ai === 'claude' && (
                          <ClaudeIcon size={12} color={isActive ? '#D97757' : 'currentColor'} />
                        )}
                        {ai === 'chatgpt' && (
                          <ChatGPTIcon
                            size={12}
                            style={{ color: isActive ? '#ffffff' : 'currentColor' }}
                          />
                        )}
                        {ai === 'gemini' && (
                          <GeminiIcon
                            size={12}
                            style={{ color: isActive ? '#4285f4' : 'currentColor' }}
                          />
                        )}
                        <span>
                          {ai === 'agent' ? '⚡ Agent' : ai.charAt(0).toUpperCase() + ai.slice(1)}
                        </span>
                      </button>
                    )
                  })}
                  {spyActive && (
                    <div
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: '#4ade80',
                        boxShadow: '0 0 6px rgba(74, 222, 128, 0.5)',
                        marginLeft: '4px',
                        marginRight: '2px'
                      }}
                      title={`Spy ${activeAI === 'claude' ? 'Claude' : activeAI === 'chatgpt' ? 'ChatGPT' : 'Gemini'} actif`}
                    />
                  )}
                </div>

                {/* Centre: Notification toast discrète */}
                {claudeNotification && (
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 500,
                      color: '#4ade80',
                      backgroundColor: 'rgba(74, 222, 128, 0.1)',
                      border: '1px solid rgba(74, 222, 128, 0.25)',
                      borderRadius: '10px',
                      padding: '1px 8px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {claudeNotification}
                  </div>
                )}

                {/* Droite: Toolbar d'icônes */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {/* Sauvegarder la page complète hors-ligne en HTML */}
                  <button
                    onClick={saveClaudePageOfflineHtml}
                    disabled={isSavingClaudeOffline}
                    title={`Enregistrer la page complète de ${activeAI === 'claude' ? 'Claude' : activeAI === 'chatgpt' ? 'ChatGPT' : 'Gemini'} hors-ligne (.html avec styles originaux)`}
                    style={{
                      width: '26px',
                      height: '26px',
                      backgroundColor: 'transparent',
                      border: '1px solid transparent',
                      borderRadius: '5px',
                      color: '#a1a1aa',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: isSavingClaudeOffline ? 'wait' : 'pointer',
                      transition: 'all 0.15s ease',
                      opacity: isSavingClaudeOffline ? 0.5 : 1
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'
                      e.currentTarget.style.color = '#ffffff'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                      e.currentTarget.style.color = '#a1a1aa'
                    }}
                  >
                    <OfflineHtmlIcon size={14} />
                  </button>

                  {/* Exporter Discussion en Markdown */}
                  <button
                    onClick={exportClaudeDiscussion}
                    disabled={isExportingClaude}
                    title={`Exporter la discussion ${activeAI === 'claude' ? 'Claude' : activeAI === 'chatgpt' ? 'ChatGPT' : 'Gemini'} vers une note Markdown (.md)`}
                    style={{
                      width: '26px',
                      height: '26px',
                      backgroundColor: 'transparent',
                      border: '1px solid transparent',
                      borderRadius: '5px',
                      color: '#a1a1aa',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: isExportingClaude ? 'wait' : 'pointer',
                      transition: 'all 0.15s ease',
                      opacity: isExportingClaude ? 0.5 : 1
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'
                      e.currentTarget.style.color = '#ffffff'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                      e.currentTarget.style.color = '#a1a1aa'
                    }}
                  >
                    <DownloadIcon size={14} />
                  </button>

                  {/* Insérer dernière réponse */}
                  <button
                    onClick={importLastClaudeMessage}
                    title={`Insérer la dernière réponse de ${activeAI === 'claude' ? 'Claude' : activeAI === 'chatgpt' ? 'ChatGPT' : 'Gemini'} dans votre note`}
                    style={{
                      width: '26px',
                      height: '26px',
                      backgroundColor: 'transparent',
                      border: '1px solid transparent',
                      borderRadius: '5px',
                      color: '#a1a1aa',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'
                      e.currentTarget.style.color = '#ffffff'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                      e.currentTarget.style.color = '#a1a1aa'
                    }}
                  >
                    <MessageSquareIcon size={14} />
                  </button>

                  {/* Page Précédente (Retour en arrière) */}
                  <button
                    onClick={() => {
                      const wv = getActiveWebview()
                      if (wv) {
                        try {
                          if (typeof wv.canGoBack === 'function' && wv.canGoBack()) {
                            wv.goBack()
                          } else {
                            wv.executeJavaScript('window.history.back()')
                          }
                          showClaudeToast('Retour en arrière')
                        } catch (_) {
                          try {
                            wv.executeJavaScript('window.history.back()')
                          } catch (_) {}
                        }
                      }
                    }}
                    title="Page précédente (Retour en arrière)"
                    style={{
                      width: '26px',
                      height: '26px',
                      backgroundColor: 'transparent',
                      border: '1px solid transparent',
                      borderRadius: '5px',
                      color: '#a1a1aa',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'
                      e.currentTarget.style.color = '#ffffff'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                      e.currentTarget.style.color = '#a1a1aa'
                    }}
                  >
                    <ArrowLeftIcon size={13} />
                  </button>

                  {/* Page Suivante */}
                  <button
                    onClick={() => {
                      const wv = getActiveWebview()
                      if (wv) {
                        try {
                          if (typeof wv.canGoForward === 'function' && wv.canGoForward()) {
                            wv.goForward()
                          } else {
                            wv.executeJavaScript('window.history.forward()')
                          }
                          showClaudeToast('Page suivante')
                        } catch (_) {
                          try {
                            wv.executeJavaScript('window.history.forward()')
                          } catch (_) {}
                        }
                      }
                    }}
                    title="Page suivante"
                    style={{
                      width: '26px',
                      height: '26px',
                      backgroundColor: 'transparent',
                      border: '1px solid transparent',
                      borderRadius: '5px',
                      color: '#a1a1aa',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'
                      e.currentTarget.style.color = '#ffffff'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                      e.currentTarget.style.color = '#a1a1aa'
                    }}
                  >
                    <ArrowRightIcon size={13} />
                  </button>

                  {/* Recharger */}
                  <button
                    onClick={() => {
                      if (getActiveWebview()) {
                        try {
                          getActiveWebview().reload()
                          showClaudeToast('Rechargement de la page...')
                        } catch (_) {}
                      }
                    }}
                    title={`Recharger ${activeAI === 'claude' ? 'Claude' : activeAI === 'chatgpt' ? 'ChatGPT' : 'Gemini'} (F5)`}
                    style={{
                      width: '26px',
                      height: '26px',
                      backgroundColor: 'transparent',
                      border: '1px solid transparent',
                      borderRadius: '5px',
                      color: '#a1a1aa',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'
                      e.currentTarget.style.color = '#ffffff'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                      e.currentTarget.style.color = '#a1a1aa'
                    }}
                  >
                    <RotateCwIcon size={13} />
                  </button>

                  {/* Accueil */}
                  <button
                    onClick={() => {
                      if (getActiveWebview()) {
                        const url =
                          activeAI === 'claude'
                            ? 'https://claude.ai'
                            : activeAI === 'chatgpt'
                              ? 'https://chatgpt.com'
                              : 'https://gemini.google.com/app'
                        try {
                          getActiveWebview().loadURL(url)
                          showClaudeToast("Retour à l'accueil")
                        } catch (_) {}
                      }
                    }}
                    title={`Retour à l'accueil de ${activeAI === 'claude' ? 'Claude' : activeAI === 'chatgpt' ? 'ChatGPT' : 'Gemini'}`}
                    style={{
                      width: '26px',
                      height: '26px',
                      backgroundColor: 'transparent',
                      border: '1px solid transparent',
                      borderRadius: '5px',
                      color: '#a1a1aa',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'
                      e.currentTarget.style.color = '#ffffff'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                      e.currentTarget.style.color = '#a1a1aa'
                    }}
                  >
                    <HomeIcon size={13} />
                  </button>

                  {/* Séparateur fin */}
                  <div
                    style={{
                      width: '1px',
                      height: '14px',
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      margin: '0 2px'
                    }}
                  />

                  {/* Bouton Envoyer */}
                  <button
                    onClick={() => sendToClaude(fileContent)}
                    disabled={isSendingToClaude}
                    title={`Envoyer la note actuelle à ${activeAI === 'claude' ? 'Claude' : activeAI === 'chatgpt' ? 'ChatGPT' : 'Gemini'}`}
                    style={{
                      height: '26px',
                      padding: '0 9px',
                      backgroundColor:
                        activeAI === 'claude'
                          ? 'rgba(217, 119, 87, 0.12)'
                          : activeAI === 'chatgpt'
                            ? 'rgba(255, 255, 255, 0.10)'
                            : 'rgba(66, 133, 244, 0.12)',
                      border:
                        activeAI === 'claude'
                          ? '1px solid rgba(217, 119, 87, 0.28)'
                          : activeAI === 'chatgpt'
                            ? '1px solid rgba(255, 255, 255, 0.25)'
                            : '1px solid rgba(66, 133, 244, 0.28)',
                      borderRadius: '5px',
                      color:
                        activeAI === 'claude'
                          ? '#e88d71'
                          : activeAI === 'chatgpt'
                            ? '#ffffff'
                            : '#60a5fa',
                      fontSize: '11.5px',
                      fontWeight: 500,
                      cursor: isSendingToClaude ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      transition: 'all 0.15s ease',
                      opacity: isSendingToClaude ? 0.6 : 1
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor =
                        activeAI === 'claude'
                          ? 'rgba(217, 119, 87, 0.22)'
                          : activeAI === 'chatgpt'
                            ? 'rgba(255, 255, 255, 0.18)'
                            : 'rgba(66, 133, 244, 0.22)'
                      e.currentTarget.style.borderColor =
                        activeAI === 'claude'
                          ? 'rgba(217, 119, 87, 0.45)'
                          : activeAI === 'chatgpt'
                            ? 'rgba(255, 255, 255, 0.45)'
                            : 'rgba(66, 133, 244, 0.45)'
                      e.currentTarget.style.color =
                        activeAI === 'claude'
                          ? '#f7a992'
                          : activeAI === 'chatgpt'
                            ? '#ffffff'
                            : '#93c5fd'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor =
                        activeAI === 'claude'
                          ? 'rgba(217, 119, 87, 0.12)'
                          : activeAI === 'chatgpt'
                            ? 'rgba(255, 255, 255, 0.10)'
                            : 'rgba(66, 133, 244, 0.12)'
                      e.currentTarget.style.borderColor =
                        activeAI === 'claude'
                          ? '1px solid rgba(217, 119, 87, 0.28)'
                          : activeAI === 'chatgpt'
                            ? '1px solid rgba(255, 255, 255, 0.25)'
                            : 'rgba(66, 133, 244, 0.28)'
                      e.currentTarget.style.color =
                        activeAI === 'claude'
                          ? '#e88d71'
                          : activeAI === 'chatgpt'
                            ? '#ffffff'
                            : '#60a5fa'
                    }}
                  >
                    {activeAI === 'claude' ? (
                      <ClaudeIcon size={12} color="currentColor" />
                    ) : activeAI === 'chatgpt' ? (
                      <ChatGPTIcon size={12} style={{ color: 'currentColor' }} />
                    ) : (
                      <GeminiIcon size={12} style={{ color: 'currentColor' }} />
                    )}
                    <span>Envoyer</span>
                  </button>
                </div>
              </div>

              {/* Webviews Container: 3 instances permanentes, affichage instantané sans rechargement */}
              <div
                style={{
                  flex: 1,
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                  minHeight: 0
                }}
              >
                {isResizing && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      zIndex: 50,
                      cursor: 'col-resize',
                      backgroundColor: 'transparent'
                    }}
                  />
                )}

                {/* Instance Claude.ai */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    visibility: activeAI === 'claude' ? 'visible' : 'hidden',
                    pointerEvents: activeAI === 'claude' ? 'auto' : 'none',
                    zIndex: activeAI === 'claude' ? 2 : 1
                  }}
                >
                  <webview
                    ref={claudeWebviewRef}
                    id="ai-webview-claude"
                    src="https://claude.ai"
                    allowpopups={'true' as any}
                    partition="persist:claude"
                    style={{
                      width: '100%',
                      height: '100%',
                      border: 'none',
                      pointerEvents: isResizing ? 'none' : 'auto'
                    }}
                  />
                </div>

                {/* Instance ChatGPT */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    visibility: activeAI === 'chatgpt' ? 'visible' : 'hidden',
                    pointerEvents: activeAI === 'chatgpt' ? 'auto' : 'none',
                    zIndex: activeAI === 'chatgpt' ? 2 : 1
                  }}
                >
                  <webview
                    ref={chatgptWebviewRef}
                    id="ai-webview-chatgpt"
                    src="https://chatgpt.com"
                    allowpopups={'true' as any}
                    partition="persist:claude"
                    style={{
                      width: '100%',
                      height: '100%',
                      border: 'none',
                      pointerEvents: isResizing ? 'none' : 'auto'
                    }}
                  />
                </div>

                {/* Instance Gemini */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    visibility: activeAI === 'gemini' ? 'visible' : 'hidden',
                    pointerEvents: activeAI === 'gemini' ? 'auto' : 'none',
                    zIndex: activeAI === 'gemini' ? 2 : 1
                  }}
                >
                  <webview
                    ref={geminiWebviewRef}
                    id="ai-webview-gemini"
                    src="https://gemini.google.com/app"
                    allowpopups={'true' as any}
                    partition="persist:claude"
                    style={{
                      width: '100%',
                      height: '100%',
                      border: 'none',
                      pointerEvents: isResizing ? 'none' : 'auto'
                    }}
                  />
                </div>

                {/* Instance Agent IA Autonome */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    visibility: activeAI === 'agent' ? 'visible' : 'hidden',
                    pointerEvents: activeAI === 'agent' ? 'auto' : 'none',
                    zIndex: activeAI === 'agent' ? 3 : 1
                  }}
                >
                  <AutonomousAgentWorkspace
                    claudeWebviewRef={claudeWebviewRef}
                    chatgptWebviewRef={chatgptWebviewRef}
                    geminiWebviewRef={geminiWebviewRef}
                    onRefreshNotesTree={fetchFiles}
                    onOpenNote={(path) => {
                      setSelectedFiles([path])
                      setActiveView('all')
                    }}
                    currentFilePath={currentFile || undefined}
                    currentNoteContent={currentFile ? fileContent : ''}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Settings & Help Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        snippets={snippets}
        shortcuts={shortcuts}
        setShortcuts={setShortcuts}
        defaultShortcuts={DEFAULT_MAPPINGS}
        actions={ACTIONS}
        formatShortcut={formatShortcut}
        activeAI={activeAI}
        onSelectAI={handleSelectAI}
        editorMode={editorMode}
        onChangeEditorMode={setEditorMode}
        zoomLevel={zoomLevel}
        onSetZoomLevel={setZoomLevel}
        notesCount={files.length}
        onEmptyTrash={() => window.api.emptyTrash()}
      />

      {/* Custom Confirm Delete Modal (Pixel-perfect to reference screenshot) */}
      {notesToDelete.length > 0 && (
        <div
          onClick={() => setNotesToDelete([])}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.72)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10000
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#18181b',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              width: '460px',
              maxWidth: '92vw',
              display: 'flex',
              flexDirection: 'column',
              boxShadow:
                '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.06)',
              color: '#ffffff',
              padding: '24px 28px'
            }}
          >
            {/* Header: Red Trash Badge + Title */}
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 600, color: '#ffffff' }}>
                {notesToDelete.length > 1
                  ? `Supprimer les ${notesToDelete.length} notes ?`
                  : `Supprimer « ${
                      notesToDelete[0]
                        .split('/')
                        .pop()
                        ?.replace(/\.(html|htm|md|markdown)$/i, '') || notesToDelete[0]
                    } » ?`}
              </h3>
            </div>

            {/* Subtitle text matching exact wording from screenshot */}
            <p
              style={{
                margin: '0 0 24px 0',
                fontSize: '13.5px',
                color: '#9ca3af',
                lineHeight: '1.6'
              }}
            >
              {notesToDelete.length > 1
                ? 'Ces notes et leur contenu seront déplacés dans la corbeille.'
                : notesToDelete[0].endsWith('.md') ||
                    notesToDelete[0].endsWith('.html') ||
                    notesToDelete[0].endsWith('.htm')
                  ? 'Cette note sera déplacée dans la corbeille.'
                  : 'Ce dossier et son contenu seront déplacés dans la corbeille.'}
              <br />
              Vous pourrez les restaurer plus tard.
            </p>

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setNotesToDelete([])}
                style={{
                  backgroundColor: '#27272a',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#e4e4e7',
                  borderRadius: '8px',
                  padding: '8px 18px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'background-color 0.15s'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#3f3f46')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#27272a')}
              >
                Annuler
              </button>
              <button
                autoFocus
                onClick={confirmDeleteNotes}
                style={{
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 18px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'background-color 0.15s'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#ef4444')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#dc2626')}
              >
                {notesToDelete.length > 1
                  ? 'Supprimer les notes'
                  : notesToDelete[0].endsWith('.md')
                    ? 'Supprimer la note'
                    : 'Supprimer le dossier'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Claude Save */}
      {codeToSave && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.72)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
          }}
        >
          <div
            style={{
              backgroundColor: '#18181b',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              width: '480px',
              maxWidth: '92vw',
              padding: '24px 28px',
              boxShadow:
                '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
              color: '#ffffff'
            }}
          >
            {/* Header: Amber Claude Badge + Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#f59e0b',
                  flexShrink: 0
                }}
              >
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                  <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
                </svg>
              </div>
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 600, color: '#ffffff' }}>
                Sauvegarder le code depuis Claude
              </h2>
            </div>

            {/* Code Snippet Box */}
            <div
              style={{
                backgroundColor: '#121316',
                padding: '12px 14px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                fontSize: '12.5px',
                color: '#a1a1aa',
                maxHeight: '120px',
                overflowY: 'auto'
              }}
            >
              <div
                style={{
                  color: '#f59e0b',
                  marginBottom: '6px',
                  fontWeight: 600,
                  fontSize: '11px',
                  textTransform: 'uppercase'
                }}
              >
                {codeToSave.language}
              </div>
              <pre
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'monospace',
                  color: '#e4e4e7'
                }}
              >
                {codeToSave.code.length > 200
                  ? codeToSave.code.substring(0, 200) + '...'
                  : codeToSave.code}
              </pre>
            </div>

            {/* Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: 'pointer',
                  fontSize: '13.5px',
                  color: '#e4e4e7'
                }}
              >
                <input
                  type="radio"
                  checked={saveActionType === 'new'}
                  onChange={() => setSaveActionType('new')}
                  style={{ accentColor: '#38bdf8' }}
                />
                Créer une nouvelle note
              </label>
              {saveActionType === 'new' && (
                <input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="Ex: claude-code.md"
                  autoFocus
                  style={{
                    marginLeft: '26px',
                    background: '#202125',
                    color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    outline: 'none',
                    width: 'calc(100% - 26px)',
                    boxSizing: 'border-box',
                    fontSize: '13px'
                  }}
                />
              )}

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: 'pointer',
                  fontSize: '13.5px',
                  color: '#e4e4e7'
                }}
              >
                <input
                  type="radio"
                  checked={saveActionType === 'append'}
                  onChange={() => setSaveActionType('append')}
                  style={{ accentColor: '#38bdf8' }}
                />
                Ajouter à une note existante
              </label>
              {saveActionType === 'append' && (
                <select
                  value={selectedExistingFile}
                  onChange={(e) => setSelectedExistingFile(e.target.value)}
                  style={{
                    marginLeft: '26px',
                    background: '#202125',
                    color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    outline: 'none',
                    width: 'calc(100% - 26px)',
                    boxSizing: 'border-box',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  {files.filter((f) => f !== '__claude_code__').length === 0 && (
                    <option value="" disabled>
                      Aucune note existante
                    </option>
                  )}
                  {files
                    .filter((f) => f !== '__claude_code__')
                    .map((f) => (
                      <option key={f} value={f}>
                        {f.replace('.md', '')}
                      </option>
                    ))}
                </select>
              )}

              <hr
                style={{
                  border: 'none',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  margin: '2px 0'
                }}
              />

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: 'pointer',
                  fontSize: '12.5px',
                  color: '#9ca3af'
                }}
              >
                <input
                  type="checkbox"
                  checked={saveAsCodeBlock}
                  onChange={(e) => setSaveAsCodeBlock(e.target.checked)}
                  style={{ accentColor: '#38bdf8' }}
                />
                Envelopper le contenu dans un bloc de code (```)
              </label>
            </div>

            {/* Buttons */}
            <div
              style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}
            >
              <button
                onClick={() => setCodeToSave(null)}
                style={{
                  backgroundColor: '#27272a',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#e4e4e7',
                  padding: '8px 18px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'background-color 0.15s'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#3f3f46')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#27272a')}
              >
                Annuler
              </button>
              <button
                onClick={confirmSaveClaudeCode}
                disabled={
                  saveActionType === 'append' &&
                  (!selectedExistingFile ||
                    files.filter((f) => f !== '__claude_code__').length === 0)
                }
                style={{
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 20px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  opacity:
                    saveActionType === 'append' &&
                    (!selectedExistingFile ||
                      files.filter((f) => f !== '__claude_code__').length === 0)
                      ? 0.5
                      : 1,
                  transition: 'background-color 0.15s'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#3b82f6')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
              >
                Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Search Modal (VS Code style Ctrl+S / Ctrl+P with sleek dark card) */}
      {isSearchOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.72)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            paddingTop: '80px',
            zIndex: 99999
          }}
          onClick={() => {
            setIsSearchOpen(false)
            setSearchFilter('')
          }}
        >
          <div
            style={{
              backgroundColor: '#18181b',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              width: '560px',
              maxWidth: '92vw',
              boxShadow:
                '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.06)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '14px 18px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                gap: '10px'
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#9ca3af"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                autoFocus
                placeholder="Rechercher une note ou un dossier..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsSearchOpen(false)
                    setSearchFilter('')
                  }
                }}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#ffffff',
                  fontSize: '14px'
                }}
              />
              <span
                style={{
                  fontSize: '11px',
                  color: '#a1a1aa',
                  backgroundColor: '#27272a',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontFamily: 'monospace'
                }}
              >
                ESC
              </span>
            </div>
            <div style={{ maxHeight: '350px', overflowY: 'auto', padding: '8px' }}>
              {files
                .filter(
                  (f) =>
                    f !== '__claude_code__' &&
                    !f.startsWith('.snippets') &&
                    !f.startsWith('.trash') &&
                    !f.includes('/.snippets') &&
                    !f.includes('/.trash') &&
                    f.toLowerCase().includes(searchFilter.toLowerCase())
                )
                .map((f) => {
                  const clean = f.replace(/\.(html|htm|md|markdown)$/i, '')
                  return (
                    <div
                      key={f}
                      onClick={() => {
                        setSelectedFiles([f])
                        setActiveView('all')
                        setIsSearchOpen(false)
                        setSearchFilter('')
                      }}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        color: '#f4f4f5',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'background-color 0.12s'
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)')
                      }
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {getFileIcon(f, 15)}
                        <span>{clean}</span>
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#9ca3af',
                          backgroundColor: 'rgba(255, 255, 255, 0.04)',
                          padding: '2px 6px',
                          borderRadius: '4px'
                        }}
                      >
                        {f.includes('/') ? f.split('/').slice(0, -1).join('/') : 'Racine'}
                      </span>
                    </div>
                  )
                })}
              {files.filter((f) => f.toLowerCase().includes(searchFilter.toLowerCase())).length ===
                0 && (
                <div
                  style={{
                    padding: '24px 16px',
                    textAlign: 'center',
                    color: '#71717a',
                    fontSize: '13px'
                  }}
                >
                  Aucune note trouvée.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODE PLEIN ÉCRAN TOTALEMENT IMMERSIF DU RENDU (PDF, HTML & MARKDOWN) */}
      {isRenderFullscreen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: showAIInFullscreen ? `${aiWidth}px` : 0,
            bottom: 0,
            zIndex: 100000000,
            backgroundColor: isHtml ? '#09090b' : isPdf ? '#111114' : 'var(--app-bg)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: isResizing ? 'none' : 'right 0.2s ease'
          }}
        >
          {/* Panneau Plan flottant en mode Plein Écran */}
          {isOutlineOpen && !isPdf && (
            <div
              style={{
                position: 'fixed',
                top: '16px',
                bottom: '16px',
                [outlinePosition === 'left' ? 'left' : 'right']: showAIInFullscreen
                  ? `${aiWidth + 16}px`
                  : '16px',
                zIndex: 100000020,
                borderRadius: '8px',
                overflow: 'hidden',
                boxShadow: '0 20px 50px rgba(0, 0, 0, 0.85)',
                border: '1px solid rgba(255, 255, 255, 0.12)'
              }}
            >
              <OutlinePanel
                headings={headings}
                activeHeadingId={activeHeadingId}
                onSelectHeading={handleSelectHeading}
                onClose={() => setIsOutlineOpen(false)}
                position={outlinePosition}
                onChangePosition={handleChangeOutlinePosition}
                isFloating={true}
              />
            </div>
          )}

          {/* Bouton discret pour ouvrir le plan en plein écran si fermé */}
          {!isOutlineOpen && !isPdf && (
            <button
              onClick={handleToggleOutline}
              title="Afficher le plan du document (Ctrl+Shift+O)"
              style={{
                position: 'fixed',
                top: '16px',
                [outlinePosition === 'left' ? 'left' : 'right']: showAIInFullscreen
                  ? `${aiWidth + 16}px`
                  : '16px',
                zIndex: 100000015,
                backgroundColor: 'rgba(24, 24, 27, 0.85)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#e4e4e7',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(39, 39, 42, 0.95)'
                e.currentTarget.style.color = '#38bdf8'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(24, 24, 27, 0.85)'
                e.currentTarget.style.color = '#e4e4e7'
              }}
            >
              <OutlineIcon size={14} />
              <span>Plan</span>
            </button>
          )}
          {isPdf ? (
            <div
              style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}
            >
              <PdfViewer
                currentFilePath={currentFile}
                fileSize={findNode(treeNodes, currentFile)?.size}
                modifiedAt={timeAgo(findNode(treeNodes, currentFile)?.mtime)}
                onDelete={() => handleDeleteNotes([currentFile])}
                showAIWorkspace={showAIInFullscreen}
                onToggleAIWorkspace={() => setShowAIInFullscreen(!showAIInFullscreen)}
                activeAI={activeAI}
                isFullscreen={true}
                onToggleFullscreen={handleToggleRenderFullscreen}
                isResizing={isResizing}
                initialPageNumber={targetPdfPage}
                lastActiveNote={lastActiveNote}
                allNotes={files}
                onShowToast={showClaudeToast}
              />
            </div>
          ) : isHtml ? (
            <iframe
              ref={fullscreenHtmlIframeRef}
              title="Fullscreen HTML Preview"
              srcDoc={fullscreenHtmlSrcDoc}
              onLoad={() => {
                try {
                  const saved = localStorage.getItem('html_scroll_' + currentFile)
                  if (saved && fullscreenHtmlIframeRef.current?.contentWindow) {
                    const { ratio, scrollY } = JSON.parse(saved)
                    fullscreenHtmlIframeRef.current.contentWindow.postMessage(
                      {
                        type: 'SET_SCROLL',
                        ratio,
                        scrollY,
                        preferRatio: true
                      },
                      '*'
                    )
                  }
                  if (fullscreenHtmlIframeRef.current?.contentWindow && zoomLevel) {
                    fullscreenHtmlIframeRef.current.contentWindow.postMessage(
                      {
                        type: 'SET_HTML_ZOOM',
                        zoom: zoomLevel
                      },
                      '*'
                    )
                  }
                  if (fullscreenHtmlIframeRef.current?.contentWindow && snippets.length > 0) {
                    fullscreenHtmlIframeRef.current.contentWindow.postMessage(
                      {
                        type: 'UPDATE_PREVIEW_SNIPPETS',
                        snippets
                      },
                      '*'
                    )
                  }
                } catch {}
              }}
              sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                backgroundColor: 'transparent',
                pointerEvents: isResizing ? 'none' : 'auto'
              }}
            />
          ) : (
            <div
              ref={fullscreenMarkdownRef}
              onKeyDownCapture={handleEditorKeyDown}
              onKeyUp={handleKeyUp}
              onClick={handleClick}
              style={{
                flex: 1,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                position: 'relative',
                backgroundColor: 'var(--app-bg)'
              }}
            >
              {editorMode === 'preview' ? (
                <div
                  onScroll={(e) => {
                    const el = e.currentTarget
                    const max = el.scrollHeight - el.clientHeight
                    const ratio = max > 0 ? el.scrollTop / max : 0
                    if (currentFile) {
                      try {
                        localStorage.setItem(
                          'markdown_scroll_' + currentFile,
                          JSON.stringify({ ratio, scrollTop: el.scrollTop })
                        )
                      } catch {}
                    }
                    if (fullscreenMarkdownRef.current) {
                      const domHeadings =
                        fullscreenMarkdownRef.current.querySelectorAll('h1, h2, h3, h4, h5, h6')
                      let activeId: string | null = null
                      for (let i = 0; i < domHeadings.length; i++) {
                        const rect = domHeadings[i].getBoundingClientRect()
                        if (rect.top <= 140) {
                          const text = domHeadings[i].textContent || ''
                          activeId = slugifyHeading(text)
                        } else {
                          break
                        }
                      }
                      if (activeId) {
                        setActiveHeadingId(activeId)
                      }
                    }
                  }}
                  style={{
                    flex: 1,
                    height: '100%',
                    overflowY: 'auto',
                    padding: '36px 48px 96px 48px',
                    boxSizing: 'border-box'
                  }}
                >
                  <div
                    className="wmde-markdown"
                    style={{
                      maxWidth: '1100px',
                      width: '100%',
                      margin: '0 auto',
                      zoom: `${zoomLevel}%`,
                      transition: 'zoom 0.18s cubic-bezier(0.16, 1, 0.3, 1)'
                    }}
                  >
                    <MDEditor.Markdown
                      source={fileContent}
                      style={{ background: 'transparent' }}
                      rehypePlugins={[[rehypeSanitize, defaultSchema]]}
                    />
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    flex: 1,
                    height: '100%',
                    overflow: 'hidden',
                    padding: '16px 48px 24px 48px'
                  }}
                >
                  <MDEditor
                    value={fileContent}
                    onChange={handleContentChange}
                    height="100%"
                    style={{
                      height: '100%',
                      borderRadius: 0,
                      border: 'none',
                      background: 'transparent'
                    }}
                    preview={editorMode === 'edit' ? 'edit' : 'live'}
                    commands={modernCommands}
                    extraCommands={[]}
                    hideToolbar={true}
                    previewOptions={{
                      remarkPlugins: [wikiLinkPlugin],
                      rehypePlugins: [
                        [
                          rehypeSanitize,
                          {
                            ...defaultSchema,
                            attributes: {
                              ...defaultSchema.attributes,
                              span: [
                                ...(defaultSchema.attributes?.span || []),
                                'style',
                                'className'
                              ],
                              div: [...(defaultSchema.attributes?.div || []), 'style', 'className'],
                              p: [...(defaultSchema.attributes?.p || []), 'style', 'className']
                            }
                          }
                        ]
                      ]
                    }}
                  />
                </div>
              )}

              <SnippetPalette
                isOpen={isSnippetPaletteOpen}
                onClose={() => setIsSnippetPaletteOpen(false)}
                scope="markdown"
                snippets={snippets}
                initialQuery={snippetQuery}
                selectedIndex={snippetSelectedIndex}
                position={snippetPalettePos}
                onSelectSnippet={handleSelectMarkdownSnippet}
              />
            </div>
          )}
        </div>
      )}

      {/* Indicateur flottant universel de zoom (actif dans tous les modes et plein écran) */}
      {showZoomIndicator && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '28px',
            backgroundColor: 'rgba(24, 24, 27, 0.94)',
            color: '#f4f4f5',
            padding: '8px 18px',
            borderRadius: '24px',
            fontSize: '13px',
            fontWeight: 600,
            zIndex: 100000005,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(10px)',
            transition: 'opacity 0.2s ease'
          }}
        >
          <ZoomInIcon size={14} color="#38bdf8" />
          <span>Zoom : {zoomLevel}%</span>
        </div>
      )}

      {/* Floating Zen Mode exit button */}
      {isZenMode && (
        <button
          onClick={() => setIsZenMode(false)}
          style={{
            position: 'fixed',
            top: 14,
            right: 18,
            zIndex: 9999999,
            backgroundColor: '#18181b',
            border: '1px solid rgba(168, 85, 247, 0.4)',
            color: '#c084fc',
            borderRadius: '20px',
            padding: '5px 14px',
            fontSize: '11.5px',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#27272a')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#18181b')}
        >
          <span>🧘 Mode Zen actif</span>
          <kbd
            style={{
              fontSize: '10px',
              opacity: 0.8,
              background: '#27272a',
              padding: '1px 5px',
              borderRadius: '4px'
            }}
          >
            Échap
          </kbd>
        </button>
      )}

      {/* History Time Travel Modal */}
      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        currentFilePath={currentFile}
        currentContent={fileContent}
        onRestore={(restored) => handleContentChange(restored)}
      />

      {/* Export Modal (PDF, Word docx, HTML) */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        noteTitle={getNoteTitle()}
        content={fileContent}
        htmlRendered={isHtml ? fileContent : undefined}
        currentFilePath={currentFile}
      />

      {/* Safe Link Refactoring Preview Modal */}
      <LinkRenameModal
        isOpen={isRenameModalOpen}
        plan={pendingRenamePlan}
        isSubmitting={isApplyingRename}
        onApply={handleApplyRenamePlan}
        onCancel={() => {
          setIsRenameModalOpen(false)
          setPendingRenamePlan(null)
        }}
      />

      {/* New Course Session Modal */}
      {isNewSessionModalOpen && newSessionSuggestion && (
        <NewSessionModal
          key={`${newSessionTargetFolder}:${newSessionSuggestion.nextSessionNumber}`}
          isOpen={isNewSessionModalOpen}
          targetFolder={newSessionTargetFolder}
          suggestion={newSessionSuggestion}
          templates={availableTemplates}
          isSubmitting={isSubmittingNewSession}
          onSubmit={handleSubmitNewSession}
          onCancel={() => setIsNewSessionModalOpen(false)}
        />
      )}

      {/* Undo Rename / Move Toast Notification */}
      {undoRenameBanner && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 10000,
            backgroundColor: '#18181b',
            border: '1px solid #38bdf8',
            borderRadius: '8px',
            padding: '12px 18px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            color: '#f4f4f5',
            fontSize: '13.5px'
          }}
        >
          <span>{undoRenameBanner.message}</span>
          <button
            onClick={() => handleUndoRename(undoRenameBanner.operationId)}
            style={{
              backgroundColor: '#0284c7',
              color: '#ffffff',
              border: 'none',
              borderRadius: '5px',
              padding: '6px 14px',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Annuler le renommage
          </button>
          <button
            onClick={() => setUndoRenameBanner(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#a1a1aa',
              cursor: 'pointer',
              fontSize: '18px',
              lineHeight: 1
            }}
            title="Ignorer"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}

export default App
