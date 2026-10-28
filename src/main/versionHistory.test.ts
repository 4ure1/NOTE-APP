import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getVersionContent } from './versionHistory'

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
