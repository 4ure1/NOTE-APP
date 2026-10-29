import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

/**
 * Écritures atomiques des fichiers du dossier de notes : fichier temporaire dans le même dossier,
 * fsync, puis rename par-dessus l'original. En cas d'échec, l'original reste intact.
 *
 * Synchrone comme le reste du fs du main : un gestionnaire IPC s'exécute d'un bout à l'autre, donc deux
 * écritures du même fichier ne peuvent pas s'entremêler et la dernière reçue gagne.
 */

// Temporaires : ".<nom>.<pid>-<aléa>.nftmp" (point initial : ignorés par l'arbre, l'index et le watcher)
export const TEMP_SUFFIX = '.nftmp'
const TEMP_NAME = /^\.(.+)\.\d+-[0-9a-f]+\.nftmp$/
// Anciens temporaires (writeAtomic, annotations, modèles) : "<nom>.tmp_<Date.now()>_<aléa>", soit
// exactement 13 chiffres puis 1 à 4 caractères de Math.random().toString(36).slice(2, 6)
const LEGACY_TEMP_NAME = /^(.+)\.tmp_\d{13}_[a-z0-9]{1,4}$/

// Dossier où sont rangés les temporaires orphelins dont le contenu diffère de l'original
export const RECOVERY_DIR = '.recovery'

// Verrous passagers sous Windows (antivirus, OneDrive, indexeur, fichier ouvert ailleurs)
const RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES'])
const RETRY_DELAYS_MS = [50, 100, 200, 400]
// Un orphelin plus récent appartient peut-être à une écriture en cours : on le laisse
const ORPHAN_MIN_AGE_MS = 60 * 1000

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf])

export class AtomicWriteError extends Error {
  readonly code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'AtomicWriteError'
    this.code = code
  }
}

export interface AtomicWriteOptions {
  // Notes : conserver le BOM et les fins de ligne CRLF de l'original, refuser un original non UTF-8
  preserveFormat?: boolean
}

export function isTempFileName(name: string): boolean {
  return TEMP_NAME.test(name) || LEGACY_TEMP_NAME.test(name)
}

// Nom du fichier visé par un temporaire, ou null si ce n'en est pas un
export function originalNameOfTemp(name: string): string | null {
  const match = TEMP_NAME.exec(name) || LEGACY_TEMP_NAME.exec(name)
  return match ? match[1] : null
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function errorCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException)?.code
}

function removeQuietly(filePath: string): void {
  try {
    fs.rmSync(filePath, { force: true })
  } catch (err) {
    console.error('[AtomicWrite] Temporaire non supprimé :', filePath, err)
  }
}

/**
 * Encode le nouveau contenu d'une note en reprenant le format de l'original : BOM UTF-8 éventuel
 * et fins de ligne CRLF si l'original les utilise majoritairement.
 */
export function encodeLikeOriginal(original: Buffer | null, content: string, name = ''): Buffer {
  if (!original) return Buffer.from(content, 'utf-8')

  let originalText: string
  try {
    originalText = new TextDecoder('utf-8', { fatal: true }).decode(original)
  } catch {
    throw new AtomicWriteError(
      `« ${name} » n'est pas encodé en UTF-8 : écriture refusée pour ne pas le corrompre.`,
      'ENOTUTF8'
    )
  }

  const hasBom = original.subarray(0, 3).equals(UTF8_BOM)
  let body = content.startsWith('﻿') ? content.slice(1) : content

  const crlfCount = (originalText.match(/\r\n/g) || []).length
  const lfCount = (originalText.match(/\n/g) || []).length
  if (crlfCount > 0 && crlfCount * 2 >= lfCount) {
    body = body.replace(/\r?\n/g, '\r\n')
  }

  const encoded = Buffer.from(body, 'utf-8')
  return hasBom ? Buffer.concat([UTF8_BOM, encoded]) : encoded
}

function tempPathFor(filePath: string): string {
  const suffix = `${process.pid}-${crypto.randomBytes(4).toString('hex')}${TEMP_SUFFIX}`
  return path.join(path.dirname(filePath), `.${path.basename(filePath)}.${suffix}`)
}

