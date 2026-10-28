import React, { useState, type ReactNode } from 'react'
import { NoteTemplate, SessionSuggestion } from '../utils/sessionDetector'
import { FolderIcon, HtmlIcon, MarkdownIcon, XIcon, CheckIcon } from './Icons'

export interface NewSessionModalProps {
  isOpen: boolean
  targetFolder: string
  suggestion: SessionSuggestion
  templates: NoteTemplate[]
  isSubmitting?: boolean
  onSubmit: (params: {
    folderPath: string
    fileName: string
    templateFileName: string
    noteTitle: string
    sessionNumber: number
    tags: string[]
  }) => Promise<void>
  onCancel: () => void
}

export default function NewSessionModal({
  isOpen,
  targetFolder,
  suggestion,
  templates,
  isSubmitting = false,
  onSubmit,
  onCancel
}: NewSessionModalProps): ReactNode {
  const [sessionNumber, setSessionNumber] = useState<number>(suggestion.nextSessionNumber)
  const [fileName, setFileName] = useState<string>(suggestion.suggestedFileName)
  const [noteTitle, setNoteTitle] = useState<string>(suggestion.suggestedTitle)
  const [selectedTemplateFile, setSelectedTemplateFile] = useState<string>(() => {
    const match = templates.find((t) => t.extension === suggestion.extension)
    return match ? match.fileName : templates[0]?.fileName || ''
  })
  const [tagsInput, setTagsInput] = useState<string>(() => {
    const folderTag = targetFolder.includes('/')
      ? targetFolder.split('/').pop() || targetFolder
      : targetFolder
    return folderTag ? `cours, ${folderTag.toLowerCase()}` : 'cours'
  })

  // Ajustement automatique du nom de fichier et du titre quand on change le numéro de séance
  const handleSessionNumberChange = (newNum: number): void => {
    const validNum = Math.max(1, newNum)
    setSessionNumber(validNum)

    const pad = String(validNum).padStart(suggestion.padding || 2, '0')
    if (suggestion.patternPrefix) {
      setFileName(`${suggestion.patternPrefix}${pad}.${suggestion.extension}`)
    } else {
      const folderSlug = (targetFolder.split('/').pop() || 'cours')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
      setFileName(`${folderSlug}-seance-${pad}.${suggestion.extension}`)
    }

    const folderName = targetFolder.split('/').pop() || 'Cours'
    const cleanFolder = folderName.charAt(0).toUpperCase() + folderName.slice(1)
    setNoteTitle(`${cleanFolder} - Séance ${pad}`)
  }

  // Changement de modèle : mise à jour de l'extension de fichier si besoin
  const handleTemplateChange = (templateFileName: string): void => {
    setSelectedTemplateFile(templateFileName)
    const tmpl = templates.find((t) => t.fileName === templateFileName)
    if (tmpl) {
      const curExt = fileName.includes('.') ? fileName.split('.').pop() : ''
      if (curExt && curExt !== tmpl.extension) {
        const base = fileName.slice(0, fileName.lastIndexOf('.'))
        setFileName(`${base}.${tmpl.extension}`)
      }
    }
  }

  if (!isOpen) return null

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCancel()
    } else if (
      e.key === 'Enter' &&
      (e.ctrlKey || e.metaKey || e.target instanceof HTMLInputElement)
    ) {
      e.preventDefault()
      handleConfirm()
    }
  }

  const handleConfirm = (): void => {
    if (isSubmitting || !fileName.trim()) return

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    onSubmit({
      folderPath: targetFolder,
      fileName: fileName.trim(),
      templateFileName: selectedTemplateFile,
      noteTitle: noteTitle.trim() || fileName.trim(),
      sessionNumber,
      tags
    })
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          backgroundColor: '#14151a',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8)',
          color: '#f8fafc',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: '#0d0e12'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>🎓</span>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>
                Nouvelle séance de cours
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  marginTop: '2px'
                }}
              >
                <span>Dossier :</span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: '#38bdf8',
                    backgroundColor: 'rgba(56, 189, 248, 0.12)',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    fontWeight: 500
                  }}
                >
                  <FolderIcon size={12} />
                  <span>{targetFolder || 'Racine'}</span>
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.12s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'
              e.currentTarget.style.color = '#ffffff'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = '#94a3b8'
            }}
          >
            <XIcon size={16} />
          </button>
        </div>

        {/* Body Fields */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Ligne 1 : Numéro de séance & Modèle */}
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '14px' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  color: '#94a3b8',
                  marginBottom: '6px',
                  fontWeight: 500
                }}
              >
                Séance n°
              </label>
              <input
                type="number"
                min="1"
                value={sessionNumber}
                onChange={(e) => handleSessionNumberChange(parseInt(e.target.value, 10) || 1)}
                style={{
                  width: '100%',
                  backgroundColor: '#090a0d',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 600,
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  color: '#94a3b8',
                  marginBottom: '6px',
                  fontWeight: 500
                }}
              >
                Modèle de note
              </label>
              <select
                value={selectedTemplateFile}
                onChange={(e) => handleTemplateChange(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: '#090a0d',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: '#ffffff',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  cursor: 'pointer'
                }}
              >
                {templates.map((tmpl) => (
                  <option key={tmpl.fileName} value={tmpl.fileName}>
                    {tmpl.name} ({tmpl.extension.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Ligne 2 : Nom de fichier */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                color: '#94a3b8',
                marginBottom: '6px',
                fontWeight: 500
              }}
            >
              Nom du fichier sur le disque
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="ex: poo-seance-04.html"
                style={{
                  width: '100%',
                  backgroundColor: '#090a0d',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  padding: '8px 32px 8px 10px',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontFamily: "Consolas, 'Cascadia Code', monospace",
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <span
                style={{ position: 'absolute', right: '10px', pointerEvents: 'none', opacity: 0.7 }}
              >
                {fileName.endsWith('.html') ? (
                  <HtmlIcon size={15} style={{ color: '#e34f26' }} />
                ) : (
                  <MarkdownIcon size={15} />
                )}
              </span>
            </div>
          </div>

          {/* Ligne 3 : Titre du document */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                color: '#94a3b8',
                marginBottom: '6px',
                fontWeight: 500
              }}
            >
              Titre principal (${`{NOTE_TITLE}`})
            </label>
            <input
              type="text"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="ex: POO - Séance 04 : Polymorphisme"
              style={{
                width: '100%',
                backgroundColor: '#090a0d',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '6px',
                padding: '8px 10px',
                color: '#ffffff',
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Ligne 4 : Tags */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                color: '#94a3b8',
                marginBottom: '6px',
                fontWeight: 500
              }}
            >
              Tags associés (${`{TAGS}`})
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="ex: cours, poo, java"
              style={{
                width: '100%',
                backgroundColor: '#090a0d',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '6px',
                padding: '8px 10px',
                color: '#ffffff',
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: '#0d0e12'
          }}
        >
          <div style={{ fontSize: '11px', color: '#64748b' }}>
            <span>Appuyez sur </span>
            <kbd
              style={{
                backgroundColor: '#1e2029',
                padding: '2px 5px',
                borderRadius: '3px',
                color: '#94a3b8'
              }}
            >
              Entrée
            </kbd>
            <span> pour créer</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={onCancel}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#cbd5e1',
                cursor: 'pointer',
                padding: '7px 14px',
                borderRadius: '6px',
                fontSize: '12.5px',
                transition: 'all 0.12s'
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)')
              }
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              Annuler
            </button>

            <button
              onClick={handleConfirm}
              disabled={isSubmitting || !fileName.trim()}
              style={{
                backgroundColor: '#38bdf8',
                border: 'none',
                color: '#09090b',
                fontWeight: 600,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                padding: '7px 16px',
                borderRadius: '6px',
                fontSize: '12.5px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                opacity: isSubmitting ? 0.7 : 1,
                boxShadow: '0 2px 10px rgba(56, 189, 248, 0.35)',
                transition: 'all 0.12s'
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting) e.currentTarget.style.backgroundColor = '#7dd3fc'
              }}
              onMouseLeave={(e) => {
                if (!isSubmitting) e.currentTarget.style.backgroundColor = '#38bdf8'
              }}
            >
              <CheckIcon size={14} />
              <span>{isSubmitting ? 'Création en cours...' : 'Créer la séance'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
