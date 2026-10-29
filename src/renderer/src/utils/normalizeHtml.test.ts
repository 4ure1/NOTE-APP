import { describe, it, expect } from 'vitest'
import { normalizeHtml } from './normalizeHtml'

// Même DOM une fois re-parsé, en ignorant les espaces entre blocs ajoutés par l'indentation
function sameMeaning(a: string, b: string): boolean {
  const canon = (html: string): string => {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_TEXT)
    const empty: Node[] = []
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!(n.nodeValue || '').trim() && n.parentElement?.closest('pre, textarea') === null) {
        empty.push(n)
      }
    }
    empty.forEach((n) => n.parentNode?.removeChild(n))
    return doc.documentElement.outerHTML
  }
  return canon(a) === canon(b)
}

function expectStable(input: string): string {
  const output = normalizeHtml(input)
  expect(sameMeaning(input, output)).toBe(true)
  expect(normalizeHtml(output)).toBe(output)
  return output
}

describe('normalizeHtml : réindentation seule', () => {
  it('réindente les conteneurs de blocs', () => {
    const output = expectStable('<div class="container"><h1>Titre</h1><p>Texte</p></div>')
    expect(output).toBe('<div class="container">\n  <h1>Titre</h1>\n  <p>Texte</p>\n</div>')
  })

  it('laisse un document déjà propre inchangé', () => {
    const clean = `<div class="container">\n  <h1>Titre</h1>\n  <p>Texte propre</p>\n</div>`
    expect(normalizeHtml(clean)).toBe(clean)
  })

  it('ne supprime ni ne fusionne aucun élément, même vide', () => {
    const input =
      '<div><p></p><p><br></p><p><br></p><div id="ancre"></div><span class="icon"></span></div>'
    const output = expectStable(input)
    expect(output.match(/<p><br><\/p>/g)).toHaveLength(2)
    expect(output).toContain('<p></p>')
    expect(output).toContain('<div id="ancre"></div>')
    expect(output).toContain('<span class="icon"></span>')
  })

  it('ne convertit pas <b> ni <i>', () => {
    const input = '<p>Texte <b>gras</b> et <i>italique</i></p>'
    expect(normalizeHtml(input)).toBe(input)
  })
})

describe('normalizeHtml : entités et attributs', () => {
  it('garde &amp; &lt; &gt; &nbsp; dans le texte', () => {
    const input = '<p>a &amp;&amp; b &lt;div&gt;&nbsp;&nbsp;fin&nbsp;</p>'
    expect(expectStable(input)).toBe(input)
  })

  it('n’interprète jamais du texte échappé comme une balise', () => {
    const output = normalizeHtml('<div><p>&lt;script&gt;alert(1)&lt;/script&gt;</p></div>')
    expect(output).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(output).not.toContain('<script>')
  })

  it('échappe & et " dans les attributs, y compris des conteneurs réindentés', () => {
    const input =
      '<div title="a &amp; &quot;b&quot;"><p><a href="x.pdf#zoom=100&amp;page=2">lien</a></p></div>'
    const output = expectStable(input)
    expect(output).toContain('<div title="a &amp; &quot;b&quot;">')
    expect(output).toContain('href="x.pdf#zoom=100&amp;page=2"')
  })

  it('garde les attributs inconnus, sans valeur ou à la syntaxe de framework', () => {
    const input = '<div data-x="1" x-on:click="go()" aria-hidden="true"><p hidden="">t</p></div>'
    const output = expectStable(input)
    for (const attr of ['data-x="1"', 'x-on:click="go()"', 'aria-hidden="true"', 'hidden']) {
      expect(output).toContain(attr)
    }
  })

  it('garde les éléments personnalisés', () => {
    const input = '<div><mon-composant data-id="3">contenu</mon-composant></div>'
    expect(expectStable(input)).toContain('<mon-composant data-id="3">contenu</mon-composant>')
  })
})

