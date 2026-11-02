import { describe, it, expect } from 'vitest'
import { generateDynamicSnippets } from '../../../shared/dynamicSnippets'
import { buildSnippetFragment } from '../../../shared/snippetFields'
import { expandSnippet } from './snippetEngine'

const NOW = new Date(2026, 10, 2)

function only(query: string): ReturnType<typeof generateDynamicSnippets>[number] {
  const results = generateDynamicSnippets(query)
  expect(results, query).toHaveLength(1)
  return results[0]
}

function fragmentOf(query: string): DocumentFragment {
  return buildSnippetFragment(document, only(query).body, '', NOW).fragment
}

describe('generateDynamicSnippets : noms complets', () => {
  it('/table-3-2 : 3 colonnes, 1 ligne d’en-tête et 2 lignes', () => {
    const s = only('table-3-2')
    expect(s).toMatchObject({ prefix: 'table-3-2', scope: 'html', category: 'Mise en page' })
    expect(s.name).toBe('Tableau 3 colonnes × 2 lignes')
    const frag = fragmentOf('table-3-2')
    expect(frag.querySelectorAll('tr')).toHaveLength(3)
    expect(frag.querySelectorAll('th')).toHaveLength(3)
    expect(frag.querySelectorAll('td')).toHaveLength(6)
  })

  it('/cards-4 et /card-4 : 4 cartes canvas de couleurs différentes', () => {
    for (const q of ['cards-4', 'card-4']) {
      const frag = fragmentOf(q)
      expect(frag.querySelector('.nodes'), q).not.toBeNull()
      const nodes = Array.from(frag.querySelectorAll('.node')).map((el) => el.className)
      expect(nodes, q).toEqual(['node red', 'node orange', 'node yellow', 'node green'])
      expect(frag.querySelectorAll('.node > .node-title'), q).toHaveLength(4)
    }
    expect(only('card-4').prefix).toBe('card-4')
  })

  it('/canvas-5 : cartes placées, numérotées, et zone des flèches', () => {
    const frag = fragmentOf('canvas-5')
    const canvas = frag.querySelector('.canvas') as HTMLElement
    expect(canvas.style.height).toBe('404px')
    expect(canvas.querySelector('svg.canvas-links')).not.toBeNull()
    const nodes = Array.from(canvas.querySelectorAll('.node')) as HTMLElement[]
    expect(nodes.map((n) => n.getAttribute('data-node'))).toEqual(['1', '2', '3', '4', '5'])
    expect([nodes[3].style.left, nodes[3].style.top]).toEqual(['24px', '214px'])
  })

  it('/etapes-6 : couleurs qui reprennent au début après la cinquième', () => {
    const labels = Array.from(fragmentOf('etapes-6').querySelectorAll('.label')).map((el) =>
      (el.textContent || '').trim()
    )
    expect(labels[0]).toBe('Étape 1 : Titre')
    expect(labels[5]).toBe('Étape 6 : Titre')
    expect(fragmentOf('etapes-6').querySelectorAll('.step')[5].className).toBe('step')
  })

  it('/ul-5 et /ol-5 : listes de 5 éléments', () => {
    expect(fragmentOf('ul-5').querySelectorAll('ul > li')).toHaveLength(5)
    expect(fragmentOf('ol-5').querySelectorAll('ol > li')).toHaveLength(5)
  })

  it('/qcm-5 : 5 choix A → E et une réponse au choix parmi eux', () => {
    const s = only('qcm-5')
    const text = s.body.join('\n')
    expect(text).toContain('E) ')
    expect(text).toContain('|A,B,C,D,E|')
    const { groups } = buildSnippetFragment(document, s.body, '', NOW)
    expect(groups.find((g) => g.occurrences[0].choices)?.occurrences[0].choices).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E'
    ])
  })

  it('/colonnes-3 : grille de 3 colonnes', () => {
    const frag = fragmentOf('colonnes-3')
    expect(frag.querySelector('.duo')!.getAttribute('style')).toContain('repeat(3, minmax(0, 1fr))')
    expect(frag.querySelectorAll('.duo > div')).toHaveLength(3)
  })

  it('/tbl-2-3 : tableau Markdown de 2 colonnes et 3 lignes', () => {
    const s = only('tbl-2-3')
    expect(s.scope).toBe('markdown')
    const text = expandSnippet(s.body).text
    const rows = text.trim().split('\n')
    expect(rows).toHaveLength(5)
    expect(rows[0]).toBe('| Col 1 | Col 2 |')
    expect(rows[1]).toBe('| --- | --- |')
  })
})

describe('generateDynamicSnippets : limites et saisies invalides', () => {
  it('ramène les nombres dans les limites', () => {
    expect(only('table-99-500').prefix).toBe('table-10-30')
    expect(only('cards-0').prefix).toBe('cards-1')
    expect(only('qcm-1').prefix).toBe('qcm-2')
    expect(only('colonnes-20').prefix).toBe('colonnes-6')
  })

  it('ignore la casse et les espaces autour', () => {
    expect(only('  Table-2-2 ').prefix).toBe('table-2-2')
  })

  it('ne propose rien pour une saisie trop courte ou sans rapport', () => {
    expect(generateDynamicSnippets('')).toEqual([])
    expect(generateDynamicSnippets('t')).toEqual([])
    expect(generateDynamicSnippets('zzz')).toEqual([])
    expect(generateDynamicSnippets('tableau')).toEqual([])
  })

  it('un nombre de paramètres faux donne l’exemple, pas un snippet faux', () => {
    expect(only('table-3').prefix).toBe('table-3-3')
    expect(only('table-3-').prefix).toBe('table-3-3')
    expect(only('cards-2-2').prefix).toBe('cards-3')
  })
})

describe('generateDynamicSnippets : débuts de nom', () => {
  it('propose un exemple avec la syntaxe en description', () => {
    const s = only('tab')
    expect(s.prefix).toBe('table-3-3')
    expect(s.description).toContain('/table-C-L')
  })

  it('un seul exemple pour /card (pas de doublon cards / card)', () => {
    expect(generateDynamicSnippets('card').map((s) => s.prefix)).toEqual(['cards-3'])
  })
})

describe('generateDynamicSnippets : passage dans les moteurs', () => {
  const queries = [
    'table-1-1',
    'table-10-30',
    'cards-12',
    'canvas-12',
    'etapes-12',
    'ul-20',
    'ol-1',
    'qcm-26',
    'colonnes-6',
    'tbl-10-30'
  ]

  it.each(queries)('%s se développe sans champ ni variable résiduels', (q) => {
    const s = only(q)
    expect(expandSnippet(s.body).text).not.toMatch(/\$\{|\$\d/)
    if (s.scope === 'html') {
      const holder = document.createElement('div')
      holder.appendChild(buildSnippetFragment(document, s.body, '', NOW).fragment)
      expect(holder.innerHTML).not.toMatch(/\$\{|\$\d||/)
    }
  })

  it('reste autonome une fois sérialisée (injection dans l’iframe)', () => {
    const rebuilt = new Function(
      `return (${generateDynamicSnippets.toString()})`
    )() as typeof generateDynamicSnippets
    expect(rebuilt('table-2-2')[0].prefix).toBe('table-2-2')
  })
})
