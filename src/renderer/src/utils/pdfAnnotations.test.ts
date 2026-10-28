import { describe, it, expect } from 'vitest'
import {
  computeRelativePath,
  parsePdfLink,
  formatPdfQuoteBlock,
  upsertAnnotation,
  removeAnnotation,
  insertQuoteIntoNoteContent,
  PdfAnnotation
} from './pdfAnnotations'

describe('pdfAnnotations', () => {
  describe('computeRelativePath', () => {
    it('calcule le chemin relatif dans le même dossier', () => {
      expect(computeRelativePath('cours/algo/note.html', 'cours/algo/cours.pdf')).toBe('cours.pdf')
    })

    it('calcule le chemin vers un sous-dossier', () => {
      expect(computeRelativePath('cours/note.html', 'cours/assets/cours.pdf')).toBe(
        'assets/cours.pdf'
      )
    })

    it('calcule le chemin vers un dossier parent', () => {
      expect(computeRelativePath('cours/algo/note.html', 'cours/cours.pdf')).toBe('../cours.pdf')
    })

    it('calcule le chemin entre deux sous-dossiers frères', () => {
      expect(computeRelativePath('cours/notes/seance-01.html', 'cours/pdf/support.pdf')).toBe(
        '../pdf/support.pdf'
      )
    })

    it('gère les fichiers à la racine de la vault', () => {
      expect(computeRelativePath('index.html', 'guide.pdf')).toBe('guide.pdf')
      expect(computeRelativePath('sub/note.html', 'guide.pdf')).toBe('../guide.pdf')
      expect(computeRelativePath('note.html', 'sub/guide.pdf')).toBe('sub/guide.pdf')
    })
  })

  describe('parsePdfLink', () => {
    it('extrait le chemin PDF et le numéro de page avec ancre #page=X', () => {
      const parsed = parsePdfLink('cours.pdf#page=12')
      expect(parsed).toEqual({ pdfPath: 'cours.pdf', pageNumber: 12 })
    })

    it('extrait le chemin dans un sous-dossier avec #page=X', () => {
      const parsed = parsePdfLink('assets/algo/poo.pdf#page=34')
      expect(parsed).toEqual({ pdfPath: 'assets/algo/poo.pdf', pageNumber: 34 })
    })

    it("utilise page 1 par défaut quand aucune ancre de page n'est spécifiée", () => {
      const parsed = parsePdfLink('document.pdf')
      expect(parsed).toEqual({ pdfPath: 'document.pdf', pageNumber: 1 })
    })

    it('renvoie null pour un lien non-PDF', () => {
      expect(parsePdfLink('note.html#section-2')).toBeNull()
      expect(parsePdfLink('README.md')).toBeNull()
      expect(parsePdfLink('')).toBeNull()
    })
  })

  describe('formatPdfQuoteBlock', () => {
    it('génère un callout HTML conforme au design system avec lien de retour précis', () => {
      const html = formatPdfQuoteBlock({
        quoteText: 'Le polymorphisme est un principe fondamental.',
        pdfRelativePath: 'cours/poo/cours-poo.pdf',
        targetNotePath: 'cours/poo/seance-01.html',
        pageNumber: 14,
        isHtml: true
      })

      expect(html).toContain('<div class="callout callout-info" data-pdf-quote="true">')
      expect(html).toContain('<a href="cours-poo.pdf#page=14">cours-poo.pdf (p. 14)</a>')
      expect(html).toContain('<p>Le polymorphisme est un principe fondamental.</p>')
    })

    it('génère un callout Markdown > [!NOTE] avec lien de retour', () => {
      const md = formatPdfQuoteBlock({
        quoteText: 'Première ligne de citation.\nDeuxième ligne de citation.',
        pdfRelativePath: 'assets/doc.pdf',
        targetNotePath: 'notes/resume.md',
        pageNumber: 8,
        isHtml: false
      })

      expect(md).toContain('> [!NOTE] Extrait PDF — [doc.pdf (p. 8)](../assets/doc.pdf#page=8)')
      expect(md).toContain('> Première ligne de citation.')
      expect(md).toContain('> Deuxième ligne de citation.')
    })

    it("inclut un commentaire optionnel s'il est fourni", () => {
      const html = formatPdfQuoteBlock({
        quoteText: 'Définition importante.',
        pdfRelativePath: 'doc.pdf',
        targetNotePath: 'note.html',
        pageNumber: 1,
        isHtml: true,
        comment: "À revoir avant l'examen"
      })

      expect(html).toContain('<em>Note : À revoir avant l&#039;examen</em>')
    })
  })

  describe('upsertAnnotation et removeAnnotation', () => {
    const mockAnnotation: PdfAnnotation = {
      id: 'ann-1',
      pageNumber: 2,
      text: 'Exemple surligné',
      color: 'yellow',
      rects: [{ x: 0.1, y: 0.2, width: 0.5, height: 0.05 }],
      createdAt: '2026-10-28T21:00:00.000Z'
    }

    it("ajoute une nouvelle annotation si elle n'existe pas", () => {
      const list: PdfAnnotation[] = []
      const next = upsertAnnotation(list, mockAnnotation)
      expect(next).toHaveLength(1)
      expect(next[0].id).toBe('ann-1')
    })

    it('met à jour une annotation existante (ex. changement de couleur)', () => {
      const list = [mockAnnotation]
      const updated: PdfAnnotation = { ...mockAnnotation, color: 'pink' }
      const next = upsertAnnotation(list, updated)
      expect(next).toHaveLength(1)
      expect(next[0].color).toBe('pink')
    })

    it('supprime une annotation par son ID', () => {
      const list = [mockAnnotation]
      const next = removeAnnotation(list, 'ann-1')
      expect(next).toHaveLength(0)
    })
  })

  describe('insertQuoteIntoNoteContent', () => {
    it('insère proprement avant </body> dans une note HTML', () => {
      const html = '<!DOCTYPE html><html><body><p>Hello</p></body></html>'
      const block = '<div class="callout">Extrait</div>'
      const result = insertQuoteIntoNoteContent(html, block, true)
      expect(result).toBe(
        '<!DOCTYPE html><html><body><p>Hello</p>  <div class="callout">Extrait</div>\n</body></html>'
      )
    })

    it("ajoute à la fin d'une note Markdown", () => {
      const md = '# Titre\n\nContenu initial.'
      const block = '> [!NOTE] Extrait'
      const result = insertQuoteIntoNoteContent(md, block, false)
      expect(result).toBe('# Titre\n\nContenu initial.\n\n> [!NOTE] Extrait\n')
    })
  })
})
