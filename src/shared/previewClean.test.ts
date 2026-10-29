import { describe, it, expect } from 'vitest'
import { cleanPreviewDocument, PreviewCleanOptions } from './previewClean'

const FULL: PreviewCleanOptions = { hadHtmlTag: true, hadDoctype: true, originalBodyStyle: null }

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('cleanPreviewDocument', () => {
  it('retire les helpers injectés et les attributs d’édition', () => {
    const doc = parse(
      '<!DOCTYPE html><html><head><style data-injected-theme="1">x</style>' +
        '<style data-injected-preview-helpers="true">body { zoom: 120% }</style>' +
        '<script data-injected-preview-helpers="true">var a</script>' +
        '<script src="https://cdn/mathjax.js"></script></head>' +
        '<body contenteditable="true" spellcheck="false"><div id="preview-snippet-menu">m</div>' +
        '<h1 data-source-line="3">Titre</h1><p contenteditable="false">x</p></body></html>'
    )
    const out = cleanPreviewDocument(doc, FULL)
    expect(out).toBe(
      '<!DOCTYPE html>\n<html><head></head><body><h1>Titre</h1><p>x</p></body></html>'
    )
  })

  it('remet le style d’origine du <body> au lieu du style ajouté par l’aperçu', () => {
    const doc = parse('<html><body style="margin: 0px auto; zoom: 120%;"><p>x</p></body></html>')
    expect(cleanPreviewDocument(doc, { ...FULL, hadDoctype: false, originalBodyStyle: null })).toBe(
      '<html><head></head><body><p>x</p></body></html>'
    )
    expect(
      cleanPreviewDocument(doc, { ...FULL, hadDoctype: false, originalBodyStyle: 'color: red' })
    ).toBe('<html><head></head><body style="color: red"><p>x</p></body></html>')
  })

  it('retire un paragraphe ajouté par un clic et resté vide, garde celui où l’on a tapé', () => {
    const doc = parse(
      '<html><body><h2>A</h2><p data-nf-pending=""><br></p><h2>B</h2>' +
        '<p data-nf-pending="">tapé</p></body></html>'
    )
    expect(cleanPreviewDocument(doc, { ...FULL, hadDoctype: false })).toBe(
      '<html><head></head><body><h2>A</h2><h2>B</h2><p>tapé</p></body></html>'
    )
  })

  it('garde les paragraphes vides qui étaient déjà dans la note', () => {
    const doc = parse('<html><body><p></p><p><br></p><p>x</p></body></html>')
    expect(cleanPreviewDocument(doc, { ...FULL, hadDoctype: false })).toBe(
      '<html><head></head><body><p></p><p><br></p><p>x</p></body></html>'
    )
  })

  it('garde les entités et les attributs de la note', () => {
    const doc = parse(
      '<html><body><p>a &amp;&amp; b &lt;div&gt;&nbsp;</p>' +
        '<a href="x.pdf#zoom=100&amp;page=2" data-x="1">l</a></body></html>'
    )
    const out = cleanPreviewDocument(doc, { ...FULL, hadDoctype: false })
    expect(out).toContain('<p>a &amp;&amp; b &lt;div&gt;&nbsp;</p>')
    expect(out).toContain('href="x.pdf#zoom=100&amp;page=2" data-x="1"')
  })

  it('recopie un doctype ancien', () => {
    const doc = parse(
      '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd"><html><body></body></html>'
    )
    expect(cleanPreviewDocument(doc, FULL)).toMatch(
      /^<!DOCTYPE html PUBLIC "-\/\/W3C\/\/DTD XHTML 1\.0 Strict\/\/EN" "http:\/\/www\.w3\.org\/TR\/xhtml1\/DTD\/xhtml1-strict\.dtd">\n/
    )
  })

  it('renvoie seulement le contenu du <body> pour une note sans <html>', () => {
    const doc = parse('<body contenteditable="true"><h1>T</h1>\n<p>x</p></body>')
    expect(
      cleanPreviewDocument(doc, { hadHtmlTag: false, hadDoctype: false, originalBodyStyle: null })
    ).toBe('<h1>T</h1>\n<p>x</p>')
  })

  it('ne modifie pas le document affiché', () => {
    const doc = parse(
      '<html><body contenteditable="true"><p data-nf-pending=""><br></p></body></html>'
    )
    cleanPreviewDocument(doc, { ...FULL, hadDoctype: false })
    expect(doc.body.getAttribute('contenteditable')).toBe('true')
    expect(doc.querySelector('[data-nf-pending]')).not.toBeNull()
  })

  it('reste autonome une fois sérialisée (injection dans l’iframe)', () => {
    const rebuilt = new Function(
      `return (${cleanPreviewDocument.toString()})`
    )() as typeof cleanPreviewDocument
    const doc = parse('<html><body spellcheck="false"><p>x</p></body></html>')
    expect(rebuilt(doc, { ...FULL, hadDoctype: false })).toBe(
      '<html><head></head><body><p>x</p></body></html>'
    )
  })
})
