/// <reference types="vite/client" />
import { ElectronAPI } from '@electron-toolkit/preload'
import { RenameOperationPlan } from '../shared/linkUpdater'
import { NoteTemplate, TemplateContext } from '../shared/sessionDetector'
import { PdfAnnotation } from '../shared/pdfAnnotations'

export interface TreeNode {
  id: string
  name: string
  relativePath: string
  type: 'file' | 'folder'
  children?: TreeNode[]
  mtime?: number
  birthtime?: number
  size?: number
}

export interface DeletedNote {
  trashId: string
  name: string
  deletedAt: number
}

interface CustomAPI {
  listMarkdownFiles: () => Promise<string[]>
  getNotesTree: () => Promise<TreeNode[]>
  createFolder: (parentRelativePath: string, folderName: string) => Promise<string | null>
  createNote: (
    parentRelativePath?: string,
    title?: string,
    templateType?: 'html' | 'md'
  ) => Promise<string>
  createSpecificNote: (title: string) => Promise<string>
  renameNote: (oldPath: string, newName: string) => Promise<string | null>
  moveItem: (sourceRelativePath: string, targetFolderRelativePath: string) => Promise<string | null>
  readNote: (relativePath: string) => Promise<string>
  writeNote: (relativePath: string, content: string) => Promise<void>
  deleteNote: (relativePath: string) => Promise<boolean>
  getDeletedNotes: () => Promise<DeletedNote[]>
  restoreDeletedNote: (trashId: string) => Promise<string | null>
  emptyTrash: () => Promise<boolean>
  deletePermanently: (trashId: string) => Promise<boolean>
  getConfig: () => Promise<Record<string, any>>
  saveConfig: (config: Record<string, any>) => Promise<boolean>
  createNoteWithContent: (fileName: string, content: string) => Promise<string>
  openInBrowser: (relativePath: string) => Promise<boolean>
  importPdfDialog: (targetFolder?: string) => Promise<string[]>
  importFileFromPath: (srcPath: string, targetFolder?: string) => Promise<string | null>
  readBinaryFile: (relativePath: string) => Promise<string | null>
  showItemInFolder: (relativePath: string) => Promise<boolean>
  savePdfBase64: (filename: string, base64: string) => Promise<string | null>
  savePdfBinary: (
    filename: string,
    buffer: ArrayBuffer,
    targetFolder?: string
  ) => Promise<string | null>
  downloadPdfFromUrl: (url: string, filename: string) => Promise<string | null>
  onDownloadCompleted: (callback: (relPath: string, fileName: string) => void) => () => void
  toggleFullscreen: () => Promise<boolean>
  setFullscreen: (flag: boolean) => Promise<boolean>
  isFullscreen: () => Promise<boolean>
  toggleMaximize: () => Promise<boolean>
  isMaximized: () => Promise<boolean>
  setActiveFolder: (folderPath: string) => Promise<boolean>
  onFullscreenChange: (callback: (isFullscreen: boolean) => void) => () => void
  onEscapePressed: (callback: () => void) => () => void
  onShortcutRecent: (callback: () => void) => () => void
  onShortcutToggleAi: (callback: () => void) => () => void
  onShortcutToggleFullscreen: (callback: () => void) => () => void
  onNotesUpdated: (callback: () => void) => () => void
  openGoogleLogin: (
    service?: 'youtube' | 'claude' | 'default',
    customUrl?: string
  ) => Promise<boolean>
  syncChromeSession: (
    service?: 'youtube' | 'claude'
  ) => Promise<{ success: boolean; count: number }>
  importCookies: (service: 'youtube' | 'claude', rawCookies: string) => Promise<number>
  onGoogleLoginSuccess: (callback: (service?: string) => void) => () => void
  aiSearchWeb: (query: string) => Promise<Array<{ title: string; link: string; snippet: string }>>
  aiSearchYouTube: (
    query: string
  ) => Promise<
    Array<{
      videoId: string
      title: string
      channel: string
      duration: string
      thumbnail: string
      url: string
    }>
  >
  aiOllamaStatus: () => Promise<{ online: boolean; models: string[]; defaultModel: string | null }>
  aiOllamaChat: (messages: any[], tools: any[], model?: string) => Promise<any>
  agentRun: (params: {
    prompt: string
    model?: string
    numCtx?: number
    contextNotePath?: string
    contextNoteContent?: string
    attachments?: Array<{ name: string; text: string }>
    toolsEnabled?: boolean
    ollamaApiKey?: string
  }) => Promise<{ success: boolean; result?: string; error?: string }>
  agentCancel: () => Promise<boolean>
  agentUndo: () => Promise<{ success: boolean; message: string }>
  agentCheckModel: (modelName: string) => Promise<boolean>
  onAgentStep: (callback: (step: any) => void) => () => void
  getSnippets: () => Promise<{ snippets: any[]; trigger: string; error?: string }>
  saveSnippets: (content: string) => Promise<boolean>
  onSnippetsUpdated: (callback: () => void) => () => void
  aiOllamaInlineComplete: (prompt: string, modelName?: string) => Promise<{ text: string }>
  getNoteHistory: (
    relativePath: string
  ) => Promise<
    Array<{ id: string; timestamp: number; dateFormatted: string; lineCount: number; size: number }>
  >
  getHistoryVersionContent: (relativePath: string, versionId: string) => Promise<string | null>
  restoreNoteVersion: (relativePath: string, versionId: string) => Promise<string>
  exportNote: (params: {
    format: 'html' | 'pdf' | 'docx'
    title: string
    content: string
    htmlRendered?: string
    defaultFileName?: string
  }) => Promise<{ success: boolean; filePath?: string; error?: string }>
  prepareRenameOrMove: (
    oldRelativePath: string,
    newTarget: string,
    isFolder: boolean,
    isMove: boolean
  ) => Promise<RenameOperationPlan>
  applyRenameOrMove: (
    plan: RenameOperationPlan
  ) => Promise<{ success: boolean; operationId?: string; newPath: string; error?: string }>
  undoRenameOrMove: (
    operationId?: string
  ) => Promise<{ success: boolean; restoredPath?: string; error?: string }>
  getTemplates: () => Promise<NoteTemplate[]>
  createNoteFromTemplate: (params: {
    folderPath: string
    fileName: string
    templateFileName?: string
    context?: TemplateContext
  }) => Promise<{ success: boolean; relativePath: string; error?: string }>
  getPdfAnnotations: (pdfRelativePath: string) => Promise<PdfAnnotation[]>
  savePdfAnnotations: (pdfRelativePath: string, annotations: PdfAnnotation[]) => Promise<boolean>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: CustomAPI
  }
}
