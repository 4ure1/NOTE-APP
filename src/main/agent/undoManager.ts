import fs from 'node:fs'
import { join } from 'node:path'
import { UndoEntry, UndoManager } from './types'
import { assertSafeNotePath } from './security'

export class LocalUndoManager implements UndoManager {
  private history: UndoEntry[] = []

  push(entry: UndoEntry): void {
    this.history.push(entry)
    // Keep max 20 entries in history
    if (this.history.length > 20) {
      this.history.shift()
    }
  }

  pop(): UndoEntry | undefined {
    return this.history.pop()
  }

  peek(): UndoEntry | undefined {
    return this.history[this.history.length - 1]
  }

  getHistory(): UndoEntry[] {
    return [...this.history]
  }

  async undoLast(notesDir: string): Promise<{ success: boolean; message: string }> {
    const entry = this.pop()
    if (!entry) {
      return { success: false, message: 'Aucune action à annuler dans l’historique.' }
    }

    try {
      const fullPath = assertSafeNotePath(notesDir, entry.targetPath)

      if (entry.type === 'create_note') {
        if (fs.existsSync(fullPath)) {
          // Soft-delete or move to trash folder
          const trashDir = join(notesDir, '.trash')
          if (!fs.existsSync(trashDir)) {
            fs.mkdirSync(trashDir, { recursive: true })
          }
          const trashTarget = join(trashDir, `undo-${Date.now()}-${entry.targetPath.replace(/[/\\]/g, '_')}`)
          fs.renameSync(fullPath, trashTarget)
          return { success: true, message: `Annulation réussie : la note "${entry.targetPath}" a été déplacée vers la corbeille.` }
        }
        return { success: false, message: `Fichier introuvable lors de l’annulation : ${entry.targetPath}` }
      }

      if (entry.type === 'append_note') {
        if (fs.existsSync(fullPath) && typeof entry.previousContent === 'string') {
          fs.writeFileSync(fullPath, entry.previousContent, 'utf-8')
          return { success: true, message: `Annulation réussie : le contenu de "${entry.targetPath}" a été restauré.` }
        }
      }

      return { success: false, message: `Type d'annulation non supporté : ${entry.type}` }
    } catch (err: any) {
      return { success: false, message: `Erreur d'annulation : ${err.message}` }
    }
  }
}

export const globalUndoManager = new LocalUndoManager()
