import { useEffect, useState } from 'react'

function Sidebar() {
  const [files, setFiles] = useState<string[]>([])

  const fetchFiles = () => {
    window.api.listMarkdownFiles().then(setFiles).catch(console.error)
  }

  useEffect(() => {
    fetchFiles()
  }, [])

  const handleCreateNote = async () => {
    await window.api.createNote('')
    fetchFiles()
  }

  return (
    <div
      style={{
        width: '250px',
        minWidth: '250px',
        borderRight: '1px solid #333',
        backgroundColor: '#1e1e1e',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
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
          onClick={handleCreateNote}
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
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, overflowY: 'auto', flexGrow: 1 }}>
        {files.map((file) => (
          <li
            key={file}
            style={{
              padding: '8px 10px',
              cursor: 'pointer',
              borderRadius: '4px',
              marginBottom: '2px'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#333')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            {file.replace('.md', '')}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default Sidebar