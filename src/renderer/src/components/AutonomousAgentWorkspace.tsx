import React, { useState, useRef, useEffect } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { SparklesIcon, SendIcon, PaperclipIcon, XIcon, PdfIcon } from './Icons'

// Configurer le worker PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

interface AttachedFile {
  id: string
  name: string
  size: number
  type: 'pdf' | 'text' | 'other'
  pageCount?: number
  extractedText: string
  rawFile: File
}

interface AgentActionLog {
  id: string
  type: 'folder' | 'note' | 'web' | 'youtube' | 'claude' | 'chatgpt' | 'ollama' | 'pdf' | 'info' | 'tool'
  text: string
  details?: string
  status?: 'pending' | 'success' | 'error'
}

interface AgentMessage {
  id: string
  sender: 'user' | 'agent'
  text: string
  attachments?: { name: string; type: string; pageCount?: number }[]
  actions?: AgentActionLog[]
  timestamp: string
  undoAvailable?: { id: string; description: string; path: string }
}

interface AutonomousAgentWorkspaceProps {
  claudeWebviewRef: React.RefObject<any>
  chatgptWebviewRef: React.RefObject<any>
  geminiWebviewRef?: React.RefObject<any>
  onRefreshNotesTree: () => void
  onOpenNote: (relativePath: string) => void
  currentFilePath?: string
  currentNoteContent?: string
}

const PRESET_MODELS = [
  'qwen2.5:7b-instruct',
  'qwen2.5:7b',
  'qwen3:8b',
  'hermes3:8b',
  'llama3.2:1b'
]

