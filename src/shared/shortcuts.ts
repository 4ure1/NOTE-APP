/**
 * Raccourcis clavier de l'app : actions, combinaisons par défaut, fusion avec ceux de l'utilisateur,
 * reconnaissance d'une touche et conflits. Un seul registre, consulté par la fenêtre (App.tsx), l'aperçu
 * (iframe) et le main (panneaux web), pour qu'un raccourci modifié le soit partout.
 */

export interface ShortcutMapping {
  uuid: string
  actionId: string
  key: string
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

export const SHORTCUT_GROUPS = ['Notes', 'Navigation', 'Affichage', 'Assistant'] as const
export type ShortcutGroup = (typeof SHORTCUT_GROUPS)[number]

export interface ShortcutAction {
  id: string
  label: string
  /** Rubrique de la page Raccourcis clavier des Paramètres. */
  group: ShortcutGroup
  /** Peut être déclenchée depuis l'aperçu ou un panneau web (jamais la suppression). */
  remote: boolean
}

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  { id: 'create-note', label: 'Nouvelle note', group: 'Notes', remote: true },
  { id: 'create-folder', label: 'Nouveau dossier', group: 'Notes', remote: true },
  { id: 'import-pdf', label: 'Importer un PDF', group: 'Notes', remote: true },
  { id: 'delete-note', label: 'Supprimer la note (corbeille)', group: 'Notes', remote: false },
  { id: 'open-search', label: 'Rechercher dans les notes', group: 'Navigation', remote: true },
  { id: 'open-recent', label: 'Notes récentes', group: 'Navigation', remote: true },
  { id: 'open-board', label: 'Ouvrir le Tableau', group: 'Navigation', remote: true },
  { id: 'open-youtube', label: 'Ouvrir YouTube', group: 'Navigation', remote: true },
  { id: 'toggle-favorite', label: 'Ajouter ou retirer des favoris', group: 'Notes', remote: true },
  {
    id: 'cycle-editor-mode',
    label: 'Alterner Code / Côte à côte / Aperçu',
    group: 'Affichage',
    remote: true
  },
  { id: 'mode-code', label: 'Code seul', group: 'Affichage', remote: true },
  { id: 'mode-split', label: 'Code et aperçu côte à côte', group: 'Affichage', remote: true },
  { id: 'mode-preview', label: 'Aperçu seul', group: 'Affichage', remote: true },
  { id: 'open-history', label: 'Historique des versions', group: 'Notes', remote: true },
  { id: 'open-export', label: 'Exporter la note', group: 'Notes', remote: true },
  { id: 'toggle-outline', label: 'Plan de la note', group: 'Affichage', remote: true },
  { id: 'toggle-zen', label: 'Mode zen', group: 'Affichage', remote: true },
  { id: 'toggle-fullscreen', label: 'Plein écran', group: 'Affichage', remote: true },
  {
    id: 'toggle-sidebar',
    label: 'Afficher ou masquer la barre latérale',
    group: 'Affichage',
    remote: true
  },
  {
    id: 'toggle-claude',
    label: 'Afficher ou masquer l’assistant',
    group: 'Assistant',
    remote: true
  },
  {
    id: 'switch-ai',
    label: 'Changer d’assistant (Claude, ChatGPT, Gemini, local)',
    group: 'Assistant',
    remote: true
  },
  { id: 'send-to-ai', label: 'Envoyer la note à l’assistant', group: 'Assistant', remote: true },
  { id: 'zoom-in', label: 'Zoom avant', group: 'Affichage', remote: true },
  { id: 'zoom-out', label: 'Zoom arrière', group: 'Affichage', remote: true },
  { id: 'zoom-reset', label: 'Zoom à 100 %', group: 'Affichage', remote: true },
  { id: 'open-settings', label: 'Paramètres', group: 'Navigation', remote: true }
]

const combo = (
  uuid: string,
  actionId: string,
  key: string,
  mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}
): ShortcutMapping => ({
  uuid,
  actionId,
  key,
  ctrlKey: !!mods.ctrl,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt
})

