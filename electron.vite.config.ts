import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        // googleLogin : preload de la seule fenêtre de connexion Google (passkeys désactivées)
        input: {
          index: resolve('src/preload/index.ts'),
          googleLogin: resolve('src/preload/googleLogin.ts')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    // Tables de caractères de pdf.js, embarquées par utils/pdfCMaps.ts
    assetsInclude: ['**/*.bcmap'],
    plugins: [react()]
  }
})
