import { useState, useEffect, useRef } from 'react'
import Sidebar from '@renderer/components/Sidebar'
import MDEditor from '@uiw/react-md-editor'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import wikiLinkPlugin from 'remark-wiki-link'

// TypeScript definition to support non-standard webview tag in JSX
declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLWebViewElement>, HTMLWebViewElement> & {
        src?: string
        id?: string
        ref?: React.RefObject<any>
        style?: React.CSSProperties
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
  'toggle-claude': 'Afficher/masquer le volet Claude'
}

const DEFAULT_MAPPINGS: ShortcutMapping[] = [
  { uuid: '1', actionId: 'create-note', key: 'n', ctrlKey: true, shiftKey: false, altKey: false },
  { uuid: '2', actionId: 'delete-note', key: 'Delete', ctrlKey: false, shiftKey: false, altKey: false },
  { uuid: '3', actionId: 'open-settings', key: ',', ctrlKey: true, shiftKey: false, altKey: false },
  { uuid: '4', actionId: 'toggle-sidebar', key: 'b', ctrlKey: true, shiftKey: false, altKey: false },
  { uuid: '5', actionId: 'toggle-claude', key: 'j', ctrlKey: true, shiftKey: false, altKey: false }
]

function App() {
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [fileContent, setFileContent] = useState<string>('')
  const [files, setFiles] = useState<string[]>([])
  
  // Autocomplete state
  const [autocompleteVisible, setAutocompleteVisible] = useState(false)
  const [autocompleteQuery, setAutocompleteQuery] = useState('')
  const [cursorPos, setCursorPos] = useState<number>(0)

  // Claude.ai integration states
  const [showClaude, setShowClaude] = useState(false)
  const webviewRef = useRef<any>(null)
  const [claudeWidth, setClaudeWidth] = useState<number>(450)
  const [isResizing, setIsResizing] = useState(false)

  // Sidebar resize & collapse states
  const [sidebarWidth, setSidebarWidth] = useState<number>(250)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isSidebarResizing, setIsSidebarResizing] = useState(false)
  const sidebarDragging = useRef(false)
  
  // Note editing & settings states
  const [editingFile, setEditingFile] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [notesToDelete, setNotesToDelete] = useState<string[]>([])
  const [shortcuts, setShortcuts] = useState<ShortcutMapping[]>(() => {
    const stored = localStorage.getItem('note-app-shortcuts')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          const merged = [...parsed]
          DEFAULT_MAPPINGS.forEach(def => {
            if (!merged.find(m => m.actionId === def.actionId)) {
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
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const fetchFiles = () => {
    window.api.listMarkdownFiles().then(setFiles).catch(console.error)
  }

  useEffect(() => {
    fetchFiles()
  }, [])

  useEffect(() => {
    if (selectedFiles.length === 1 && selectedFiles[0] !== '__claude_code__') {
      window.api.readNote(selectedFiles[0]).then((content) => {
        setFileContent(content)
      }).catch(console.error)
    } else {
      setFileContent('')
    }
  }, [selectedFiles])

  const handleContentChange = (value?: string) => {
    const newContent = value || ''
    setFileContent(newContent)

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    if (selectedFiles.length === 1 && selectedFiles[0] !== '__claude_code__') {
      saveTimeoutRef.current = setTimeout(() => {
        window.api.writeNote(selectedFiles[0], newContent).catch(console.error)
      }, 500)
    }
  }

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
      setAutocompleteVisible(false)
      
      if (selectedFiles.length === 1 && selectedFiles[0] !== '__claude_code__') {
        window.api.writeNote(selectedFiles[0], newContent).catch(console.error)
      }
    }
  }

  // Note Action Handlers
  const handleCreateNote = async () => {
    const newFile = await window.api.createNote('')
    fetchFiles()
    setSelectedFiles([newFile])
    setEditingFile(newFile)
    setEditValue('') // start editing with empty input (placeholder shows note #X)
  }

  const handleDeleteNotes = (fileNames: string[]) => {
    const toDelete = fileNames.filter(f => f !== '__claude_code__')
    if (toDelete.length > 0) {
      setNotesToDelete(toDelete)
    }
  }

  const confirmDeleteNotes = async () => {
    if (notesToDelete.length === 0) return
    let anySuccess = false
    for (const file of notesToDelete) {
      const success = await window.api.deleteNote(file)
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

  const submitRename = async () => {
    if (editingFile && editValue.trim() !== '') {
      const oldName = editingFile
      const newName = editValue.trim()
      const oldNameWithoutExt = oldName.replace('.md', '')
      
      if (newName !== oldNameWithoutExt) {
        const result = await window.api.renameNote(oldName, newName)
        if (result) {
          fetchFiles()
          setSelectedFiles((prev) => prev.map((f) => (f === oldName ? result : f)))
        }
      }
    }
    setEditingFile(null)
  }

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
      const isTyping = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        (activeEl as HTMLElement).isContentEditable
      )
      
      const match = shortcuts.find(s => {
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
          setIsSettingsOpen(prev => !prev)
        } else if (match.actionId === 'toggle-sidebar') {
          setIsSidebarCollapsed(prev => !prev)
        } else if (match.actionId === 'toggle-claude') {
          setShowClaude(prev => !prev)
        }
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [shortcuts, selectedFiles, isSettingsOpen, recordingUuid, notesToDelete])

  // Recording shortcut combination keydown handler
  useEffect(() => {
    if (!recordingUuid || !isSettingsOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      
      if (e.key === 'Escape') {
        setRecordingUuid(null)
        setShortcuts(prev => {
          const item = prev.find(m => m.uuid === recordingUuid)
          if (item && !item.key) {
            return prev.filter(m => m.uuid !== recordingUuid)
          }
          return prev
        })
        return
      }

      const key = e.key.toLowerCase()
      if (['control', 'shift', 'alt', 'meta'].includes(key)) {
        return
      }

      setShortcuts(prev => {
        const updated = prev.map(m => {
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

  const sendToClaude = async (prompt: string) => {
    const webview = webviewRef.current
    if (!webview) {
      console.error("La Webview Claude.ai n'est pas disponible.")
      return
    }

    const script = `
      (async () => {
        const editor = document.querySelector('div[contenteditable="true"]');
        if (!editor) {
          console.error("Éditeur ProseMirror non trouvé dans Claude.ai");
          return false;
        }

        editor.focus();
        document.execCommand('insertText', false, ${JSON.stringify(prompt)});
        editor.dispatchEvent(new Event('input', { bubbles: true }));

        await new Promise(resolve => setTimeout(resolve, 500));

        const selectors = [
          'button[aria-label*="Send Message"]',
          'button[aria-label*="Send"]',
          'button[aria-label*="Envoyer"]',
          'button[aria-label*="Submit"]',
          'button[type="submit"]',
          'button:has(svg)'
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
            const text = btn.innerText.toLowerCase();
            return (label.includes('send') || label.includes('envoyer') || label.includes('submit') ||
                    text.includes('send') || text.includes('envoyer') || text.includes('submit')) && !btn.disabled;
          });
        }

        if (sendButton) {
          sendButton.focus();
          sendButton.click();
          return true;
        }

        return false;
      })()
    `

    try {
      const success = await webview.executeJavaScript(script)
      if (success) {
        console.log('Prompt envoyé avec succès à Claude.ai !')
      } else {
        console.warn("Échec de l'envoi.")
      }
    } catch (error) {
      console.error("Erreur d'exécution JavaScript dans la webview :", error)
    }
  }

  const isDragging = useRef(false)

  const handleResize = (e: MouseEvent) => {
    if (!isDragging.current) return
    const newWidth = window.innerWidth - e.clientX
    if (newWidth > 300 && newWidth < window.innerWidth * 0.8) {
      setClaudeWidth(newWidth)
    }
  }

  const stopResize = () => {
    isDragging.current = false
    setIsResizing(false)
    document.removeEventListener('mousemove', handleResize)
    document.removeEventListener('mouseup', stopResize)
  }

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    setIsResizing(true)
    document.addEventListener('mousemove', handleResize)
    document.addEventListener('mouseup', stopResize)
  }

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleResize)
      document.removeEventListener('mouseup', stopResize)
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
  }

  const startSidebarResize = (e: React.MouseEvent) => {
    e.preventDefault()
    sidebarDragging.current = true
    setIsSidebarResizing(true)
    document.addEventListener('mousemove', handleSidebarResize)
    document.addEventListener('mouseup', stopSidebarResize)
  }

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleSidebarResize)
      document.removeEventListener('mouseup', stopSidebarResize)
    }
  }, [])

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        backgroundColor: '#252526',
        color: '#fff',
        fontFamily: 'sans-serif',
        margin: 0,
        padding: 0,
        overflow: 'hidden'
      }}
    >
      {/* Sidebar wrapper with transition */}
      <div
        style={{
          width: isSidebarCollapsed ? '0px' : `${sidebarWidth}px`,
          minWidth: isSidebarCollapsed ? '0px' : `${sidebarWidth}px`,
          overflow: 'hidden',
          transition: isSidebarResizing ? 'none' : 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          flexShrink: 0,
          position: 'relative'
        }}
      >
        <Sidebar
          onSelectFiles={setSelectedFiles}
          selectedFiles={selectedFiles}
          files={files}
          fetchFiles={fetchFiles}
          editingFile={editingFile}
          setEditingFile={setEditingFile}
          editValue={editValue}
          setEditValue={setEditValue}
          onDeleteNotes={handleDeleteNotes}
          onCreateNote={handleCreateNote}
          onOpenSettings={() => setIsSettingsOpen(true)}
          submitRename={submitRename}
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
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#1e1e1e',
          position: 'relative'
        }}
      >
        {/* Top Navigation Bar */}
        <div
          style={{
            height: '40px',
            minHeight: '40px',
            backgroundColor: '#252526',
            borderBottom: '1px solid #333',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 12px',
            boxSizing: 'border-box',
            zIndex: 1000
          }}
        >
          {/* Sidebar Toggle */}
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            title={isSidebarCollapsed ? 'Afficher la barre latérale' : 'Masquer la barre latérale'}
            style={{
              width: '28px',
              height: '28px',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '4px',
              color: '#aaa',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#37373d'
              e.currentTarget.style.color = '#fff'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = '#aaa'
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Settings Toggle */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              title="Paramètres (Ctrl+,)"
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: '#aaa',
                borderRadius: '4px',
                padding: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#37373d'
                e.currentTarget.style.color = '#fff'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = '#aaa'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>

            {/* Claude Toggle */}
            <button
              onClick={() => setShowClaude(!showClaude)}
              style={{
                backgroundColor: showClaude ? '#37373d' : 'transparent',
                border: 'none',
                color: '#fff',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '14px',
                cursor: 'pointer',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#37373d'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = showClaude ? '#37373d' : 'transparent'
              }}
            >
              <svg width="18" height="18" fill="#D97757" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <title>Claude</title>
                <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"/>
              </svg>
              Claude
            </button>
          </div>
        </div>
        {/* Always-mounted Claude Code workspace (persistent, hidden when not active) */}
        <div style={{
          flex: 1,
          display: (selectedFiles.length === 1 && selectedFiles[0] === '__claude_code__') ? 'flex' : 'none',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          backgroundColor: '#1a1a1a'
        }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 16px',
              backgroundColor: '#252526',
              borderBottom: '1px solid #333',
              height: '40px',
              boxSizing: 'border-box'
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="16" height="16" fill="#D97757" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"/></svg>
              Claude Code
            </span>
            <span style={{ color: '#888', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Espace de travail Claude.ai
            </span>
          </div>
          <div style={{ flex: 1, position: 'relative' }}>
            <webview
              id="claude-code-webview"
              src="https://claude.ai"
              allowpopups
              useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
              style={{ width: '100%', height: '100%', border: 'none' }}
            />
          </div>
        </div>

        {selectedFiles.length > 0 ? (
          selectedFiles.length > 1 ? (
            /* Multi-selection info screen */
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: '#1e1e1e',
                color: '#aaa',
                gap: '16px'
              }}
            >
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#00d2ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 8px rgba(0, 210, 255, 0.4))' }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="9" y1="15" x2="15" y2="15" />
                <line x1="9" y1="11" x2="15" y2="11" />
              </svg>
              <div style={{ fontSize: '18px', fontWeight: 600, color: '#fff' }}>
                {selectedFiles.length} notes sélectionnées
              </div>
              <button
                onClick={() => handleDeleteNotes(selectedFiles)}
                style={{
                  backgroundColor: 'transparent',
                  color: '#ff5555',
                  border: '1px solid #ff5555',
                  borderRadius: '4px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#ff5555'
                  e.currentTarget.style.color = '#fff'
                  e.currentTarget.style.boxShadow = '0 0 10px rgba(255, 85, 85, 0.4)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = '#ff5555'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                Supprimer les {selectedFiles.length} notes
              </button>
            </div>
          ) : selectedFiles[0] === '__claude_code__' ? null : (
            /* Standard markdown editor with resizable Claude panel */
            <div 
              data-color-mode="dark" 
              style={{ flex: 1, height: '100%', overflow: 'hidden', position: 'relative' }}
              onKeyUp={handleKeyUp}
              onClick={handleClick}
            >


              {/* Split Screen Layout */}
              <div style={{ display: 'flex', height: '100%', width: '100%' }}>
                {/* Left pane: Markdown Editor */}
                <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
                  {autocompleteVisible && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '45px', // Décale pour éviter la superposition avec le bouton de Claude
                        right: '10px',
                        width: '250px',
                        backgroundColor: '#252526',
                        border: '1px solid #444',
                        borderRadius: '4px',
                        zIndex: 1000,
                        maxHeight: '300px',
                        overflowY: 'auto',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                      }}
                    >
                      <div style={{ padding: '8px', borderBottom: '1px solid #444', fontSize: '12px', color: '#888' }}>
                        Lier à une note...
                      </div>
                      {files
                        .filter(f => f.toLowerCase().includes(autocompleteQuery.toLowerCase()))
                        .map(f => {
                          const name = f.replace('.md', '')
                          return (
                            <div
                              key={f}
                              onClick={() => insertLink(name)}
                              style={{ padding: '8px', cursor: 'pointer', borderBottom: '1px solid #333' }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#37373d'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                              {name}
                            </div>
                          )
                        })}
                      {files.filter(f => f.toLowerCase().includes(autocompleteQuery.toLowerCase())).length === 0 && (
                        <div
                          onClick={() => insertLink(autocompleteQuery)}
                          style={{ padding: '8px', cursor: 'pointer', color: '#00d2ff' }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#37373d'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          Créer "{autocompleteQuery}"
                        </div>
                      )}
                    </div>
                  )}
                  <MDEditor
                    value={fileContent}
                    onChange={handleContentChange}
                    height="100%"
                    style={{ height: '100%', borderRadius: 0, border: 'none' }}
                    preview="live"
                    previewOptions={{
                      remarkPlugins: [wikiLinkPlugin],
                      components: {
                        a: ({ node, href, children, ...props }) => {
                          if (props.className?.includes('internal')) {
                            const linkName = children && Array.isArray(children) ? String(children[0]) : String(children || '')
                            return (
                              <a
                                {...props}
                                href="#"
                                onClick={async (e) => {
                                  e.preventDefault()
                                  const fileName = await window.api.createSpecificNote(linkName)
                                  fetchFiles()
                                  setSelectedFiles([fileName])
                                }}
                                style={{ color: '#00d2ff', textDecoration: 'underline', cursor: 'pointer' }}
                              >
                                {children}
                              </a>
                            )
                          }
                          return <a href={href} {...props}>{children}</a>
                        }
                      },
                      rehypePlugins: [
                        [
                          rehypeSanitize,
                          {
                            ...defaultSchema,
                            attributes: {
                              ...defaultSchema.attributes,
                              span: [...(defaultSchema.attributes?.span || []), 'style', 'className'],
                              div: [...(defaultSchema.attributes?.div || []), 'style', 'className'],
                              p: [...(defaultSchema.attributes?.p || []), 'style', 'className']
                            }
                          }
                        ]
                      ]
                    }}
                  />
                </div>

                {/* Draggable Divider for resizing (always mounted, hidden via CSS) */}
                <div
                  onMouseDown={startResize}
                  style={{
                    width: '6px',
                    cursor: 'col-resize',
                    backgroundColor: isResizing ? '#00d2ff' : '#252526',
                    borderLeft: '1px solid #333',
                    borderRight: '1px solid #333',
                    zIndex: 100,
                    transition: 'background-color 0.1s ease',
                    position: 'relative',
                    display: showClaude ? 'block' : 'none'
                  }}
                />

                {/* Right pane: Claude.ai WebView (always mounted, hidden via CSS) */}
                <div
                  style={{
                    width: showClaude ? `${claudeWidth}px` : '0px',
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: '#1a1a1a',
                    zIndex: 10,
                    overflow: 'hidden',
                    transition: 'width 0.2s ease'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      backgroundColor: '#252526',
                      borderBottom: '1px solid #333',
                      height: '40px',
                      boxSizing: 'border-box',
                      minWidth: `${claudeWidth}px`
                    }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="16" height="16" fill="#D97757" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"/></svg>
                      Claude
                    </span>
                    <button
                      onClick={() => sendToClaude(fileContent)}
                      style={{
                        backgroundColor: '#ff0055',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '4px 12px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        boxShadow: '0 0 8px rgba(255, 0, 85, 0.3)',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#ff2a70'
                        e.currentTarget.style.boxShadow = '0 0 12px rgba(255, 0, 85, 0.6)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#ff0055'
                        e.currentTarget.style.boxShadow = '0 0 8px rgba(255, 0, 85, 0.3)'
                      }}
                    >
                      Envoyer à Claude
                    </button>
                  </div>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <webview
                      ref={webviewRef}
                      id="claude-webview"
                      src="https://claude.ai"
                      allowpopups
                      useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                      style={{ width: '100%', height: '100%', border: 'none', pointerEvents: isResizing ? 'none' : 'auto' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              color: '#888'
            }}
          >
            Sélectionnez ou créez une note
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999
          }}
        >
          <div
            style={{
              backgroundColor: '#1e1e1e',
              border: '1px solid #333',
              borderRadius: '8px',
              width: '650px',
              maxWidth: '90%',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
              color: '#fff'
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #333',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Paramètres</h2>
              <button
                onClick={() => {
                  setRecordingUuid(null)
                  setIsSettingsOpen(false)
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#888',
                  fontSize: '20px',
                  cursor: 'pointer',
                  outline: 'none'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#888'}
              >
                &times;
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', color: '#00d2ff' }}>Raccourcis clavier</h3>
                <p style={{ margin: '0 0 15px 0', fontSize: '13px', color: '#aaa' }}>
                  Configurez vos raccourcis clavier. Si vous enregistrez un raccourci sans modificateur (ex: Suppr), il ne fonctionnera pas pendant la saisie de texte dans l'éditeur.
                </p>
              </div>

              {/* Shortcuts List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {shortcuts.map((s) => (
                  <div
                    key={s.uuid}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px',
                      backgroundColor: '#252526',
                      border: '1px solid #333',
                      borderRadius: '6px'
                    }}
                  >
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <select
                        value={s.actionId}
                        onChange={(e) => {
                          const newAction = e.target.value
                          setShortcuts(prev => {
                            const updated = prev.map(m => m.uuid === s.uuid ? { ...m, actionId: newAction } : m)
                            localStorage.setItem('note-app-shortcuts', JSON.stringify(updated))
                            return updated
                          })
                        }}
                        style={{
                          backgroundColor: '#1e1e1e',
                          color: '#fff',
                          border: '1px solid #444',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '13px',
                          outline: 'none'
                        }}
                      >
                        {Object.entries(ACTIONS).map(([id, label]) => (
                          <option key={id} value={id}>{label}</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <span
                        style={{
                          backgroundColor: recordingUuid === s.uuid ? '#ff8a00' : '#1e1e1e',
                          color: recordingUuid === s.uuid ? '#fff' : '#00d2ff',
                          border: `1px solid ${recordingUuid === s.uuid ? '#ff8a00' : '#444'}`,
                          borderRadius: '4px',
                          padding: '6px 10px',
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          minWidth: '150px',
                          textAlign: 'center'
                        }}
                      >
                        {recordingUuid === s.uuid ? 'Appuyez...' : formatShortcut(s)}
                      </span>

                      <div style={{ display: 'flex', gap: '5px' }}>
                        <button
                          onClick={() => setRecordingUuid(s.uuid)}
                          style={{
                            backgroundColor: '#37373d',
                            color: '#fff',
                            border: '1px solid #555',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#45454b'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#37373d'}
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => {
                            if (recordingUuid === s.uuid) {
                              setRecordingUuid(null)
                            }
                            setShortcuts(prev => {
                              const updated = prev.filter(m => m.uuid !== s.uuid)
                              localStorage.setItem('note-app-shortcuts', JSON.stringify(updated))
                              return updated
                            })
                          }}
                          style={{
                            backgroundColor: 'transparent',
                            color: '#ff5555',
                            border: '1px solid #ff5555',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#ff5555'
                            e.currentTarget.style.color = '#fff'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent'
                            e.currentTarget.style.color = '#ff5555'
                          }}
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
                <button
                  onClick={() => {
                    const newUuid = Math.random().toString()
                    setShortcuts(prev => {
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
                    backgroundColor: '#37373d',
                    color: '#fff',
                    border: '1px solid #555',
                    borderRadius: '4px',
                    padding: '8px 12px',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#45454b'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#37373d'}
                >
                  + Ajouter un raccourci
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('Voulez-vous réinitialiser tous les raccourcis par défaut ?')) {
                      setShortcuts(DEFAULT_MAPPINGS)
                      localStorage.setItem('note-app-shortcuts', JSON.stringify(DEFAULT_MAPPINGS))
                    }
                  }}
                  style={{
                    backgroundColor: 'transparent',
                    color: '#aaa',
                    border: '1px solid #444',
                    borderRadius: '4px',
                    padding: '8px 12px',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#666'
                    e.currentTarget.style.color = '#fff'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#444'
                    e.currentTarget.style.color = '#aaa'
                  }}
                >
                  Réinitialiser
                </button>
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid #333',
                display: 'flex',
                justifyContent: 'flex-end',
                backgroundColor: '#1a1a1a',
                borderBottomLeftRadius: '8px',
                borderBottomRightRadius: '8px'
              }}
            >
              <button
                onClick={() => {
                  setRecordingUuid(null)
                  setIsSettingsOpen(false)
                }}
                style={{
                  backgroundColor: '#00d2ff',
                  color: '#000',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '8px 16px',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  cursor: 'pointer',
                  outline: 'none'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#00bfe5'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#00d2ff'}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirm Delete Modal */}
      {notesToDelete.length > 0 && (
        <div
          onClick={() => setNotesToDelete([])}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
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
              backgroundColor: '#1e1e1e',
              border: '1px solid #333',
              borderRadius: '8px',
              width: '400px',
              maxWidth: '90%',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 0 20px rgba(0, 210, 255, 0.2), 0 0 40px rgba(255, 0, 85, 0.15), 0 10px 30px rgba(0,0,0,0.6)',
              color: '#fff',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            {/* Top Neon Gradient Bar */}
            <div
              style={{
                height: '4px',
                width: '100%',
                background: 'linear-gradient(90deg, #00d2ff, #ff0055, #ff8a00)'
              }}
            />

            {/* Content Container */}
            <div style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                {/* Neon-colored Warning Icon */}
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ff0055"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    filter: 'drop-shadow(0 0 4px #ff0055)'
                  }}
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#fff' }}>
                  {notesToDelete.length > 1 ? `Supprimer les ${notesToDelete.length} notes ?` : 'Supprimer la note ?'}
                </h3>
              </div>

              <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#ccc', lineHeight: '1.5' }}>
                {notesToDelete.length > 1 ? (
                  <>
                    Voulez-vous vraiment supprimer ces <strong style={{ color: '#00d2ff', textShadow: '0 0 8px rgba(0, 210, 255, 0.3)' }}>{notesToDelete.length} notes</strong> ?
                  </>
                ) : (
                  <>
                    Voulez-vous vraiment supprimer la note <strong style={{ color: '#00d2ff', textShadow: '0 0 8px rgba(0, 210, 255, 0.3)' }}>"{notesToDelete[0].replace('.md', '')}"</strong> ?
                  </>
                )}
                <br />
                Cette action supprimera définitivement les fichiers et est irréversible.
              </p>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  onClick={() => setNotesToDelete([])}
                  style={{
                    backgroundColor: '#2d2d30',
                    color: '#ccc',
                    border: '1px solid #444',
                    borderRadius: '4px',
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    outline: 'none',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#3e3e42'
                    e.currentTarget.style.color = '#fff'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#2d2d30'
                    e.currentTarget.style.color = '#ccc'
                  }}
                >
                  Annuler
                </button>
                <button
                  autoFocus
                  onClick={confirmDeleteNotes}
                  style={{
                    background: 'linear-gradient(135deg, #ff0055, #ff5500)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '8px 18px',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    outline: 'none',
                    boxShadow: '0 0 10px rgba(255, 0, 85, 0.4)',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 0 18px rgba(255, 0, 85, 0.7)'
                    e.currentTarget.style.filter = 'brightness(1.1)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = '0 0 10px rgba(255, 0, 85, 0.4)'
                    e.currentTarget.style.filter = 'brightness(1.0)'
                  }}
                >
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App