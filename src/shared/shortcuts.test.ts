import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_ACTIONS,
  findConflict,
  formatShortcut,
  matchShortcut,
  mergeShortcuts,
  needsModifier,
  remoteCombos,
  sanitizeRemoteCombos,
  type KeyLike,
  type ShortcutMapping
} from './shortcuts'

const key = (
  k: string,
  mods: Partial<{ ctrl: boolean; shift: boolean; alt: boolean; code: string }> = {}
): KeyLike => ({
  key: k,
  code: mods.code,
  ctrlKey: !!mods.ctrl,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt
})

describe('raccourcis par défaut', () => {
  it('chaque action a un raccourci et aucune combinaison n’est en double', () => {
    for (const a of SHORTCUT_ACTIONS) {
      expect(DEFAULT_SHORTCUTS.some((m) => m.actionId === a.id)).toBe(true)
    }
    for (const m of DEFAULT_SHORTCUTS) expect(findConflict(DEFAULT_SHORTCUTS, m)).toBeUndefined()
  })

  it('Ctrl+F n’est plus pris : il reste à la recherche de l’éditeur', () => {
    expect(matchShortcut(DEFAULT_SHORTCUTS, key('f', { ctrl: true }))).toBeUndefined()
    expect(matchShortcut(DEFAULT_SHORTCUTS, key('F', { ctrl: true, shift: true }))?.actionId).toBe(
      'toggle-fullscreen'
    )
  })
})

describe('mergeShortcuts', () => {
  it('garde les raccourcis de l’utilisateur et ajoute les actions manquantes', () => {
    const saved: ShortcutMapping[] = [
      {
        uuid: '1',
        actionId: 'create-note',
        key: 'm',
        ctrlKey: true,
        shiftKey: false,
        altKey: false
      }
    ]
    const merged = mergeShortcuts(saved)
    expect(merged.filter((m) => m.actionId === 'create-note')).toEqual(saved)
    expect(merged.some((m) => m.actionId === 'open-history')).toBe(true)
    expect(new Set(merged.map((m) => m.uuid)).size).toBe(merged.length)
  })

  it('l’ancien Ctrl+F (et F11) du plein écran devient Ctrl+Maj+F', () => {
    const merged = mergeShortcuts([
      {
        uuid: '6',
        actionId: 'toggle-fullscreen',
        key: 'f',
        ctrlKey: true,
        shiftKey: false,
        altKey: false
      }
    ])
    expect(merged.find((m) => m.actionId === 'toggle-fullscreen')).toMatchObject({
      key: 'f',
      ctrlKey: true,
      shiftKey: true
    })
    const fromF11 = mergeShortcuts([
      {
        uuid: '6',
        actionId: 'toggle-fullscreen',
        key: 'F11',
        ctrlKey: false,
        shiftKey: false,
        altKey: false
      }
    ])
    expect(fromF11.find((m) => m.actionId === 'toggle-fullscreen')).toMatchObject({
      key: 'f',
      shiftKey: true
    })
  })

  it('n’impose pas un raccourci par défaut déjà pris par l’utilisateur', () => {
    const merged = mergeShortcuts([
      {
        uuid: 'x',
        actionId: 'create-note',
        key: 'e',
        ctrlKey: true,
        shiftKey: false,
        altKey: false
      }
    ])
    expect(merged.some((m) => m.actionId === 'cycle-editor-mode')).toBe(false)
  })

  it('écarte les entrées mal formées ou d’actions inconnues', () => {
    const merged = mergeShortcuts([{ uuid: 'z', actionId: 'pirate', key: 'q' }, null, 'x'])
    expect(merged.some((m) => m.uuid === 'z')).toBe(false)
    expect(mergeShortcuts('pas un tableau')).toEqual(DEFAULT_SHORTCUTS)
  })
})

