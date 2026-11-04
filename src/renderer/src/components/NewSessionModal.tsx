import React, { useId, useState, type ReactNode } from 'react'
import { NoteTemplate, SessionSuggestion } from '../utils/sessionDetector'
import { useModalA11y } from '../utils/useModalA11y'
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

  // Échap est déjà géré par handleKeyDown (sur le fond) : le hook ne fait que le focus et Tab
  const dialogRef = useModalA11y(isOpen, onCancel, { closeOnEscape: false })
  const fid = useId()

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
        backgroundColor: 'var(--overlay-bg)',
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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${fid}-title`}
        tabIndex={-1}
        style={{
          width: '100%',
          maxWidth: '560px',
          backgroundColor: 'var(--surface-panel)',
          border: '1px solid var(--border-strong)',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8)',
          color: 'var(--text-strong)',
          fontFamily: 'var(--font-ui)',
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
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: 'var(--surface-sunken)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span aria-hidden="true" style={{ fontSize: '18px' }}>
              🎓
            </span>
            <div>
              <div
                id={`${fid}-title`}
                style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}
              >
                Nouvelle séance de cours
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
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
                    color: 'var(--accent-color)',
                    backgroundColor: 'color-mix(in srgb, var(--accent-color) 12%, transparent)',
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
            aria-label="Fermer"
            title="Fermer (Échap)"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
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
              e.currentTarget.style.color = 'var(--text-strong)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = 'var(--text-secondary)'
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
                htmlFor={`${fid}-num`}
                style={{
                  display: 'block',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  marginBottom: '6px',
                  fontWeight: 500
                }}
              >
                Séance n°
              </label>
              <input
                id={`${fid}-num`}
                type="number"
                min="1"
                value={sessionNumber}
                onChange={(e) => handleSessionNumberChange(parseInt(e.target.value, 10) || 1)}
                style={{
                  width: '100%',
                  backgroundColor: 'var(--surface-sunken)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: 'var(--text-strong)',
                  fontSize: '13px',
                  fontWeight: 600,
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label
                htmlFor={`${fid}-tpl`}
                style={{
                  display: 'block',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  marginBottom: '6px',
                  fontWeight: 500
                }}
              >
                Modèle de note
              </label>
              <select
                id={`${fid}-tpl`}
                value={selectedTemplateFile}
                onChange={(e) => handleTemplateChange(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: 'var(--surface-sunken)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: 'var(--text-strong)',
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
              htmlFor={`${fid}-file`}
              style={{
                display: 'block',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                marginBottom: '6px',
                fontWeight: 500
              }}
            >
              Nom du fichier sur le disque
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                id={`${fid}-file`}
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="ex: poo-seance-04.html"
                style={{
                  width: '100%',
                  backgroundColor: 'var(--surface-sunken)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: '6px',
                  padding: '8px 32px 8px 10px',
                  color: 'var(--text-strong)',
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
              htmlFor={`${fid}-title-input`}
              style={{
                display: 'block',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                marginBottom: '6px',
                fontWeight: 500
              }}
            >
              Titre principal (${`{NOTE_TITLE}`})
            </label>
            <input
              id={`${fid}-title-input`}
              type="text"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="ex: POO - Séance 04 : Polymorphisme"
              style={{
                width: '100%',
                backgroundColor: 'var(--surface-sunken)',
                border: '1px solid var(--border-strong)',
                borderRadius: '6px',
                padding: '8px 10px',
                color: 'var(--text-strong)',
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Ligne 4 : Tags */}
          <div>
            <label
              htmlFor={`${fid}-tags`}
              style={{
                display: 'block',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                marginBottom: '6px',
                fontWeight: 500
              }}
            >
              Tags associés (${`{TAGS}`})
            </label>
            <input
              id={`${fid}-tags`}
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="ex: cours, poo, java"
              style={{
                width: '100%',
                backgroundColor: 'var(--surface-sunken)',
                border: '1px solid var(--border-strong)',
                borderRadius: '6px',
                padding: '8px 10px',
                color: 'var(--text-strong)',
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
            borderTop: '1px solid var(--border-color)',
            backgroundColor: 'var(--surface-sunken)'
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            <span>Appuyez sur </span>
            <kbd
              style={{
                backgroundColor: '#1e2029',
                padding: '2px 5px',
                borderRadius: '3px',
                color: 'var(--text-secondary)'
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
                border: '1px solid var(--border-strong)',
                color: 'var(--text-primary)',
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
                backgroundColor: 'var(--accent-color)',
                border: 'none',
                color: 'var(--surface-sunken)',
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
                if (!isSubmitting) e.currentTarget.style.backgroundColor = 'var(--accent-color)'
              }}
              onMouseLeave={(e) => {
                if (!isSubmitting) e.currentTarget.style.backgroundColor = 'var(--accent-color)'
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
