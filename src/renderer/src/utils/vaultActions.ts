/*! NOTE-APP — © 2026 4URE1 — https://github.com/4ure1 — Tous droits réservés. */
// Coffres-forts côté interface : lecture de la liste et actions communes (sélecteur, Paramètres, écran de choix)
import { useCallback, useEffect, useState } from 'react'
import type { VaultInfo } from '../../../shared/vaults'
import { askConfirm } from '../components/ConfirmDialog'
import { notifyApiError } from './apiError'

export interface VaultListState {
  fromEnv: boolean
  activeMissing: boolean
  vaults: VaultInfo[]
}

// Événement émis après toute modification de la liste : sélecteur, Paramètres et écran de choix se relisent
export const VAULTS_CHANGED_EVENT = 'nf-vaults-changed'

export function useVaults(): { state: VaultListState | null; reload: () => void } {
  const [state, setState] = useState<VaultListState | null>(null)
  const reload = useCallback(() => {
    window.api
      .listVaults()
      .then((res) => {
        if (res.success) {
          setState({ fromEnv: res.fromEnv, activeMissing: res.activeMissing, vaults: res.vaults })
        } else notifyApiError('Coffres', new Error(res.error))
      })
      .catch((err: unknown) => notifyApiError('Coffres', err))
  }, [])
  useEffect(() => {
    reload()
    window.addEventListener(VAULTS_CHANGED_EVENT, reload)
    return () => window.removeEventListener(VAULTS_CHANGED_EVENT, reload)
  }, [reload])
  return { state, reload }
}

export const notifyVaultsChanged = (): void => {
  window.dispatchEvent(new Event(VAULTS_CHANGED_EVENT))
}

// Ouvre un coffre : l'app redémarre dessus (la saisie en attente est enregistrée à la fermeture)
export async function switchToVault(vault: VaultInfo, ask = true): Promise<void> {
  if (vault.active && vault.exists) return
  if (!vault.exists) {
    notifyApiError('Coffres', new Error(`Dossier introuvable : ${vault.path}`))
    return
  }
  if (ask) {
    const ok = await askConfirm({
      title: `Ouvrir le coffre « ${vault.name} » ?`,
      message:
        'NOTE-APP va redémarrer sur ce coffre. Les notes du coffre actuel restent où elles sont.',
      confirmLabel: 'Ouvrir et redémarrer'
    })
    if (!ok) return
  }
  try {
    const res = await window.api.switchVault(vault.id)
    if (!res.success) notifyApiError('Coffres', new Error(res.error))
  } catch (err) {
    notifyApiError('Coffres', err)
  }
}

// Ajoute un dossier existant choisi dans la fenêtre du système, puis propose de l'ouvrir
export async function openFolderAsVault(): Promise<void> {
  try {
    const picked = await window.api.pickVaultFolder('open')
    if (!picked.success) {
      if (!picked.canceled && picked.error) notifyApiError('Coffres', new Error(picked.error))
      return
    }
    const res = await window.api.addVault({ mode: 'open', path: picked.path })
    if (!res.success) {
      notifyApiError('Coffres', new Error(res.error))
      return
    }
    notifyVaultsChanged()
    await offerToOpen(res.vault)
  } catch (err) {
    notifyApiError('Coffres', err)
  }
}

export async function offerToOpen(vault: {
  id: string
  name: string
  path: string
}): Promise<void> {
  const ok = await askConfirm({
    title: `Ouvrir « ${vault.name} » maintenant ?`,
    message: `Le coffre est enregistré (${vault.path}). NOTE-APP va redémarrer dessus.`,
    confirmLabel: 'Ouvrir et redémarrer'
  })
  if (!ok) return
  const res = await window.api.switchVault(vault.id)
  if (!res.success) notifyApiError('Coffres', new Error(res.error))
}
