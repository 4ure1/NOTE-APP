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
      '<!DOCTYPE html>\n<html><head></head><body><h1>Titre</h1>\n<p>x</p></body></html>'
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
      '<html><head></head><body><h2>A</h2>\n<h2>B</h2>\n<p>tapé</p></body></html>'
    )
  })

  it('garde les paragraphes vides qui étaient déjà dans la note', () => {
    const doc = parse('<html><body><p></p><p><br></p><p>x</p></body></html>')
    expect(cleanPreviewDocument(doc, { ...FULL, hadDoctype: false })).toBe(
      '<html><head></head><body><p></p>\n<p><br></p>\n<p>x</p></body></html>'
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

  it('retire la configuration et les styles ajoutés par MathJax, garde les styles de la note', () => {
    const doc = parse(
      '<html><head><style>.perso{color:red}</style>' +
        '<script data-injected-preview-helpers="true">window.MathJax = {}</script>' +
        '<style type="text/css">.CtxtMenu_InfoClose { top:.2em; }</style>' +
        '<style id="MJX-CHTML-styles">mjx-container { line-height: 0; }</style>' +
        '</head><body><p>x</p></body></html>'
    )
    expect(cleanPreviewDocument(doc, { ...FULL, hadDoctype: false })).toBe(
      '<html><head><style>.perso{color:red}</style></head><body><p>x</p></body></html>'
    )
  })

  it('retire les marqueurs de champ d’un snippet en cours, en gardant le texte saisi', () => {
    const zw = String.fromCharCode(8203)
    const doc = parse(
      '<html><body><div class="step purple"><span class="label">' +
        '<span data-nf-field="1" data-nf-hint="" class="nf-active">Mon titre</span></span>' +
        '<span data-nf-field="2" data-nf-hint="texte" class="nf-empty">' +
        zw +
        '</span><span data-nf-field="0" data-nf-final=""></span></div></body></html>'
    )
    expect(cleanPreviewDocument(doc, { ...FULL, hadDoctype: false })).toBe(
      '<html><head></head><body><div class="step purple"><span class="label">Mon titre</span>' +
        '</div></body></html>'
    )
  })

  it('retire l’espace de largeur nulle d’un champ où l’on a tapé', () => {
    const zw = String.fromCharCode(8203)
    const doc = parse(
      `<html><body><p><span data-nf-field="1">${zw}abc</span> fin</p></body></html>`
    )
    expect(cleanPreviewDocument(doc, { ...FULL, hadDoctype: false })).toBe(
      '<html><head></head><body><p>abc fin</p></body></html>'
    )
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

describe('cleanPreviewDocument : fond des champs recopié par Chrome', () => {
  it('retire le fond bleu des champs et déballe le <span> resté sans attribut', () => {
    document.documentElement.innerHTML =
      '<head></head><body><div class="note"><span class="label">🧠 <span style="background-color: rgba(79, 193, 255, 0.22);">Question ?</span></span>' +
      '<span style="color: red; background-color: rgba(79, 193, 255, 0.12);">garde</span>' +
      '<span style="background-color: rgba(1, 2, 3, 0.5);">autre</span></div></body>'
    const html = cleanPreviewDocument(document, {
      hadHtmlTag: false,
      hadDoctype: false,
      originalBodyStyle: null
    })
    expect(html).toContain('<span class="label">🧠 Question ?</span>')
    expect(html).toContain('<span style="color: red;">garde</span>')
    expect(html).toContain('<span style="background-color: rgba(1, 2, 3, 0.5);">autre</span>')
  })
})

describe('cleanPreviewDocument : code lisible', () => {
  const opts = { hadHtmlTag: false, hadDoctype: false, originalBodyStyle: null }

  it('sépare les blocs collés (les <p></p> de la note restent)', () => {
    document.documentElement.innerHTML =
      '<head></head><body><div class="container">\n  <ul><li>a</li><li>b</li></ul><div class="canvas"></div><p></p><h2>Titre</h2><p><br></p>\n</div></body>'
    expect(cleanPreviewDocument(document, opts)).toBe(
      '<div class="container">\n  <ul><li>a</li>\n    <li>b</li></ul>\n  <div class="canvas"></div>\n  <p></p>\n  <h2>Titre</h2>\n  <p><br></p>\n</div>'
    )
  })

  it('ne touche ni au texte en ligne, ni aux cellules d’une ligne, ni au code', () => {
    document.documentElement.innerHTML =
      '<head></head><body><p>a <b>b</b><i>c</i></p><table><tbody><tr><td>1</td><td>2</td></tr></tbody></table><pre><div>x</div><div>y</div></pre></body>'
    const html = cleanPreviewDocument(document, opts)
    expect(html).toContain('<p>a <b>b</b><i>c</i></p>')
    expect(html).toContain('<tr><td>1</td><td>2</td></tr>')
    expect(html).toContain('<pre><div>x</div><div>y</div></pre>')
  })

  it('stable : un second passage ne change plus rien', () => {
    document.documentElement.innerHTML =
      '<head></head><body><div class="container">\n  <p>a</p><p>b</p>\n</div></body>'
    const once = cleanPreviewDocument(document, opts)
    document.body.innerHTML = once
    expect(cleanPreviewDocument(document, opts)).toBe(once)
  })
})

describe('cleanPreviewDocument : structure saine', () => {
  const opts = { hadHtmlTag: false, hadDoctype: false, originalBodyStyle: null }

  it('<p> contenant des blocs : coupé autour, sans <p></p> vides, même imbriqué', () => {
    document.body.innerHTML = ''
    const p = document.createElement('p')
    p.innerHTML = 'avant<div class="note">n</div>'
    const inner = document.createElement('p')
    inner.innerHTML = '<ul><li>x</li></ul>'
    p.appendChild(inner)
    p.appendChild(document.createTextNode('après'))
    document.body.appendChild(p)
    expect(cleanPreviewDocument(document, opts)).toBe(
      '<p>avant</p>\n<div class="note">n</div>\n<ul><li>x</li></ul>\n<p>après</p>'
    )
  })

  it('retire le <br> final invisible d’un bloc, garde les lignes vides et les <span> de la note', () => {
    document.body.innerHTML =
      '<p>texte<br></p><p><br></p><p>a<br><br></p><p><span>nu</span> <span class="o">o</span></p>'
    expect(cleanPreviewDocument(document, opts)).toBe(
      '<p>texte</p>\n<p><br></p>\n<p>a<br><br></p>\n<p><span>nu</span> <span class="o">o</span></p>'
    )
  })

  it('garde le <br> qui termine un <span> suivi de texte (retour à la ligne visible)', () => {
    document.body.innerHTML = '<p><span>a<br></span>b</p>'
    expect(cleanPreviewDocument(document, opts)).toBe('<p><span>a<br></span>b</p>')
  })

  it('aucun saut de ligne ajouté entre deux blocs inline-block (l’espace serait visible)', () => {
    document.body.innerHTML =
      '<div style="display: inline-block">A</div><div style="display: inline-block">B</div><p>x</p><p>y</p>'
    expect(cleanPreviewDocument(document, opts)).toBe(
      '<div style="display: inline-block">A</div><div style="display: inline-block">B</div><p>x</p>\n<p>y</p>'
    )
    expect(document.querySelector('[data-nf-keep-space]')).toBeNull()
  })
})
