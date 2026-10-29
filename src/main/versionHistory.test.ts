import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getVersionContent, getHistory, saveSnapshot, ensureSnapshot } from './versionHistory'

let vault: string

beforeEach(() => {
  vault = fs.mkdtempSync(path.join(os.tmpdir(), 'note-app-history-'))
})

afterEach(() => {
  fs.rmSync(vault, { recursive: true, force: true })
})

describe('getVersionContent', () => {
  it('lit un instantané existant', async () => {
    const dir = path.join(vault, '.history', 'cours_note_md')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, '1730140000000.json'), JSON.stringify({ content: 'v1' }))
    expect(await getVersionContent(vault, 'cours/note.md', '1730140000000')).toBe('v1')
  })

  it('refuse un identifiant qui sortirait du dossier d’historique', async () => {
    // Un .json placé hors de .history ne doit jamais être lu via versionId
    fs.writeFileSync(path.join(vault, 'piege.json'), JSON.stringify({ content: 'fuite' }))
    expect(await getVersionContent(vault, 'cours/note.md', '../../piege')).toBeNull()
    expect(await getVersionContent(vault, 'cours/note.md', '..\\..\\piege')).toBeNull()
    expect(await getVersionContent(vault, 'cours/note.md', '12a')).toBeNull()
  })
})

describe('ensureSnapshot (instantané forcé avant restauration)', () => {
  const contents = async (rel: string): Promise<string[]> => {
    const items = await getHistory(vault, rel)
    return Promise.all(items.map(async (i) => (await getVersionContent(vault, rel, i.id)) ?? ''))
  }

  it('enregistre l’état courant même juste après un autre instantané (pas de délai de 90 s)', async () => {
    expect(await saveSnapshot(vault, 'note.md', 'v1')).toBe(true)
    // Une sauvegarde normale à moins de 90 s est ignorée…
    expect(await saveSnapshot(vault, 'note.md', 'v2 tapée juste après')).toBe(false)
    // …mais l'instantané forcé la conserve
    expect(await ensureSnapshot(vault, 'note.md', 'v2 tapée juste après')).toBe(true)
    expect(await contents('note.md')).toEqual(['v2 tapée juste après', 'v1'])
  })

  it('n’ajoute rien si le dernier instantané a déjà ce contenu', async () => {
    await ensureSnapshot(vault, 'note.md', 'v1')
    expect(await ensureSnapshot(vault, 'note.md', 'v1')).toBe(true)
    expect(await contents('note.md')).toEqual(['v1'])
  })

  it('garde deux instantanés distincts écrits dans la même milliseconde', async () => {
    const realNow = Date.now
    Date.now = (): number => 1_800_000_000_000
    try {
      await ensureSnapshot(vault, 'note.md', 'état courant')
      await ensureSnapshot(vault, 'note.md', 'version restaurée')
    } finally {
      Date.now = realNow
    }
    expect(await contents('note.md')).toEqual(['version restaurée', 'état courant'])
  })

  it('considère une note vide comme déjà conservée', async () => {
    expect(await ensureSnapshot(vault, 'note.md', '   ')).toBe(true)
    expect(await getHistory(vault, 'note.md')).toEqual([])
  })

  it('renvoie false si l’historique ne peut pas être écrit', async () => {
    // Un fichier à la place du dossier .history rend toute écriture impossible
    fs.writeFileSync(path.join(vault, '.history'), 'pas un dossier')
    expect(await ensureSnapshot(vault, 'note.md', 'contenu')).toBe(false)
  })
})
