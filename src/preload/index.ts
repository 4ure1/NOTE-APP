import { contextBridge, ipcRenderer, webUtils } from 'electron'

const api = {
  listMarkdownFiles: () => ipcRenderer.invoke('list-markdown-files'),
  getNotesTree: () => ipcRenderer.invoke('get-notes-tree'),
  createFolder: (parentRelativePath: string, folderName: string) =>
    ipcRenderer.invoke('create-folder', parentRelativePath, folderName),
  createNote: (parentRelativePath?: string, title?: string, templateType?: 'html' | 'md') =>
    ipcRenderer.invoke('create-note', parentRelativePath, title, templateType),
  createSpecificNote: (title: string) => ipcRenderer.invoke('create-specific-note', title),
  renameNote: (oldPath: string, newName: string) =>
    ipcRenderer.invoke('rename-note', oldPath, newName),
  moveItem: (sourceRelativePath: string, targetFolderRelativePath: string) =>
    ipcRenderer.invoke('move-item', sourceRelativePath, targetFolderRelativePath),
  readNote: (relativePath: string) => ipcRenderer.invoke('read-note', relativePath),
  writeNote: (relativePath: string, content: string) =>
    ipcRenderer.invoke('write-note', relativePath, content),
  deleteNote: (relativePath: string) => ipcRenderer.invoke('delete-note', relativePath),
  getDeletedNotes: () => ipcRenderer.invoke('get-deleted-notes'),
  restoreDeletedNote: (trashId: string) => ipcRenderer.invoke('restore-deleted-note', trashId),
  emptyTrash: () => ipcRenderer.invoke('empty-trash'),
  deletePermanently: (trashId: string) => ipcRenderer.invoke('delete-permanently', trashId),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config: Record<string, any>) => ipcRenderer.invoke('save-config', config),
  createNoteWithContent: (fileName: string, content: string) =>
    ipcRenderer.invoke('create-note-with-content', fileName, content),
  openInBrowser: (relativePath: string) => ipcRenderer.invoke('open-in-browser', relativePath),
  openExternalUrl: (url: string) => ipcRenderer.invoke('open-external-url', url),
  importPdfDialog: (targetFolder?: string) => ipcRenderer.invoke('import-pdf-dialog', targetFolder),
  // Le chemin disque n'est lu que depuis un vrai File (glisser-déposer ou <input type="file">) :
  // une page ne peut pas fabriquer un File qui pointe vers un fichier arbitraire du disque
  importDroppedFile: (file: File, targetFolder?: string) => {
    const srcPath = webUtils.getPathForFile(file)
    if (!srcPath) {
      return Promise.reject(
        new Error('Accès refusé : ce fichier ne provient pas du disque (glisser-déposer requis).')
      )
    }
    return ipcRenderer.invoke('import-file-from-path', srcPath, targetFolder)
  },
  readBinaryFile: (relativePath: string) => ipcRenderer.invoke('read-binary-file', relativePath),
  showItemInFolder: (relativePath: string) =>
    ipcRenderer.invoke('show-item-in-folder', relativePath),
  savePdfBase64: (filename: string, base64: string) =>
    ipcRenderer.invoke('save-pdf-base64', filename, base64),
  savePdfBinary: (filename: string, buffer: ArrayBuffer, targetFolder?: string) =>
    ipcRenderer.invoke('save-pdf-binary', filename, buffer, targetFolder),
  downloadPdfFromUrl: (url: string, filename: string) =>
    ipcRenderer.invoke('download-pdf-from-url', url, filename),
  onDownloadCompleted: (callback: (relPath: string, fileName: string) => void) => {
    const sub = (_event: any, relPath: string, fileName: string) => callback(relPath, fileName)
    ipcRenderer.on('download-completed', sub)
    return () => {
      ipcRenderer.removeListener('download-completed', sub)
    }
  },
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  setFullscreen: (flag: boolean) => ipcRenderer.invoke('set-fullscreen', flag),
  isFullscreen: () => ipcRenderer.invoke('is-fullscreen'),
  toggleMaximize: () => ipcRenderer.invoke('toggle-maximize'),
  isMaximized: () => ipcRenderer.invoke('is-maximized'),
  setActiveFolder: (folderPath: string) => ipcRenderer.invoke('set-active-folder', folderPath),
  onFullscreenChange: (callback: (isFullscreen: boolean) => void) => {
    const sub = (_event: any, val: boolean) => callback(val)
    ipcRenderer.on('fullscreen-change', sub)
    return () => {
      ipcRenderer.removeListener('fullscreen-change', sub)
    }
  },
  onEscapePressed: (callback: () => void) => {
    const sub = () => callback()
    ipcRenderer.on('escape-pressed', sub)
    return () => {
      ipcRenderer.removeListener('escape-pressed', sub)
    }
  },
  onShortcutRecent: (callback: () => void) => {
    const sub = () => callback()
    ipcRenderer.on('shortcut-recent', sub)
    return () => {
      ipcRenderer.removeListener('shortcut-recent', sub)
    }
  },
  onShortcutToggleAi: (callback: () => void) => {
    const sub = () => callback()
    ipcRenderer.on('shortcut-toggle-ai', sub)
    return () => {
      ipcRenderer.removeListener('shortcut-toggle-ai', sub)
    }
  },
  onShortcutToggleFullscreen: (callback: () => void) => {
    const sub = () => callback()
    ipcRenderer.on('shortcut-toggle-fullscreen', sub)
    return () => {
      ipcRenderer.removeListener('shortcut-toggle-fullscreen', sub)
    }
  },
  onNotesUpdated: (callback: () => void) => {
    const sub = () => callback()
    ipcRenderer.on('notes-updated', sub)
    return () => {
      ipcRenderer.removeListener('notes-updated', sub)
    }
  },
  openGoogleLogin: (service?: 'youtube' | 'claude' | 'default', customUrl?: string) =>
    ipcRenderer.invoke('open-google-login', service, customUrl),
  syncChromeSession: (service?: 'youtube' | 'claude') =>
    ipcRenderer.invoke('sync-chrome-session', service),
  importCookies: (service: 'youtube' | 'claude', rawCookies: string) =>
    ipcRenderer.invoke('import-cookies', service, rawCookies),
  onGoogleLoginSuccess: (callback: (service?: string) => void) => {
    const sub = (_event: any, service?: string) => callback(service)
    ipcRenderer.on('google-login-success', sub)
    return () => {
      ipcRenderer.removeListener('google-login-success', sub)
    }
  },
  aiSearchWeb: (query: string) => ipcRenderer.invoke('ai-search-web', query),
  aiSearchYouTube: (query: string) => ipcRenderer.invoke('ai-search-youtube', query),
  aiOllamaStatus: () => ipcRenderer.invoke('ai-ollama-status'),
  aiOllamaChat: (messages: any[], tools: any[], model?: string) =>
    ipcRenderer.invoke('ai-ollama-chat', messages, tools, model),
  agentRun: (params: any) => ipcRenderer.invoke('agent-run', params),
  agentCancel: () => ipcRenderer.invoke('agent-cancel'),
  agentUndo: () => ipcRenderer.invoke('agent-undo'),
  agentCheckModel: (modelName: string) => ipcRenderer.invoke('agent-check-model', modelName),
  onAgentStep: (callback: (step: any) => void) => {
    const sub = (_event: any, step: any) => callback(step)
    ipcRenderer.on('agent-step', sub)
    return () => {
      ipcRenderer.removeListener('agent-step', sub)
    }
  },
  getSnippets: () => ipcRenderer.invoke('get-snippets'),
  saveSnippets: (content: string) => ipcRenderer.invoke('save-snippets', content),
  onSnippetsUpdated: (callback: () => void) => {
    const sub = () => callback()
    ipcRenderer.on('snippets-updated', sub)
    return () => {
      ipcRenderer.removeListener('snippets-updated', sub)
    }
  },
  aiOllamaInlineComplete: (prompt: string, modelName?: string) =>
    ipcRenderer.invoke('ai-ollama-inline-complete', prompt, modelName),
  getNoteHistory: (relativePath: string) => ipcRenderer.invoke('get-note-history', relativePath),
  getHistoryVersionContent: (relativePath: string, versionId: string) =>
    ipcRenderer.invoke('get-history-version-content', relativePath, versionId),
  restoreNoteVersion: (relativePath: string, versionId: string) =>
    ipcRenderer.invoke('restore-note-version', relativePath, versionId),
  exportNote: (params: {
    format: 'html' | 'pdf' | 'docx'
    title: string
    content: string
    htmlRendered?: string
    defaultFileName?: string
  }) => ipcRenderer.invoke('export-note', params),
  prepareRenameOrMove: (
    oldRelativePath: string,
    newTarget: string,
    isFolder: boolean,
    isMove: boolean
  ) => ipcRenderer.invoke('prepare-rename-or-move', oldRelativePath, newTarget, isFolder, isMove),
  applyRenameOrMove: (plan: any) => ipcRenderer.invoke('apply-rename-or-move', plan),
  undoRenameOrMove: (operationId?: string) =>
    ipcRenderer.invoke('undo-rename-or-move', operationId),
  getTemplates: () => ipcRenderer.invoke('get-templates'),
  createNoteFromTemplate: (params: {
    folderPath: string
    fileName: string
    templateFileName?: string
    context?: any
  }) => ipcRenderer.invoke('create-note-from-template', params),
  getPdfAnnotations: (pdfRelativePath: string) =>
    ipcRenderer.invoke('get-pdf-annotations', pdfRelativePath),
  savePdfAnnotations: (pdfRelativePath: string, annotations: any[]) =>
    ipcRenderer.invoke('save-pdf-annotations', pdfRelativePath, annotations)
}

// Seule l'API métier est exposée : pas d'accès générique à ipcRenderer ni à process.env
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.api = api
}
