// Message lisible à partir d'une erreur IPC
// ("Error invoking remote method 'read-note': PathAccessError: Accès refusé : ..." -> "Accès refusé : ...")
export function describeApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return raw.replace(/^Error invoking remote method '[^']*':\s*(?:[A-Za-z]*Error:\s*)?/, '').trim()
}

// Résultat { success, error } du main : lève une erreur lisible en cas d'échec, pour les try/catch
export function ensureSuccess<T extends { success: boolean; error?: string }>(result: T): T {
  if (!result || !result.success) {
    throw new Error(result?.error || 'Opération impossible.')
  }
  return result
}

// Vrai si le main a refusé l'accès (chemin hors du dossier de notes, nom interdit, URL non web)
export function isAccessDenied(err: unknown): boolean {
  return describeApiError(err).startsWith('Accès refusé')
}

const CONTAINER_ID = 'api-error-toasts'

// Affiche une erreur non bloquante en bas à droite, utilisable depuis n'importe quel composant
export function notifyApiError(action: string, err: unknown): void {
  const message = `${action} : ${describeApiError(err)}`
  console.error('[API]', message, err)
  if (typeof document === 'undefined') return

  let container = document.getElementById(CONTAINER_ID)
  if (!container) {
    container = document.createElement('div')
    container.id = CONTAINER_ID
    Object.assign(container.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      zIndex: '100000',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      maxWidth: '420px'
    })
    document.body.appendChild(container)
  }

  const toast = document.createElement('div')
  toast.setAttribute('role', 'alert')
  toast.textContent = message
  Object.assign(toast.style, {
    background: '#2d2d30',
    color: '#f4f4f5',
    border: '1px solid #f48771',
    borderLeft: '4px solid #f48771',
    borderRadius: '6px',
    padding: '10px 14px',
    fontSize: '13px',
    lineHeight: '1.4',
    boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
    cursor: 'pointer'
  })
  toast.addEventListener('click', () => toast.remove())
  container.appendChild(toast)
  setTimeout(() => toast.remove(), 6000)
}