describe('matchShortcut', () => {
  it('Cmd vaut Ctrl, majuscules ignorées', () => {
    expect(
      matchShortcut(DEFAULT_SHORTCUTS, {
        key: 'N',
        ctrlKey: false,
        metaKey: true,
        shiftKey: false,
        altKey: false
      })?.actionId
    ).toBe('create-note')
  })

  it('chiffres en AZERTY (Ctrl+& sur la touche 1) et pavé numérique', () => {
    expect(
      matchShortcut(DEFAULT_SHORTCUTS, key('&', { ctrl: true, code: 'Digit1' }))?.actionId
    ).toBe('mode-code')
    expect(
      matchShortcut(DEFAULT_SHORTCUTS, key('3', { ctrl: true, code: 'Numpad3' }))?.actionId
    ).toBe('mode-preview')
  })

  it('zoom : « + » avec ou sans Maj, « = » et pavé numérique', () => {
    expect(matchShortcut(DEFAULT_SHORTCUTS, key('+', { ctrl: true, shift: true }))?.actionId).toBe(
      'zoom-in'
    )
    expect(matchShortcut(DEFAULT_SHORTCUTS, key('=', { ctrl: true }))?.actionId).toBe('zoom-in')
    expect(
      matchShortcut(DEFAULT_SHORTCUTS, key('-', { ctrl: true, code: 'NumpadSubtract' }))?.actionId
    ).toBe('zoom-out')
  })

  it('distingue Ctrl+E et Ctrl+Maj+E', () => {
    expect(matchShortcut(DEFAULT_SHORTCUTS, key('e', { ctrl: true }))?.actionId).toBe(
      'cycle-editor-mode'
    )
    expect(matchShortcut(DEFAULT_SHORTCUTS, key('E', { ctrl: true, shift: true }))?.actionId).toBe(
      'open-export'
    )
  })
})

describe('affichage, saisie et distance', () => {
  it('formate en français', () => {
    expect(formatShortcut({ key: 'Enter', ctrlKey: true, shiftKey: true, altKey: false })).toBe(
      'Ctrl Maj Entrée'
    )
    expect(formatShortcut({ key: 'h', ctrlKey: true, shiftKey: false, altKey: true })).toBe(
      'Ctrl Alt H'
    )
    expect(formatShortcut({ key: '', ctrlKey: false, shiftKey: false, altKey: false })).toBe(
      'Non défini'
    )
  })

  it('une touche seule (Suppr) attend que la saisie soit finie ; F11 non', () => {
    expect(needsModifier(DEFAULT_SHORTCUTS.find((m) => m.actionId === 'delete-note')!)).toBe(true)
    expect(needsModifier(DEFAULT_SHORTCUTS.find((m) => m.actionId === 'toggle-fullscreen')!)).toBe(
      false
    )
  })

  it('la suppression n’est jamais déclenchable depuis l’aperçu ou un site', () => {
    const withCtrlDelete = mergeShortcuts([
      {
        uuid: '2',
        actionId: 'delete-note',
        key: 'Delete',
        ctrlKey: true,
        shiftKey: false,
        altKey: false
      }
    ])
    expect(remoteCombos(withCtrlDelete).some((c) => c.actionId === 'delete-note')).toBe(false)
    expect(remoteCombos(DEFAULT_SHORTCUTS).some((c) => c.actionId === 'toggle-claude')).toBe(true)
  })
})

describe('sanitizeRemoteCombos (IPC vers le main)', () => {
  it('garde les combinaisons valides, refuse la suppression, les touches seules et les intrus', () => {
    expect(
      sanitizeRemoteCombos([
        { actionId: 'toggle-claude', key: 'J', ctrlKey: true, shiftKey: false, altKey: false },
        {
          actionId: 'toggle-fullscreen',
          key: 'F11',
          ctrlKey: false,
          shiftKey: false,
          altKey: false
        },
        { actionId: 'delete-note', key: 'Delete', ctrlKey: true, shiftKey: false, altKey: false },
        { actionId: 'open-search', key: 'p', ctrlKey: false, shiftKey: false, altKey: false },
        {
          actionId: 'toggle-claude',
          key: 'x'.repeat(30),
          ctrlKey: true,
          shiftKey: false,
          altKey: false
        },
        'n’importe quoi'
      ])
    ).toEqual([
      { actionId: 'toggle-claude', key: 'j', ctrlKey: true, shiftKey: false, altKey: false },
      { actionId: 'toggle-fullscreen', key: 'F11', ctrlKey: false, shiftKey: false, altKey: false }
    ])
    expect(sanitizeRemoteCombos(null)).toEqual([])
  })
})