export const DEFAULT_SHORTCUTS: ShortcutMapping[] = [
  combo('1', 'create-note', 'n', { ctrl: true }),
  combo('2', 'delete-note', 'Delete'),
  combo('3', 'open-settings', ',', { ctrl: true }),
  combo('4', 'toggle-sidebar', 'b', { ctrl: true }),
  combo('5', 'toggle-claude', 'j', { ctrl: true }),
  combo('6', 'toggle-fullscreen', 'f', { ctrl: true, shift: true }),
  combo('7', 'switch-ai', 'i', { ctrl: true }),
  combo('8', 'open-recent', 'r', { ctrl: true }),
  combo('9', 'open-search', 'p', { ctrl: true }),
  combo('10', 'create-folder', 'n', { ctrl: true, shift: true }),
  combo('11', 'import-pdf', 'o', { ctrl: true }),
  combo('12', 'open-board', 't', { ctrl: true, shift: true }),
  combo('13', 'open-youtube', 'y', { ctrl: true, shift: true }),
  combo('14', 'toggle-favorite', 's', { ctrl: true, shift: true }),
  combo('15', 'cycle-editor-mode', 'e', { ctrl: true }),
  combo('16', 'mode-code', '1', { ctrl: true }),
  combo('17', 'mode-split', '2', { ctrl: true }),
  combo('18', 'mode-preview', '3', { ctrl: true }),
  combo('19', 'open-history', 'h', { ctrl: true, alt: true }),
  combo('20', 'open-export', 'e', { ctrl: true, shift: true }),
  combo('21', 'toggle-outline', 'o', { ctrl: true, shift: true }),
  combo('22', 'toggle-zen', 'Enter', { ctrl: true, shift: true }),
  combo('23', 'send-to-ai', 'j', { ctrl: true, shift: true }),
  combo('24', 'zoom-in', '+', { ctrl: true }),
  combo('25', 'zoom-out', '-', { ctrl: true }),
  combo('26', 'zoom-reset', '0', { ctrl: true })
]

const ACTION_IDS = new Set(SHORTCUT_ACTIONS.map((a) => a.id))

export function actionLabel(actionId: string): string {
  return SHORTCUT_ACTIONS.find((a) => a.id === actionId)?.label || actionId
}

/** Touche telle qu'on la compare : minuscule, « = » et « _ » ramenés à « + » et « - » (même touche). */
export function normalizeKey(key: string): string {
  if (key === 'Space') return ' '
  if (key === '=') return '+'
  if (key === '_') return '-'
  return key.length === 1 ? key.toLowerCase() : key
}

function isValid(m: unknown): m is ShortcutMapping {
  if (!m || typeof m !== 'object') return false
  const r = m as Record<string, unknown>
  return (
    typeof r.uuid === 'string' &&
    typeof r.actionId === 'string' &&
    ACTION_IDS.has(r.actionId) &&
    typeof r.key === 'string' &&
    r.key.length <= 20 &&
    typeof r.ctrlKey === 'boolean' &&
    typeof r.shiftKey === 'boolean' &&
    typeof r.altKey === 'boolean'
  )
}

/**
 * Raccourcis enregistrés + raccourci par défaut de chaque action qui n'en a aucun.
 * Ctrl+F sert à chercher dans la note : le plein écran est sur Ctrl+Maj+F (l'ancien Ctrl+F et le
 * F11 d'une version intermédiaire y passent d'eux-mêmes).
 */
export function mergeShortcuts(saved: unknown): ShortcutMapping[] {
  if (!Array.isArray(saved)) return DEFAULT_SHORTCUTS.map((m) => ({ ...m }))
  const kept = saved.filter(isValid).map((m) => {
    const isOldFullscreen =
      m.actionId === 'toggle-fullscreen' &&
      !m.altKey &&
      ((normalizeKey(m.key) === 'f' && m.ctrlKey && !m.shiftKey) ||
        (m.key === 'F11' && !m.ctrlKey && !m.shiftKey))
    return isOldFullscreen ? { ...m, key: 'f', ctrlKey: true, shiftKey: true } : { ...m }
  })
  const used = new Set(kept.map((m) => m.uuid))
  for (const def of DEFAULT_SHORTCUTS) {
    if (kept.some((m) => m.actionId === def.actionId)) continue
    // Une combinaison déjà prise par l'utilisateur n'est pas imposée : l'action reste sans raccourci
    if (kept.some((m) => m.key && sameCombo(m, def))) continue
    let uuid = def.uuid
    while (used.has(uuid)) uuid += '-d'
    used.add(uuid)
    kept.push({ ...def, uuid })
  }
  return kept
}

export function sameCombo(
  a: Pick<ShortcutMapping, 'key' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
  b: Pick<ShortcutMapping, 'key' | 'ctrlKey' | 'shiftKey' | 'altKey'>
): boolean {
  return (
    normalizeKey(a.key) === normalizeKey(b.key) &&
    a.ctrlKey === b.ctrlKey &&
    a.shiftKey === b.shiftKey &&
    a.altKey === b.altKey
  )
}

