import { describe, it, expect } from 'vitest'
import { normalizeHtml } from './normalizeHtml'

describe('normalizeHtml', () => {
  it('supprime les balises <p></p> vides générées par contenteditable', () => {
    const input = '<div><h1>Titre</h1><p></p><p>Texte</p><p></p></div>'
    const output = normalizeHtml(input)
    expect(output).not.toContain('<p></p>')
    expect(output).toContain('<h1>Titre</h1>')
    expect(output).toContain('<p>Texte</p>')
  })

  it('fusionne les suites excessives de <p><br></p> en au plus un <p><br></p>', () => {
    const input = '<div><h1>Titre</h1><p><br></p><p><br></p><p><br></p><p>Texte</p></div>'
    const output = normalizeHtml(input)
    // Ne doit contenir qu'un seul <p><br></p>
    const matches = output.match(/<p><br><\/p>/g) || []
    expect(matches.length).toBe(1)
  })

  it('supprime les <p><br></p> au tout début et à la fin d un conteneur', () => {
    const input = '<div><p><br></p><h1>Titre</h1><p><br></p></div>'
    const output = normalizeHtml(input)
    expect(output).not.toContain('<p><br></p>')
    expect(output).toContain('<h1>Titre</h1>')
  })

  it('nettoie les &nbsp; superflus (début, fin de bloc, doublons)', () => {
    const input = '<p>&nbsp;&nbsp;Hello&nbsp;&nbsp;World&nbsp;</p>'
    const output = normalizeHtml(input)
    expect(output).toBe('<p>Hello World</p>')
  })

  it('convertit <b> en <strong> et <i> en <em>', () => {
    const input = '<p>Texte <b>gras</b> et <i>italique</i></p>'
    const output = normalizeHtml(input)
    expect(output).toBe('<p>Texte <strong>gras</strong> et <em>italique</em></p>')
  })

  it('préserve les classes des balises <i> d icônes', () => {
    const input = '<p><i class="fa fa-star"></i> Étoile</p>'
    const output = normalizeHtml(input)
    expect(output).toContain('<i class="fa fa-star"></i>')
  })

  it('préserve rigoureusement le contenu exact et les sauts de ligne de <pre> et <code>', () => {
    const codeContent = 'const a = 1;\n  <b>not bold</b>;\n    const c = 3;'
    const input = `<pre><code>${codeContent}</code></pre>`
    const output = normalizeHtml(input)
    expect(output).toContain(codeContent)
  })

  it('préserve le contenu de <style> et <script>', () => {
    const styleContent = 'body { margin: 0; color: #fff; }'
    const scriptContent = 'console.log("hello");'
    const input = `<style>${styleContent}</style><script>${scriptContent}</script>`
    const output = normalizeHtml(input)
    expect(output).toContain(styleContent)
    expect(output).toContain(scriptContent)
  })

  it('garantit l idempotence : normalizeHtml(normalizeHtml(x)) === normalizeHtml(x)', () => {
    const messy =
      '<div><h1>Titre</h1><p class="subtitle"></p><p><br></p><p><br></p><p>Charte&nbsp;graphique&nbsp;</p><p><b>Important</b></p></div>'
    const firstPass = normalizeHtml(messy)
    const secondPass = normalizeHtml(firstPass)
    expect(secondPass).toBe(firstPass)
  })

  it('laisse un document déjà propre inchangé', () => {
    const clean = `<div class="container">\n  <h1>Titre</h1>\n  <p>Texte propre</p>\n</div>`
    const output = normalizeHtml(clean)
    expect(output).toBe(clean)
  })

  it('gère les documents complets avec <!DOCTYPE html>, <html>, <head> et <body>', () => {
    const fullDoc = `<!DOCTYPE html>\n<html>\n  <head>\n    <title>Ma Note</title>\n  </head>\n  <body style="margin: 0px auto;">\n    <div class="container">\n      <h1>Chapitre 1</h1>\n      <p>Contenu</p>\n    </div>\n  </body>\n</html>`
    const output = normalizeHtml(fullDoc)
    expect(output).toContain('<!DOCTYPE html>')
    expect(output).toContain('<title>Ma Note</title>')
    expect(output).toContain('<h1>Chapitre 1</h1>')
    expect(normalizeHtml(output)).toBe(output)
  })
})
