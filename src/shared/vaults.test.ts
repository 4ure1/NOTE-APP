import { describe, it, expect } from 'vitest'
import {
  normalizeVaultKey,
  sameVaultPath,
  defaultVaultName,
  sanitizeVaultFolderName,
  sanitizeVaults,
  addVault,
  removeVault,
  renameVault,
  ensureVaults,
  findVaultByPath,
  type Vault
} from './vaults'

const ids = (): (() => string) => {
  let n = 0
  return () => `v${++n}`
}

describe('normalizeVaultKey', () => {
  it('unifie casse, séparateurs, doublons et séparateur final', () => {
    expect(normalizeVaultKey('C:\\Users\\Me\\Notes')).toBe('c:\\users\\me\\notes')
    expect(normalizeVaultKey('c:/users/me/notes/')).toBe('c:\\users\\me\\notes')
    expect(normalizeVaultKey('C:\\\\Users\\Me\\\\Notes\\\\')).toBe('c:\\users\\me\\notes')
    expect(normalizeVaultKey('  C:\\Notes\\.\\  ')).toBe('c:\\notes')
  })

  it('garde la racine d’un disque et les chemins réseau', () => {
    expect(normalizeVaultKey('D:')).toBe('d:\\')
    expect(normalizeVaultKey('D:\\')).toBe('d:\\')
    expect(normalizeVaultKey('\\\\serveur\\partage\\Notes\\')).toBe('\\\\serveur\\partage\\notes')
  })

  it('ne confond pas un dossier et son voisin', () => {
    expect(sameVaultPath('C:\\Notes', 'C:\\Notes2')).toBe(false)
    expect(sameVaultPath('C:\\Notes', 'c:/NOTES')).toBe(true)
  })
})

describe('noms', () => {
  it('defaultVaultName prend le dernier segment', () => {
    expect(defaultVaultName('C:\\Users\\Me\\Cours\\')).toBe('Cours')
    expect(defaultVaultName('/home/me/notes')).toBe('notes')
    expect(defaultVaultName('C:\\')).toBe('Coffre')
  })

  it('sanitizeVaultFolderName retire les caractères interdits et refuse les noms réservés', () => {
    expect(sanitizeVaultFolderName('  Cours: S1 / maths?  ')).toBe('Cours S1 maths')
    expect(sanitizeVaultFolderName('Projet...')).toBe('Projet')
    expect(sanitizeVaultFolderName('..')).toBe('')
    expect(sanitizeVaultFolderName('CON')).toBe('')
    expect(sanitizeVaultFolderName('nul.txt')).toBe('')
    expect(sanitizeVaultFolderName('a\u0000b')).toBe('ab')
    expect(sanitizeVaultFolderName(42)).toBe('')
  })
})

describe('sanitizeVaults', () => {
  it('ignore les entrées invalides et dédoublonne ids et chemins', () => {
    const raw = [
      { id: 'a', name: 'Cours', path: 'C:\\Cours' },
      { id: 'b', name: 'Doublon', path: 'c:/cours/' },
      { id: 'a', name: 'Même id', path: 'C:\\Autre' },
      { id: 'c', path: 'D:\\Perso' },
      { id: '', path: 'E:\\x' },
      null,
      'texte',
      { id: 'd', name: 'x' }
    ]
    expect(sanitizeVaults(raw)).toEqual([
      { id: 'a', name: 'Cours', path: 'C:\\Cours' },
      { id: 'c', name: 'Perso', path: 'D:\\Perso' }
    ])
    expect(sanitizeVaults({})).toEqual([])
  })
})

describe('addVault / removeVault / renameVault', () => {
  it('ajoute puis renvoie le coffre existant pour le même dossier écrit autrement', () => {
    const makeId = ids()
    const first = addVault([], 'C:\\Cours', makeId)
    expect(first.added).toBe(true)
    expect(first.vault).toEqual({ id: 'v1', name: 'Cours', path: 'C:\\Cours' })
    const again = addVault(first.vaults, 'c:/COURS/', makeId, 'Autre nom')
    expect(again.added).toBe(false)
    expect(again.vault.id).toBe('v1')
    expect(again.vaults).toHaveLength(1)
  })

  it('évite un id déjà pris', () => {
    const list: Vault[] = [{ id: 'v1', name: 'A', path: 'C:\\A' }]
    expect(addVault(list, 'C:\\B', ids(), 'B').vault.id).toBe('v2')
  })

  it('retire sans toucher aux autres', () => {
    const list: Vault[] = [
      { id: 'a', name: 'A', path: 'C:\\A' },
      { id: 'b', name: 'B', path: 'C:\\B' }
    ]
    expect(removeVault(list, 'a')).toEqual([{ id: 'b', name: 'B', path: 'C:\\B' }])
    expect(removeVault(list, 'zzz')).toEqual(list)
  })

  it('renomme avec un nom nettoyé, refuse le vide et l’inconnu', () => {
    const list: Vault[] = [{ id: 'a', name: 'A', path: 'C:\\A' }]
    const ok = renameVault(list, 'a', '  Mes   cours ')
    expect(ok.ok && ok.vaults[0].name).toBe('Mes cours')
    expect(renameVault(list, 'a', '   ').ok).toBe(false)
    expect(renameVault(list, 'x', 'Nom').ok).toBe(false)
  })
})

describe('ensureVaults', () => {
  it('liste vide : le dossier par défaut devient le coffre actif', () => {
    const res = ensureVaults([], undefined, undefined, 'C:\\Users\\Me\\Notes', ids())
    expect(res.vaults).toEqual([{ id: 'v1', name: 'Notes', path: 'C:\\Users\\Me\\Notes' }])
    expect(res.active.id).toBe('v1')
  })

  it('reprend l’ancien notesDir comme coffre actif', () => {
    const res = ensureVaults([], undefined, 'D:\\Cours', 'C:\\Users\\Me\\Notes', ids())
    expect(res.vaults.map((v) => v.path)).toEqual(['D:\\Cours'])
    expect(res.active.path).toBe('D:\\Cours')
  })

  it('n’ajoute pas deux fois l’ancien notesDir et garde le coffre actif connu', () => {
    const list: Vault[] = [
      { id: 'a', name: 'A', path: 'D:\\Cours' },
      { id: 'b', name: 'B', path: 'E:\\Perso' }
    ]
    const res = ensureVaults(list, 'b', 'd:/cours', 'C:\\N', ids())
    expect(res.vaults).toHaveLength(2)
    expect(res.active.id).toBe('b')
  })

  it('coffre actif inconnu : le premier de la liste', () => {
    const list: Vault[] = [{ id: 'a', name: 'A', path: 'D:\\Cours' }]
    expect(ensureVaults(list, 'zzz', undefined, 'C:\\N', ids()).active.id).toBe('a')
    expect(findVaultByPath(list, 'd:\\COURS\\')?.id).toBe('a')
  })
})
