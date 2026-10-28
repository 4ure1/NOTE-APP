import fs from 'fs'
import path from 'path'

export interface HistoryItem {
  id: string
  timestamp: number
  dateFormatted: string
  lineCount: number
  size: number
}

interface StoredSnapshot extends HistoryItem {
  relativePath: string
  content: string
}

function getSanitizedFolder(notesDir: string, relativePath: string): string {
  const historyBase = path.join(notesDir, '.history')
  const safeName = relativePath.replace(/[^a-zA-Z0-9_-]/g, '_')
  const targetDir = path.join(historyBase, safeName)
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }
  return targetDir
}

/**
 * Enregistre un instantané si au moins 2 minutes se sont écoulées depuis le précédent
 * ou si le fichier est nouveau.
 */
export async function saveSnapshot(
  notesDir: string,
  relativePath: string,
  content: string
): Promise<boolean> {
  try {
    if (!content.trim()) return false
    const targetDir = getSanitizedFolder(notesDir, relativePath)

    const existingFiles = fs.readdirSync(targetDir).filter((f) => f.endsWith('.json'))
    const now = Date.now()

    // Vérifier la date du dernier instantané
    if (existingFiles.length > 0) {
      existingFiles.sort((a, b) => {
        const tA = parseInt(a.replace('.json', ''), 10) || 0
        const tB = parseInt(b.replace('.json', ''), 10) || 0
        return tB - tA
      })

      const latestFile = path.join(targetDir, existingFiles[0])
      try {
        const latestData: StoredSnapshot = JSON.parse(fs.readFileSync(latestFile, 'utf-8'))
        // Si le contenu est strictement identique ou s'il s'est écoulé moins de 90 secondes, on ne spamme pas
        if (latestData.content === content || now - latestData.timestamp < 90 * 1000) {
          return false
        }
      } catch {}
    }

    const d = new Date(now)
    const dateFormatted = d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })

    const snapshot: StoredSnapshot = {
      id: String(now),
      timestamp: now,
      dateFormatted,
      relativePath,
      lineCount: content.split('\n').length,
      size: Buffer.byteLength(content, 'utf-8'),
      content
    }

    fs.writeFileSync(path.join(targetDir, `${now}.json`), JSON.stringify(snapshot, null, 2), 'utf-8')

    // Élagage : garder au maximum 50 versions par fichier
    if (existingFiles.length >= 50) {
      const filesToDelete = existingFiles.slice(49)
      for (const f of filesToDelete) {
        try {
          fs.unlinkSync(path.join(targetDir, f))
        } catch {}
      }
    }

    return true
  } catch (err) {
    console.warn('Failed to save version snapshot:', err)
    return false
  }
}

/**
 * Récupère l'historique chronologique des instantanés d'une note
 */
export async function getHistory(notesDir: string, relativePath: string): Promise<HistoryItem[]> {
  try {
    const targetDir = getSanitizedFolder(notesDir, relativePath)
    if (!fs.existsSync(targetDir)) return []

    const files = fs.readdirSync(targetDir).filter((f) => f.endsWith('.json'))
    const list: HistoryItem[] = []

    for (const file of files) {
      try {
        const fullPath = path.join(targetDir, file)
        const data: StoredSnapshot = JSON.parse(fs.readFileSync(fullPath, 'utf-8'))
        list.push({
          id: data.id,
          timestamp: data.timestamp,
          dateFormatted: data.dateFormatted,
          lineCount: data.lineCount,
          size: data.size
        })
      } catch {}
    }

    // Tri du plus récent au plus ancien
    list.sort((a, b) => b.timestamp - a.timestamp)
    return list
  } catch (err) {
    console.warn('Failed to load history list:', err)
    return []
  }
}

/**
 * Récupère le contenu d'un instantané précis
 */
export async function getVersionContent(
  notesDir: string,
  relativePath: string,
  versionId: string
): Promise<string | null> {
  try {
    const targetDir = getSanitizedFolder(notesDir, relativePath)
    const filePath = path.join(targetDir, `${versionId}.json`)
    if (!fs.existsSync(filePath)) return null
    const data: StoredSnapshot = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return data.content
  } catch (err) {
    console.warn('Failed to read version snapshot content:', err)
    return null
  }
}
