import { describe, it, expect } from 'vitest'
import { parsePdfHref, resolveVaultLinkPath, isPdfUrl } from './pdfLink'

describe('parsePdfHref', () => {
  it('reconnaît un lien PDF simple, quelle que soit la casse', () => {
    expect(parsePdfHref('cours.pdf')).toEqual({ path: 'cours.pdf', page: 1 })
    expect(parsePdfHref('COURS.PDF')).toEqual({ path: 'COURS.PDF', page: 1 })
  })

  it('lit la page dans l’ancre', () => {
    expect(parsePdfHref('cours.pdf#page=3')).toEqual({ path: 'cours.pdf', page: 3 })
    expect(parsePdfHref('cours.pdf#page=3&zoom=100')).toEqual({ path: 'cours.pdf', page: 3 })
    expect(parsePdfHref('cours.pdf#zoom=100&Page=7')).toEqual({ path: 'cours.pdf', page: 7 })
  })

  it('ignore une page invalide ou mal nommée', () => {
    expect(parsePdfHref('cours.pdf#page=0')).toEqual({ path: 'cours.pdf', page: 1 })
    expect(parsePdfHref('cours.pdf#nopage=3')).toEqual({ path: 'cours.pdf', page: 1 })
    expect(parsePdfHref('cours.pdf#page=abc')).toEqual({ path: 'cours.pdf', page: 1 })
  })

  it('retire la query du chemin', () => {
    expect(parsePdfHref('cours.pdf?v=2#page=3')).toEqual({ path: 'cours.pdf', page: 3 })
    expect(parsePdfHref('cours.pdf?v=2')).toEqual({ path: 'cours.pdf', page: 1 })
  })

  it('décode les espaces et les accents encodés', () => {
    expect(parsePdfHref('mes%20cours.pdf#page=2')).toEqual({ path: 'mes cours.pdf', page: 2 })
    expect(parsePdfHref('r%C3%A9sum%C3%A9.pdf')).toEqual({ path: 'résumé.pdf', page: 1 })
    expect(parsePdfHref('mes cours.pdf')).toEqual({ path: 'mes cours.pdf', page: 1 })
  })

  it('garde le chemin brut si l’encodage est invalide, sans lever', () => {
    expect(parsePdfHref('%E9t%E9.pdf')).toEqual({ path: '%E9t%E9.pdf', page: 1 })
  })

  it('normalise les antislashs, garde les chemins relatifs et rogne les espaces', () => {
    expect(parsePdfHref('dossier\\cours.pdf')).toEqual({ path: 'dossier/cours.pdf', page: 1 })
    expect(parsePdfHref('../assets/cours.pdf#page=4')).toEqual({
      path: '../assets/cours.pdf',
      page: 4
    })
    expect(parsePdfHref('  cours.pdf  ')).toEqual({ path: 'cours.pdf', page: 1 })
  })

  it('refuse ce qui n’est pas un PDF', () => {
    for (const href of [
      'cours.pdf.md',
      'xpdf',
      'cours.pdfx',
      'coursxpdf',
      '.pdf',
      'dossier/.pdf'
    ]) {
      expect(parsePdfHref(href), href).toBeNull()
    }
  })

  it('ne se fie pas à la query ni à l’ancre', () => {
    expect(parsePdfHref('annexe.html#voir-cours.pdf')).toBeNull()
    expect(parsePdfHref('note.md?from=cours.pdf')).toBeNull()
  })

  it('refuse les liens externes et les schémas', () => {
    for (const href of [
      'https://site.fr/doc.pdf',
      'HTTP://site.fr/doc.pdf',
      'file:///C:/doc.pdf',
      'note-pdf://notes/doc.pdf',
      'mailto:a.pdf',
      'javascript:alert(1)//.pdf',
      '//cdn.site.fr/x.pdf',
      'C:\\Users\\x\\doc.pdf',
      'C%3A/doc.pdf'
    ]) {
      expect(parsePdfHref(href), href).toBeNull()
    }
  })

  it('refuse les entrées vides', () => {
    expect(parsePdfHref('')).toBeNull()
    expect(parsePdfHref('   ')).toBeNull()
    expect(parsePdfHref(undefined as unknown as string)).toBeNull()
  })

  it('reste autonome une fois sérialisée (injection dans l’iframe)', () => {
    const rebuilt = new Function(`return (${parsePdfHref.toString()})`)() as typeof parsePdfHref
    expect(rebuilt('mes%20cours.pdf?v=1#page=5')).toEqual({ path: 'mes cours.pdf', page: 5 })
    expect(rebuilt('https://site.fr/doc.pdf')).toBeNull()
  })
})

describe('resolveVaultLinkPath', () => {
  it('résout par rapport au dossier de la note', () => {
    expect(resolveVaultLinkPath('cours/algo/note.html', 'cours.pdf')).toBe('cours/algo/cours.pdf')
    expect(resolveVaultLinkPath('cours/algo/note.html', './cours.pdf')).toBe('cours/algo/cours.pdf')
    expect(resolveVaultLinkPath('cours/algo/note.html', '../assets/cours.pdf')).toBe(
      'cours/assets/cours.pdf'
    )
    expect(resolveVaultLinkPath('note.html', 'sub/guide.pdf')).toBe('sub/guide.pdf')
  })

  it('part de la racine pour un chemin absolu ou sans note courante', () => {
    expect(resolveVaultLinkPath('cours/note.html', '/guide.pdf')).toBe('guide.pdf')
    expect(resolveVaultLinkPath('', 'guide.pdf')).toBe('guide.pdf')
  })

  it('refuse un lien qui sort du dossier de notes', () => {
    expect(resolveVaultLinkPath('note.html', '../cours.pdf')).toBeNull()
    expect(resolveVaultLinkPath('cours/note.html', '../../Windows/x.pdf')).toBeNull()
    expect(resolveVaultLinkPath('cours/note.html', 'a/../../../x.pdf')).toBeNull()
    expect(resolveVaultLinkPath('cours/note.html', '/../x.pdf')).toBeNull()
  })

  it('refuse un lien qui ne désigne aucun fichier', () => {
    expect(resolveVaultLinkPath('cours/note.html', '..')).toBeNull()
  })
})

describe('isPdfUrl', () => {
  it('reconnaît une URL dont le chemin est un PDF', () => {
    expect(isPdfUrl('https://x.fr/a.pdf')).toBe(true)
    expect(isPdfUrl('https://x.fr/docs/A.PDF?dl=1')).toBe(true)
    expect(isPdfUrl('http://x.fr/mes%20cours.pdf#page=2')).toBe(true)
  })

  it('ignore l’hôte, la query et l’ancre', () => {
    expect(isPdfUrl('https://www.google.com/search?q=cours.pdf')).toBe(false)
    expect(isPdfUrl('https://exemple.pdf.io/')).toBe(false)
    expect(isPdfUrl('https://x.fr/telecharger?file=a.pdf')).toBe(false)
    expect(isPdfUrl('https://x.fr/page#a.pdf')).toBe(false)
  })

  it('refuse ce qui n’est pas un PDF ou pas une URL web', () => {
    expect(isPdfUrl('https://x.fr/guide.pdf.html')).toBe(false)
    expect(isPdfUrl('https://x.fr/a.pdf/')).toBe(false)
    expect(isPdfUrl('https://x.fr/.pdf')).toBe(false)
    expect(isPdfUrl('file:///C:/a.pdf')).toBe(false)
    expect(isPdfUrl('pas une url')).toBe(false)
    expect(isPdfUrl('https://x.fr/%E9.pdf')).toBe(true)
  })
})