// Remplace l'original par le temporaire, avec quelques essais courts si Windows verrouille le fichier
function commitTemp(tempPath: string, filePath: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(tempPath, filePath)
      return
    } catch (err) {
      const code = errorCode(err)
      if (code && RETRY_CODES.has(code) && attempt < RETRY_DELAYS_MS.length) {
        sleepSync(RETRY_DELAYS_MS[attempt])
        continue
      }
      removeQuietly(tempPath)
      const name = path.basename(filePath)
      const reason =
        code && RETRY_CODES.has(code)
          ? 'est verrouillé par un autre programme (antivirus, OneDrive, fichier ouvert ailleurs)'
          : `n'a pas pu être remplacé (${(err as Error).message})`
      throw new AtomicWriteError(
        `« ${name} » ${reason} : rien n'a été écrit, le fichier d'origine est intact.`,
        code
      )
    }
  }
}

export function writeFileAtomic(
  filePath: string,
  data: string | Buffer,
  options: AtomicWriteOptions = {}
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })

  let bytes: Buffer
  if (typeof data !== 'string') {
    bytes = data
  } else if (options.preserveFormat) {
    const original = fs.existsSync(filePath) ? fs.readFileSync(filePath) : null
    bytes = encodeLikeOriginal(original, data, path.basename(filePath))
  } else {
    bytes = Buffer.from(data, 'utf-8')
  }

  const tempPath = tempPathFor(filePath)
  let fd: number | null = null
  try {
    fd = fs.openSync(tempPath, 'wx')
    fs.writeFileSync(fd, bytes)
    fs.fsyncSync(fd)
    fs.closeSync(fd)
    fd = null
  } catch (err) {
    if (fd !== null) {
      try {
        fs.closeSync(fd)
      } catch (closeErr) {
        console.error('[AtomicWrite] Fermeture du temporaire impossible :', closeErr)
      }
    }
    removeQuietly(tempPath)
    throw new AtomicWriteError(
      `Écriture impossible pour « ${path.basename(filePath)} » : ${(err as Error).message}`,
      errorCode(err)
    )
  }

  commitTemp(tempPath, filePath)
}

// Copie atomique (imports) : copie vers un temporaire du dossier cible, puis rename
export function copyFileAtomic(srcPath: string, destPath: string): void {
  fs.mkdirSync(path.dirname(destPath), { recursive: true })
  const tempPath = tempPathFor(destPath)
  try {
    fs.copyFileSync(srcPath, tempPath, fs.constants.COPYFILE_EXCL)
  } catch (err) {
    removeQuietly(tempPath)
    throw new AtomicWriteError(
      `Copie impossible vers « ${path.basename(destPath)} » : ${(err as Error).message}`,
      errorCode(err)
    )
  }
  commitTemp(tempPath, destPath)
}

export interface TempCleanupReport {
  removed: string[]
  recovered: string[]
}

function filesEqual(a: string, b: string): boolean {
  try {
    return fs.readFileSync(a).equals(fs.readFileSync(b))
  } catch {
    return false
  }
}

/**
 * Au démarrage : supprime les temporaires orphelins identiques à leur original et range les autres
 * dans .recovery/<horodatage>/ en gardant leur chemin relatif. Chemins renvoyés en POSIX.
 */
export function cleanupTempFiles(notesDir: string, now = Date.now()): TempCleanupReport {
  const report: TempCleanupReport = { removed: [], recovered: [] }
  const root = path.resolve(notesDir)
  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-')

  const walk = (dir: string): void => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (err) {
      console.error('[AtomicWrite] Dossier illisible pendant le nettoyage :', dir, err)
      return
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (dir === root && entry.name === RECOVERY_DIR) continue
        if (entry.name === 'node_modules') continue
        walk(fullPath)
        continue
      }
      if (!entry.isFile()) continue
      const originalName = originalNameOfTemp(entry.name)
      if (!originalName) continue

      try {
        if (now - fs.statSync(fullPath).mtimeMs < ORPHAN_MIN_AGE_MS) continue
        const rel = path.relative(root, fullPath).split(path.sep).join('/')
        const originalPath = path.join(dir, originalName)
        if (fs.existsSync(originalPath) && filesEqual(fullPath, originalPath)) {
          fs.rmSync(fullPath, { force: true })
          report.removed.push(rel)
          continue
        }
        const relDir = path.relative(root, dir)
        const target = path.join(root, RECOVERY_DIR, stamp, relDir, originalName)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        let finalTarget = target
        for (let n = 1; fs.existsSync(finalTarget); n++) finalTarget = `${target} (${n})`
        fs.renameSync(fullPath, finalTarget)
        report.recovered.push(path.relative(root, finalTarget).split(path.sep).join('/'))
      } catch (err) {
        console.error('[AtomicWrite] Orphelin non traité :', fullPath, err)
      }
    }
  }

  walk(root)
  return report
}
