/*! NOTE-APP — © 2026 4URE1 — https://github.com/4ure1 — Tous droits réservés. */
import React, { useEffect, useRef, useState } from 'react'

interface TitleBarProps {
  /** Nom de la note ouverte (sans extension), ou rien. */
  noteName?: string
}

/**
 * Barre du haut d'une fenêtre sans cadre. Fenêtre agrandie : cachée tant que la souris ne touche pas
 * le bord haut de l'écran, elle glisse alors par-dessus l'app (sans décaler le contenu). Fenêtre
 * réduite : toujours visible, l'app est décalée d'autant (classe nf-titlebar-pinned sur <html>). On y déplace la fenêtre
 * (double-clic : agrandir / restaurer) et on y trouve réduire, agrandir et fermer.
 * En mode test, le rappel TEST-VAULT y figure aussi (le titre de la fenêtre le porte déjà).
 */
export default function TitleBar({ noteName }: TitleBarProps): React.JSX.Element {
  const [visible, setVisible] = useState(false)
  const [maximized, setMaximized] = useState(true)
  const [testVault, setTestVault] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    window.api
      .getAppSetup()
      .then((setup) => setTestVault(setup.fromEnv))
      .catch((err: unknown) => console.error('[TitleBar]', err))
    window.api
      .windowControl('state')
      .then((res) => {
        if (res.success) setMaximized(res.maximized)
      })
      .catch((err: unknown) => console.error('[TitleBar]', err))
    return window.api.onWindowMaximized(setMaximized)
  }, [])

  // Fenêtre réduite : barre fixe, on doit pouvoir déplacer et redimensionner sans la chercher
  const pinned = !maximized
  useEffect(() => {
    document.documentElement.classList.toggle('nf-titlebar-pinned', pinned)
    return () => document.documentElement.classList.remove('nf-titlebar-pinned')
  }, [pinned])

  const show = (): void => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setVisible(true)
  }
  const hideSoon = (): void => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setVisible(false), 450)
  }
  const control = (action: 'minimize' | 'toggle-maximize' | 'close'): void => {
    window.api.windowControl(action).catch((err: unknown) => console.error('[TitleBar]', err))
  }

  return (
    <>
      {/* Zone sensible le long du bord haut : la survoler fait apparaître la barre */}
      <div className="app-titlebar-trigger" onMouseEnter={show} aria-hidden="true" />
      <div
        className={'app-titlebar' + (visible || pinned ? ' visible' : '')}
        onMouseEnter={show}
        onMouseLeave={hideSoon}
        onFocus={show}
        onBlur={hideSoon}
      >
        <span className="app-titlebar-name">NOTE-APP</span>
        {noteName && <span className="app-titlebar-note">{noteName}</span>}
        {testVault && <span className="app-titlebar-test">TEST-VAULT</span>}
        <span className="app-titlebar-grow" />
        <div className="app-titlebar-controls">
          <button onClick={() => control('minimize')} aria-label="Réduire" title="Réduire">
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M1 5h8" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
          <button
            onClick={() => control('toggle-maximize')}
            aria-label={maximized ? 'Restaurer' : 'Agrandir'}
            title={maximized ? 'Restaurer' : 'Agrandir'}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" fill="none">
              {maximized ? (
                <path
                  d="M2.5 3.5h5v5h-5zM3.5 3.5V1.5h5v5h-1"
                  stroke="currentColor"
                  strokeWidth="1"
                />
              ) : (
                <path d="M1.5 1.5h7v7h-7z" stroke="currentColor" strokeWidth="1" />
              )}
            </svg>
          </button>
          <button
            className="close"
            onClick={() => control('close')}
            aria-label="Fermer"
            title="Fermer"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
        </div>
      </div>
    </>
  )
}