/** Autre raccourci qui utilise déjà la même combinaison (pour l'avertissement des Paramètres). */
export function findConflict(
  shortcuts: ShortcutMapping[],
  mapping: ShortcutMapping
): ShortcutMapping | undefined {
  if (!mapping.key) return undefined
  return shortcuts.find((m) => m.uuid !== mapping.uuid && m.key && sameCombo(m, mapping))
}

export interface KeyLike {
  key: string
  /** Touche physique (KeyboardEvent.code) : sert aux chiffres, qui demandent Maj en AZERTY. */
  code?: string
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey?: boolean
}

type Combo = Pick<ShortcutMapping, 'key' | 'ctrlKey' | 'shiftKey' | 'altKey'>

/** Raccourci correspondant à une touche (Cmd vaut Ctrl). */
export function matchShortcut<T extends Combo>(shortcuts: T[], e: KeyLike): T | undefined {
  if (!e.key || ['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return undefined
  const ctrlKey = e.ctrlKey || !!e.metaKey
  const pressed = { key: e.key, ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey }
  return shortcuts.find((m) => {
    if (!m.key) return false
    if (sameCombo(m, pressed)) return true
    // Chiffres et « + » / « - » : selon le clavier ils demandent Maj ; Maj n'est alors pas comparée
    if (m.ctrlKey !== ctrlKey || m.altKey !== e.altKey) return false
    if (/^[0-9]$/.test(m.key)) return e.code === `Digit${m.key}` || e.code === `Numpad${m.key}`
    if (m.key === '+') return normalizeKey(e.key) === '+' || e.code === 'NumpadAdd'
    if (m.key === '-') return normalizeKey(e.key) === '-' || e.code === 'NumpadSubtract'
    return false
  })
}

/** Une touche sans modificateur (sauf F1-F12) ne doit pas agir pendant la saisie. */
export function needsModifier(m: ShortcutMapping): boolean {
  return !m.ctrlKey && !m.altKey && !/^F([1-9]|1[0-2])$/.test(m.key)
}

export function formatShortcut(
  m: Pick<ShortcutMapping, 'key' | 'ctrlKey' | 'shiftKey' | 'altKey'>
): string {
  if (!m.key) return 'Non défini'
  const parts: string[] = []
  if (m.ctrlKey) parts.push('Ctrl')
  if (m.altKey) parts.push('Alt')
  if (m.shiftKey) parts.push('Maj')
  const names: Record<string, string> = {
    ' ': 'Espace',
    Space: 'Espace',
    Delete: 'Suppr',
    Enter: 'Entrée',
    Escape: 'Échap',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→'
  }
  parts.push(names[m.key] || (m.key.length === 1 ? m.key.toUpperCase() : m.key))
  return parts.join(' ')
}

/** Combinaisons transmises à l'aperçu et au main (actions déclenchables à distance seulement). */
export function remoteCombos(
  shortcuts: ShortcutMapping[]
): { actionId: string; key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }[] {
  const remote = new Set(SHORTCUT_ACTIONS.filter((a) => a.remote).map((a) => a.id))
  return shortcuts
    .filter((m) => m.key && remote.has(m.actionId) && !needsModifier(m))
    .map(({ actionId, key, ctrlKey, shiftKey, altKey }) => ({
      actionId,
      key: normalizeKey(key),
      ctrlKey,
      shiftKey,
      altKey
    }))
}

export type RemoteCombo = ReturnType<typeof remoteCombos>[number]

/** Combinaisons reçues par IPC (main) : seules les entrées bien formées d'actions connues et distantes. */
export function sanitizeRemoteCombos(raw: unknown): RemoteCombo[] {
  if (!Array.isArray(raw)) return []
  const remote = new Set(SHORTCUT_ACTIONS.filter((a) => a.remote).map((a) => a.id))
  const out: RemoteCombo[] = []
  for (const item of raw.slice(0, 100)) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    if (
      typeof r.actionId === 'string' &&
      remote.has(r.actionId) &&
      typeof r.key === 'string' &&
      r.key.length > 0 &&
      r.key.length <= 20 &&
      typeof r.ctrlKey === 'boolean' &&
      typeof r.shiftKey === 'boolean' &&
      typeof r.altKey === 'boolean' &&
      (r.ctrlKey || r.altKey || /^F([1-9]|1[0-2])$/.test(r.key))
    ) {
      out.push({
        actionId: r.actionId,
        key: normalizeKey(r.key),
        ctrlKey: r.ctrlKey,
        shiftKey: r.shiftKey,
        altKey: r.altKey
      })
    }
  }
  return out
}
