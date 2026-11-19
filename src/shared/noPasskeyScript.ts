/*! NOTE-APP — 4URE1 (https://github.com/4ure1), tous droits réservés */

/**
 * Exécuté dans la fenêtre de connexion Google avant tout script de la page
 * (preload googleLogin.ts, contextBridge.executeInMainWorld : fonction transmise par sa source,
 * donc autonome, sans import ni constante externe ; `win` vaut alors le `window` de la page).
 * Google y demande d'emblée une passkey (WebAuthn) : Windows ouvre alors sa boîte
 * « Choose a passkey », modale, qui fige la page de connexion. On répond « pas de passkey »
 * pour que Google passe au formulaire e-mail / mot de passe. Les autres usages de
 * `navigator.credentials` restent intacts.
 */
export function disablePasskeys(
  win: Window & { DOMException: typeof DOMException } = window
): void {
  const nav = win.navigator as Navigator & { credentials?: CredentialsContainer }
  const creds = nav.credentials
  if (creds && typeof creds.get === 'function') {
    const refuse = (): Promise<never> =>
      Promise.reject(new win.DOMException('Passkeys désactivées ici', 'NotAllowedError'))
    const originalGet = creds.get.bind(creds)
    const originalCreate = typeof creds.create === 'function' ? creds.create.bind(creds) : null
    try {
      Object.defineProperty(creds, 'get', {
        configurable: true,
        value: (options?: CredentialRequestOptions) =>
          options && options.publicKey ? refuse() : originalGet(options)
      })
      if (originalCreate) {
        Object.defineProperty(creds, 'create', {
          configurable: true,
          value: (options?: CredentialCreationOptions) =>
            options && options.publicKey ? refuse() : originalCreate(options)
        })
      }
    } catch (err) {
      console.error('[Connexion Google]', err)
    }
  }
  const pkc = (win as Window & { PublicKeyCredential?: Record<string, unknown> })
    .PublicKeyCredential
  if (pkc) {
    for (const name of [
      'isConditionalMediationAvailable',
      'isUserVerifyingPlatformAuthenticatorAvailable'
    ]) {
      try {
        Object.defineProperty(pkc, name, {
          configurable: true,
          value: () => Promise.resolve(false)
        })
      } catch (err) {
        console.error('[Connexion Google]', err)
      }
    }
  }
}
