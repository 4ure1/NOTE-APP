import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

/**
 * Empreintes SHA-256 des notes : la version du disque sur laquelle s'appuie l'éditeur.
 *
 * Mises à jour par : read-note, write-note (après écriture), restore-note-version, renommages et
 * déplacements (y compris avec mise à jour des liens), car l'éditeur reçoit alors le même contenu.
 * Jamais par l'agent ni par un autre programme : leurs écritures sur la note ouverte doivent apparaître
 * comme une modification externe (code EXTERNAL_CHANGE) au lieu d'être écrasées en silence.
 */

export type ExternalChangeReason = 'changed' | 'deleted' | 'unknown'

export function hashBytes(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

/**
 * Règle de conflit, à partir de l'empreinte connue et de celle du disque (null : fichier absent).
 * - connue, identique au disque : pas de conflit ;
 * - connue, différente : modifiée par un autre programme ;
 * - connue, fichier absent : supprimée ou déplacée par un autre programme ;
 * - inconnue (jamais lue dans cette session), fichier présent : conflit, on ne l'écrase pas à l'aveugle ;
 * - inconnue, fichier absent : création, pas de conflit.
 */
export function detectExternalChange(
  known: string | undefined,
  onDisk: string | null
): ExternalChangeReason | null {
  if (known === undefined) return onDisk === null ? null : 'unknown'
  if (onDisk === null) return 'deleted'
  return known === onDisk ? null : 'changed'
}

export function externalChangeMessage(reason: ExternalChangeReason, name: string): string {
  switch (reason) {
    case 'changed':
      return `« ${name} » a été modifiée par un autre programme depuis son ouverture.`
    case 'deleted':
      return `« ${name} » a été supprimée ou déplacée par un autre programme.`
    case 'unknown':
      return `« ${name} » n'a pas été lue dans cette session : elle ne sera pas écrasée sans confirmation.`
  }
}

export class NoteFingerprints {
  private readonly hashes = new Map<string, string>()

  private key(fullPath: string): string {
    const resolved = path.resolve(fullPath)
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved
  }

  recordBytes(fullPath: string, bytes: Buffer): void {
    this.hashes.set(this.key(fullPath), hashBytes(bytes))
  }

  // Après une écriture : empreinte des octets réellement sur le disque (BOM et CRLF compris)
  recordFromDisk(fullPath: string): void {
    if (fs.existsSync(fullPath)) this.recordBytes(fullPath, fs.readFileSync(fullPath))
    else this.forget(fullPath)
  }

  // Oublie un fichier, ou tout un dossier et son contenu
  forget(fullPath: string): void {
    const base = this.key(fullPath)
    for (const key of Array.from(this.hashes.keys())) {
      if (key === base || key.startsWith(base + path.sep)) this.hashes.delete(key)
    }
  }

  // Renommage ou déplacement d'un fichier ou d'un dossier fait par l'app
  move(oldFullPath: string, newFullPath: string): void {
    const oldBase = this.key(oldFullPath)
    const newBase = this.key(newFullPath)
    if (oldBase === newBase) return
    for (const [key, hash] of Array.from(this.hashes.entries())) {
      if (key === oldBase || key.startsWith(oldBase + path.sep)) {
        this.hashes.delete(key)
        this.hashes.set(newBase + key.slice(oldBase.length), hash)
      }
    }
  }

  check(fullPath: string): ExternalChangeReason | null {
    const onDisk = fs.existsSync(fullPath) ? hashBytes(fs.readFileSync(fullPath)) : null
    return detectExternalChange(this.hashes.get(this.key(fullPath)), onDisk)
  }
}

// Instance unique du processus main
export const noteFingerprints = new NoteFingerprints()
