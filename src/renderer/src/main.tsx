/*! NOTE-APP — © 2026 4URE1 — https://github.com/4ure1 — Tous droits réservés. */
// Polices de l'interface embarquées (hors ligne) : Atkinson Hyperlegible Next pour l'UI, Newsreader pour les titres
import '@fontsource/atkinson-hyperlegible-next/400.css'
import '@fontsource/atkinson-hyperlegible-next/400-italic.css'
import '@fontsource/atkinson-hyperlegible-next/500.css'
import '@fontsource/atkinson-hyperlegible-next/600.css'
import '@fontsource/atkinson-hyperlegible-next/700.css'
import '@fontsource/newsreader/400.css'
import '@fontsource/newsreader/400-italic.css'
import '@fontsource/newsreader/500.css'
import './assets/main.css'
import './monacoConfig'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { APP_NAME, AUTHOR_GITHUB, COPYRIGHT } from './utils/credits'

console.info(
  '%c' + APP_NAME + ' %c ' + COPYRIGHT + ' ' + AUTHOR_GITHUB,
  'color:#4fc1ff;font-weight:bold',
  'color:#9d9d9d'
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
