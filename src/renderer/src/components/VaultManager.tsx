/*! NOTE-APP — © 2026 4URE1 — https://github.com/4ure1 — Tous droits réservés. */
import { useState, type ReactNode } from 'react'
import type { VaultInfo } from '../../../shared/vaults'
import { askConfirm } from './ConfirmDialog'
import { notifyApiError } from '../utils/apiError'
import {
  notifyVaultsChanged,
  offerToOpen,
  openFolderAsVault,
  switchToVault,
  useVaults
} from '../utils/vaultActions'

interface VaultManagerProps {
  // Ouvre directement le formulaire de création
  startCreate?: boolean
}

// Liste des coffres avec Ouvrir, Renommer, Retirer, et création / ouverture d'un dossier
export default function VaultManager({ startCreate = false }: VaultManagerProps): ReactNode {
  const { state, reload } = useVaults()
  const [creating, setCreating] = useState(startCreate)
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const readOnly = !state || state.fromEnv
  const lockTitle = state?.fromEnv
    ? 'Mode test : le dossier est imposé par NOTE_APP_NOTES_DIR'
    : undefined

  const create = async (): Promise<void> => {
    const name = newName.trim()
    if (!name) return
    try {
      const picked = await window.api.pickVaultFolder('create')
      if (!picked.success) {
        if (!picked.canceled && picked.error) notifyApiError('Coffres', new Error(picked.error))
        return
      }
      const res = await window.api.addVault({ mode: 'create', path: picked.path, name })
      if (!res.success) {
        notifyApiError('Coffres', new Error(res.error))
        return
      }
      setCreating(false)
      setNewName('')
      notifyVaultsChanged()
      await offerToOpen(res.vault)
    } catch (err) {
      notifyApiError('Coffres', err)
    }
  }

  const commitRename = async (vault: VaultInfo): Promise<void> => {
    const name = renameValue.trim()
    setRenamingId(null)
    if (!name || name === vault.name) return
    try {
      const res = await window.api.renameVault(vault.id, name)
      if (!res.success) notifyApiError('Coffres', new Error(res.error))
      notifyVaultsChanged()
    } catch (err) {
      notifyApiError('Coffres', err)
    }
  }

  const remove = async (vault: VaultInfo): Promise<void> => {
    const ok = await askConfirm({
      title: `Retirer « ${vault.name} » de la liste ?`,
      message: `Aucun fichier n’est supprimé : le dossier ${vault.path} reste sur le disque et pourra être rouvert.`,
      confirmLabel: 'Retirer de la liste',
      danger: true
    })
    if (!ok) return
    try {
      const res = await window.api.removeVault(vault.id)
      if (!res.success) notifyApiError('Coffres', new Error(res.error))
      notifyVaultsChanged()
    } catch (err) {
      notifyApiError('Coffres', err)
      reload()
    }
  }

  return (
    <>
      <div className="st-card">
        {!state && <div className="st-empty">Chargement…</div>}
        {state?.vaults.map((vault) => {
          const canRemove = !readOnly && (!vault.active || state.activeMissing)
          return (
            <div className="st-row" key={vault.id}>
              <div className="st-row-text">
                {renamingId === vault.id ? (
                  <input
                    className="st-input"
                    autoFocus
                    value={renameValue}
                    maxLength={80}
                    aria-label="Nouveau nom du coffre"
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => commitRename(vault)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        commitRename(vault)
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        e.stopPropagation()
                        setRenamingId(null)
                      }
                    }}
                  />
                ) : (
                  <div className="st-row-title vault-row-title">
                    {vault.name}
                    {vault.active && !state.activeMissing && (
                      <span className="vault-badge">Actif</span>
                    )}
                    {!vault.exists && <span className="vault-badge missing">Introuvable</span>}
                  </div>
                )}
                <code className="st-path">{vault.path}</code>
              </div>
              <div className="st-actions">
                {(!vault.active || state.activeMissing) && (
                  <button
                    className="st-btn"
                    disabled={readOnly || !vault.exists}
                    title={lockTitle}
                    onClick={() => switchToVault(vault)}
                  >
                    Ouvrir
                  </button>
                )}
                <button
                  className="st-btn"
                  disabled={readOnly}
                  title={lockTitle}
                  onClick={() => {
                    setRenamingId(vault.id)
                    setRenameValue(vault.name)
                  }}
                >
                  Renommer
                </button>
                <button
                  className="st-btn danger"
                  disabled={!canRemove}
                  title={
                    lockTitle ||
                    (vault.active && !state.activeMissing
                      ? 'Ouvre d’abord un autre coffre pour retirer celui-ci'
                      : 'Retirer de la liste (aucun fichier supprimé)')
                  }
                  onClick={() => remove(vault)}
                >
                  Retirer
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {creating ? (
        <form
          className="vault-create"
          onSubmit={(e) => {
            e.preventDefault()
            create()
          }}
        >
          <input
            className="st-input"
            autoFocus
            placeholder="Nom du nouveau coffre"
            aria-label="Nom du nouveau coffre"
            value={newName}
            maxLength={80}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                setCreating(false)
              }
            }}
          />
          <button className="st-btn" type="submit" disabled={readOnly || !newName.trim()}>
            Choisir l’emplacement…
          </button>
          <button className="st-btn" type="button" onClick={() => setCreating(false)}>
            Annuler
          </button>
        </form>
      ) : (
        <div className="vault-create">
          <button
            className="st-btn"
            disabled={readOnly}
            title={lockTitle}
            onClick={() => setCreating(true)}
          >
            Créer un coffre…
          </button>
          <button
            className="st-btn"
            disabled={readOnly}
            title={lockTitle}
            onClick={openFolderAsVault}
          >
            Ouvrir un dossier comme coffre…
          </button>
        </div>
      )}
    </>
  )
}
