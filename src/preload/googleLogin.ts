/*! NOTE-APP — 4URE1 (https://github.com/4ure1), tous droits réservés */

// Preload de la seule fenêtre de connexion Google (openGoogleLoginWindow, main).
// N'expose rien à la page : il désactive seulement les passkeys dans son monde, avant ses
// scripts, pour éviter la boîte Windows « Choose a passkey » qui figeait la connexion.
import { contextBridge } from 'electron'
import { disablePasskeys } from '../shared/noPasskeyScript'

try {
  contextBridge.executeInMainWorld({ func: disablePasskeys })
} catch (err) {
  console.error('[Connexion Google]', err)
}
