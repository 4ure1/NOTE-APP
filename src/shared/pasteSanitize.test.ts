import { describe, it, expect } from 'vitest'
import { sanitizePastedHtml } from './pasteSanitize'

function clean(html: string): string {
  const holder = document.createElement('div')
  holder.appendChild(sanitizePastedHtml(document, html))
  return holder.innerHTML
}

describe('sanitizePastedHtml', () => {
  it('page web : styles, polices et <span> retirés, structure gardée', () => {
    expect(
      clean(
        '<!--StartFragment--><div style="font-family: Arial"><span style="color: rgb(0,0,0); font-size: 16px;">Un <b style="font-weight:700">mot</b></span></div>' +
          '<ul class="list-xyz"><li style="margin:0">a</li></ul><!--EndFragment-->'
      )
    ).toBe('<p>Un <b>mot</b></p><ul><li>a</li></ul>')
  })

  it('copie d’une autre note : classes du thème gardées, les autres retirées', () => {
    expect(
      clean(
        '<div class="step purple foo"><span class="label">Titre</span><p>Texte <span class="o">orange</span></p></div>'
      )
    ).toBe(
      '<div class="step purple"><span class="label">Titre</span><p>Texte <span class="o">orange</span></p></div>'
    )
  })

  it('retire scripts, iframes, événements et liens javascript:', () => {
    expect(
      clean(
        '<p onclick="x()">a<script>alert(1)</script><iframe src="https://e"></iframe> <a href="javascript:alert(1)" onmouseover="y()">l</a> <a href="https://ok.fr" target="_blank">ok</a></p>'
      )
    ).toBe('<p>a <a>l</a> <a href="https://ok.fr">ok</a></p>')
  })

  it('tableaux : fusions de cases gardées, mise en forme retirée', () => {
    expect(
      clean(
        '<table border="1" style="width:100%"><tr><td colspan="2" class="x" bgcolor="red">c</td></tr></table>'
      )
    ).toMatch(/^<table>(<tbody>)?<tr><td colspan="2">c<\/td><\/tr>(<\/tbody>)?<\/table>$/)
  })

  it('texte nu à côté de blocs : regroupé en paragraphe', () => {
    expect(clean('Intro <b>gras</b><ul><li>x</li></ul>fin')).toBe(
      '<p>Intro <b>gras</b></p><ul><li>x</li></ul><p>fin</p>'
    )
  })

  it('reste autonome une fois sérialisée', () => {
    const rebuilt = new Function(
      `return (${sanitizePastedHtml.toString()})`
    )() as typeof sanitizePastedHtml
    const holder = document.createElement('div')
    holder.appendChild(rebuilt(document, '<span style="x">t</span>'))
    expect(holder.innerHTML).toBe('t')
  })
})
