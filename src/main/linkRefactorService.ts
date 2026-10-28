import fs from 'fs'
import path from 'path'
import {
  buildRenamePlan,
  normalizePosix,
  RenameOperationPlan,
  VaultFileRef
} from '../shared/linkUpdater'
import { saveSnapshot } from './versionHistory'

export interface RenameUndoRecord {
  operationId: string
  timestamp: number
  plan: RenameOperationPlan
}

// Pile d'annulation en mémoire des opérations de renommage/déplacement
const undoStack: RenameUndoRecord[] = []

function getOperationsDir(notesDir: string): string {
  const opDir = path.join(notesDir, '.history', 'link_operations')
  if (!fs.existsSync(opDir)) {
    fs.mkdirSync(opDir, { recursive: true })
  }
  return opDir
}

/**
 * Parcourt récursivement la vault pour lister tous les fichiers texte (.html, .htm, .md, .markdown)
 */
export function scanVaultFiles(notesDir: string): VaultFileRef[] {
  const result: VaultFileRef[] = []

  function walk(currentDir: string): void {
    if (!fs.existsSync(currentDir)) return
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })

    for (const entry of entries) {
      // Ignorer les dossiers système, cachés, corbeille, historique et templates
      if (
        entry.name.startsWith('.') ||
        entry.name === '.trash' ||
        entry.name === '.history' ||
        entry.name === 'node_modules' ||
        entry.name === '.snippets'
      ) {
        continue
      }

      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (['.html', '.htm', '.md', '.markdown'].includes(ext)) {
          const rel = normalizePosix(path.relative(notesDir, fullPath))
          try {
            const content = fs.readFileSync(fullPath, 'utf-8')
            result.push({ relativePath: rel, content })
          } catch (err) {
            console.warn(`[scanVaultFiles] Impossible de lire ${fullPath}:`, err)
          }
        }
      }
    }
  }

  walk(notesDir)
  return result
}

/**
 * Calcule le nouveau chemin relatif pour un renommage ou un déplacement.
 */
export function computeTargetNewPath(
  oldRelativePath: string,
  newTargetNameOrFolder: string,
  isFolder: boolean,
  isMove: boolean
): string {
  const normOld = normalizePosix(oldRelativePath)
  const cleanTarget = newTargetNameOrFolder.trim().replace(/\\/g, '/')

  if (!isMove) {
    // Cas Renommage
    const dir = path.posix.dirname(normOld)
    const oldExt = path.posix.extname(normOld)
    let finalName = cleanTarget

    if (!isFolder && !path.posix.extname(finalName)) {
      finalName += oldExt || '.html'
    }

    return dir === '.' || !dir ? finalName : `${dir}/${finalName}`
  } else {
    // Cas Déplacement
    const baseName = path.posix.basename(normOld)
    const cleanDestFolder = normalizePosix(cleanTarget).replace(/^\/+|\/+$/g, '')

    if (!cleanDestFolder) {
      return baseName
    }
    return `${cleanDestFolder}/${baseName}`
  }
}

/**
 * Prépare le plan de renommage ou de déplacement sécurisé en analysant l'impact sur tous les fichiers.
 */
export function prepareRenameOrMove(
  notesDir: string,
  oldRelativePath: string,
  newTarget: string,
  isFolder: boolean,
  isMove: boolean
): RenameOperationPlan {
  const normOld = normalizePosix(oldRelativePath)
  const oldFullPath = path.join(notesDir, normOld)
  const actualIsFolder = fs.existsSync(oldFullPath)
    ? fs.statSync(oldFullPath).isDirectory()
    : isFolder

  const newPath = computeTargetNewPath(oldRelativePath, newTarget, actualIsFolder, isMove)
  const newFullPath = path.join(notesDir, newPath)

  // 1. Vérifier si l'ancien fichier/dossier existe
  if (!fs.existsSync(oldFullPath)) {
    return {
      oldPath: normOld,
      newPath,
      isFolder,
      affectedFiles: [],
      totalChanges: 0,
      hasCollision: true,
      collisionError: `L'élément source "${normOld}" n'existe pas.`
    }
  }

  // 2. Vérifier l'interdiction de déplacer un dossier dans lui-même
  if (isFolder && isMove) {
    const resolvedOld = path.resolve(oldFullPath)
    const resolvedNew = path.resolve(newFullPath)
    if (resolvedNew === resolvedOld || resolvedNew.startsWith(resolvedOld + path.sep)) {
      return {
        oldPath: normOld,
        newPath,
        isFolder,
        affectedFiles: [],
        totalChanges: 0,
        hasCollision: true,
        collisionError: 'Impossible de déplacer un dossier à l’intérieur de lui-même.'
      }
    }
  }

  // 3. Scanner la vault
  const vaultFiles = scanVaultFiles(notesDir)

  // 4. Vérifier la collision de destination sur disque
  let hasDiskCollision = false
  if (path.resolve(oldFullPath).toLowerCase() !== path.resolve(newFullPath).toLowerCase()) {
    if (fs.existsSync(newFullPath)) {
      hasDiskCollision = true
    }
  }

  // 5. Construire le plan via le module pur
  const plan = buildRenamePlan(vaultFiles, normOld, newPath, actualIsFolder)

  if (hasDiskCollision) {
    plan.hasCollision = true
    plan.collisionError = `Un élément nommé "${path.posix.basename(newPath)}" existe déjà à cet emplacement.`
  }

  return plan
}

/**
 * Écriture atomique d'un fichier (écriture temporaire puis renommage).
 */
