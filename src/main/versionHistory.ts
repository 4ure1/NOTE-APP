import fs from 'fs'
import path from 'path'
import { isVersionId } from './agent/security'
import { writeFileAtomic } from './atomicWrite'

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

const MAX_SNAPSHOTS = 50
const MIN_SNAPSHOT_INTERVAL_MS = 90 * 1000

// Instantanés d'une note, du plus récent au plus ancien
function sortedSnapshotFiles(targetDir: string): string[] {
  return fs
    .readdirSync(targetDir)
    .filter((f) => f.endsWith('.json'))
    .sort((a, b) => (parseInt(b, 10) || 0) - (parseInt(a, 10) || 0))
}

function readLatestSnapshot(targetDir: string, files: string[]): StoredSnapshot | null {
  if (files.length === 0) return null
  try {
    return JSON.parse(fs.readFileSync(path.join(targetDir, files[0]), 'utf-8'))
  } catch (err) {
    console.warn('[Historique] Dernier instantané illisible :', err)
    return null
  }
}

// Écrit un instantané puis élague les plus anciens. Identifiant unique même si deux instantanés
// tombent dans la même milliseconde (instantané forcé suivi de la version restaurée)
function writeSnapshotFile(
  targetDir: string,
  relativePath: string,
  content: string,
  existingFiles: string[]
): void {
  let now = Date.now()
  while (fs.existsSync(path.join(targetDir, `${now}.json`))) now++

  const snapshot: StoredSnapshot = {
    id: String(now),
    timestamp: now,
    dateFormatted: new Date(now).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }),
    relativePath,
    lineCount: content.split('\n').length,
    size: Buffer.byteLength(content, 'utf-8'),
    content
  }
  writeFileAtomic(path.join(targetDir, `${now}.json`), JSON.stringify(snapshot, null, 2))

  // Élagage : garder au maximum MAX_SNAPSHOTS versions par fichier
  for (const f of existingFiles.slice(MAX_SNAPSHOTS - 1)) {
    try {
      fs.unlinkSync(path.join(targetDir, f))
    } catch (err) {
      console.warn('[Historique] Ancien instantané non supprimé :', f, err)
    }
  }
}

/**
 * Enregistre un instantané si au moins 90 secondes se sont écoulées depuis le précédent
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
    const existingFiles = sortedSnapshotFiles(targetDir)

    // Contenu identique ou dernier instantané trop récent : on ne spamme pas
    const latest = readLatestSnapshot(targetDir, existingFiles)
    if (
      latest &&
      (latest.content === content || Date.now() - latest.timestamp < MIN_SNAPSHOT_INTERVAL_MS)
    ) {
      return false
    }

    writeSnapshotFile(targetDir, relativePath, content, existingFiles)
    return true
  } catch (err) {
    console.warn('Failed to save version snapshot:', err)
    return false
  }
}

/**
 * Instantané forcé, sans délai minimal : garantit que `content` figure dans l'historique avant une
 * opération qui va l'écraser (restauration d'une version). Renvoie true s'il y est déjà (dernier
 * instantané identique, ou contenu vide) ou s'il vient d'être enregistré ; false si l'écriture a échoué.
 */
export async function ensureSnapshot(
  notesDir: string,
  relativePath: string,
  content: string
): Promise<boolean> {
  if (!content.trim()) return true
  try {
    const targetDir = getSanitizedFolder(notesDir, relativePath)
    const existingFiles = sortedSnapshotFiles(targetDir)
    if (readLatestSnapshot(targetDir, existingFiles)?.content === content) return true
    writeSnapshotFile(targetDir, relativePath, content, existingFiles)
    return true
  } catch (err) {
    console.error('[Historique] Instantané forcé impossible :', err)
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
  // L'identifiant compose un nom de fichier : un timestamp uniquement (sinon "../" sortirait du dossier)
  if (!isVersionId(versionId)) return null
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
