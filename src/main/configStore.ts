import fs from 'fs'
import path from 'path'
import { writeFileAtomic } from './atomicWrite'

/**
 * Lecture et écriture de .config.json. Les appels du renderer envoient souvent un objet partiel
 * (ex. { favorites, tags }) : on fusionne toujours avec l'existant au lieu de le remplacer.
 */

export type ConfigObject = Record<string, unknown>

function isPlainObject(value: unknown): value is ConfigObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Configuration actuelle ; {} si le fichier est absent ou illisible
export function readConfig(configFile: string): ConfigObject {
  if (!fs.existsSync(configFile)) return {}
  try {
    const parsed = JSON.parse(fs.readFileSync(configFile, 'utf-8'))
    return isPlainObject(parsed) ? parsed : {}
  } catch (err) {
    console.error('[Config] .config.json illisible :', err)
    return {}
  }
}

/**
 * Fusionne `patch` dans la configuration existante (clés de premier niveau) et l'écrit atomiquement.
 * Un fichier existant mais illisible est mis de côté (.config.corrupt-<horodatage>.json), jamais écrasé.
 */
export function mergeConfig(configFile: string, patch: unknown, now = Date.now()): ConfigObject {
  if (!isPlainObject(patch)) {
    throw new Error('Configuration invalide : un objet est attendu.')
  }

  let existing: ConfigObject = {}
  if (fs.existsSync(configFile)) {
    const raw = fs.readFileSync(configFile, 'utf-8')
    let parsed: unknown
    let readable = true
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      readable = false
      console.error('[Config] .config.json illisible, copie mise de côté :', err)
    }
    if (readable && isPlainObject(parsed)) {
      existing = parsed
    } else {
      const backup = path.join(path.dirname(configFile), `.config.corrupt-${now}.json`)
      fs.renameSync(configFile, backup)
    }
  }

  const merged = { ...existing, ...patch }
  writeFileAtomic(configFile, JSON.stringify(merged, null, 2))
  return merged
}