describe('normalizeHtml : zones recopiées à l’octet près', () => {
  it('<pre> et <code> : espaces, sauts de ligne, entités et première ligne vide', () => {
    const pre =
      '<pre class="java">\n\n  if (a &lt; b &amp;&amp; c) {\n\treturn &quot;x&quot;;\n  }\n</pre>'
    const output = normalizeHtml(`<div><h2>Code</h2>${pre}<p>Voir <code>a &lt; b</code></p></div>`)
    expect(output).toContain(pre)
    expect(output).toContain('<code>a &lt; b</code>')
  })

  it('<textarea> : contenu qui ressemble à du HTML', () => {
    const textarea = '<textarea name="t">\n  <b>pas gras</b> &amp; </textarea>'
    expect(normalizeHtml(`<div>${textarea}</div>`)).toContain(textarea)
  })

  it('<style> et <script> : caractères spéciaux et fausse balise fermante', () => {
    const style =
      '<style>\n  a > b { content: "&amp;"; }\n  @media (max-width: 800px) { .duo { display: block } }\n</style>'
    const script =
      '<script>\n  if (a < b && c) { el.innerHTML = \'<div>\' + "<\\/div>" }\n  // <!-- pas un commentaire\n</script>'
    const output = normalizeHtml(
      `<!DOCTYPE html><html><head>${style}</head><body>${script}<p>x</p></body></html>`
    )
    expect(output).toContain(style)
    expect(output).toContain(script)
  })

  it('commentaires, y compris dans <head> et avant <html>', () => {
    const input =
      '<!DOCTYPE html>\n<!-- en-tête -->\n<html>\n<head><!-- dans head --><title>T</title></head>\n<body><!--[if IE]><p>vieux</p><![endif]--><p>x</p></body>\n</html>'
    const output = expectStable(input)
    for (const c of [
      '<!-- en-tête -->',
      '<!-- dans head -->',
      '<!--[if IE]><p>vieux</p><![endif]-->'
    ]) {
      expect(output).toContain(c)
    }
  })

  it('doctype ancien recopié tel quel', () => {
    const doctype =
      '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">'
    expect(normalizeHtml(`${doctype}<html><body><p>x</p></body></html>`).startsWith(doctype)).toBe(
      true
    )
  })
})

describe('normalizeHtml : documents et fragments', () => {
  it('formate un document complet et garde ses attributs', () => {
    const input =
      '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Ma Note</title></head><body class="x"><div class="container"><h1>Chapitre</h1><p>Contenu</p></div></body></html>'
    const output = expectStable(input)
    expect(output).toBe(
      [
        '<!DOCTYPE html>',
        '<html lang="fr">',
        '  <head>',
        '    <meta charset="UTF-8">',
        '    <title>Ma Note</title>',
        '  </head>',
        '  <body class="x">',
        '    <div class="container">',
        '      <h1>Chapitre</h1>',
        '      <p>Contenu</p>',
        '    </div>',
        '  </body>',
        '</html>'
      ].join('\n')
    )
  })

  it('n’ajoute pas de <head> absent de la source', () => {
    const output = normalizeHtml('<html><body><p>x</p></body></html>')
    expect(output).not.toContain('<head>')
  })

  it('garde un <style> ou un <meta> en tête de fragment', () => {
    const output = normalizeHtml('<style>p { color: red }</style><meta name="x"><p>texte</p>')
    expect(output).toBe('<style>p { color: red }</style>\n<meta name="x">\n<p>texte</p>')
  })

  it('recopie un conteneur qui mêle texte et blocs', () => {
    const input = '<div>Texte libre <p>et un bloc</p></div>'
    expect(normalizeHtml(input)).toBe(input)
  })

  it('conserve le saut de ligne final', () => {
    expect(normalizeHtml('<p>x</p>\n')).toBe('<p>x</p>\n')
    expect(normalizeHtml('<p>x</p>')).toBe('<p>x</p>')
  })

  it('renvoie une chaîne vide pour une entrée vide', () => {
    expect(normalizeHtml('')).toBe('')
    expect(normalizeHtml('   ')).toBe('')
  })
})
