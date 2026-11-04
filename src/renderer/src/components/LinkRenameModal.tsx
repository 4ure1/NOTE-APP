import { useId, useState, type ReactNode } from 'react'
import { RenameOperationPlan } from '../../../../src/shared/linkUpdater'
import { useModalA11y } from '../utils/useModalA11y'

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
  // Échap = Annuler, sauf pendant l'application (le bouton Annuler est alors désactivé)
  const dialogRef = useModalA11y(
    isOpen && !!plan,
    () => {
      if (!isSubmitting) onCancel()
    },
    { initialFocus: 'first' }
  )
  const titleId = useId()

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
        backgroundColor: 'var(--overlay-bg)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '85vh',
          backgroundColor: 'var(--surface-raised)',
          border: '1px solid var(--border-strong)',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
          color: 'var(--text-strong)',
          fontFamily: 'var(--font-ui)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--surface-input)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <h2
              id={titleId}
              style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-strong)' }}
            >
              {isFolder ? 'Déplacement / Renommage de dossier' : 'Renommage sécurisé de la note'}
            </h2>
            <div style={{ marginTop: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <span style={{ color: 'var(--danger-strong)', textDecoration: 'line-through' }}>
                {plan.oldPath}
              </span>
              {' ➔ '}
              <span style={{ color: 'var(--accent-color)', fontWeight: 500 }}>{plan.newPath}</span>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '20px',
              lineHeight: 1,
              padding: '4px 8px',
              borderRadius: '4px'
            }}
            title="Fermer (Échap)"
            aria-label="Fermer"
          >
            <span aria-hidden="true">×</span>
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
                backgroundColor: 'color-mix(in srgb, var(--danger-strong) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--danger-strong) 30%, transparent)',
                borderRadius: '8px',
                padding: '12px 16px',
                color: 'var(--danger-color)',
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
                backgroundColor: 'var(--surface-input)',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '13.5px'
              }}
            >
              <div style={{ color: 'var(--text-primary)' }}>
                {hasChanges ? (
                  <>
                    <strong style={{ color: 'var(--accent-color)' }}>
                      {plan.affectedFiles.length}
                    </strong>{' '}
                    fichier
                    {plan.affectedFiles.length > 1 ? 's' : ''} impacté
                    {plan.affectedFiles.length > 1 ? 's' : ''} (
                    <strong style={{ color: 'var(--accent-color)' }}>{plan.totalChanges}</strong>{' '}
                    lien
                    {plan.totalChanges > 1 ? 's' : ''} à actualiser)
                  </>
                ) : (
                  <span>Aucun lien externe à mettre à jour. Seul le fichier sera renommé.</span>
                )}
              </div>
              <span
                style={{
                  fontSize: '11.5px',
                  backgroundColor: 'color-mix(in srgb, var(--accent-color) 15%, transparent)',
                  color: 'var(--accent-color)',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontWeight: 500
                }}
              >
                Version sauvegardée avant
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
                  color: 'var(--text-muted)'
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
                      border: '1px solid var(--surface-input)',
                      borderRadius: '8px',
                      backgroundColor: 'var(--surface-raised)',
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      onClick={() => toggleExpand(file.relativePath)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          toggleExpand(file.relativePath)
                        }
                      }}
                      style={{
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        userSelect: 'none',
                        backgroundColor: 'var(--surface-control)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          aria-hidden="true"
                          style={{ fontSize: '11px', color: 'var(--text-muted)' }}
                        >
                          {isExpanded ? '▼' : '▶'}
                        </span>
                        <span
                          style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-strong)' }}
                        >
                          {file.relativePath}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: '11.5px',
                          color: 'var(--text-secondary)',
                          backgroundColor: 'var(--surface-input)',
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
                          borderTop: '1px solid var(--surface-input)',
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
                              backgroundColor: 'var(--surface-raised)',
                              borderRadius: '4px',
                              padding: '6px 10px',
                              border: '1px solid var(--surface-input)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '2px'
                            }}
                          >
                            <div
                              style={{
                                color: 'var(--danger-strong)',
                                textDecoration: 'line-through'
                              }}
                            >
                              - Ligne {change.line} : {change.original}
                            </div>
                            <div style={{ color: 'var(--success-strong)' }}>
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

          <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            🛡️ <strong>Sécurité garantie :</strong> chaque note modifiée fait l&apos;objet d&apos;un
            instantané dans l&apos;historique des versions. Vous disposerez également d&apos;un
            bouton immédiat pour annuler ce renommage en un clic.
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--surface-input)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '12px'
          }}
        >
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            data-autofocus
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              backgroundColor: 'var(--surface-input)',
              color: 'var(--text-primary)',
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
              backgroundColor:
                plan.hasCollision || isSubmitting ? '#475569' : 'var(--accent-strong)',
              color: 'var(--text-strong)',
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
