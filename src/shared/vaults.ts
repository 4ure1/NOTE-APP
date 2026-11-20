/*! NOTE-APP — © 2026 4URE1 — https://github.com/4ure1 — Tous droits réservés. */
// Coffres-forts : liste des dossiers de notes enregistrés (rangée dans <userData>/app-setup.json).
// Logique pure, sans accès disque : le main valide les dossiers et écrit le fichier.

export interface Vault {
  id: string
  name: string
  // Chemin absolu du dossier (forme Windows ou POSIX, telle que rendue par le système)
  path: string
}

// Coffre tel que rendu à l'interface par list-vaults
export interface VaultInfo extends Vault {
  active: boolean
  // Dossier présent sur le disque (~/Notes compte comme présent : il est créé au besoin)
  exists: boolean
}

export const VAULT_NAME_MAX = 80

// Clé de comparaison d'un chemin : séparateurs unifiés, doublons et séparateur final retirés, casse
// ignorée (Windows). « C:\Notes », « c:/notes/ » et « C:\\Notes » désignent le même coffre.
export function normalizeVaultKey(p: string): string {
  let s = String(p ?? '')
    .trim()
    .replace(/\//g, '\\')
  const unc = s.startsWith('\\\\')
  s = s.replace(/\\{2,}/g, '\\')
  if (unc) s = '\\' + s
  // Segments « . » retirés
  s = s.replace(/\\\.(?=\\|$)/g, '')
  while (s.length > 1 && s.endsWith('\\') && !/^[a-z]:\\$/i.test(s)) s = s.slice(0, -1)
  if (/^[a-z]:$/i.test(s)) s += '\\'
  return s.toLowerCase()
}

export function sameVaultPath(a: string, b: string): boolean {
  return normalizeVaultKey(a) === normalizeVaultKey(b)
}

// Nom proposé pour un coffre : le dernier segment du chemin
export function defaultVaultName(p: string): string {
  const parts = String(p ?? '')
    .split(/[\\/]+/)
    .filter(Boolean)
  const last = parts[parts.length - 1] || ''
  return /^[a-z]:$/i.test(last) || !last ? 'Coffre' : last
}

export function cleanVaultName(name: unknown): string {
  if (typeof name !== 'string') return ''
  // Caractères de contrôle retirés (codes 0-31 et 127)
  const visible = Array.from(name)
    .filter((ch) => ch.charCodeAt(0) > 31 && ch.charCodeAt(0) !== 127)
    .join('')
  return visible.replace(/\s+/g, ' ').trim().slice(0, VAULT_NAME_MAX)
}

const RESERVED_WIN_NAMES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i

/**
 * Nom de dossier sûr pour un nouveau coffre : caractères interdits par Windows retirés, pas de point ni
 * d'espace final, pas de nom réservé (CON, NUL…), pas de « . » ni « .. ». Renvoie '' si rien ne reste.
 */
export function sanitizeVaultFolderName(name: unknown): string {
  let s = cleanVaultName(name)
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
  s = s.replace(/[. ]+$/g, '').trim()
  if (!s || /^\.+$/.test(s) || RESERVED_WIN_NAMES.test(s)) return ''
  return s
}

// Relit une liste venue du JSON : entrées invalides ignorées, chemins et ids dédoublonnés
export function sanitizeVaults(raw: unknown): Vault[] {
  if (!Array.isArray(raw)) return []
  const out: Vault[] = []
  const ids = new Set<string>()
  const keys = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const { id, name, path } = item as Record<string, unknown>
    if (typeof id !== 'string' || !id.trim() || typeof path !== 'string' || !path.trim()) continue
    const key = normalizeVaultKey(path)
    if (ids.has(id) || keys.has(key)) continue
    ids.add(id)
    keys.add(key)
    out.push({ id, name: cleanVaultName(name) || defaultVaultName(path), path: path.trim() })
  }
  return out
}

export function findVaultById(vaults: Vault[], id: unknown): Vault | undefined {
  return typeof id === 'string' ? vaults.find((v) => v.id === id) : undefined
}

export function findVaultByPath(vaults: Vault[], p: string): Vault | undefined {
  const key = normalizeVaultKey(p)
  return vaults.find((v) => normalizeVaultKey(v.path) === key)
}

/**
 * Ajoute un coffre. Si le chemin est déjà enregistré (même dossier écrit autrement), la liste est
 * rendue telle quelle avec le coffre existant et `added: false`.
 */
export function addVault(
  vaults: Vault[],
  p: string,
  makeId: () => string,
  name?: string
): { vaults: Vault[]; vault: Vault; added: boolean } {
  const existing = findVaultByPath(vaults, p)
  if (existing) return { vaults, vault: existing, added: false }
  let id = makeId()
  while (vaults.some((v) => v.id === id)) id = makeId()
  const vault: Vault = { id, name: cleanVaultName(name) || defaultVaultName(p), path: p.trim() }
  return { vaults: [...vaults, vault], vault, added: true }
}

// Retire un coffre de la liste (aucun fichier n'est touché)
export function removeVault(vaults: Vault[], id: string): Vault[] {
  return vaults.filter((v) => v.id !== id)
}

export function renameVault(
  vaults: Vault[],
  id: string,
  name: unknown
): { ok: true; vaults: Vault[] } | { ok: false; error: string } {
  const clean = cleanVaultName(name)
  if (!clean) return { ok: false, error: 'Le nom du coffre ne peut pas être vide.' }
  if (!findVaultById(vaults, id)) return { ok: false, error: 'Coffre inconnu.' }
  return { ok: true, vaults: vaults.map((v) => (v.id === id ? { ...v, name: clean } : v)) }
}

/**
 * Liste effective et coffre actif. Ancien réglage `notesDir` (avant les coffres) repris comme coffre ;
 * liste vide : le dossier par défaut (~/Notes) devient le premier coffre. Coffre actif inconnu : le
 * premier de la liste.
 */
export function ensureVaults(
  vaults: Vault[],
  activeVaultId: string | undefined,
  legacyNotesDir: string | undefined,
  defaultDir: string,
  makeId: () => string,
  defaultName = 'Notes'
): { vaults: Vault[]; active: Vault } {
  let list = vaults
  let activeId = activeVaultId
  if (legacyNotesDir && legacyNotesDir.trim()) {
    const res = addVault(list, legacyNotesDir, makeId)
    list = res.vaults
    if (!findVaultById(list, activeId)) activeId = res.vault.id
  }
  if (list.length === 0) {
    const res = addVault(list, defaultDir, makeId, defaultName)
    list = res.vaults
    activeId = res.vault.id
  }
  const active = findVaultById(list, activeId) || list[0]
  return { vaults: list, active }
}