export default function AutonomousAgentWorkspace({
  claudeWebviewRef: _claudeWebviewRef,
  chatgptWebviewRef: _chatgptWebviewRef,
  onRefreshNotesTree,
  onOpenNote,
  currentFilePath,
  currentNoteContent
}: AutonomousAgentWorkspaceProps) {
  // Engine sélectionné : Ollama (Agent Local), Claude Webview, ChatGPT Webview
  const [selectedEngine, setSelectedEngine] = useState<'ollama' | 'claude' | 'chatgpt'>(() => {
    try {
      const saved = localStorage.getItem('agent_selected_engine') as any
      if (saved === 'ollama' || saved === 'claude' || saved === 'chatgpt') return saved
    } catch {}
    return 'ollama'
  })

  useEffect(() => {
    try {
      localStorage.setItem('agent_selected_engine', selectedEngine)
    } catch {}
  }, [selectedEngine])

  // Modèle Ollama configurable (par défaut qwen2.5:7b-instruct)
  const [agentModel, setAgentModel] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('agent_configured_model')
      if (saved) return saved
    } catch {}
    return 'qwen2.5:7b-instruct'
  })

  useEffect(() => {
    try {
      localStorage.setItem('agent_configured_model', agentModel)
    } catch {}
  }, [agentModel])

  // Mode outils activés ou chat pur
  const [toolsEnabled, setToolsEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('agent_tools_enabled') !== 'false'
    } catch {
      return true
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('agent_tools_enabled', String(toolsEnabled))
    } catch {}
  }, [toolsEnabled])

  const [ollamaInfo, setOllamaInfo] = useState<{ online: boolean; models: string[]; defaultModel: string | null }>({
    online: false,
    models: [],
    defaultModel: null
  })

  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      id: 'welcome',
      sender: 'agent',
      text: "Bonjour ! Je suis ton **Assistant IA Généraliste et Autonome**. Je peux répondre à tes questions générales, explorer le **web** pour des actualités avec citation des sources, et interagir avec tes **notes** (rechercher, lire et créer des fiches) avec un contexte de 16K !",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ])

  const [inputValue, setInputValue] = useState('')
  const [isExecuting, setIsExecuting] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [statusText, setStatusText] = useState('Prêt')
  const [attachments, setAttachments] = useState<AttachedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [undoToast, setUndoToast] = useState<string | null>(null)

  // Configuration Clé API Ollama Web Search
  const [ollamaApiKey, setOllamaApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem('ollama_api_key') || ''
    } catch {
      return ''
    }
  })
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [tempApiKey, setTempApiKey] = useState('')
  const [showKeySecret, setShowKeySecret] = useState(false)

  // Charger la clé API depuis .config.json au premier rendu
  useEffect(() => {
    const loadKey = async () => {
      try {
        const cfg = await (window.api as any).getConfig()
        if (cfg?.ollamaApiKey && typeof cfg.ollamaApiKey === 'string') {
          setOllamaApiKey(cfg.ollamaApiKey)
          localStorage.setItem('ollama_api_key', cfg.ollamaApiKey)
        }
      } catch {}
    }
    loadKey()
  }, [])

  const handleSaveApiKey = async (newKey: string) => {
    const clean = newKey.trim()
    setOllamaApiKey(clean)
    try {
      localStorage.setItem('ollama_api_key', clean)
      const cfg = (await (window.api as any).getConfig()) || {}
      await (window.api as any).saveConfig({ ...cfg, ollamaApiKey: clean })
    } catch {}
    setShowSettingsModal(false)
  }

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const refreshTreeRef = useRef(onRefreshNotesTree)

  useEffect(() => {
    refreshTreeRef.current = onRefreshNotesTree
  }, [onRefreshNotesTree])

  // Compteur de temps d'exécution
  useEffect(() => {
    if (!isExecuting) {
      setElapsedSeconds(0)
      return
    }
    const timer = setInterval(() => {
      setElapsedSeconds((s) => s + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [isExecuting])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isExecuting])

  // Vérification périodique du statut Ollama
  const fetchOllamaStatus = async () => {
    try {
      const res = await window.api.aiOllamaStatus()
      if (res) {
        setOllamaInfo(res)
      }
    } catch (_) {}
  }

  useEffect(() => {
    fetchOllamaStatus()
    const timer = setInterval(fetchOllamaStatus, 6000)
    return () => clearInterval(timer)
  }, [])

  // Écouteur des étapes de l'agent en streaming
  useEffect(() => {
    const unsubscribe = window.api.onAgentStep((step: any) => {
      if (step.type === 'status') {
        setStatusText(step.data.message || 'Raisonnement en cours...')
      } else if (step.type === 'token') {
        const token = step.data.token || ''
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last && last.sender === 'agent') {
            return [
              ...prev.slice(0, -1),
              { ...last, text: last.text + token }
            ]
          }
          return prev
        })
      } else if (step.type === 'tool_call') {
        const toolName = step.data.name
        setStatusText(`Exécution de l'outil : ${toolName}...`)
        const argsStr = typeof step.data.args === 'object' ? JSON.stringify(step.data.args) : String(step.data.args)
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last && last.sender === 'agent') {
            const currentActions = last.actions || []
            const newAction: AgentActionLog = {
              id: step.data.id || String(Date.now()),
              type: 'tool',
              text: `Appel d'outil : ${toolName}`,
              details: argsStr,
              status: 'pending'
            }
            return [
              ...prev.slice(0, -1),
              { ...last, actions: [...currentActions, newAction] }
            ]
          }
          return prev
        })
      } else if (step.type === 'tool_result') {
        setStatusText(`Outil ${step.data.name} exécuté. Analyse...`)
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last && last.sender === 'agent' && last.actions) {
            const updatedActions = last.actions.map((act) => {
              if (act.id === (step.data.id || step.data.name)) {
                return {
                  ...act,
                  text: step.data.success
                    ? `✓ ${step.data.name} : ${step.data.result?.message || 'Succès'}`
                    : `✗ ${step.data.name} : ${step.data.result?.error || 'Erreur'}`,
                  status: step.data.success ? ('success' as const) : ('error' as const)
                }
              }
              return act
            })
            return [
              ...prev.slice(0, -1),
              { ...last, actions: updatedActions }
            ]
          }
          return prev
        })
      } else if (step.type === 'undo_available') {
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last && last.sender === 'agent') {
            return [
              ...prev.slice(0, -1),
              { ...last, undoAvailable: step.data }
            ]
          }
          return prev
        })
      } else if (step.type === 'done') {
        setIsExecuting(false)
        setStatusText('Terminé')
        refreshTreeRef.current?.()
      } else if (step.type === 'error') {
        setIsExecuting(false)
        setStatusText('Erreur')
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last && last.sender === 'agent' && !last.text) {
            return [
              ...prev.slice(0, -1),
              { ...last, text: `❌ ${step.data?.error || 'Erreur survenue pendant l’exécution.'}` }
            ]
          }
          return prev
        })
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  // Extraction PDF avec pdfjsLib
  const extractPdfText = async (file: File): Promise<{ text: string; pages: number }> => {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
      const pdfDoc = await loadingTask.promise
      let fullText = ''
      const numPages = pdfDoc.numPages
      const maxPages = Math.min(numPages, 30)

      for (let i = 1; i <= maxPages; i++) {
        const page = await pdfDoc.getPage(i)
        const textContent = await page.getTextContent()
        const pageText = textContent.items
          .map((item: any) => item.str || '')
          .join(' ')
        fullText += `\n--- Page ${i} ---\n` + pageText
      }

      return { text: fullText.trim(), pages: numPages }
    } catch (e: any) {
      console.error('Erreur extraction PDF:', e)
      return { text: `[Erreur d'extraction du texte du PDF : ${e.message}]`, pages: 0 }
    }
  }

  // Ajout de fichiers attachés
  const processFiles = async (fileList: FileList | File[]) => {
    const filesArray = Array.from(fileList)
    const newAttachments: AttachedFile[] = []

    for (const f of filesArray) {
      const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
      const isText = f.type.startsWith('text/') || f.name.match(/\.(md|txt|html|json|js|ts|py|csv)$/i)

      let extracted = ''
      let pageCount: number | undefined = undefined

      if (isPdf) {
        setStatusText(`Extraction du PDF "${f.name}"...`)
        const res = await extractPdfText(f)
        extracted = res.text
        pageCount = res.pages
      } else if (isText) {
        extracted = await f.text()
      } else {
        extracted = `[Fichier brut non textuel : ${f.name} (${f.size} octets)]`
      }

      newAttachments.push({
        id: Date.now() + '-' + Math.random().toString(36).substring(2, 7),
        name: f.name,
        size: f.size,
        type: isPdf ? 'pdf' : isText ? 'text' : 'other',
        pageCount,
        extractedText: extracted,
        rawFile: f
      })
    }

    setAttachments((prev) => [...prev, ...newAttachments])
    setStatusText(`${newAttachments.length} fichier(s) joint(s) prêt(s).`)
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files)
      e.target.value = ''
    }
  }

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  // Annulation (Undo)
  const handleUndo = async () => {
    try {
      const res = await window.api.agentUndo()
      setUndoToast(res.message)
      setTimeout(() => setUndoToast(null), 4000)
      onRefreshNotesTree()
    } catch (err: any) {
      setUndoToast(`Erreur : ${err.message}`)
      setTimeout(() => setUndoToast(null), 4000)
    }
  }

  // Arrêt de l'agent en cours
  const handleCancelAgent = async () => {
    try {
      await window.api.agentCancel()
      setIsExecuting(false)
      setStatusText('Annulé par l’utilisateur.')
    } catch {}
  }

  // Exécution principale
  const handleExecute = async (userPrompt: string) => {
    if ((!userPrompt.trim() && attachments.length === 0) || isExecuting) return

    const promptText = userPrompt.trim() || 'Analyse ce document et crée une fiche structurée.'
    const currentAttachments = [...attachments]

    setInputValue('')
    setAttachments([])
    setIsExecuting(true)
    setStatusText('Démarrage de la réflexion...')

    // 1. Message utilisateur
    const userMsg: AgentMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: promptText,
      attachments: currentAttachments.map((a) => ({ name: a.name, type: a.type, pageCount: a.pageCount })),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    // 2. Message réponse de l'agent (en préparation pour le streaming)
    const agentMsgId = (Date.now() + 1).toString()
    const agentMsg: AgentMessage = {
      id: agentMsgId,
      sender: 'agent',
      text: '',
      actions: [],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    setMessages((prev) => [...prev, userMsg, agentMsg])

    try {
      if (selectedEngine === 'ollama') {
        // Exécution de l'Agent ReAct natif avec boucle dans le Main Process
        const runRes = await window.api.agentRun({
          prompt: promptText,
          model: agentModel,
          numCtx: 16384,
          toolsEnabled,
          ollamaApiKey: ollamaApiKey.trim() || undefined,
          contextNotePath: currentFilePath,
          contextNoteContent: currentNoteContent,
          attachments: currentAttachments.map((a) => ({ name: a.name, text: a.extractedText }))
        })

        if (!runRes.success) {
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (last && last.id === agentMsgId) {
              return [
                ...prev.slice(0, -1),
                { ...last, text: last.text || `❌ ${runRes.error || 'Erreur d’exécution de l’agent.'}` }
              ]
            }
            return prev
          })
        } else {
          // Si l'exécution a réussi, s'assurer que le texte de l'agent n'est pas vide
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (last && last.id === agentMsgId) {
              const currentText = last.text.trim()
              const fallback = runRes.result || 'Opération accomplie avec succès.'
              return [
                ...prev.slice(0, -1),
                { ...last, text: currentText || fallback }
              ]
            }
            return prev
          })
          refreshTreeRef.current?.()
        }
      } else {
        // Si Claude ou ChatGPT Webview sont sélectionnés
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last && last.id === agentMsgId) {
            return [
              ...prev.slice(0, -1),
              {
                ...last,
                text: `Pour exécuter des outils directs sur vos notes (recherche, création automatique), sélectionnez **Ollama (Agent Local)** ci-dessus.`
              }
            ]
          }
          return prev
        })
      }
    } catch (err: any) {
      console.error('Erreur handleExecute:', err)
      setStatusText(`Erreur : ${err.message}`)
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last && last.id === agentMsgId) {
          return [
            ...prev.slice(0, -1),
            { ...last, text: last.text || `❌ Erreur : ${err.message}` }
          ]
        }
        return prev
      })
    } finally {
      setIsExecuting(false)
    }
  }

  // Liste combinée des modèles (présélections + modèles déjà installés dans Ollama)
  const availableModelOptions = Array.from(new Set([...PRESET_MODELS, ...ollamaInfo.models]))
  const isCurrentModelInstalled = ollamaInfo.models.some(
    (m) => m === agentModel || m.startsWith(agentModel + ':') || agentModel.startsWith(m + ':')
  )

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#121214',
        color: '#e4e4e7',
        fontSize: '13px',
        position: 'relative',
        border: isDragging ? '2px dashed #10b981' : 'none'
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragging(false)
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          processFiles(e.dataTransfer.files)
        }
      }}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept=".pdf,.txt,.md,.html,.json,.js,.ts,.py,.csv"
        multiple
        style={{ display: 'none' }}
      />

      {/* Header Principal */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: '#18181b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10b981'
            }}
          >
            <SparklesIcon size={16} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '13px', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
              Agent IA Autonome
              <span
                style={{
                  fontSize: '10px',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  backgroundColor: toolsEnabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                  color: toolsEnabled ? '#34d399' : '#facc15',
                  fontWeight: 600
                }}
              >
                {toolsEnabled ? 'OUTILS ACTIFS' : 'CHAT PUR'}
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
              <span style={{ color: isCurrentModelInstalled ? '#34d399' : '#f59e0b', display: 'flex', alignItems: 'center', gap: '3px' }}>
                ● {agentModel} {!isCurrentModelInstalled && '(Non installé)'}
              </span>
              <span>•</span>
              <span
                style={{
                  padding: '1px 6px',
                  borderRadius: '4px',
                  backgroundColor: currentFilePath ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.08)',
                  color: currentFilePath ? '#38bdf8' : '#a1a1aa',
                  fontSize: '10px',
                  fontWeight: 500
                }}
              >
                {currentFilePath ? `📄 ${currentFilePath.split('/').pop()}` : '🏠 Accueil'}
              </span>
            </div>
          </div>
        </div>

        {/* Engine Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', backgroundColor: '#121214', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <button
            onClick={() => setSelectedEngine('ollama')}
            title="Agent Local ReAct avec Outils & Contexte 16K"
            style={{
              padding: '4px 9px',
              borderRadius: '6px',
              backgroundColor: selectedEngine === 'ollama' ? 'rgba(16, 185, 129, 0.22)' : 'transparent',
              border: selectedEngine === 'ollama' ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid transparent',
              color: selectedEngine === 'ollama' ? '#34d399' : '#a1a1aa',
              fontSize: '11px',
              fontWeight: selectedEngine === 'ollama' ? 700 : 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <span>🤖</span> Ollama Agent
          </button>
          <button
            onClick={() => setSelectedEngine('claude')}
            title="Déléguer à Claude Webview"
            style={{
              padding: '4px 9px',
              borderRadius: '6px',
              backgroundColor: selectedEngine === 'claude' ? 'rgba(217, 119, 87, 0.22)' : 'transparent',
              border: selectedEngine === 'claude' ? '1px solid rgba(217, 119, 87, 0.4)' : '1px solid transparent',
              color: selectedEngine === 'claude' ? '#f87171' : '#a1a1aa',
              fontSize: '11px',
              fontWeight: selectedEngine === 'claude' ? 700 : 500,
              cursor: 'pointer'
            }}
          >
            Claude
          </button>
          <button
            onClick={() => setSelectedEngine('chatgpt')}
            title="Déléguer à ChatGPT Webview"
            style={{
              padding: '4px 9px',
              borderRadius: '6px',
              backgroundColor: selectedEngine === 'chatgpt' ? 'rgba(56, 189, 248, 0.22)' : 'transparent',
              border: selectedEngine === 'chatgpt' ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid transparent',
              color: selectedEngine === 'chatgpt' ? '#38bdf8' : '#a1a1aa',
              fontSize: '11px',
              fontWeight: selectedEngine === 'chatgpt' ? 700 : 500,
              cursor: 'pointer'
            }}
          >
            ChatGPT
          </button>
        </div>
      </div>

      {/* Barre de Configuration du Modèle (Ollama) */}
      {selectedEngine === 'ollama' && (
        <div
          style={{
            padding: '6px 14px',
            backgroundColor: '#141416',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#71717a' }}>Modèle :</span>
            <select
              value={agentModel}
              onChange={(e) => setAgentModel(e.target.value)}
              style={{
                backgroundColor: '#27272a',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '6px',
                padding: '2px 8px',
                fontSize: '11px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {availableModelOptions.map((m) => (
                <option key={m} value={m}>
                  {m} {ollamaInfo.models.includes(m) ? '✓' : '(à télécharger)'}
                </option>
              ))}
            </select>

            <button
              onClick={() => setToolsEnabled(!toolsEnabled)}
              title={toolsEnabled ? 'Désactiver les outils (mode conversationnel seul)' : 'Activer les outils de recherche et création'}
              style={{
                backgroundColor: toolsEnabled ? 'rgba(16, 185, 129, 0.15)' : '#27272a',
                color: toolsEnabled ? '#34d399' : '#a1a1aa',
                border: '1px solid ' + (toolsEnabled ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.1)'),
                borderRadius: '6px',
                padding: '2px 8px',
                fontSize: '11px',
                cursor: 'pointer'
              }}
            >
              {toolsEnabled ? '🛠️ Outils actifs (16K)' : '💬 Chat pur'}
            </button>

            <button
              onClick={() => {
                setTempApiKey(ollamaApiKey)
                setShowSettingsModal(true)
              }}
              title="Configurer la clé API Ollama Web Search & Web Fetch"
              style={{
                backgroundColor: ollamaApiKey ? 'rgba(56, 189, 248, 0.15)' : '#27272a',
                color: ollamaApiKey ? '#38bdf8' : '#a1a1aa',
                border: '1px solid ' + (ollamaApiKey ? 'rgba(56, 189, 248, 0.3)' : 'rgba(255, 255, 255, 0.1)'),
                borderRadius: '6px',
                padding: '2px 8px',
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span>⚙️ Clé Web</span>
              {ollamaApiKey ? <span style={{ color: '#34d399', fontSize: '9px' }}>●</span> : null}
            </button>
          </div>

          <div style={{ fontSize: '11px', color: '#71717a' }}>
            <span>Contexte : <strong>16 384 tokens</strong></span>
          </div>
        </div>
      )}

      {/* Modal de Configuration Clé API Ollama Web */}
      {showSettingsModal && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            backdropFilter: 'blur(3px)'
          }}
          onClick={() => setShowSettingsModal(false)}
        >
          <div
            style={{
              backgroundColor: '#18181b',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '12px',
              padding: '20px',
              width: '90%',
              maxWidth: '480px',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>⚙️</span>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#f4f4f5' }}>
                  Réglages de l’Agent (Clé Web Ollama)
                </h3>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', fontSize: '16px' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '12px', color: '#a1a1aa', margin: '0 0 14px 0', lineHeight: 1.5 }}>
              Cette clé permet à l’Agent d’exécuter les outils <code>web_search</code> et <code>web_fetch</code> via l’API officielle Ollama (<code>https://ollama.com/api/web_search</code>). Elle est stockée de manière sécurisée dans <code>.config.json</code> et n'est jamais exposée en dur.
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#d4d4d8', marginBottom: '6px' }}>
                Clé API Ollama (Bearer Token)
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type={showKeySecret ? 'text' : 'password'}
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                  placeholder="ex: dbe4d58575a0450483899a639b2075d2..."
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    backgroundColor: '#27272a',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowKeySecret(!showKeySecret)}
                  style={{
                    padding: '0 10px',
                    backgroundColor: '#27272a',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#a1a1aa',
                    cursor: 'pointer',
                    fontSize: '11px'
                  }}
                >
                  {showKeySecret ? 'Masquer' : 'Afficher'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                style={{
                  padding: '6px 14px',
                  backgroundColor: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  color: '#d4d4d8',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => handleSaveApiKey(tempApiKey)}
                style={{
                  padding: '6px 14px',
                  backgroundColor: '#10b981',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Enregistrer la clé
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alerte si le modèle n'est pas encore installé */}
      {selectedEngine === 'ollama' && !isCurrentModelInstalled && (
        <div
          style={{
            padding: '6px 14px',
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
            borderBottom: '1px solid rgba(245, 158, 11, 0.25)',
            color: '#fbbf24',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <span>
            ⚠️ Le modèle <strong>{agentModel}</strong> n’est pas détecté dans Ollama. Lance <code>ollama pull {agentModel}</code> dans ton terminal.
          </span>
          {ollamaInfo.models.length > 0 && (
            <button
              onClick={() => setAgentModel(ollamaInfo.models[0])}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: '#ffffff',
                padding: '2px 6px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '10px'
              }}
            >
              Basculer sur {ollamaInfo.models[0]}
            </button>
          )}
        </div>
      )}

      {/* Quick Chips d'action */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          display: 'flex',
          gap: '6px',
          overflowX: 'auto',
          backgroundColor: '#141417'
        }}
      >
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: '4px 8px',
            borderRadius: '6px',
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#34d399',
            fontSize: '11px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <PaperclipIcon size={12} /> Joindre un PDF / doc
        </button>

        <button
          onClick={() => handleExecute("Cherche les nouveautés d'Ollama et fais-moi un résumé avec les sources")}
          style={{
            padding: '4px 8px',
            borderRadius: '6px',
            backgroundColor: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            color: '#38bdf8',
            fontSize: '11px',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          🌐 Nouveautés Ollama
        </button>

        <button
          onClick={() => handleExecute("Cherche les notes existantes sur le sujet et crée une note de synthèse")}
          style={{
            padding: '4px 8px',
            borderRadius: '6px',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            color: '#34d399',
            fontSize: '11px',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          🔍 Chercher & Synthétiser
        </button>

        <button
          onClick={() => handleExecute("Crée une note 'Checklist Révisions' dans le dossier Cours")}
          style={{
            padding: '4px 8px',
            borderRadius: '6px',
            backgroundColor: 'rgba(168, 85, 247, 0.12)',
            border: '1px solid rgba(168, 85, 247, 0.25)',
            color: '#c084fc',
            fontSize: '11px',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          📝 Créer une Note
        </button>
      </div>

      {/* Toast d'annulation */}
      {undoToast && (
        <div
          style={{
            position: 'absolute',
            top: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#1e293b',
            border: '1px solid #38bdf8',
            color: '#e2e8f0',
            padding: '8px 16px',
            borderRadius: '8px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
            zIndex: 100,
            fontSize: '12px'
          }}
        >
          {undoToast}
        </div>
      )}

      {/* Fil de discussion */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {messages.map((m, idx) => (
          <div
            key={m.id}
            style={{
              alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: m.sender === 'user' ? 'flex-end' : 'flex-start'
            }}
          >
            <div
              style={{
                backgroundColor: m.sender === 'user' ? '#10b981' : '#1e1e24',
                color: m.sender === 'user' ? '#ffffff' : '#e4e4e7',
                padding: '10px 14px',
                borderRadius: m.sender === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                lineHeight: 1.5,
                fontSize: '12.5px',
                border: m.sender === 'user' ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap'
              }}
            >
              {/* Badges de pièces jointes */}
              {m.attachments && m.attachments.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                  {m.attachments.map((att, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(0, 0, 0, 0.25)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        fontSize: '11px',
                        color: '#cbd5e1'
                      }}
                    >
                      <PdfIcon size={12} style={{ color: '#f87171' }} />
                      <span style={{ fontWeight: 600 }}>{att.name}</span>
                      {att.pageCount && <span style={{ opacity: 0.7 }}>({att.pageCount} p.)</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Badges d'Outils appelés en direct */}
              {m.actions && m.actions.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '10px' }}>
                  {m.actions.map((act) => (
                    <div
                      key={act.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        padding: '5px 9px',
                        borderRadius: '6px',
                        backgroundColor:
                          act.status === 'success'
                            ? 'rgba(16, 185, 129, 0.12)'
                            : act.status === 'error'
                            ? 'rgba(239, 68, 68, 0.12)'
                            : 'rgba(56, 189, 248, 0.12)',
                        border:
                          act.status === 'success'
                            ? '1px solid rgba(16, 185, 129, 0.3)'
                            : act.status === 'error'
                            ? '1px solid rgba(239, 68, 68, 0.3)'
                            : '1px solid rgba(56, 189, 248, 0.3)',
                        color:
                          act.status === 'success'
                            ? '#6ee7b7'
                            : act.status === 'error'
                            ? '#fca5a5'
                            : '#7dd3fc',
                        fontSize: '11.5px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                        {act.status === 'pending' && <span style={{ animation: 'spin 1s infinite' }}>⏳</span>}
                        <span>{act.text}</span>
                      </div>
                      {act.details && (
                        <div style={{ fontSize: '10px', opacity: 0.8, fontFamily: 'monospace' }}>
                          {act.details.slice(0, 160)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Texte de la réponse ou indicateur de réflexion */}
              {m.text ? (
                <div>{m.text}</div>
              ) : isExecuting && idx === messages.length - 1 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontStyle: 'italic', fontSize: '12px' }}>
                  <span style={{ display: 'inline-block', animation: 'spin 1.5s linear infinite' }}>⚙️</span>
                  <span>L'agent analyse ta demande et prépare les outils...</span>
                </div>
              ) : null}

              {/* Bouton d'annulation interactif si une note a été créée */}
              {m.undoAvailable && (
                <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => onOpenNote(m.undoAvailable!.path)}
                    style={{
                      padding: '4px 10px',
                      backgroundColor: 'rgba(56, 189, 248, 0.15)',
                      border: '1px solid rgba(56, 189, 248, 0.35)',
                      color: '#38bdf8',
                      borderRadius: '6px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    📄 Ouvrir la note
                  </button>
                  <button
                    onClick={handleUndo}
                    style={{
                      padding: '4px 10px',
                      backgroundColor: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      color: '#f87171',
                      borderRadius: '6px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    ↩️ Annuler la création
                  </button>
                </div>
              )}
            </div>
            <span style={{ fontSize: '10px', color: '#71717a', marginTop: '3px', padding: '0 4px' }}>
              {m.timestamp}
            </span>
          </div>
        ))}

        {isExecuting && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              backgroundColor: '#202024',
              borderRadius: '8px',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              width: 'fit-content'
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#10b981',
                boxShadow: '0 0 8px rgba(16, 185, 129, 0.7)',
                display: 'inline-block'
              }}
            />
            <span style={{ fontSize: '12px', color: '#a1a1aa' }}>
              {statusText} {elapsedSeconds > 0 ? `(${elapsedSeconds}s)` : ''}
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Zone de pièces jointes prêtes à l'envoi */}
      {attachments.length > 0 && (
        <div
          style={{
            padding: '6px 12px',
            backgroundColor: '#18181b',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px'
          }}
        >
          {attachments.map((att) => (
            <div
              key={att.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 9px',
                borderRadius: '6px',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#34d399',
                fontSize: '11.5px'
              }}
            >
              <PdfIcon size={13} style={{ color: '#f87171' }} />
              <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {att.name}
              </span>
              {att.pageCount && <span style={{ fontSize: '10px', opacity: 0.8 }}>({att.pageCount} p.)</span>}
              <button
                onClick={() => removeAttachment(att.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#a1a1aa',
                  cursor: 'pointer',
                  padding: '1px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <XIcon size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Zone de Saisie */}
      <div style={{ padding: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', backgroundColor: '#18181b' }}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleExecute(inputValue)
          }}
          style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
        >
          {/* Bouton Pièce Jointe */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Joindre un PDF ou fichier document"
            style={{
              padding: '8px',
              backgroundColor: '#27272a',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              color: '#a1a1aa',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s'
            }}
          >
            <PaperclipIcon size={15} />
          </button>

          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={
              attachments.length > 0
                ? 'Que souhaites-tu faire avec ce document ?'
                : 'Demande à l’Agent (ex: Cherche les notes Java et fais une synthèse)...'
            }
            disabled={isExecuting}
            style={{
              flex: 1,
              backgroundColor: '#27272a',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '8px 12px',
              color: '#ffffff',
              fontSize: '12.5px',
              outline: 'none'
            }}
          />

          {isExecuting ? (
            <button
              type="button"
              onClick={handleCancelAgent}
              title="Arrêter l'exécution"
              style={{
                padding: '0 12px',
                height: '34px',
                backgroundColor: '#dc2626',
                border: 'none',
                borderRadius: '8px',
                color: '#ffffff',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 600
              }}
            >
              Arrêter
            </button>
          ) : (
            <button
              type="submit"
              disabled={!inputValue.trim() && attachments.length === 0}
              style={{
                padding: '0 12px',
                height: '34px',
                backgroundColor: !inputValue.trim() && attachments.length === 0 ? '#3f3f46' : '#10b981',
                border: 'none',
                borderRadius: '8px',
                color: '#ffffff',
                cursor: !inputValue.trim() && attachments.length === 0 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <SendIcon size={14} />
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
