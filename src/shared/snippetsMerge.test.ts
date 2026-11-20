import { describe, it, expect } from 'vitest'
import { mergeDefaultSnippets, replaceRetiredDefaults } from './snippetsMerge'

const s = (prefix: string, body = prefix): { prefix: string; id: string; body: string } => ({
  prefix,
  id: prefix,
  body
})

describe('mergeDefaultSnippets', () => {
  it('ajoute les snippets par défaut absents du fichier de l’utilisateur, après les siens', () => {
    const merged = mergeDefaultSnippets([s('h1'), s('hk')], [s('h1'), s('hk'), s('ho'), s('hb')])
    expect(merged.map((x) => x.prefix)).toEqual(['h1', 'hk', 'ho', 'hb'])
  })

  it('garde la version de l’utilisateur pour un même préfixe ou un même id, sans tenir compte de la casse', () => {
    const merged = mergeDefaultSnippets(
      [s('page', 'ma page'), { prefix: 'Note', id: 'note', body: 'mon bloc' }],
      [s('page', 'page par défaut'), s('note', 'note par défaut')]
    )
    expect(merged).toEqual([s('page', 'ma page'), { prefix: 'Note', id: 'note', body: 'mon bloc' }])
  })

  it('masque les snippets par défaut listés dans disabledDefaults', () => {
    const merged = mergeDefaultSnippets([s('h1')], [s('h1'), s('ho'), s('hb')], ['HB'])
    expect(merged.map((x) => x.prefix)).toEqual(['h1', 'ho'])
  })

  it('ignore un disabledDefaults mal formé', () => {
    const merged = mergeDefaultSnippets([], [s('ho')], 'ho')
    expect(merged.map((x) => x.prefix)).toEqual(['ho'])
  })

  it('ne modifie pas les tableaux reçus', () => {
    const user = [s('h1')]
    const defaults = [s('h1'), s('ho')]
    mergeDefaultSnippets(user, defaults)
    expect(user).toHaveLength(1)
    expect(defaults).toHaveLength(2)
  })
})

describe('replaceRetiredDefaults', () => {
  const defaults = [
    { prefix: 'divider', id: 'divider', body: ['<hr class="rule">', '$0'] },
    { prefix: 'chapitre', id: 'chapitre', body: ['<div class="chapter-break">${1:Chapitre}</div>'] }
  ]

  it('remplace un ancien /divider par défaut jamais modifié', () => {
    const user = [
      { prefix: 'divider', id: 'divider', body: ['<div class="divider">⸻</div>'] },
      { prefix: 'note', body: 'x' }
    ]
    const out = replaceRetiredDefaults(user, defaults)
    expect(out[0].body).toEqual(['<hr class="rule">', '$0'])
    expect(out[1]).toBe(user[1])
  })

  it('remplace aussi la version « chapitre » de /divider', () => {
    const user = [
      {
        prefix: 'divider',
        id: 'divider',
        body: ['<div class="chapter-break">${1:Chapitre}</div>', '$0']
      }
    ]
    expect(replaceRetiredDefaults(user, defaults)[0].body).toEqual(['<hr class="rule">', '$0'])
  })

  it('garde un /divider personnalisé', () => {
    const user = [{ prefix: 'divider', id: 'divider', body: ['<hr class="mon-trait">'] }]
    expect(replaceRetiredDefaults(user, defaults)[0]).toBe(user[0])
  })
})
