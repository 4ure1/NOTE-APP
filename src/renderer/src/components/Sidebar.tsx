import { useEffect, useState } from 'react'

interface SidebarProps {
  onSelectFiles: (files: string[]) => void
  selectedFiles: string[]
  files: string[]
  fetchFiles: () => void
  
  editingFile: string | null
  setEditingFile: (file: string | null) => void
  editValue: string
  setEditValue: (val: string) => void
  onDeleteNotes: (files: string[]) => void
  onCreateNote: () => void
  onOpenSettings: () => void
  submitRename: () => void
  width?: number
}

function Sidebar({
  onSelectFiles,
  selectedFiles,
  files,
  fetchFiles,
  editingFile,
  setEditingFile,
  editValue,
  setEditValue,
  onDeleteNotes,
  onCreateNote,
  onOpenSettings,
  submitRename,
  width = 250
}: SidebarProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, file: string } | null>(null)
  const [lastClickedFile, setLastClickedFile] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null)

  useEffect(() => {
    fetchFiles()
  }, [])

  useEffect(() => {
    const handleCloseMenu = () => setContextMenu(null)
    const handleMouseUp = () => {
      setIsDragging(false)
      setDragStartIndex(null)
    }
    window.addEventListener('click', handleCloseMenu)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('click', handleCloseMenu)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  return (
    <div
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Backspace' && selectedFiles.length > 0 && !editingFile) {
          e.preventDefault()
          onDeleteNotes(selectedFiles)
        }
      }}
      style={{
        width: `${width}px`,
        minWidth: `${width}px`,
        borderRight: '1px solid #333',
        backgroundColor: '#1e1e1e',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        userSelect: 'none',
        outline: 'none'
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flexGrow: 1 }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px',
            borderBottom: '1px solid #444'
          }}
        >
          <h3 style={{ margin: 0 }}>Notes</h3>
          <button
            onClick={onCreateNote}
            style={{
              background: '#444',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              width: '28px',
              height: '28px',
              fontSize: '18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: '28px'
            }}
          >
            +
          </button>
        </div>
        {/* File List */}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, overflowY: 'auto', flexGrow: 1 }}>
          {/* Option virtuelle "Claude Code" */}
          <li
            onClick={() => {
              onSelectFiles(['__claude_code__'])
              setLastClickedFile('__claude_code__')
            }}
            onContextMenu={(e) => e.preventDefault()}
            style={{
              padding: '8px 10px',
              cursor: 'pointer',
              borderRadius: '4px',
              marginBottom: '4px',
              backgroundColor: selectedFiles.includes('__claude_code__') ? '#ff0055' : 'transparent',
              color: selectedFiles.includes('__claude_code__') ? '#fff' : '#00d2ff',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: selectedFiles.includes('__claude_code__') ? '0 0 10px rgba(255, 0, 85, 0.3)' : 'none',
              border: '1px solid ' + (selectedFiles.includes('__claude_code__') ? '#ff0055' : 'transparent')
            }}
            onMouseEnter={(e) => {
              if (!selectedFiles.includes('__claude_code__')) e.currentTarget.style.backgroundColor = '#2a2d2e'
            }}
            onMouseLeave={(e) => {
              if (!selectedFiles.includes('__claude_code__')) e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <svg width="16" height="16" fill="#D97757" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ filter: selectedFiles.includes('__claude_code__') ? 'drop-shadow(0 0 4px rgba(217,119,87,0.5))' : 'none' }}><path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"/></svg>
            Claude
          </li>

          {files.map((file, index) => {
            const isEditing = editingFile === file
            const displayName = file.replace('.md', '')

            const handleNoteClick = (e: React.MouseEvent) => {
              if (isEditing) return

              let newSelection: string[] = []

              if (e.ctrlKey || e.metaKey) {
                if (selectedFiles.includes(file)) {
                  newSelection = selectedFiles.filter((f) => f !== file)
                } else {
                  const cleanPrev = selectedFiles.filter((f) => f !== '__claude_code__')
                  newSelection = [...cleanPrev, file]
                }
              } else if (e.shiftKey && lastClickedFile && lastClickedFile !== '__claude_code__') {
                const startIdx = files.indexOf(lastClickedFile)
                const endIdx = files.indexOf(file)
                if (startIdx !== -1 && endIdx !== -1) {
                  const min = Math.min(startIdx, endIdx)
                  const max = Math.max(startIdx, endIdx)
                  newSelection = files.slice(min, max + 1)
                } else {
                  newSelection = [file]
                }
              } else {
                newSelection = [file]
              }

              onSelectFiles(newSelection)
              setLastClickedFile(file)
            }
            
            return (
              <li
                key={file}
                onClick={handleNoteClick}
                onMouseDown={(e) => {
                  if (e.button !== 0 || isEditing) return
                  setIsDragging(true)
                  setDragStartIndex(index)
                  if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                    onSelectFiles([file])
                    setLastClickedFile(file)
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  if (!selectedFiles.includes(file)) {
                    onSelectFiles([file])
                    setLastClickedFile(file)
                  }
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    file: file
                  })
                }}
                style={{
                  padding: '8px 10px',
                  cursor: isEditing ? 'text' : 'pointer',
                  borderRadius: '4px',
                  marginBottom: '2px',
                  backgroundColor: selectedFiles.includes(file) ? '#37373d' : 'transparent',
                  display: 'flex',
                  alignItems: 'center'
                }}
                onMouseEnter={(e) => {
                  if (isDragging && dragStartIndex !== null) {
                    const min = Math.min(dragStartIndex, index)
                    const max = Math.max(dragStartIndex, index)
                    const newSelection = files.slice(min, max + 1)
                    onSelectFiles(newSelection)
                    setLastClickedFile(file)
                  }
                  if (!selectedFiles.includes(file)) e.currentTarget.style.backgroundColor = '#2a2d2e'
                }}
                onMouseLeave={(e) => {
                  if (!selectedFiles.includes(file)) e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                {isEditing ? (
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={submitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitRename()
                      if (e.key === 'Escape') setEditingFile(null)
                    }}
                    autoFocus
                    placeholder={file.replace('.md', '')}
                    style={{
                      width: '100%',
                      background: '#1e1e1e',
                      color: '#fff',
                      border: '1px solid #00d2ff',
                      borderRadius: '2px',
                      padding: '2px 4px',
                      outline: 'none',
                      fontFamily: 'inherit',
                      fontSize: 'inherit'
                    }}
                  />
                ) : (
                  displayName
                )}
              </li>
            )
          })}
        </ul>
      </div>



      {/* Context Menu Dropdown */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            top: `${contextMenu.y}px`,
            left: `${contextMenu.x}px`,
            backgroundColor: '#252526',
            border: '1px solid #444',
            borderRadius: '4px',
            zIndex: 10000,
            padding: '4px 0',
            minWidth: '150px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            fontFamily: 'sans-serif',
            fontSize: '13px'
          }}
        >
          {selectedFiles.length === 1 && (
            <div
              onClick={() => {
                setEditingFile(contextMenu.file)
                setEditValue(contextMenu.file.replace('.md', ''))
                setContextMenu(null)
              }}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#37373d'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              Renommer
            </div>
          )}
          <div
            onClick={() => {
              onDeleteNotes(selectedFiles)
              setContextMenu(null)
            }}
            style={{
              padding: '8px 12px',
              cursor: 'pointer',
              color: '#ff5555',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderTop: selectedFiles.length === 1 ? '1px solid #333' : 'none'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#37373d'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            {selectedFiles.length > 1 ? `Supprimer les ${selectedFiles.length} notes` : 'Supprimer'}
          </div>
        </div>
      )}
    </div>
  )
}

export default Sidebar