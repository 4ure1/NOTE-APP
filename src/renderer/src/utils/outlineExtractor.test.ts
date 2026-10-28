import { describe, it, expect } from 'vitest'
import {
  extractOutlineFromHtml,
  extractOutlineFromMarkdown,
  extractOutline,
  slugifyHeading,
  stripMarkdownFormatting,
  buildOutlineTree
} from './outlineExtractor'

describe('outlineExtractor', () => {
  describe('slugifyHeading & stripMarkdownFormatting', () => {
    it('génère un slug propre sans accents ni caractères spéciaux', () => {
      expect(slugifyHeading("1. Introduction à l'Algorithmique & Graphes")).toBe(
        '1-introduction-a-l-algorithmique-graphes'
      )
      expect(slugifyHeading('  --- Titre avec espaces --- ')).toBe('titre-avec-espaces')
      expect(slugifyHeading('###')).toBe('section')
    })

    it('nettoie le formatage markdown inline des titres', () => {
      expect(stripMarkdownFormatting('**Important** : *définition* de `Foo`')).toBe(
        'Important : définition de Foo'
      )
      expect(
        stripMarkdownFormatting('Voir [Lien](https://example.com) et [[Note Interne|Alias]]')
      ).toBe('Voir Lien et Alias')
      expect(stripMarkdownFormatting('Titre avec ~~barré~~')).toBe('Titre avec barré')
    })
  })

  describe('extractOutlineFromHtml', () => {
    it('extrait les balises h1 à h6 avec leurs niveaux et leurs numéros de ligne exacts', () => {
      const html = `<!DOCTYPE html>
<html>
<body>
  <h1>Titre Principal</h1>
  <p>Paragraphe</p>
  <h2 id="custom-anchor">Sous-titre Personnalisé</h2>
  <div class="card">
    <h3>Détail Niveau 3</h3>
  </div>
</body>
</html>`

      const outline = extractOutlineFromHtml(html)
      expect(outline).toHaveLength(3)

      expect(outline[0]).toEqual({
        id: 'titre-principal',
        text: 'Titre Principal',
        level: 1,
        line: 4
      })

      expect(outline[1]).toEqual({
        id: 'custom-anchor',
        text: 'Sous-titre Personnalisé',
        level: 2,
        line: 6
      })

      expect(outline[2]).toEqual({
        id: 'detail-niveau-3',
        text: 'Détail Niveau 3',
        level: 3,
        line: 8
      })
    })

    it('ignore strictement les balises h1-h6 situées dans <pre>, <code>, <style>, <script> et commentaires', () => {
      const html = `<h1>Vrai Titre 1</h1>
<pre>
  <h2>Ce h2 dans pre ne doit PAS être extrait</h2>
</pre>
<code>
  <h3>Ce h3 dans code ne doit PAS être extrait</h3>
</code>
<script>
  // <h4>Ce h4 dans script ne doit PAS être extrait</h4>
</script>
<!-- <h5>Ce h5 en commentaire ne doit PAS être extrait</h5> -->
<h2>Vrai Titre 2</h2>`

      const outline = extractOutlineFromHtml(html)
      expect(outline).toHaveLength(2)
      expect(outline[0].text).toBe('Vrai Titre 1')
      expect(outline[0].line).toBe(1)
      expect(outline[1].text).toBe('Vrai Titre 2')
      expect(outline[1].line).toBe(12)
    })

    it('gère les doublons de titres en ajoutant un suffixe numérique incrémental', () => {
      const html = `<h2>Introduction</h2>
<p>Texte</p>
<h2>Introduction</h2>
<p>Texte</p>
<h2>Introduction</h2>`

      const outline = extractOutlineFromHtml(html)
      expect(outline).toHaveLength(3)
      expect(outline[0].id).toBe('introduction')
      expect(outline[1].id).toBe('introduction-2')
      expect(outline[2].id).toBe('introduction-3')
    })
  })

  describe('extractOutlineFromMarkdown', () => {
    it('extrait les titres de niveau 1 à 6 avec ligne source exacte', () => {
      const md = `# Chapitre 1
Introduction

## Section 1.1
Contenu

### Sous-section 1.1.1
Détail

#### Sous-section 1.1.1.1 ####
Fin`

      const outline = extractOutlineFromMarkdown(md)
      expect(outline).toHaveLength(4)

      expect(outline[0]).toEqual({
        id: 'chapitre-1',
        text: 'Chapitre 1',
        level: 1,
        line: 1
      })

      expect(outline[1]).toEqual({
        id: 'section-1-1',
        text: 'Section 1.1',
        level: 2,
        line: 4
      })

      expect(outline[2]).toEqual({
        id: 'sous-section-1-1-1',
        text: 'Sous-section 1.1.1',
        level: 3,
        line: 7
      })

      expect(outline[3]).toEqual({
        id: 'sous-section-1-1-1-1',
        text: 'Sous-section 1.1.1.1',
        level: 4,
        line: 10
      })
    })

    it('ignore les commentaires et dièses situés dans les blocs de code Markdown (```)', () => {
      const md = `# Titre Réel

\`\`\`python
# Ceci est un commentaire Python, pas un titre de document !
## Autre commentaire
\`\`\`

## Deuxième Titre Réel`

      const outline = extractOutlineFromMarkdown(md)
      expect(outline).toHaveLength(2)
      expect(outline[0].text).toBe('Titre Réel')
      expect(outline[0].line).toBe(1)
      expect(outline[1].text).toBe('Deuxième Titre Réel')
      expect(outline[1].line).toBe(8)
    })
  })

  describe('extractOutline (auto detect)', () => {
    it('détecte automatiquement le mode HTML vs Markdown', () => {
      const html = '<h1>Titre HTML</h1>'
      const md = '# Titre Markdown'

      const outHtml = extractOutline(html)
      expect(outHtml[0].text).toBe('Titre HTML')

      const outMd = extractOutline(md)
      expect(outMd[0].text).toBe('Titre Markdown')
    })
  })

  describe('buildOutlineTree', () => {
    it('construit un arbre hiérarchique pliable avec enfants imbriqués', () => {
      const headings = [
        { id: 'h1-1', text: 'H1 Premier', level: 1, line: 1 },
        { id: 'h2-1', text: 'H2 Premier sous-titre', level: 2, line: 5 },
        { id: 'h3-1', text: 'H3 Détail', level: 3, line: 10 },
        { id: 'h2-2', text: 'H2 Deuxième sous-titre', level: 2, line: 15 },
        { id: 'h1-2', text: 'H1 Second', level: 1, line: 20 }
      ]

      const tree = buildOutlineTree(headings)
      expect(tree).toHaveLength(2) // 2 H1 racines

      // Premier H1
      expect(tree[0].id).toBe('h1-1')
      expect(tree[0].children).toHaveLength(2) // 2 H2 enfants
      expect(tree[0].children[0].id).toBe('h2-1')
      expect(tree[0].children[0].children).toHaveLength(1) // 1 H3 sous h2-1
      expect(tree[0].children[0].children[0].id).toBe('h3-1')
      expect(tree[0].children[1].id).toBe('h2-2')
      expect(tree[0].children[1].children).toHaveLength(0)

      // Second H1
      expect(tree[1].id).toBe('h1-2')
      expect(tree[1].children).toHaveLength(0)
    })
  })
})
