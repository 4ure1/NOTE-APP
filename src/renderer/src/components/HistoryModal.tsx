import React, { useState, useEffect, useId } from 'react'
import { notifyApiError } from '../utils/apiError'
import Modal from './Modal'

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
function computeDiff(
  oldText: string,
  newText: string
): Array<{ type: 'add' | 'del' | 'same'; text: string }> {
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
  // Échap ne ferme pas pendant une restauration en cours
  const handleDismiss = (): void => {
    if (!isRestoring) onClose()
  }
  const titleId = useId()

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
          const content = await window.api.getHistoryVersionContent(
            currentFilePath,
            selectedVersionId
          )
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
    <Modal
      labelledBy={titleId}
      onClose={handleDismiss}
      initialFocus="first"
      panelStyle={{ maxWidth: '920px', height: '640px', maxHeight: '88vh' }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--surface-input)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--surface-raised)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span aria-hidden="true" style={{ fontSize: '18px' }}>
            ⏳
          </span>
          <div>
            <h3 id={titleId} style={{ margin: 0, fontSize: '15px', color: 'var(--text-strong)' }}>
              Historique des versions
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {currentFilePath}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Fermer"
          title="Fermer (Échap)"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: '18px',
            cursor: 'pointer'
          }}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      {/* Content Split: Timeline (Left) & Diff Viewer (Right) */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: Version Timeline */}
        <div
          style={{
            width: '280px',
            borderRight: '1px solid var(--surface-input)',
            backgroundColor: 'var(--surface-panel)',
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
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              borderBottom: '1px solid var(--border-subtle)'
            }}
          >
            Instantanés sauvegardés ({history.length})
          </div>

          {isLoading ? (
            <div
              style={{
                padding: '20px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '12px'
              }}
            >
              Chargement de l'historique...
            </div>
          ) : history.length === 0 ? (
            <div
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '12.5px'
              }}
            >
              Aucun instantané disponible pour cette note. Continuez à taper, les versions
              s'enregistrent automatiquement toutes les 2 minutes !
            </div>
          ) : (
            history.map((item) => {
              const isSelected = item.id === selectedVersionId
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedVersionId(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelectedVersionId(item.id)
                    }
                  }}
                  style={{
                    padding: '12px 14px',
                    borderBottom: '1px solid var(--border-subtle)',
                    backgroundColor: isSelected
                      ? 'color-mix(in srgb, var(--accent-color) 12%, transparent)'
                      : 'transparent',
                    borderLeft: isSelected
                      ? '3px solid var(--accent-color)'
                      : '3px solid transparent',
                    cursor: 'pointer',
                    transition: 'background 0.12s'
                  }}
                >
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: isSelected ? 'var(--accent-color)' : 'var(--text-primary)',
                      marginBottom: '4px'
                    }}
                  >
                    {item.dateFormatted}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      fontSize: '11px',
                      color: 'var(--text-muted)'
                    }}
                  >
                    <span>{item.lineCount} lignes</span>
                    <span>•</span>
                    <span>{Math.round((item.size / 1024) * 10) / 10} Ko</span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Right: Diff & Restore */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--surface-raised)',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              padding: '10px 16px',
              borderBottom: '1px solid var(--surface-input)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'var(--surface-control)'
            }}
          >
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              <span style={{ color: 'var(--success-color)' }}>+ Vert : Ajouts actuels</span>
              <span style={{ margin: '0 8px' }}>|</span>
              <span style={{ color: 'var(--danger-color)' }}>
                - Rouge : Présent dans l’instantané
              </span>
            </div>

            {selectedVersionId && (
              <button
                onClick={handleRestoreClick}
                disabled={isRestoring}
                style={{
                  backgroundColor: 'var(--accent-strong)',
                  color: 'var(--text-strong)',
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
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '60px' }}>
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
    </Modal>
  )
}
