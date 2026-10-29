import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  NoteFingerprints,
  detectExternalChange,
  externalChangeMessage,
  hashBytes
} from './noteFingerprints'

describe('detectExternalChange', () => {
  const h = 'a'.repeat(64)
  const other = 'b'.repeat(64)

  it('pas de conflit si le disque correspond à l’empreinte connue', () => {
    expect(detectExternalChange(h, h)).toBeNull()
  })

  it('modifiée, supprimée, inconnue', () => {
    expect(detectExternalChange(h, other)).toBe('changed')
    expect(detectExternalChange(h, null)).toBe('deleted')
    expect(detectExternalChange(undefined, other)).toBe('unknown')
  })

  it('création d’un fichier absent sans empreinte : pas de conflit', () => {
    expect(detectExternalChange(undefined, null)).toBeNull()
  })

  it('messages en français avec le nom de la note', () => {
    expect(externalChangeMessage('changed', 'a.html')).toContain('« a.html » a été modifiée')
    expect(externalChangeMessage('deleted', 'a.html')).toContain('supprimée ou déplacée')
    expect(externalChangeMessage('unknown', 'a.html')).toContain("n'a pas été lue")
  })
})

describe('NoteFingerprints', () => {
  let dir: string
  let fp: NoteFingerprints

  // Lecture comme read-note : octets lus puis empreinte enregistrée
  const read = (registry: NoteFingerprints, file: string): string => {
    const bytes = fs.readFileSync(file)
    registry.recordBytes(file, bytes)
    return bytes.toString('utf-8')
  }

  beforeEach(() => {
    // Dossier isolé dans %TEMP% : jamais les vraies notes
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-app-fingerprints-'))
    fp = new NoteFingerprints()
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('note lue puis enregistrée par l’app : jamais de conflit', () => {
    const note = path.join(dir, 'a.html')
    fs.writeFileSync(note, 'v1')
    read(fp, note)
    expect(fp.check(note)).toBeNull()
    fs.writeFileSync(note, 'v2') // écriture de l'app…
    fp.recordFromDisk(note) // …suivie de l'enregistrement de l'empreinte
    expect(fp.check(note)).toBeNull()
  })

  it('détecte une écriture d’un autre programme (ou de l’agent) depuis la lecture', () => {
    const note = path.join(dir, 'a.html')
    fs.writeFileSync(note, 'v1')
    read(fp, note)
    fs.writeFileSync(note, 'v1 + ajout externe')
    expect(fp.check(note)).toBe('changed')
  })

  it('détecte une simple conversion de fins de ligne par un autre éditeur', () => {
    const note = path.join(dir, 'a.md')
    fs.writeFileSync(note, 'a\r\nb\r\n')
    read(fp, note)
    fs.writeFileSync(note, 'a\nb\n')
    expect(fp.check(note)).toBe('changed')
  })

  it('détecte une suppression externe', () => {
    const note = path.join(dir, 'a.html')
    fs.writeFileSync(note, 'v1')
    read(fp, note)
    fs.rmSync(note)
    expect(fp.check(note)).toBe('deleted')
  })

  it('refuse d’écraser une note présente mais jamais lue', () => {
    const note = path.join(dir, 'a.html')
    fs.writeFileSync(note, 'v1')
    expect(fp.check(note)).toBe('unknown')
  })

  it('accepte la création d’une note qui n’existe pas', () => {
    expect(fp.check(path.join(dir, 'nouvelle.html'))).toBeNull()
  })

  it('relancer l’app avec des onglets ouverts ne crée pas de conflit', () => {
    const note = path.join(dir, 'onglet.html')
    fs.writeFileSync(note, 'contenu')
    read(fp, note)
    // Redémarrage : nouveau processus main, registre vide ; l'onglet restauré relit la note
    const afterRestart = new NoteFingerprints()
    read(afterRestart, note)
    expect(afterRestart.check(note)).toBeNull()
    // …et la frappe suivante s'enregistre sans conflit
    fs.writeFileSync(note, 'contenu modifié')
    afterRestart.recordFromDisk(note)
    expect(afterRestart.check(note)).toBeNull()
  })

  it('suit le renommage d’une note et le déplacement d’un dossier', () => {
    fs.mkdirSync(path.join(dir, 'cours'))
    const a = path.join(dir, 'cours', 'a.html')
    fs.writeFileSync(a, 'A')
    read(fp, a)

    const renamed = path.join(dir, 'cours', 'b.html')
    fs.renameSync(a, renamed)
    fp.move(a, renamed)
    expect(fp.check(renamed)).toBeNull()

    const movedDir = path.join(dir, 'archives')
    fs.renameSync(path.join(dir, 'cours'), movedDir)
    fp.move(path.join(dir, 'cours'), movedDir)
    expect(fp.check(path.join(movedDir, 'b.html'))).toBeNull()
  })

  it('ne déplace pas un dossier voisin au nom proche', () => {
    const near = path.join(dir, 'cours-2', 'x.html')
    fs.mkdirSync(path.dirname(near))
    fs.writeFileSync(near, 'X')
    read(fp, near)
    fp.move(path.join(dir, 'cours'), path.join(dir, 'archives'))
    expect(fp.check(near)).toBeNull()
  })

  it('oublie une note ou un dossier supprimé par l’app', () => {
    const note = path.join(dir, 'sous', 'a.html')
    fs.mkdirSync(path.dirname(note))
    fs.writeFileSync(note, 'A')
    read(fp, note)
    fp.forget(path.join(dir, 'sous'))
    expect(fp.check(note)).toBe('unknown')
  })

  it.skipIf(process.platform !== 'win32')('ignore la casse des chemins sous Windows', () => {
    const note = path.join(dir, 'Note.html')
    fs.writeFileSync(note, 'v1')
    read(fp, note)
    expect(fp.check(path.join(dir, 'note.HTML'))).toBeNull()
  })

  it('hashBytes : SHA-256 hexadécimal', () => {
    expect(hashBytes(Buffer.from(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    )
  })
})
