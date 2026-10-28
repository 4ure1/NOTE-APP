import { useState, type ReactNode } from 'react'
import { RenameOperationPlan } from '../../../../src/shared/linkUpdater'

interface LinkRenameModalProps {
  isOpen: boolean
  plan: RenameOperationPlan | null
  isSubmitting?: boolean
  onApply: (plan: RenameOperationPlan) => void
  onCancel: () => void
}

export default function LinkRenameModal({
  isOpen,
  plan,
  isSubmitting = false,
  onApply,
  onCancel
}: LinkRenameModalProps): ReactNode {
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({})

  if (!isOpen || !plan) return null

  const toggleExpand = (filePath: string): void => {
    setExpandedFiles((prev) => ({
      ...prev,
      [filePath]: !prev[filePath]
    }))
  }

  const isFolder = plan.isFolder
  const hasChanges = plan.totalChanges > 0

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={onCancel}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '85vh',
          backgroundColor: '#18181b',
          border: '1px solid #3f3f46',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
          color: '#f4f4f5',
          fontFamily: 'Inter, system-ui, sans-serif'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #27272a',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#f8fafc' }}>
              {isFolder ? 'Déplacement / Renommage de dossier' : 'Renommage sécurisé de la note'}
            </h2>
            <div style={{ marginTop: '6px', fontSize: '13px', color: '#94a3b8' }}>
              <span style={{ color: '#ef4444', textDecoration: 'line-through' }}>
                {plan.oldPath}
              </span>
              {' ➔ '}
              <span style={{ color: '#38bdf8', fontWeight: 500 }}>{plan.newPath}</span>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '20px',
              lineHeight: 1,
              padding: '4px 8px',
              borderRadius: '4px'
            }}
            title="Fermer"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: '20px 24px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}
        >
          {plan.hasCollision ? (
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                padding: '12px 16px',
                color: '#f87171',
                fontSize: '13.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              <span style={{ fontSize: '18px' }}>⚠️</span>
              <div>
                <strong>Collision détectée :</strong> {plan.collisionError}
              </div>
            </div>
          ) : (
            <div
              style={{
                backgroundColor: '#27272a',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '13.5px'
              }}
            >
              <div style={{ color: '#e4e4e7' }}>
                {hasChanges ? (
                  <>
                    <strong style={{ color: '#38bdf8' }}>{plan.affectedFiles.length}</strong>{' '}
                    fichier
                    {plan.affectedFiles.length > 1 ? 's' : ''} impacté
                    {plan.affectedFiles.length > 1 ? 's' : ''} (
                    <strong style={{ color: '#38bdf8' }}>{plan.totalChanges}</strong> lien
                    {plan.totalChanges > 1 ? 's' : ''} à actualiser)
                  </>
                ) : (
                  <span>Aucun lien externe à mettre à jour. Seul le fichier sera renommé.</span>
                )}
              </div>
              <span
                style={{
                  fontSize: '11.5px',
                  backgroundColor: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontWeight: 500
                }}
              >
                Snapshot Time Travel auto
              </span>
            </div>
          )}

          {/* Liste des fichiers impactés */}
          {hasChanges && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div
                style={{
                  fontSize: '12px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#71717a'
                }}
              >
                Fichiers et liens modifiés
              </div>

              {plan.affectedFiles.map((file) => {
                const isExpanded = expandedFiles[file.relativePath] ?? true
                return (
                  <div
                    key={file.relativePath}
                    style={{
                      border: '1px solid #27272a',
                      borderRadius: '8px',
                      backgroundColor: '#1f1f23',
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      onClick={() => toggleExpand(file.relativePath)}
                      style={{
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        userSelect: 'none',
                        backgroundColor: '#232328'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: '#71717a' }}>
                          {isExpanded ? '▼' : '▶'}
                        </span>
                        <span style={{ fontSize: '13px', fontWeight: 500, color: '#f4f4f5' }}>
                          {file.relativePath}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: '11.5px',
                          color: '#a1a1aa',
                          backgroundColor: '#27272a',
                          padding: '2px 8px',
                          borderRadius: '10px'
                        }}
                      >
                        {file.changesCount} lien{file.changesCount > 1 ? 's' : ''}
                      </span>
                    </div>

                    {isExpanded && (
                      <div
                        style={{
                          padding: '10px 14px',
                          borderTop: '1px solid #27272a',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          fontSize: '12px',
                          fontFamily: 'Consolas, monospace'
                        }}
                      >
                        {file.changes.map((change, idx) => (
                          <div
                            key={idx}
                            style={{
                              backgroundColor: '#18181b',
                              borderRadius: '4px',
                              padding: '6px 10px',
                              border: '1px solid #2a2a30',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '2px'
                            }}
                          >
                            <div style={{ color: '#ef4444', textDecoration: 'line-through' }}>
                              - Ligne {change.line} : {change.original}
                            </div>
                            <div style={{ color: '#10b981' }}>
                              + Ligne {change.line} : {change.replacement}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ fontSize: '12px', color: '#71717a', lineHeight: 1.5 }}>
            🛡️ <strong>Sécurité garantie :</strong> chaque note modifiée fait l&apos;objet d&apos;un
            snapshot dans l&apos;historique Time Travel. Vous disposerez également d&apos;un bouton
            immédiat pour annuler ce renommage en un clic.
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #27272a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '12px'
          }}
        >
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              backgroundColor: '#27272a',
              color: '#d4d4d8',
              border: 'none',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 500
            }}
          >
            Annuler
          </button>
          <button
            onClick={() => onApply(plan)}
            disabled={plan.hasCollision || isSubmitting}
            style={{
              padding: '8px 18px',
              borderRadius: '6px',
              backgroundColor: plan.hasCollision || isSubmitting ? '#475569' : '#0284c7',
              color: '#ffffff',
              border: 'none',
              cursor: plan.hasCollision || isSubmitting ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {isSubmitting ? 'Application en cours...' : 'Appliquer'}
          </button>
        </div>
      </div>
    </div>
  )
}
