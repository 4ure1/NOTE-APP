import React, { useState } from 'react'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  noteTitle: string
  content: string
  htmlRendered?: string
  currentFilePath: string
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  noteTitle,
  content,
  htmlRendered
}) => {
  const [selectedFormat, setSelectedFormat] = useState<'pdf' | 'docx' | 'html'>('pdf')
  const [title, setTitle] = useState(noteTitle || 'Ma Note')
  const [isExporting, setIsExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState<{ text: string; error?: boolean } | null>(null)

  if (!isOpen) return null

  const handleExport = async () => {
    setIsExporting(true)
    setExportMessage(null)
    try {
      if (window.api?.exportNote) {
        const res = await window.api.exportNote({
          format: selectedFormat,
          title: title.trim() || 'Note',
          content,
          htmlRendered: htmlRendered || content
        })

        if (res.success && res.filePath) {
          setExportMessage({ text: `Exporté avec succès : ${res.filePath}` })
          setTimeout(() => {
            onClose()
          }, 1800)
        } else if (res.error && res.error !== "Annulé par l'utilisateur") {
          setExportMessage({ text: `Erreur : ${res.error}`, error: true })
        }
      }
    } catch (err: any) {
      setExportMessage({ text: `Erreur inattendue : ${err.message}`, error: true })
    } finally {
      setIsExporting(false)
    }
  }

  const formats = [
    {
      id: 'pdf',
      name: 'Document PDF Pro',
      icon: '📄',
      desc: 'Mise en page A4 impeccable, numérotation de pages X/Y et application intégrale des styles de votre thème.',
      badge: 'Imprimable'
    },
    {
      id: 'docx',
      name: 'Document Word (.docx)',
      icon: '📘',
      desc: 'Fichier natif Microsoft Word structuré : Titres H1-H3, listes à puces, blocs de code ombrés et callouts.',
      badge: 'Éditable'
    },
    {
      id: 'html',
      name: 'Page Web autonome (.html)',
      icon: '🌐',
      desc: 'Fichier web 100% autonome avec CSS embarqué, idéal à partager par email ou héberger sans dépendances.',
      badge: 'Léger'
    }
  ] as const

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
          width: '560px',
          backgroundColor: '#18181b',
          border: '1px solid #27272a',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>🚀</span>
            <h3 style={{ margin: 0, fontSize: '15px', color: '#f4f4f5' }}>Exporter la note</h3>
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

        {/* Body */}
        <div style={{ padding: '20px' }}>
          {/* Titre du document */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#a1a1aa', marginBottom: '6px' }}>
              Titre du document exporté :
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: '#141416',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '6px',
                padding: '8px 12px',
                color: '#f4f4f5',
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Choix du format */}
          <label style={{ display: 'block', fontSize: '12px', color: '#a1a1aa', marginBottom: '8px' }}>
            Format d'exportation :
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
            {formats.map((f) => {
              const isSelected = selectedFormat === f.id
              return (
                <div
                  key={f.id}
                  onClick={() => setSelectedFormat(f.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: `1px solid ${isSelected ? '#38bdf8' : 'rgba(255,255,255,0.06)'}`,
                    backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.08)' : '#141416',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ fontSize: '24px' }}>{f.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: isSelected ? '#38bdf8' : '#e4e4e7' }}>
                        {f.name}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '1px 6px',
                          borderRadius: '10px',
                          backgroundColor: isSelected ? '#0284c7' : '#27272a',
                          color: '#fff'
                        }}
                      >
                        {f.badge}
                      </span>
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#71717a', lineHeight: 1.4 }}>
                      {f.desc}
                    </div>
                  </div>
                  <input
                    type="radio"
                    checked={isSelected}
                    onChange={() => setSelectedFormat(f.id)}
                    style={{ accentColor: '#38bdf8' }}
                  />
                </div>
              )
            })}
          </div>

          {/* Messages de statut */}
          {exportMessage && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                marginBottom: '16px',
                backgroundColor: exportMessage.error ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                color: exportMessage.error ? '#f87171' : '#4ade80',
                border: `1px solid ${exportMessage.error ? '#ef4444' : '#22c55e'}`
              }}
            >
              {exportMessage.text}
            </div>
          )}

          {/* Action button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              onClick={onClose}
              disabled={isExporting}
              style={{
                backgroundColor: '#27272a',
                color: '#d4d4d8',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '12.5px',
                cursor: 'pointer'
              }}
            >
              Annuler
            </button>
            <button
              onClick={handleExport}
              disabled={isExporting}
              style={{
                backgroundColor: '#0284c7',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 20px',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {isExporting ? 'Génération en cours...' : `Exporter en ${selectedFormat.toUpperCase()}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
