/// <reference types="vite/client" />
import { ElectronAPI } from '@electron-toolkit/preload'

interface CustomAPI {
  listMarkdownFiles: () => Promise<string[]>
  createNote: (title: string) => Promise<string>
  createSpecificNote: (title: string) => Promise<string>
  renameNote: (oldName: string, newName: string) => Promise<string | null>
  readNote: (fileName: string) => Promise<string>
  writeNote: (fileName: string, content: string) => Promise<void>
  deleteNote: (fileName: string) => Promise<boolean>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: CustomAPI
  }
}