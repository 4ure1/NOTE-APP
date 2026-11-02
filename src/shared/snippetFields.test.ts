import { describe, it, expect } from 'vitest'
import defaults from '../main/defaultSnippets.json'
import { buildSnippetFragment } from './snippetFields'

const NOW = new Date(2026, 10, 2)

// Variables que l'aperçu fournit pour une note située dans cours/
const VARIABLES = { NOTES_THEME: '../.theme/notes.css' }

function build(body: string[] | string, selected = ''): ReturnType<typeof buildSnippetFragment> {
  return buildSnippetFragment(document, body, selected, NOW, VARIABLES)
}

function html(fragment: DocumentFragment): string {
  const div = document.createElement('div')
  div.appendChild(fragment.cloneNode(true))
  return div.innerHTML
}

describe('buildSnippetFragment : champs dans le texte', () => {
  it('un champ avec valeur par défaut devient un marqueur visible qui contient cette valeur', () => {
    const { fragment, groups } = build(['<span class="label">${1:Titre}</span>'])
    expect(html(fragment)).toBe(
      '<span class="label"><span data-nf-field="1" data-nf-hint="Titre">Titre</span></span>'
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].occurrences[0]).toMatchObject({ kind: 'text', defaultValue: 'Titre' })
  })

  it('un champ vide reçoit une indication « texte » pour rester visible', () => {
    const { fragment } = build(['<span class="k">$1</span>$0'])
    const marker = fragment.querySelector('[data-nf-field="1"]')!
    expect(marker.getAttribute('data-nf-hint')).toBe('texte')
    expect(marker.textContent).toBe('')
  })

  it('setValue remplace le contenu du champ', () => {
    const { fragment, groups } = build(['<p>${1:a}</p>'])
    groups[0].occurrences[0].setValue('bonjour')
    expect(fragment.querySelector('p')!.textContent).toBe('bonjour')
  })

  it('ordonne les champs par numéro et regroupe les répétitions', () => {
    const { groups } = build(['<p>${2:b} ${1:a} ${2:b}</p>'])
    expect(groups.map((g) => g.index)).toEqual([1, 2])
    expect(groups[1].occurrences).toHaveLength(2)
  })

  it('$0 devient le marqueur final, hors des champs', () => {
    const { finalMarker, groups } = build(['<div class="step">${1:x}</div>', '', '$0'])
    expect(finalMarker?.hasAttribute('data-nf-final')).toBe(true)
    expect(groups.map((g) => g.index)).toEqual([1])
  })
})

describe('buildSnippetFragment : champs dans un attribut', () => {
  it('un choix dans la classe applique le premier et se change en direct', () => {
    const { fragment, groups } = build(['<div class="step ${1|purple,orange,green,red|}">x</div>'])
    const div = fragment.querySelector('div')!
    expect(div.className).toBe('step purple')
    const field = groups[0].occurrences[0]
    expect(field).toMatchObject({ kind: 'attribute', attribute: 'class' })
    expect(field.choices).toEqual(['purple', 'orange', 'green', 'red'])
    field.setValue('green')
    expect(div.className).toBe('step green')
    expect(field.getValue()).toBe('green')
  })

  it('un choix dans un style garde le reste de l’attribut', () => {
    const { fragment, groups } = build([
      '<span style="color: var(--${1|purple,blue|}); font-weight: 600;">${TM_SELECTED_TEXT:$2}</span>$0'
    ])
    const span = fragment.querySelector('span[style]')!
    expect(span.getAttribute('style')).toBe('color: var(--purple); font-weight: 600;')
    groups[0].occurrences[0].setValue('blue')
    expect(span.getAttribute('style')).toBe('color: var(--blue); font-weight: 600;')
    // Sans sélection, le texte est un champ vide visible
    expect(groups.map((g) => g.index)).toEqual([1, 2])
  })
})

describe('buildSnippetFragment : variables et sécurité', () => {
  it('reprend le texte sélectionné, échappé, sans en faire un champ', () => {
    const { fragment, groups } = build(
      ['<span class="k">${TM_SELECTED_TEXT:$1}</span>$0'],
      'a < b & c'
    )
    expect(fragment.querySelector('.k')!.textContent).toBe('a < b & c')
    expect(fragment.querySelector('.k script, .k b')).toBeNull()
    expect(groups).toEqual([])
  })

  it('n’interprète jamais le texte sélectionné comme du HTML', () => {
    const { fragment } = build(
      ['<code>${TM_SELECTED_TEXT:$1}</code>'],
      '<img src=x onerror=alert(1)>'
    )
    expect(fragment.querySelector('img')).toBeNull()
    expect(fragment.querySelector('code')!.textContent).toBe('<img src=x onerror=alert(1)>')
  })

  it('remplace les dates', () => {
    const { fragment } = build(['<p>${CURRENT_DATE}/${CURRENT_MONTH}/${CURRENT_YEAR}</p>'])
    expect(fragment.querySelector('p')!.textContent).toBe('02/11/2026')
  })

  it('met la valeur par défaut sans marqueur dans <style> et <script>', () => {
    const { fragment, groups } = build(['<style>p { color: ${1:red}; }</style>'])
    expect(fragment.querySelector('style')!.textContent).toBe('p { color: red; }')
    expect(groups).toEqual([])
  })
})

describe('buildSnippetFragment : tous les snippets par défaut', () => {
  const htmlSnippets = defaults.snippets.filter((s) => s.scope !== 'markdown')

  it.each(htmlSnippets.map((s) => [s.prefix, s] as const))(
    '%s se construit sans variable ni jeton résiduel',
    (_prefix, snippet) => {
      for (const selected of ['', 'texte sélectionné']) {
        const { fragment, groups } = build(snippet.body, selected)
        const out = html(fragment)
        expect(out).not.toMatch(/\$\{|\$\d||/)
        for (const group of groups) expect(group.index).toBeGreaterThan(0)
      }
    }
  )
})

describe('buildSnippetFragment : injection', () => {
  it('reste autonome une fois sérialisée (injection dans l’iframe)', () => {
    const rebuilt = new Function(
      `return (${buildSnippetFragment.toString()})`
    )() as typeof buildSnippetFragment
    const { fragment, groups } = rebuilt(document, ['<p>${1:a}</p>'], '', NOW)
    expect(fragment.querySelector('[data-nf-field="1"]')!.textContent).toBe('a')
    expect(groups).toHaveLength(1)
  })
})

describe('buildSnippetFragment : variables de l’app', () => {
  it('relie /page au thème partagé avec le chemin fourni', () => {
    const page = defaults.snippets.find((s) => s.prefix === 'page')!
    expect(page.body.join('\n')).toContain('${NOTES_THEME}')
    expect(page.body.join('\n')).not.toContain('<style>')
    const built = buildSnippetFragment(
      document,
      ['<link href="${NOTES_THEME}">'],
      '',
      NOW,
      VARIABLES
    )
    expect(html(built.fragment)).toBe('<link href="../.theme/notes.css">')
  })
})
