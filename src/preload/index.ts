import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  listMarkdownFiles: () => ipcRenderer.invoke('list-markdown-files'),
  createNote: (title: string) => ipcRenderer.invoke('create-note', title),
  createSpecificNote: (title: string) => ipcRenderer.invoke('create-specific-note', title),
  renameNote: (oldName: string, newName: string) => ipcRenderer.invoke('rename-note', oldName, newName),
  readNote: (fileName: string) => ipcRenderer.invoke('read-note', fileName),
  writeNote: (fileName: string, content: string) => ipcRenderer.invoke('write-note', fileName, content),
  deleteNote: (fileName: string) => ipcRenderer.invoke('delete-note', fileName),
  createNoteWithContent: (fileName: string, content: string) => ipcRenderer.invoke('create-note-with-content', fileName, content)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}