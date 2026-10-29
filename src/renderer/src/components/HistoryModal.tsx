import React, { useState, useEffect } from 'react'
import { notifyApiError } from '../utils/apiError'

interface HistoryItem {
  id: string
  timestamp: number
  dateFormatted: string
  lineCount: number
  size: number
}

interface HistoryModalProps {
  isOpen: boolean
  onClose: () => void
  currentFilePath: string
  currentContent: string
  onRestore: (restoredContent: string) => void
  // Écrit la saisie en attente avant la restauration (elle entre ainsi dans l'instantané forcé) ;
  // false : restauration abandonnée, l'appelant a déjà prévenu l'utilisateur
  onBeforeRestore?: () => Promise<boolean>
}

/**
 * Calculateur de diff textuel ligne par ligne simple et ultra-rapide
 */
function computeDiff(oldText: string, newText: string): Array<{ type: 'add' | 'del' | 'same'; text: string }> {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const diff: Array<{ type: 'add' | 'del' | 'same'; text: string }> = []

  let i = 0
  let j = 0

  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length) {
      if (oldLines[i] === newLines[j]) {
        diff.push({ type: 'same', text: oldLines[i] })
        i++
        j++
      } else {
        // Recherche simple de synchronisation
        const matchInNew = newLines.indexOf(oldLines[i], j)
        const matchInOld = oldLines.indexOf(newLines[j], i)

        if (matchInNew !== -1 && (matchInOld === -1 || matchInNew - j <= matchInOld - i)) {
          // Des lignes ont été ajoutées dans la nouvelle version
          while (j < matchInNew) {
            diff.push({ type: 'add', text: newLines[j] })
            j++
          }
        } else if (matchInOld !== -1) {
          // Des lignes ont été supprimées
          while (i < matchInOld) {
            diff.push({ type: 'del', text: oldLines[i] })
            i++
          }
        } else {
          diff.push({ type: 'del', text: oldLines[i] })
          diff.push({ type: 'add', text: newLines[j] })
          i++
          j++
        }
      }
    } else if (i < oldLines.length) {
      diff.push({ type: 'del', text: oldLines[i] })
      i++
    } else if (j < newLines.length) {
      diff.push({ type: 'add', text: newLines[j] })
      j++
    }
  }

  return diff
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  currentFilePath,
  currentContent,
  onRestore,
  onBeforeRestore
}) => {
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [versionContent, setVersionContent] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)

  useEffect(() => {
    if (!isOpen || !currentFilePath) return

    const loadHistory = async () => {
      setIsLoading(true)
      try {
        if (window.api?.getNoteHistory) {
          const list = await window.api.getNoteHistory(currentFilePath)
          setHistory(list)
          if (list.length > 0) {
            setSelectedVersionId(list[0].id)
          } else {
            setSelectedVersionId(null)
            setVersionContent('')
          }
        }
      } catch (err) {
        notifyApiError("Chargement de l'historique", err)
      } finally {
        setIsLoading(false)
      }
    }

    loadHistory()
  }, [isOpen, currentFilePath])

  useEffect(() => {
    if (!selectedVersionId || !currentFilePath) return

    const loadContent = async () => {
      try {
        if (window.api?.getHistoryVersionContent) {
          const content = await window.api.getHistoryVersionContent(currentFilePath, selectedVersionId)
          setVersionContent(content || '')
        }
      } catch (err) {
        notifyApiError('Lecture de la version', err)
      }
    }

    loadContent()
  }, [selectedVersionId, currentFilePath])

  if (!isOpen) return null

  const diffLines = computeDiff(versionContent, currentContent)

  const handleRestoreClick = async () => {
    if (!selectedVersionId || !currentFilePath) return
    setIsRestoring(true)
    try {
      if (window.api?.restoreNoteVersion) {
        if (onBeforeRestore && !(await onBeforeRestore())) return
        const restored = await window.api.restoreNoteVersion(currentFilePath, selectedVersionId)
        onRestore(restored)
        onClose()
      }
    } catch (err) {
      notifyApiError('Restauration de la version', err)
    } finally {
      setIsRestoring(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '920px',
          height: '640px',
          backgroundColor: '#18181b',
          border: '1px solid #27272a',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #27272a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#1f1f23'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>⏳</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', color: '#f4f4f5' }}>
                Historique des versions (Time Travel)
              </h3>
              <span style={{ fontSize: '12px', color: '#a1a1aa' }}>{currentFilePath}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#a1a1aa',
              fontSize: '18px',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>

        {/* Content Split: Timeline (Left) & Diff Viewer (Right) */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left: Version Timeline */}
          <div
            style={{
              width: '280px',
              borderRight: '1px solid #27272a',
              backgroundColor: '#141416',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div
              style={{
                padding: '10px 14px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#71717a',
                textTransform: 'uppercase',
                borderBottom: '1px solid rgba(255,255,255,0.05)'
              }}
            >
              Instantanés sauvegardés ({history.length})
            </div>

            {isLoading ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#71717a', fontSize: '12px' }}>
                Chargement de l'historique...
              </div>
            ) : history.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: '#71717a', fontSize: '12.5px' }}>
                Aucun instantané disponible pour cette note. Continuez à taper, les versions s'enregistrent automatiquement toutes les 2 minutes !
              </div>
            ) : (
              history.map((item) => {
                const isSelected = item.id === selectedVersionId
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedVersionId(item.id)}
                    style={{
                      padding: '12px 14px',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                      borderLeft: isSelected ? '3px solid #38bdf8' : '3px solid transparent',
                      cursor: 'pointer',
                      transition: 'background 0.12s'
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 600, color: isSelected ? '#38bdf8' : '#e4e4e7', marginBottom: '4px' }}>
                      {item.dateFormatted}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#71717a' }}>
                      <span>{item.lineCount} lignes</span>
                      <span>•</span>
                      <span>{Math.round(item.size / 1024 * 10) / 10} Ko</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Right: Diff & Restore */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#18181b', overflow: 'hidden' }}>
            <div
              style={{
                padding: '10px 16px',
                borderBottom: '1px solid #27272a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#1c1c20'
              }}
            >
              <div style={{ fontSize: '12px', color: '#a1a1aa' }}>
                <span style={{ color: '#4ade80' }}>+ Vert : Ajouts actuels</span>
                <span style={{ margin: '0 8px' }}>|</span>
                <span style={{ color: '#f87171' }}>- Rouge : Présent dans l'instantané</span>
              </div>

              {selectedVersionId && (
                <button
                  onClick={handleRestoreClick}
                  disabled={isRestoring}
                  style={{
                    backgroundColor: '#0284c7',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {isRestoring ? 'Restauration...' : '⏪ Restaurer cette version'}
                </button>
              )}
            </div>

            {/* Diff content view */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '14px',
                fontFamily: "Consolas, 'Cascadia Code', monospace",
                fontSize: '12.5px',
                lineHeight: '20px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all'
              }}
            >
              {!selectedVersionId ? (
                <div style={{ textAlign: 'center', color: '#71717a', marginTop: '60px' }}>
                  Sélectionnez un instantané à gauche pour comparer les modifications
                </div>
              ) : (
                diffLines.map((line, idx) => {
                  let bg = 'transparent'
                  let color = '#d4d4d8'
                  let prefix = '  '

                  if (line.type === 'add') {
                    bg = 'rgba(34, 197, 94, 0.15)'
                    color = '#4ade80'
                    prefix = '+ '
                  } else if (line.type === 'del') {
                    bg = 'rgba(239, 68, 68, 0.15)'
                    color = '#f87171'
                    prefix = '- '
                  }

                  return (
                    <div
                      key={idx}
                      style={{
                        backgroundColor: bg,
                        color,
                        padding: '1px 6px',
                        borderRadius: '2px'
                      }}
                    >
                      <span style={{ userSelect: 'none', opacity: 0.6 }}>{prefix}</span>
                      {line.text}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
