import fs from 'node:fs'
import { join, relative } from 'node:path'
import MiniSearch from 'minisearch'
import { ToolDefinition, ToolExecutionContext, ToolResult } from '../types'
import { assertSafeNotePath } from '../security'

export const searchNotesDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'search_notes',
    description: 'Effectue une recherche textuelle et floue (fuzzy) parmi toutes les notes de la base de connaissances.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Mots-clés ou phrase à rechercher dans le titre et le contenu des notes.'
        },
        folder: {
          type: 'string',
          description: 'Optionnel : sous-dossier dans lequel restreindre la recherche.'
        }
      },
      required: ['query']
    }
  }
}

interface NoteDocument {
  id: string
  title: string
  content: string
  folder: string
  path: string
}

function scanNotes(dir: string, baseDir: string, list: NoteDocument[] = []): NoteDocument[] {
  if (!fs.existsSync(dir)) return list

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === '.snippets' || entry.name === '.trash' || entry.name === 'node_modules') continue

    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      scanNotes(fullPath, baseDir, list)
    } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.html') || entry.name.endsWith('.txt'))) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8')
        const relPath = relative(baseDir, fullPath).replace(/\\/g, '/')
        const folder = relPath.includes('/') ? relPath.substring(0, relPath.lastIndexOf('/')) : ''
        const title = entry.name.replace(/\.[^.]+$/, '')
        list.push({
          id: relPath,
          title,
          content,
          folder,
          path: relPath
        })
      } catch {}
    }
  }
  return list
}

export async function executeSearchNotes(
  args: any,
  context: ToolExecutionContext
): Promise<ToolResult> {
  // 1. Validation stricte des arguments avec message d'auto-correction pour le LLM
  if (!args || typeof args !== 'object') {
    return {
      success: false,
      error: "Arguments manquants ou invalides : attend un objet JSON avec au moins la propriété 'query'."
    }
  }

  const query = typeof args.query === 'string' ? args.query.trim() : ''
  if (!query) {
    return {
      success: false,
      error: "Le paramètre 'query' est obligatoire et ne peut pas être vide. Exemple : { \"query\": \"docker\" }"
    }
  }

  try {
    const searchBaseDir = args.folder
      ? assertSafeNotePath(context.notesDir, String(args.folder).trim().replace(/^\/+/, ''), {
          allowRoot: true
        })
      : context.notesDir
    const docs = scanNotes(searchBaseDir, context.notesDir)

    if (docs.length === 0) {
      return {
        success: true,
        data: [],
        message: `Aucune note trouvée dans le répertoire exploré (${docs.length} notes scannées).`
      }
    }

    // Indexation avec MiniSearch (support fuzzy + prefix)
    const miniSearch = new MiniSearch<NoteDocument>({
      fields: ['title', 'content', 'folder'],
      storeFields: ['title', 'path', 'folder'],
      searchOptions: {
        fuzzy: 0.2,
        prefix: true,
        boost: { title: 3, folder: 1.5, content: 1 }
      }
    })

    miniSearch.addAll(docs)
    const searchResults = miniSearch.search(query)

    // Formater les meilleurs résultats avec snippets
    const topResults = searchResults.slice(0, 5).map((res) => {
      const doc = docs.find((d) => d.id === res.id)
      let snippet = ''
      if (doc) {
        const lowerContent = doc.content.toLowerCase()
        const lowerQuery = query.toLowerCase()
        const idx = lowerContent.indexOf(lowerQuery)
        if (idx >= 0) {
          const start = Math.max(0, idx - 60)
          const end = Math.min(doc.content.length, idx + query.length + 100)
          snippet = (start > 0 ? '...' : '') + doc.content.substring(start, end).replace(/\r?\n/g, ' ') + '...'
        } else {
          snippet = doc.content.slice(0, 140).replace(/\r?\n/g, ' ') + '...'
        }
      }

      return {
        path: res.path,
        title: res.title,
        folder: res.folder || '/',
        score: Math.round(res.score * 100) / 100,
        snippet
      }
    })

    return {
      success: true,
      data: topResults,
      message: `${topResults.length} note(s) pertinente(s) trouvée(s) pour "${query}".`
    }
  } catch (err: any) {
    return {
      success: false,
      error: `Erreur lors de la recherche de notes : ${err.message}`
    }
  }
}
