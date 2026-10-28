import { ToolDefinition, ToolExecutionContext, ToolResult } from '../types'
import { searchNotesDefinition, executeSearchNotes } from './searchNotes'
import { createNoteDefinition, executeCreateNote } from './createNote'
import { readNoteDefinition, executeReadNote } from './readNote'
import { webSearchDefinition, executeWebSearch } from './webSearch'
import { webFetchDefinition, executeWebFetch } from './webFetch'

export const REGISTERED_TOOLS: ToolDefinition[] = [
  searchNotesDefinition,
  createNoteDefinition,
  readNoteDefinition,
  webSearchDefinition,
  webFetchDefinition
]

export async function executeToolCall(
  name: string,
  args: any,
  context: ToolExecutionContext
): Promise<ToolResult> {
  switch (name) {
    case 'search_notes':
      return await executeSearchNotes(args, context)
    case 'create_note':
      return await executeCreateNote(args, context)
    case 'read_note':
      return await executeReadNote(args, context)
    case 'web_search':
      return await executeWebSearch(args, context)
    case 'web_fetch':
      return await executeWebFetch(args, context)
    default:
      return {
        success: false,
        error: `Outil inconnu : "${name}". Les outils disponibles sont : ${REGISTERED_TOOLS.map((t) => t.function.name).join(', ')}.`
      }
  }
}
