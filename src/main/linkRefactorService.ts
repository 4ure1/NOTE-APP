import fs from 'fs'
import path from 'path'
import {
  buildRenamePlan,
  normalizePosix,
  RenameOperationPlan,
  VaultFileRef
} from '../shared/linkUpdater'
import { saveSnapshot } from './versionHistory'
import { assertSafeNotePath, assertSafeFileName, isOperationId } from './agent/security'

// Plans préparés par le main : le renderer ne renvoie que leur identifiant
const PLAN_TTL_MS = 10 * 60 * 1000
const preparedPlans = new Map<string, { plan: RenameOperationPlan; createdAt: number }>()
const TEXT_EXTENSIONS = ['.html', '.htm', '.md', '.markdown']

function rememberPlan(plan: RenameOperationPlan): RenameOperationPlan {
  const now = Date.now()
  for (const [id, entry] of preparedPlans) {
    if (now - entry.createdAt > PLAN_TTL_MS) preparedPlans.delete(id)
  }
  const planId = `plan_${now}_${Math.random().toString(36).slice(2, 10)}`
  const stored = { ...plan, planId }
  preparedPlans.set(planId, { plan: stored, createdAt: now })
  return stored
}

// Revalide chaque chemin d'un plan (préparé ici ou relu depuis le journal d'annulation sur disque)
function assertPlanPaths(notesDir: string, plan: RenameOperationPlan): void {
  assertSafeNotePath(notesDir, plan.oldPath)
  assertSafeNotePath(notesDir, plan.newPath)
  for (const file of plan.affectedFiles) {
    assertSafeNotePath(notesDir, file.relativePath)
    if (!TEXT_EXTENSIONS.includes(path.extname(file.relativePath).toLowerCase())) {
      throw new Error(`Accès refusé : "${file.relativePath}" n'est pas une note texte.`)
    }
  }
}

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
  const oldFullPath = assertSafeNotePath(notesDir, normOld)
  const actualIsFolder = fs.existsSync(oldFullPath)
    ? fs.statSync(oldFullPath).isDirectory()
    : isFolder

  // Renommage : un nom simple ; déplacement : un dossier du vault (racine permise)
  if (isMove) {
    assertSafeNotePath(notesDir, newTarget.trim(), { allowRoot: true })
  } else {
    assertSafeFileName(newTarget.trim())
  }
  const newPath = computeTargetNewPath(oldRelativePath, newTarget, actualIsFolder, isMove)
  const newFullPath = assertSafeNotePath(notesDir, newPath)

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

  return rememberPlan(plan)
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
  planRef: Pick<RenameOperationPlan, 'planId'> & Partial<RenameOperationPlan>
): Promise<{ success: boolean; operationId?: string; newPath: string; error?: string }> {
  // Seul le plan conservé ici fait foi : chemins et contenus envoyés par le renderer sont ignorés
  const entry = planRef?.planId ? preparedPlans.get(planRef.planId) : undefined
  if (planRef?.planId) preparedPlans.delete(planRef.planId)
  if (!entry || Date.now() - entry.createdAt > PLAN_TTL_MS) {
    return {
      success: false,
      newPath: String(planRef?.newPath ?? ''),
      error: 'Plan de renommage inconnu ou expiré : relance l’opération.'
    }
  }
  const plan = entry.plan

  if (plan.hasCollision) {
    return {
      success: false,
      newPath: plan.newPath,
      error: plan.collisionError || 'Collision détectée'
    }
  }

  let oldFullPath: string
  let newFullPath: string
  try {
    assertPlanPaths(notesDir, plan)
    oldFullPath = assertSafeNotePath(notesDir, plan.oldPath)
    newFullPath = assertSafeNotePath(notesDir, plan.newPath)
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    return { success: false, newPath: plan.newPath, error }
  }

  // Une note modifiée depuis la préparation serait écrasée par un contenu périmé : on abandonne
  for (const file of plan.affectedFiles) {
    const fullPath = path.join(notesDir, file.relativePath)
    const current = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf-8') : null
    if (current !== file.originalContent) {
      return {
        success: false,
        newPath: plan.newPath,
        error: `La note "${file.relativePath}" a changé depuis la préparation : relance l’opération.`
      }
    }
  }

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

  if (operationId !== undefined && !isOperationId(operationId)) {
    return { success: false, error: 'Accès refusé : identifiant d’opération invalide.' }
  }

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
  // Le journal peut venir du disque (.history/link_operations) : ses chemins sont revalidés
  try {
    assertPlanPaths(notesDir, plan)
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
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