export function writeAtomic(filePath: string, content: string): void {
  const parentDir = path.dirname(filePath)
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true })
  }
  const tempPath = `${filePath}.tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  fs.writeFileSync(tempPath, content, 'utf-8')
  fs.renameSync(tempPath, filePath)
}

/**
 * Applique le plan de renommage avec écritures atomiques et sauvegardes Time Travel.
 */
export async function applyRenameOrMove(
  notesDir: string,
  plan: RenameOperationPlan
): Promise<{ success: boolean; operationId?: string; newPath: string; error?: string }> {
  if (plan.hasCollision) {
    return {
      success: false,
      newPath: plan.newPath,
      error: plan.collisionError || 'Collision détectée'
    }
  }

  const oldFullPath = path.join(notesDir, plan.oldPath)
  const newFullPath = path.join(notesDir, plan.newPath)

  if (!fs.existsSync(oldFullPath)) {
    return {
      success: false,
      newPath: plan.newPath,
      error: `Fichier source ${plan.oldPath} introuvable.`
    }
  }

  const operationId = `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  try {
    // 1. Sauvegarde Time Travel pour chaque fichier avant modification
    for (const file of plan.affectedFiles) {
      await saveSnapshot(notesDir, file.relativePath, file.originalContent).catch((err) => {
        console.warn(`[applyRenameOrMove] Snapshot échoué pour ${file.relativePath}:`, err)
      })
    }

    // 2. Écritures atomiques de tous les fichiers impactés
    for (const file of plan.affectedFiles) {
      const fullPath = path.join(notesDir, file.relativePath)
      writeAtomic(fullPath, file.newContent)
    }

    // 3. Renommage / déplacement du fichier ou dossier lui-même
    if (plan.oldPath !== plan.newPath) {
      const destDir = path.dirname(newFullPath)
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true })
      }
      fs.renameSync(oldFullPath, newFullPath)

      // Déplacer / renommer le sidecar d'annotations si c'est un PDF
      if (plan.oldPath.toLowerCase().endsWith('.pdf')) {
        const oldAnn = path.join(notesDir, `${plan.oldPath}.annotations.json`)
        const newAnn = path.join(notesDir, `${plan.newPath}.annotations.json`)
        if (fs.existsSync(oldAnn)) {
          try {
            fs.renameSync(oldAnn, newAnn)
          } catch {}
        }
      }
    }

    // 4. Enregistrement de l'opération pour annulation
    const record: RenameUndoRecord = {
      operationId,
      timestamp: Date.now(),
      plan
    }
    undoStack.push(record)

    // Sauvegarde persistée sur disque
    try {
      const opFile = path.join(getOperationsDir(notesDir), `${operationId}.json`)
      fs.writeFileSync(opFile, JSON.stringify(record, null, 2), 'utf-8')
    } catch (err) {
      console.warn('[applyRenameOrMove] Impossible de persister le log d’annulation:', err)
    }

    return { success: true, operationId, newPath: plan.newPath }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[applyRenameOrMove] Erreur critique pendant l’opération:', err)
    return { success: false, newPath: plan.newPath, error: message }
  }
}

/**
 * Annule une opération de renommage/déplacement en restaurant les fichiers et le chemin d'origine.
 */
export async function undoRenameOrMove(
  notesDir: string,
  operationId?: string
): Promise<{ success: boolean; restoredPath?: string; error?: string }> {
  let record: RenameUndoRecord | undefined

  if (operationId) {
    record = undoStack.find((r) => r.operationId === operationId)
    if (!record) {
      // Tenter de charger depuis le disque
      const opFile = path.join(getOperationsDir(notesDir), `${operationId}.json`)
      if (fs.existsSync(opFile)) {
        try {
          record = JSON.parse(fs.readFileSync(opFile, 'utf-8'))
        } catch (err) {
          console.warn('[undoRenameOrMove] Lecture du log impossible:', err)
        }
      }
    }
  } else {
    record = undoStack.pop()
  }

  if (!record) {
    return { success: false, error: 'Aucune opération de renommage à annuler.' }
  }

  const { plan } = record
  const currentFullPath = path.join(notesDir, plan.newPath)
  const originalFullPath = path.join(notesDir, plan.oldPath)

  try {
    // 1. Renommer / replacer le fichier ou dossier vers son emplacement initial
    if (plan.oldPath !== plan.newPath && fs.existsSync(currentFullPath)) {
      const origDir = path.dirname(originalFullPath)
      if (!fs.existsSync(origDir)) {
        fs.mkdirSync(origDir, { recursive: true })
      }
      fs.renameSync(currentFullPath, originalFullPath)

      // Restaurer le sidecar d'annotations si c'est un PDF
      if (plan.oldPath.toLowerCase().endsWith('.pdf')) {
        const oldAnn = path.join(notesDir, `${plan.oldPath}.annotations.json`)
        const currentAnn = path.join(notesDir, `${plan.newPath}.annotations.json`)
        if (fs.existsSync(currentAnn)) {
          try {
            fs.renameSync(currentAnn, oldAnn)
          } catch {}
        }
      }
    }

    // 2. Restaurer le contenu exact d'origine de chaque fichier impacté
    for (const file of plan.affectedFiles) {
      const fullPath = path.join(notesDir, file.relativePath)
      if (fs.existsSync(fullPath)) {
        writeAtomic(fullPath, file.originalContent)
      }
    }

    // 3. Supprimer le fichier de log de cette opération
    try {
      const opFile = path.join(getOperationsDir(notesDir), `${record.operationId}.json`)
      if (fs.existsSync(opFile)) {
        fs.unlinkSync(opFile)
      }
    } catch (err) {
      console.warn('[undoRenameOrMove] Nettoyage du log impossible:', err)
    }

    return { success: true, restoredPath: plan.oldPath }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[undoRenameOrMove] Erreur lors de l’annulation:', err)
    return { success: false, error: message }
  }
}
