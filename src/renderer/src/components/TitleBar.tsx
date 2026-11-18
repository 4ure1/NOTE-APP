/*! NOTE-APP — © 2026 4URE1 — https://github.com/4ure1 — Tous droits réservés. */
import React, { useEffect, useState } from 'react'

interface TitleBarProps {
  /** Nom de la note ouverte (sans extension), ou rien. */
  noteName?: string
}

/**
 * Barre de titre intégrée (fenêtre créée avec titleBarStyle « hidden ») : zone de déplacement aux
 * couleurs du thème ; réduire / agrandir / fermer sont dessinés par Windows à droite (titleBarOverlay).
 * En mode test, le rappel [TEST-VAULT] reste visible ici, puisque le titre natif ne l'est plus.
 */
export default function TitleBar({ noteName }: TitleBarProps): React.JSX.Element {
  const [testVault, setTestVault] = useState(false)

  useEffect(() => {
    window.api
      .getAppSetup()
      .then((setup) => setTestVault(setup.fromEnv))
      .catch((err: unknown) => console.error('[TitleBar]', err))
  }, [])

  return (
    <div className="app-titlebar">
      <span className="app-titlebar-name">NOTE-APP</span>
      {noteName && <span className="app-titlebar-note">{noteName}</span>}
      {testVault && <span className="app-titlebar-test">TEST-VAULT</span>}
    </div>
  )
}
