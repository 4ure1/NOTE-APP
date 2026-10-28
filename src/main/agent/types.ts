export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, any>
      required?: string[]
    }
  }
}

export interface ToolExecutionContext {
  notesDir: string
  mainWindow?: Electron.BrowserWindow | null
  undoManager: UndoManager
  ollamaApiKey?: string
}

export type ToolResult = 
  | { success: true; data: any; message?: string }
  | { success: false; error: string; needsCorrection?: boolean }

export interface AgentStepEvent {
  type: 'status' | 'thought' | 'token' | 'tool_call' | 'tool_result' | 'done' | 'error' | 'undo_available'
  data: any
}

export interface AgentRunParams {
  prompt: string
  model?: string
  numCtx?: number
  contextNotePath?: string
  contextNoteContent?: string
  attachments?: Array<{ name: string; text: string }>
  toolsEnabled?: boolean
  ollamaApiKey?: string
}

export interface UndoEntry {
  id: string
  type: 'create_note' | 'append_note'
  description: string
  targetPath: string
  previousContent?: string
  timestamp: number
}

export interface UndoManager {
  push(entry: UndoEntry): void
  pop(): UndoEntry | undefined
  peek(): UndoEntry | undefined
  undoLast(notesDir: string): Promise<{ success: boolean; message: string }>
  getHistory(): UndoEntry[]
}
