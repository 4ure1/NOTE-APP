import { describe, it, expect, beforeEach } from 'vitest'
import { enterJumpsToNextListField } from './listFieldEnter'

const field = (i: number): Element => document.querySelectorAll('[data-nf-field]')[i]

beforeEach(() => {
  document.body.innerHTML =
    '<ul>' +
    '<li><span data-nf-field>élément</span></li>' +
    '<li><span data-nf-field>élément</span></li>' +
    '<li><span data-nf-field>élément</span></li>' +
    '</ul>' +
    '<p><span data-nf-field>texte</span></p>'
})

describe('enterJumpsToNextListField', () => {
  it('va au 2e élément tant qu’il n’a pas été modifié', () => {
    expect(enterJumpsToNextListField(field(0), field(1), 'élément', 'élément')).toBe(true)
    expect(enterJumpsToNextListField(field(1), field(2), 'élément', 'élément')).toBe(true)
  })

  it('crée une nouvelle puce si le 2e élément a déjà été modifié', () => {
    expect(enterJumpsToNextListField(field(0), field(1), 'élément', 'Pommes')).toBe(false)
    expect(enterJumpsToNextListField(field(0), field(1), 'élément', '')).toBe(false)
  })

  it('ne saute que vers l’élément juste après, dans la même liste', () => {
    expect(enterJumpsToNextListField(field(0), field(2), 'élément', 'élément')).toBe(false)
    expect(enterJumpsToNextListField(field(2), field(3), 'texte', 'texte')).toBe(false)
    expect(enterJumpsToNextListField(field(1), field(0), 'élément', 'élément')).toBe(false)
  })

  it('sans champ suivant ni texte d’origine connu : comportement habituel', () => {
    expect(enterJumpsToNextListField(field(0), null, 'élément', 'élément')).toBe(false)
    expect(enterJumpsToNextListField(field(0), field(1), undefined, 'élément')).toBe(false)
    expect(enterJumpsToNextListField(null, field(1), 'élément', 'élément')).toBe(false)
  })
})
