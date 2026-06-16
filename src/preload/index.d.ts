/// <reference types="vite/client" />
import { ElectronAPI } from '@electron-toolkit/preload'

interface CustomAPI {
  listMarkdownFiles: () => Promise<string[]>
  createNote: (title: string) => Promise<string>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: CustomAPI
  }
}