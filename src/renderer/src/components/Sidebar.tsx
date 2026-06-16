import { useEffect, useState } from 'react'

interface SidebarProps {
  onSelectFile: (file: string) => void
  selectedFile: string | null
  files: string[]
  fetchFiles: () => void
  
  editingFile: string | null
  setEditingFile: (file: string | null) => void
  editValue: string
  setEditValue: (val: string) => void
  onDeleteNote: (file: string) => void
  onCreateNote: () => void
  onOpenSettings: () => void
  submitRename: () => void
}

function Sidebar({
  onSelectFile,
  selectedFile,
  files,
  fetchFiles,
  editingFile,
  setEditingFile,
  editValue,
  setEditValue,
  onDeleteNote,
  onCreateNote,
  onOpenSettings,
  submitRename
}: SidebarProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, file: string } | null>(null)

  useEffect(() => {
    fetchFiles()
  }, [])

  useEffect(() => {
    const handleCloseMenu = () => setContextMenu(null)
    window.addEventListener('click', handleCloseMenu)
    return () => window.removeEventListener('click', handleCloseMenu)
  }, [])

  return (
    <div
      style={{
        width: '250px',
        minWidth: '250px',
        borderRight: '1px solid #333',
        backgroundColor: '#1e1e1e',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        userSelect: 'none'
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
          {files.map((file) => {
            const isEditing = editingFile === file
            const displayName = file.replace('.md', '')
            
            return (
              <li
                key={file}
                onClick={() => !isEditing && onSelectFile(file)}
                onContextMenu={(e) => {
                  e.preventDefault()
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
                  backgroundColor: selectedFile === file ? '#37373d' : 'transparent',
                  display: 'flex',
                  alignItems: 'center'
                }}
                onMouseEnter={(e) => {
                  if (selectedFile !== file) e.currentTarget.style.backgroundColor = '#2a2d2e'
                }}
                onMouseLeave={(e) => {
                  if (selectedFile !== file) e.currentTarget.style.backgroundColor = 'transparent'
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

      {/* Settings Panel Button (Pinned to bottom) */}
      <div
        onClick={onOpenSettings}
        style={{
          padding: '12px 16px',
          borderTop: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          cursor: 'pointer',
          backgroundColor: '#1a1a1a',
          transition: 'background-color 0.2s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2a2d2e'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#1a1a1a'}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: '#aaa' }}
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        <span style={{ fontSize: '14px', color: '#aaa', fontWeight: 500 }}>Paramètres</span>
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
            minWidth: '130px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            fontFamily: 'sans-serif',
            fontSize: '13px'
          }}
        >
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
          <div
            onClick={() => {
              onDeleteNote(contextMenu.file)
              setContextMenu(null)
            }}
            style={{
              padding: '8px 12px',
              cursor: 'pointer',
              color: '#ff5555',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderTop: '1px solid #333'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#37373d'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Supprimer
          </div>
        </div>
      )}
    </div>
  )
}

export default Sidebar