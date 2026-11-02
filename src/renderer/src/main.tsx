/*! NOTE-APP — © 2026 4URE1 — https://github.com/4ure1 — Tous droits réservés. */
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
