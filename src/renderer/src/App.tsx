import Sidebar from '@renderer/components/Sidebar'

function App() {
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
      <Sidebar />
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
    </div>
  )
}

export default App