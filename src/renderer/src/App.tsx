import { useState, useEffect, useRef } from 'react'
import Sidebar from '@renderer/components/Sidebar'
import MDEditor from '@uiw/react-md-editor'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import wikiLinkPlugin from 'remark-wiki-link'

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
  'delete-note': 'Supprimer la note actuelle'
}

const DEFAULT_MAPPINGS: ShortcutMapping[] = [
  { uuid: '1', actionId: 'create-note', key: 'n', ctrlKey: true, shiftKey: false, altKey: false },
  { uuid: '2', actionId: 'delete-note', key: 'Delete', ctrlKey: false, shiftKey: false, altKey: false }
]

function App() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [files, setFiles] = useState<string[]>([])
  
  // Autocomplete state
  const [autocompleteVisible, setAutocompleteVisible] = useState(false)
  const [autocompleteQuery, setAutocompleteQuery] = useState('')
  const [cursorPos, setCursorPos] = useState<number>(0)
  
  // Note editing & settings states
  const [editingFile, setEditingFile] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null)
  const [shortcuts, setShortcuts] = useState<ShortcutMapping[]>(() => {
    const stored = localStorage.getItem('note-app-shortcuts')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) return parsed
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
    if (selectedFile) {
      window.api.readNote(selectedFile).then((content) => {
        setFileContent(content)
      }).catch(console.error)
    } else {
      setFileContent('')
    }
  }, [selectedFile])

  const handleContentChange = (value?: string) => {
    const newContent = value || ''
    setFileContent(newContent)

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    if (selectedFile) {
      saveTimeoutRef.current = setTimeout(() => {
        window.api.writeNote(selectedFile, newContent).catch(console.error)
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
      
      if (selectedFile) {
        window.api.writeNote(selectedFile, newContent).catch(console.error)
      }
    }
  }

  // Note Action Handlers
  const handleCreateNote = async () => {
    const newFile = await window.api.createNote('')
    fetchFiles()
    setSelectedFile(newFile)
    setEditingFile(newFile)
    setEditValue('') // start editing with empty input (placeholder shows note #X)
  }

  const handleDeleteNote = (fileName: string) => {
    setNoteToDelete(fileName)
  }

  const confirmDeleteNote = async () => {
    if (!noteToDelete) return
    const success = await window.api.deleteNote(noteToDelete)
    if (success) {
      fetchFiles()
      if (selectedFile === noteToDelete) {
        setSelectedFile(null)
      }
      if (editingFile === noteToDelete) {
        setEditingFile(null)
      }
    }
    setNoteToDelete(null)
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
          if (selectedFile === oldName) {
            setSelectedFile(result)
          }
        }
      }
    }
    setEditingFile(null)
  }

  // Global keyboard shortcuts logic
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (noteToDelete) {
        if (e.key === 'Escape') {
          e.preventDefault()
          setNoteToDelete(null)
        } else if (e.key === 'Enter') {
          e.preventDefault()
          confirmDeleteNote()
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
          if (selectedFile) {
            handleDeleteNote(selectedFile)
          }
        }
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [shortcuts, selectedFile, isSettingsOpen, recordingUuid, noteToDelete])

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
      <Sidebar
        onSelectFile={setSelectedFile}
        selectedFile={selectedFile}
        files={files}
        fetchFiles={fetchFiles}
        editingFile={editingFile}
        setEditingFile={setEditingFile}
        editValue={editValue}
        setEditValue={setEditValue}
        onDeleteNote={handleDeleteNote}
        onCreateNote={handleCreateNote}
        onOpenSettings={() => setIsSettingsOpen(true)}
        submitRename={submitRename}
      />
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#1e1e1e',
          position: 'relative'
        }}
      >
        {selectedFile ? (
          <div 
            data-color-mode="dark" 
            style={{ flex: 1, height: '100%', overflow: 'hidden', position: 'relative' }}
            onKeyUp={handleKeyUp}
            onClick={handleClick}
          >
            {autocompleteVisible && (
              <div
                style={{
                  position: 'absolute',
                  top: '10px',
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
                            setSelectedFile(fileName)
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
      {noteToDelete && (
        <div
          onClick={() => setNoteToDelete(null)}
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
                  Supprimer la note ?
                </h3>
              </div>

              <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#ccc', lineHeight: '1.5' }}>
                Voulez-vous vraiment supprimer la note <strong style={{ color: '#00d2ff', textShadow: '0 0 8px rgba(0, 210, 255, 0.3)' }}>"{noteToDelete.replace('.md', '')}"</strong> ?
                Cette action supprimera définitivement le fichier et est irréversible.
              </p>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  onClick={() => setNoteToDelete(null)}
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
                  onClick={confirmDeleteNote}
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