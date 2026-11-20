/*! NOTE-APP — © 2026 4URE1 — https://github.com/4ure1 — Tous droits réservés. */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import Modal from './Modal'
import VaultManager from './VaultManager'
import { openFolderAsVault, switchToVault, useVaults } from '../utils/vaultActions'
import { CheckIcon, ChevronDown, FolderIcon } from './Icons'

const MENU_WIDTH = 260

// Fenêtre « Gérer les coffres » (aussi utilisée par l'écran de choix)
export function VaultManagerModal({
  onClose,
  startCreate
}: {
  onClose: () => void
  startCreate?: boolean
}): ReactNode {
  const titleId = useId()
  return (
    <Modal
      labelledBy={titleId}
      onClose={onClose}
      initialFocus="first"
      panelStyle={{ width: 'min(640px, calc(100vw - 32px))', padding: '20px 22px' }}
    >
      <div className="vault-modal-head">
        <h3 id={titleId}>Coffres</h3>
        <button className="st-btn" onClick={onClose} data-autofocus>
          Fermer
        </button>
      </div>
      <p className="vault-lead">
        Chaque coffre est un dossier de notes. Changer de coffre redémarre l’app ; retirer un coffre
        de la liste ne supprime aucun fichier.
      </p>
      <VaultManager startCreate={startCreate} />
    </Modal>
  )
}

// Sélecteur en bas de la barre latérale : coffre actif, liste, création et ouverture d'un dossier
export default function VaultSwitcher(): ReactNode {
  const { state } = useVaults()
  const [position, setPosition] = useState<{ bottom: number; left: number } | null>(null)
  const [manager, setManager] = useState<null | { create: boolean }>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const isOpen = position !== null
  const active = state?.vaults.find((v) => v.active)
  const readOnly = !state || state.fromEnv

  useEffect(() => {
    if (!isOpen) return
    menuRef.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')?.focus()
    const handleOutside = (e: MouseEvent): void => {
      const target = e.target as Node
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setPosition(null)
      }
    }
    window.addEventListener('mousedown', handleOutside)
    return () => window.removeEventListener('mousedown', handleOutside)
  }, [isOpen])

  const toggle = (): void => {
    if (isOpen) {
      setPosition(null)
      return
    }
    const r = buttonRef.current?.getBoundingClientRect()
    if (r) {
      setPosition({
        bottom: Math.max(8, window.innerHeight - r.top + 4),
        left: Math.max(8, Math.min(r.left, window.innerWidth - MENU_WIDTH - 8))
      })
    }
  }

  const close = (): void => {
    setPosition(null)
    buttonRef.current?.focus()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const items = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])')
    )
    const i = items.indexOf(document.activeElement as HTMLElement)
    let handled = true
    if (e.key === 'ArrowDown') items[(i + 1) % items.length]?.focus()
    else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length]?.focus()
    else if (e.key === 'Home') items[0]?.focus()
    else if (e.key === 'End') items[items.length - 1]?.focus()
    else if (e.key === 'Escape' || e.key === 'Tab') close()
    else handled = false
    if (handled) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  const name = active?.name ?? 'Coffre'

  return (
    <>
      <button
        ref={buttonRef}
        className="sb-row vault-switcher"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={active ? `${active.name} — ${active.path}` : 'Coffres'}
      >
        <FolderIcon size={16} />
        <span className="sb-label">{name}</span>
        {state?.fromEnv && <span className="vault-badge">Test</span>}
        <ChevronDown size={13} />
      </button>

      {position && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Coffres"
          className="vault-menu"
          onKeyDown={handleKeyDown}
          style={{ bottom: `${position.bottom}px`, left: `${position.left}px`, width: MENU_WIDTH }}
        >
          <div className="vault-menu-label">Coffres</div>
          {state?.vaults.map((vault) => (
            <button
              key={vault.id}
              role="menuitemradio"
              aria-checked={vault.active}
              tabIndex={-1}
              className="vault-menu-item"
              disabled={readOnly || !vault.exists}
              title={vault.exists ? vault.path : `Introuvable : ${vault.path}`}
              onClick={() => {
                close()
                if (!vault.active || state.activeMissing) switchToVault(vault)
              }}
            >
              <span className="vault-menu-check">{vault.active && <CheckIcon size={13} />}</span>
              <span className="sb-label">{vault.name}</span>
              {!vault.exists && <span className="vault-badge missing">Introuvable</span>}
            </button>
          ))}
          <div className="vault-menu-sep" role="separator" />
          <button
            role="menuitem"
            tabIndex={-1}
            className="vault-menu-item"
            disabled={readOnly}
            onClick={() => {
              close()
              setManager({ create: true })
            }}
          >
            <span className="vault-menu-check" />
            Créer un coffre…
          </button>
          <button
            role="menuitem"
            tabIndex={-1}
            className="vault-menu-item"
            disabled={readOnly}
            onClick={() => {
              close()
              openFolderAsVault()
            }}
          >
            <span className="vault-menu-check" />
            Ouvrir un dossier comme coffre…
          </button>
          <button
            role="menuitem"
            tabIndex={-1}
            className="vault-menu-item"
            onClick={() => {
              close()
              setManager({ create: false })
            }}
          >
            <span className="vault-menu-check" />
            Gérer les coffres…
          </button>
          {state?.fromEnv && (
            <div className="vault-menu-note">Mode test : coffre imposé par NOTE_APP_NOTES_DIR.</div>
          )}
        </div>
      )}

      {manager && (
        <VaultManagerModal startCreate={manager.create} onClose={() => setManager(null)} />
      )}
    </>
  )
}

// Écran de choix quand le coffre actif est introuvable (dossier supprimé, disque débranché) :
// l'app ne montre rien d'autre tant qu'un coffre valide n'est pas ouvert
export function VaultPickerScreen(): ReactNode {
  const { state } = useVaults()
  const titleId = useId()
  if (!state || !state.activeMissing) return null
  const missing = state.vaults.find((v) => v.active)
  return (
    <div className="vault-picker" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="vault-picker-panel">
        <h2 id={titleId}>Coffre introuvable</h2>
        <p className="vault-lead">
          {missing ? (
            <>
              Le dossier du coffre « {missing.name} » n’existe plus ou n’est pas accessible :
              <code className="st-path">{missing.path}</code>
            </>
          ) : (
            'Aucun coffre valide.'
          )}
          Ouvre un autre coffre, rebranche le disque puis redémarre l’app, ou crée un nouveau
          coffre.
        </p>
        <VaultManager />
      </div>
    </div>
  )
}
