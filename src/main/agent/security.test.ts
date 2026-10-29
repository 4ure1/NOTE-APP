import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  assertSafeNotePath,
  assertSafeFileName,
  sanitizeDownloadName,
  isVersionId,
  isOperationId,
  PathAccessError
} from './security'

const isWindows = process.platform === 'win32'
let base: string
let vault: string
let outside: string

beforeAll(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'note-app-security-'))
  vault = path.join(base, 'Mon Vault')
  outside = path.join(base, 'dehors')
  fs.mkdirSync(path.join(vault, 'cours'), { recursive: true })
  fs.mkdirSync(outside, { recursive: true })
  fs.writeFileSync(path.join(vault, 'cours', 'élève à.md'), 'ok')
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret')
})

afterAll(() => {
  fs.rmSync(base, { recursive: true, force: true })
})

const refused = (p: string, options = {}): void => {
  expect(() => assertSafeNotePath(vault, p, options)).toThrow(PathAccessError)
}

describe('assertSafeNotePath : usages légitimes', () => {
  it('accepte sous-dossiers, accents et espaces', () => {
    expect(assertSafeNotePath(vault, 'cours/élève à.md')).toBe(
      path.join(vault, 'cours', 'élève à.md')
    )
    expect(assertSafeNotePath(vault, 'Mes Cours/Chapitre 1.html')).toBe(
      path.join(vault, 'Mes Cours', 'Chapitre 1.html')
    )
  })

  it('accepte les séparateurs mixtes et les segments "." ou vides', () => {
    expect(assertSafeNotePath(vault, 'cours\\sous/./note.md')).toBe(
      path.join(vault, 'cours', 'sous', 'note.md')
    )
    expect(assertSafeNotePath(vault, 'cours//note.md')).toBe(path.join(vault, 'cours', 'note.md'))
  })

  it('accepte un nom qui commence par deux points', () => {
    expect(assertSafeNotePath(vault, '..notes.md')).toBe(path.join(vault, '..notes.md'))
  })

  it('accepte les noms Unicode en NFC comme en NFD', () => {
    expect(() => assertSafeNotePath(vault, 'élève.md'.normalize('NFC'))).not.toThrow()
    expect(() => assertSafeNotePath(vault, 'élève.md'.normalize('NFD'))).not.toThrow()
  })

  it('accepte un fichier qui n’existe pas encore', () => {
    expect(assertSafeNotePath(vault, 'nouveau/dossier/note.md')).toBe(
      path.join(vault, 'nouveau', 'dossier', 'note.md')
    )
  })

  it('laisse accessibles les sidecars .annotations.json des PDF', () => {
    expect(assertSafeNotePath(vault, 'cours/doc.pdf.annotations.json')).toBe(
      path.join(vault, 'cours', 'doc.pdf.annotations.json')
    )
    expect(assertSafeNotePath(vault, 'cours/doc.pdf') + '.annotations.json').toBe(
      path.join(vault, 'cours', 'doc.pdf.annotations.json')
    )
  })
})

describe('assertSafeNotePath : sorties du dossier', () => {
  it('refuse ".." où qu’il soit', () => {
    refused('../secret.txt')
    refused('cours/../../secret.txt')
    refused('cours\\..\\..\\secret.txt')
    refused('cours/..')
  })

  it('refuse les chemins absolus et les lettres de lecteur', () => {
    refused('C:\\Windows\\win.ini')
    refused('c:/windows/win.ini')
    refused('D:\\x.txt')
    refused('C:secret.txt')
  })

  it('refuse les chemins UNC, les chemins de périphérique et le "/" initial', () => {
    refused('\\\\serveur\\partage\\x')
    refused('//serveur/partage/x')
    refused('\\\\?\\C:\\Windows\\win.ini')
    refused('\\\\.\\PhysicalDrive0')
    refused('/etc/passwd')
    refused('/cours/note.md')
  })

  it('refuse les flux NTFS et les caractères interdits', () => {
    refused('note.md:flux')
    refused('cours/a<b>.md')
    refused('cours/a|b.md')
    refused('cours/a?.md')
    refused('cours/a*.md')
    refused('cours/a"b.md')
    refused('cours/a\u0001.md')
  })

  it('refuse les points ou espaces en fin de nom', () => {
    refused('cours/note.md.')
    refused('cours/note.md ')
    refused('dossier /note.md')
    refused('.. /secret.txt')
  })

  it('refuse les noms réservés, quelle que soit la casse ou l’extension', () => {
    const reserved = ['NUL', 'con', 'Con.txt', 'cours/aux.md', 'PRN', 'COM1', 'lpt9.html']
    for (const name of [...reserved, 'CONIN$', 'COM¹']) refused(name)
    expect(() => assertSafeNotePath(vault, 'console.md')).not.toThrow()
    expect(() => assertSafeNotePath(vault, 'COM10.md')).not.toThrow()
  })

  it('refuse les noms réservés aux fichiers temporaires', () => {
    refused('.note.html.1234-a1b2c3d4.nftmp')
    refused('cours/.note.html.1234-a1b2c3d4.nftmp')
    refused('cours/note.html.tmp_1730000000000_ab12')
    expect(() => assertSafeNotePath(vault, 'cours/mes.nftmp.md')).not.toThrow()
    expect(() => assertSafeNotePath(vault, 'cours/rapport.tmp_2024_v2')).not.toThrow()
  })

  it('refuse les entrées non textuelles', () => {
    refused(undefined as unknown as string)
    refused(42 as unknown as string)
  })
})

