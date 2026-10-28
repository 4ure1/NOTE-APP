import fs from 'node:fs'
import { join, dirname } from 'node:path'
import { ToolDefinition, ToolExecutionContext, ToolResult } from '../types'
import { assertSafeNotePath, sanitizeFileName } from '../security'

export const createNoteDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'create_note',
    description: 'Crée une nouvelle note au format Markdown dans les notes de l’utilisateur.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Le titre de la note (utilisé pour le nom de fichier et le titre principal).'
        },
        content: {
          type: 'string',
          description: 'Optionnel : le contenu structuré en Markdown de la note. Si non fourni, un squelette sera généré.'
        },
        folder: {
          type: 'string',
          description: 'Optionnel : le nom du sous-dossier de destination (ex: "Cuisine", "Projets/Web"). S’il n’existe pas, il sera créé.'
        }
      },
      required: ['title']
    }
  }
}

export async function executeCreateNote(
  args: any,
  context: ToolExecutionContext
): Promise<ToolResult> {
  // 1. Validation des arguments
  if (!args || typeof args !== 'object') {
    return {
      success: false,
      error: "Arguments invalides : un objet contenant au moins 'title' est requis."
    }
  }

  const rawTitle = typeof args.title === 'string' ? args.title.trim() : ''
  if (!rawTitle) {
    return {
      success: false,
      error: "Le paramètre 'title' est manquant ou vide. Précise un titre pour la note."
    }
  }

  let content = typeof args.content === 'string' ? args.content : ''
  if (!content.trim()) {
    content = `# ${rawTitle}\n\n*Note créée par l'Agent IA le ${new Date().toLocaleDateString('fr-FR')}.*\n`
  }

  try {
    const safeTitle = sanitizeFileName(rawTitle)
    const fileName = safeTitle.endsWith('.md') ? safeTitle : `${safeTitle}.md`

    // Calcul du sous-dossier
    let relPath = fileName
    if (args.folder && typeof args.folder === 'string' && args.folder.trim()) {
      const cleanFolder = args.folder.trim().replace(/^[/\\]+/, '')
      relPath = join(cleanFolder, fileName).replace(/\\/g, '/')
    }

    const fullPath = assertSafeNotePath(context.notesDir, relPath)
    const parentDir = dirname(fullPath)

    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true })
    }

    // Gestion des doublons : si le fichier existe déjà, générer un nom incrémenté
    let finalFullPath = fullPath
    let finalRelPath = relPath
    let counter = 1
    while (fs.existsSync(finalFullPath)) {
      const baseNoExt = safeTitle.replace(/\.md$/, '')
      const candidateName = `${baseNoExt}-${counter}.md`
      finalRelPath = args.folder
        ? join(args.folder.trim().replace(/^[/\\]+/, ''), candidateName).replace(/\\/g, '/')
        : candidateName
      finalFullPath = assertSafeNotePath(context.notesDir, finalRelPath)
      counter++
    }

    // Écriture du fichier
    fs.writeFileSync(finalFullPath, content, 'utf-8')

    // Enregistrement dans l'historique d'annulation (Undo)
    context.undoManager.push({
      id: `undo-create-${Date.now()}`,
      type: 'create_note',
      description: `Création de la note "${finalRelPath}"`,
      targetPath: finalRelPath,
      timestamp: Date.now()
    })

    // Notification du renderer pour rafraîchir l'arbre des notes
    if (context.mainWindow && !context.mainWindow.isDestroyed()) {
      context.mainWindow.webContents.send('notes-updated')
    }

    return {
      success: true,
      data: {
        path: finalRelPath,
        title: rawTitle,
        size: Buffer.byteLength(content, 'utf-8')
      },
      message: `Note créée avec succès : "${finalRelPath}"`
    }
  } catch (err: any) {
    return {
      success: false,
      error: `Échec de création de note : ${err.message}`
    }
  }
}
