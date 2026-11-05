import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
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