describe('assertSafeNotePath : racine et dossiers internes', () => {
  it('refuse la racine par défaut', () => {
    refused('')
    refused('.')
    refused('./')
  })

  it('accepte la racine avec allowRoot', () => {
    expect(assertSafeNotePath(vault, '', { allowRoot: true })).toBe(path.resolve(vault))
    expect(assertSafeNotePath(vault, '.', { allowRoot: true })).toBe(path.resolve(vault))
  })

  it('refuse les dossiers internes, sauf avec allowInternal', () => {
    const internal = ['.history/x.json', '.trash/1___a.md', '.snippets/snippets.json']
    for (const p of [...internal, '.templates/t.html', '.config.json', '.HISTORY/x']) refused(p)
    refused('.recovery/2026-10-29/note.md')
    refused('.Recovery/x')
    expect(assertSafeNotePath(vault, '.history/x.json', { allowInternal: true })).toBe(
      path.join(vault, '.history', 'x.json')
    )
    expect(() => assertSafeNotePath(vault, 'cours/.history/x.md')).not.toThrow()
  })
})

describe.skipIf(!isWindows)('assertSafeNotePath : jonctions et casse (Windows)', () => {
  it('refuse une jonction du vault qui pointe vers l’extérieur', () => {
    fs.symlinkSync(outside, path.join(vault, 'lien'), 'junction')
    refused('lien/secret.txt')
    refused('lien/nouveau.md')
    refused('lien')
  })

  it('accepte un vault situé derrière une jonction', () => {
    const vaultJunction = path.join(base, 'Vault Jonction')
    fs.symlinkSync(vault, vaultJunction, 'junction')
    expect(assertSafeNotePath(vaultJunction, 'cours/élève à.md')).toBe(
      path.join(vaultJunction, 'cours', 'élève à.md')
    )
    expect(() => assertSafeNotePath(vaultJunction, 'nouveau.md')).not.toThrow()
  })

  it('compare les chemins sans tenir compte de la casse', () => {
    expect(() => assertSafeNotePath(vault.toUpperCase(), 'cours/élève à.md')).not.toThrow()
    expect(() => assertSafeNotePath(vault.toLowerCase(), 'COURS/nouveau.md')).not.toThrow()
  })
})

describe('assertSafeFileName', () => {
  it('accepte un nom simple', () => {
    expect(assertSafeFileName('Chapitre 1 – élève.html')).toBe('Chapitre 1 – élève.html')
  })

  it('refuse séparateurs, "..", noms réservés et fins invalides', () => {
    const invalid = ['', '.', '..', 'a/b.md', 'a\\b.md', '..\\..\\x']
    for (const name of [...invalid, 'NUL', 'note.md.', 'note.md ', 'a:b']) {
      expect(() => assertSafeFileName(name)).toThrow(PathAccessError)
    }
  })
})

describe('sanitizeDownloadName', () => {
  it('garde un nom correct et ajoute .pdf si besoin', () => {
    expect(sanitizeDownloadName('cours.pdf')).toBe('cours.pdf')
    expect(sanitizeDownloadName('cours')).toBe('cours.pdf')
    expect(sanitizeDownloadName('COURS.PDF')).toBe('COURS.PDF')
  })

  it('ne garde que le dernier segment', () => {
    expect(sanitizeDownloadName('../../Windows/evil.pdf')).toBe('evil.pdf')
    expect(sanitizeDownloadName('..\\..\\evil.pdf')).toBe('evil.pdf')
    expect(sanitizeDownloadName('C:\\Users\\x\\evil.pdf')).toBe('evil.pdf')
  })

  it('remplace les caractères interdits et retire les fins invalides', () => {
    expect(sanitizeDownloadName('a:b?.pdf')).toBe('a-b-.pdf')
    expect(sanitizeDownloadName('rapport. . ')).toBe('rapport.pdf')
  })

  it('gère les noms vides ou réservés', () => {
    expect(sanitizeDownloadName('')).toBe('document.pdf')
    expect(sanitizeDownloadName('..')).toBe('document.pdf')
    expect(sanitizeDownloadName('CON')).toBe('_CON.pdf')
    expect(sanitizeDownloadName('nul.pdf')).toBe('_nul.pdf')
  })

  it('limite la longueur', () => {
    const name = sanitizeDownloadName('a'.repeat(500))
    expect(name.length).toBe(200)
    expect(name.endsWith('.pdf')).toBe(true)
  })
})

describe('identifiants', () => {
  it('isVersionId', () => {
    expect(isVersionId('1730140000000')).toBe(true)
    expect(isVersionId('../../x')).toBe(false)
    expect(isVersionId('12a')).toBe(false)
    expect(isVersionId(12)).toBe(false)
  })

  it('isOperationId', () => {
    expect(isOperationId('op_1730140000000_ab12cd')).toBe(true)
    expect(isOperationId('../op_1_a')).toBe(false)
    expect(isOperationId('op_1_A')).toBe(false)
  })
})
