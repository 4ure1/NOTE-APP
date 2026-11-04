import React, { useId, useState } from 'react'
import { useModalA11y } from '../utils/useModalA11y'

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
  // Échap ne ferme pas pendant la génération (comme le bouton Annuler, désactivé)
  const dialogRef = useModalA11y(isOpen, () => {
    if (!isExporting) onClose()
  })
  const titleId = useId()
  const docTitleId = useId()

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
        backgroundColor: 'var(--overlay-bg)',
        backdropFilter: 'blur(4px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          width: '560px',
          backgroundColor: 'var(--surface-raised)',
          border: '1px solid var(--surface-input)',
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
            borderBottom: '1px solid var(--surface-input)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--surface-raised)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span aria-hidden="true" style={{ fontSize: '18px' }}>
              🚀
            </span>
            <h3 id={titleId} style={{ margin: 0, fontSize: '15px', color: 'var(--text-strong)' }}>
              Exporter la note
            </h3>
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

        {/* Body */}
        <div style={{ padding: '20px' }}>
          {/* Titre du document */}
          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor={docTitleId}
              style={{
                display: 'block',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                marginBottom: '6px'
              }}
            >
              Titre du document exporté :
            </label>
            <input
              id={docTitleId}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: 'var(--surface-panel)',
                border: '1px solid var(--border-strong)',
                borderRadius: '6px',
                padding: '8px 12px',
                color: 'var(--text-strong)',
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Choix du format */}
          <label
            style={{
              display: 'block',
              fontSize: '12px',
              color: 'var(--text-secondary)',
              marginBottom: '8px'
            }}
          >
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
                    border: `1px solid ${isSelected ? 'var(--accent-color)' : 'var(--border-color)'}`,
                    backgroundColor: isSelected
                      ? 'color-mix(in srgb, var(--accent-color) 8%, transparent)'
                      : 'var(--surface-panel)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span aria-hidden="true" style={{ fontSize: '24px' }}>
                    {f.icon}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: isSelected ? 'var(--accent-color)' : 'var(--text-primary)'
                        }}
                      >
                        {f.name}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '1px 6px',
                          borderRadius: '10px',
                          backgroundColor: isSelected
                            ? 'var(--accent-strong)'
                            : 'var(--surface-input)',
                          color: 'var(--text-strong)'
                        }}
                      >
                        {f.badge}
                      </span>
                    </div>
                    <div
                      style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.4 }}
                    >
                      {f.desc}
                    </div>
                  </div>
                  <input
                    type="radio"
                    name="export-format"
                    aria-label={f.name}
                    checked={isSelected}
                    onChange={() => setSelectedFormat(f.id)}
                    style={{ accentColor: 'var(--accent-color)' }}
                  />
                </div>
              )
            })}
          </div>

          {/* Messages de statut */}
          {exportMessage && (
            <div
              role={exportMessage.error ? 'alert' : 'status'}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                marginBottom: '16px',
                backgroundColor: exportMessage.error
                  ? 'color-mix(in srgb, var(--danger-strong) 15%, transparent)'
                  : 'color-mix(in srgb, var(--success-strong) 15%, transparent)',
                color: exportMessage.error ? 'var(--danger-color)' : 'var(--success-color)',
                border: `1px solid ${exportMessage.error ? 'var(--danger-strong)' : 'var(--success-strong)'}`
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
                backgroundColor: 'var(--surface-input)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
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
                backgroundColor: 'var(--accent-strong)',
                color: 'var(--text-strong)',
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
