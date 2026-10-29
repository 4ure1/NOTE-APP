import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { readConfig, mergeConfig } from './configStore'

describe('configStore', () => {
  let dir: string
  let configFile: string

  beforeEach(() => {
    // Dossier isolé dans %TEMP% : jamais les vraies notes
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-app-config-'))
    configFile = path.join(dir, '.config.json')
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('crée le fichier s’il n’existe pas', () => {
    mergeConfig(configFile, { favorites: ['a.md'] })
    expect(readConfig(configFile)).toEqual({ favorites: ['a.md'] })
  })

  it('garde les clés absentes d’un objet partiel', () => {
    fs.writeFileSync(
      configFile,
      JSON.stringify({ ollamaApiKey: 'cle', ollamaModel: 'qwen', youtubeShortcuts: [1], tags: {} })
    )
    // Comme App.tsx quand on ajoute un favori
    mergeConfig(configFile, { favorites: ['a.md'], tags: { 'a.md': ['cours'] } })
    expect(readConfig(configFile)).toEqual({
      ollamaApiKey: 'cle',
      ollamaModel: 'qwen',
      youtubeShortcuts: [1],
      favorites: ['a.md'],
      tags: { 'a.md': ['cours'] }
    })
  })

  it('remplace une clé fournie, y compris par une valeur vide', () => {
    fs.writeFileSync(configFile, JSON.stringify({ ollamaApiKey: 'cle', favorites: ['a.md'] }))
    mergeConfig(configFile, { ollamaApiKey: '', favorites: [] })
    expect(readConfig(configFile)).toEqual({ ollamaApiKey: '', favorites: [] })
  })

  it('met de côté un fichier illisible au lieu de l’écraser', () => {
    fs.writeFileSync(configFile, '{ cassé')
    mergeConfig(configFile, { favorites: [] }, 1234)
    expect(readConfig(configFile)).toEqual({ favorites: [] })
    expect(fs.readFileSync(path.join(dir, '.config.corrupt-1234.json'), 'utf-8')).toBe('{ cassé')
  })

  it('refuse un patch qui n’est pas un objet, sans toucher au fichier', () => {
    fs.writeFileSync(configFile, JSON.stringify({ ollamaApiKey: 'cle' }))
    for (const bad of [null, [], 'texte', 3]) {
      expect(() => mergeConfig(configFile, bad)).toThrow(/objet est attendu/)
    }
    expect(readConfig(configFile)).toEqual({ ollamaApiKey: 'cle' })
  })

  it('readConfig renvoie {} pour un fichier absent, illisible ou qui n’est pas un objet', () => {
    expect(readConfig(configFile)).toEqual({})
    fs.writeFileSync(configFile, '[1, 2]')
    expect(readConfig(configFile)).toEqual({})
    fs.writeFileSync(configFile, 'pas du json')
    expect(readConfig(configFile)).toEqual({})
  })
})
