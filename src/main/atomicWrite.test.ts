import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  writeFileAtomic,
  copyFileAtomic,
  cleanupTempFiles,
  encodeLikeOriginal,
  isTempFileName,
  originalNameOfTemp,
  AtomicWriteError
} from './atomicWrite'

const BOM = Buffer.from([0xef, 0xbb, 0xbf])

function errno(code: string): NodeJS.ErrnoException {
  const err = new Error(`${code}: opération refusée`) as NodeJS.ErrnoException
  err.code = code
  return err
}

describe('atomicWrite', () => {
  let dir: string

  // Fichiers du dossier hors temporaires éventuels
  const tempFilesIn = (d: string): string[] => fs.readdirSync(d).filter((n) => isTempFileName(n))

  beforeEach(() => {
    // Dossier isolé dans %TEMP% : jamais les vraies notes
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-app-atomic-'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  describe('writeFileAtomic', () => {
    it('crée un fichier et ses dossiers parents, sans laisser de temporaire', () => {
      const target = path.join(dir, 'sous', 'dossier', 'note.html')
      writeFileAtomic(target, '<p>été</p>')
      expect(fs.readFileSync(target, 'utf-8')).toBe('<p>été</p>')
      expect(tempFilesIn(path.dirname(target))).toEqual([])
    })

    it('remplace un fichier existant', () => {
      const target = path.join(dir, 'note.md')
      fs.writeFileSync(target, 'ancien')
      writeFileAtomic(target, 'nouveau')
      expect(fs.readFileSync(target, 'utf-8')).toBe('nouveau')
      expect(tempFilesIn(dir)).toEqual([])
    })

    it('écrit un Buffer tel quel', () => {
      const target = path.join(dir, 'doc.pdf')
      const bytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff])
      writeFileAtomic(target, bytes)
      expect(fs.readFileSync(target).equals(bytes)).toBe(true)
    })

    it('réessaie quand Windows verrouille le fichier, puis réussit', () => {
      const target = path.join(dir, 'note.html')
      fs.writeFileSync(target, 'ancien')
      const realRename = fs.renameSync
      let calls = 0
      vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
        calls++
        if (calls <= 2) throw errno('EPERM')
        realRename(from, to)
      })
      writeFileAtomic(target, 'nouveau')
      expect(calls).toBe(3)
      expect(fs.readFileSync(target, 'utf-8')).toBe('nouveau')
      expect(tempFilesIn(dir)).toEqual([])
    })

    it('abandonne après plusieurs essais : original intact, temporaire supprimé, erreur claire', () => {
      const target = path.join(dir, 'note.html')
      fs.writeFileSync(target, 'contenu précieux')
      vi.spyOn(fs, 'renameSync').mockImplementation(() => {
        throw errno('EBUSY')
      })
      let caught: unknown
      try {
        writeFileAtomic(target, 'nouveau')
      } catch (err) {
        caught = err
      }
      expect(caught).toBeInstanceOf(AtomicWriteError)
      expect((caught as AtomicWriteError).code).toBe('EBUSY')
      expect((caught as Error).message).toContain('« note.html » est verrouillé')
      expect((caught as Error).message).toContain("le fichier d'origine est intact")
      expect(fs.readFileSync(target, 'utf-8')).toBe('contenu précieux')
      expect(tempFilesIn(dir)).toEqual([])
    })

    it('ne réessaie pas une erreur non passagère', () => {
      const target = path.join(dir, 'note.html')
      fs.writeFileSync(target, 'ancien')
      const spy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
        throw errno('ENOSPC')
      })
      expect(() => writeFileAtomic(target, 'nouveau')).toThrow(AtomicWriteError)
      expect(spy).toHaveBeenCalledTimes(1)
      expect(fs.readFileSync(target, 'utf-8')).toBe('ancien')
      expect(tempFilesIn(dir)).toEqual([])
    })

    it('ne laisse pas de fichier vide si l’écriture du temporaire échoue', () => {
      const target = path.join(dir, 'note.html')
      fs.writeFileSync(target, 'ancien')
      vi.spyOn(fs, 'fsyncSync').mockImplementation(() => {
        throw errno('EIO')
      })
      expect(() => writeFileAtomic(target, 'nouveau')).toThrow(AtomicWriteError)
      expect(fs.readFileSync(target, 'utf-8')).toBe('ancien')
      expect(tempFilesIn(dir)).toEqual([])
    })

    it('preserveFormat : conserve le BOM et les CRLF de l’original', () => {
      const target = path.join(dir, 'note.html')
      fs.writeFileSync(target, Buffer.concat([BOM, Buffer.from('<p>a</p>\r\n<p>b</p>\r\n')]))
      // Le renderer renvoie du LF, avec ou sans le caractère BOM
      writeFileAtomic(target, '<p>a</p>\n<p>c</p>\n', { preserveFormat: true })
      expect(
        fs
          .readFileSync(target)
          .equals(Buffer.concat([BOM, Buffer.from('<p>a</p>\r\n<p>c</p>\r\n')]))
      ).toBe(true)
      writeFileAtomic(target, '﻿<p>d</p>\n', { preserveFormat: true })
      expect(
        fs.readFileSync(target).equals(Buffer.concat([BOM, Buffer.from('<p>d</p>\r\n')]))
      ).toBe(true)
    })

    it('preserveFormat : n’ajoute ni BOM ni CRLF à un original en LF', () => {
      const target = path.join(dir, 'note.md')
      fs.writeFileSync(target, '# Titre\n')
      writeFileAtomic(target, '# Titre\nTexte\n', { preserveFormat: true })
      expect(fs.readFileSync(target, 'utf-8')).toBe('# Titre\nTexte\n')
    })

    it('preserveFormat : refuse d’écraser un original non UTF-8', () => {
      const target = path.join(dir, 'ancienne.html')
      const latin1 = Buffer.from([0x3c, 0x70, 0x3e, 0xe9, 0x74, 0xe9]) // "<p>été" en Latin-1
      fs.writeFileSync(target, latin1)
      expect(() => writeFileAtomic(target, '<p>été', { preserveFormat: true })).toThrow(
        /n'est pas encodé en UTF-8/
      )
      expect(fs.readFileSync(target).equals(latin1)).toBe(true)
      expect(tempFilesIn(dir)).toEqual([])
    })
  })

  describe('encodeLikeOriginal', () => {
    it('suit la majorité des fins de ligne d’un original mixte', () => {
      const mostlyLf = Buffer.from('a\nb\nc\r\n')
      expect(encodeLikeOriginal(mostlyLf, 'x\ny').toString()).toBe('x\ny')
      const mostlyCrlf = Buffer.from('a\r\nb\r\nc\n')
      expect(encodeLikeOriginal(mostlyCrlf, 'x\ny').toString()).toBe('x\r\ny')
    })

    it('n’introduit pas de \\r\\r\\n si le contenu contient déjà des CRLF', () => {
      expect(encodeLikeOriginal(Buffer.from('a\r\n'), 'x\r\ny\n').toString()).toBe('x\r\ny\r\n')
    })

    it('encode simplement un nouveau fichier', () => {
      expect(encodeLikeOriginal(null, '﻿x\n').equals(Buffer.from('﻿x\n'))).toBe(true)
    })
  })

  describe('copyFileAtomic', () => {
    it('copie sans laisser de temporaire et n’altère pas la source', () => {
      const src = path.join(dir, 'source.pdf')
      fs.writeFileSync(src, Buffer.from([1, 2, 3]))
      const dest = path.join(dir, 'cible', 'copie.pdf')
      copyFileAtomic(src, dest)
      expect(fs.readFileSync(dest).equals(Buffer.from([1, 2, 3]))).toBe(true)
      expect(fs.existsSync(src)).toBe(true)
      expect(tempFilesIn(path.dirname(dest))).toEqual([])
    })

    it('laisse la cible intacte si le rename échoue', () => {
      const src = path.join(dir, 'source.pdf')
      const dest = path.join(dir, 'copie.pdf')
      fs.writeFileSync(src, 'nouveau')
      fs.writeFileSync(dest, 'ancien')
      vi.spyOn(fs, 'renameSync').mockImplementation(() => {
        throw errno('EACCES')
      })
      expect(() => copyFileAtomic(src, dest)).toThrow(AtomicWriteError)
      expect(fs.readFileSync(dest, 'utf-8')).toBe('ancien')
      expect(tempFilesIn(dir)).toEqual([])
    })
  })

  describe('noms des temporaires', () => {
    it('reconnaît les temporaires actuels et anciens', () => {
      expect(isTempFileName('.note.html.1234-a1b2c3d4.nftmp')).toBe(true)
      expect(originalNameOfTemp('.note.html.1234-a1b2c3d4.nftmp')).toBe('note.html')
      expect(isTempFileName('note.html.tmp_1730000000000_ab12')).toBe(true)
      expect(originalNameOfTemp('note.html.tmp_1730000000000_ab12')).toBe('note.html')
    })

    it('ne confond pas une note ordinaire avec un temporaire', () => {
      for (const name of ['note.html', '.config.json', 'mes.nftmp.md', 'note.tmp', 'tmp_1_a.md']) {
        expect(isTempFileName(name), name).toBe(false)
      }
    })

    it('ne reconnaît que le format exact des anciens temporaires', () => {
      // Noms qu'un utilisateur peut donner : horodatage trop court ou trop long, suffixe trop long
      for (const name of [
        'rapport.tmp_2024_v2',
        'rapport.tmp_173000000000_ab',
        'rapport.tmp_17300000000000_ab',
        'rapport.tmp_1730000000000_abcde',
        'rapport.tmp_1730000000000_',
        'rapport.TMP_1730000000000_ab'
      ]) {
        expect(isTempFileName(name), name).toBe(false)
      }
      expect(isTempFileName('note.md.tmp_1730000000000_a')).toBe(true)
    })
  })

  describe('cleanupTempFiles', () => {
    const OLD = Date.now() + 5 * 60 * 1000

    it('supprime un orphelin identique et range un orphelin différent dans .recovery', () => {
      fs.mkdirSync(path.join(dir, 'cours'))
      fs.writeFileSync(path.join(dir, 'a.html'), 'même contenu')
      fs.writeFileSync(path.join(dir, '.a.html.11-aaaa.nftmp'), 'même contenu')
      fs.writeFileSync(path.join(dir, 'cours', 'b.md'), 'version disque')
      fs.writeFileSync(path.join(dir, 'cours', '.b.md.22-bbbb.nftmp'), 'version plus récente')
      fs.writeFileSync(path.join(dir, 'cours', 'c.json.tmp_1730000000000_cc'), 'sans original')

      const report = cleanupTempFiles(dir, OLD)

      expect(report.removed).toEqual(['.a.html.11-aaaa.nftmp'])
      expect(report.recovered).toHaveLength(2)
      expect(fs.existsSync(path.join(dir, '.a.html.11-aaaa.nftmp'))).toBe(false)
      expect(fs.existsSync(path.join(dir, 'cours', '.b.md.22-bbbb.nftmp'))).toBe(false)
      const recoveredB = report.recovered.find((p) => p.endsWith('cours/b.md'))!
      expect(recoveredB.startsWith('.recovery/')).toBe(true)
      expect(fs.readFileSync(path.join(dir, recoveredB), 'utf-8')).toBe('version plus récente')
      // Les originaux ne sont jamais touchés
      expect(fs.readFileSync(path.join(dir, 'a.html'), 'utf-8')).toBe('même contenu')
      expect(fs.readFileSync(path.join(dir, 'cours', 'b.md'), 'utf-8')).toBe('version disque')
    })

    it('laisse en place un fichier utilisateur au nom proche d’un ancien temporaire', () => {
      fs.writeFileSync(path.join(dir, 'rapport.tmp_2024_v2'), 'fichier de l’utilisateur')
      expect(cleanupTempFiles(dir, OLD)).toEqual({ removed: [], recovered: [] })
      expect(fs.existsSync(path.join(dir, 'rapport.tmp_2024_v2'))).toBe(true)
    })

    it('laisse les temporaires récents et les fichiers ordinaires', () => {
      fs.writeFileSync(path.join(dir, 'note.html'), 'x')
      fs.writeFileSync(path.join(dir, '.note.html.33-cccc.nftmp'), 'en cours')
      const report = cleanupTempFiles(dir, Date.now())
      expect(report).toEqual({ removed: [], recovered: [] })
      expect(fs.existsSync(path.join(dir, '.note.html.33-cccc.nftmp'))).toBe(true)
    })

    it('ne retraite pas ce qui est déjà dans .recovery', () => {
      fs.mkdirSync(path.join(dir, '.recovery', 'ancien'), { recursive: true })
      fs.writeFileSync(path.join(dir, '.recovery', 'ancien', '.x.md.1-ab.nftmp'), 'déjà récupéré')
      expect(cleanupTempFiles(dir, OLD)).toEqual({ removed: [], recovered: [] })
    })
  })
})
