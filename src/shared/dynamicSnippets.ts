/**
 * Snippets « à nombre », générés à la volée d'après ce qui est tapé après « / » :
 * /table-3-2 (3 colonnes, 2 lignes), /cards-4 ou /card-4 (.step), /cardf-4 (cartes canvas), /canvas-4, /etapes-5, /ul-6, /ol-6, /qcm-5,
 * /colonnes-3, et /tbl-3-2 (tableau Markdown).
 *
 * - Nom complet : le snippet demandé (nombres ramenés dans les limites).
 * - Début de nom (/tab, /card, /table-) : un exemple, avec la syntaxe en description.
 * Les snippets produits ont le format habituel (corps en lignes, champs ${n:…}, $0) et passent par les
 * moteurs existants (aperçu, Monaco, éditeur Markdown).
 *
 * Fonction autonome (aucun import, aucune constante externe) : sa source est injectée telle quelle
 * dans l'iframe d'aperçu (CodeWorkspace.tsx) via toString().
 */

export interface DynamicSnippet {
  prefix: string
  id: string
  name: string
  description: string
  category: string
  scope: 'html' | 'markdown'
  body: string[]
}

export function generateDynamicSnippets(query: string): DynamicSnippet[] {
  const D = '$'
  const STEP_COLORS = ['', 'purple', 'orange', 'green', 'red']
  const NODE_COLORS = ['red', 'orange', 'yellow', 'green', 'purple', 'teal', 'blue', 'brown']
  const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n))
  const field = (n: number, def: string): string => D + '{' + n + ':' + def + '}'
  const empty = (n: number): string => D + '{' + n + ':}'
  const plural = (n: number, word: string): string => n + ' ' + word + (n > 1 ? 's' : '')
  const stepClass = (i: number): string => {
    const color = STEP_COLORS[i % STEP_COLORS.length]
    return color ? 'step ' + color : 'step'
  }
  const list = (tag: string, count: number): string[] => {
    const lines = ['<' + tag + '>']
    for (let i = 0; i < count; i++) {
      lines.push('  <li>' + field(i + 1, 'Élément ' + (i + 1)) + '</li>')
    }
    return lines.concat(['</' + tag + '>', '', D + '0'])
  }

  // names : noms acceptés (le premier sert aux exemples) ; syntax : aide affichée ; limits : [min, max]
  const generators: Array<{
    names: string[]
    syntax: string
    example: number[]
    limits: Array<[number, number]>
    scope: 'html' | 'markdown'
    category: string
    title: (n: number[]) => string
    build: (n: number[]) => string[]
  }> = [
    {
      names: ['table'],
      syntax: 'table-C-L (colonnes, lignes)',
      example: [3, 3],
      limits: [
        [1, 10],
        [1, 30]
      ],
      scope: 'html',
      category: 'Mise en page',
      title: (n) => 'Tableau ' + plural(n[0], 'colonne') + ' × ' + plural(n[1], 'ligne'),
      build: ([cols, rows]) => {
        let k = 1
        let head = ''
        for (let c = 1; c <= cols; c++) head += '<th>' + field(k++, 'Colonne ' + c) + '</th>'
        const lines = ['<table>', '  <tr>' + head + '</tr>']
        for (let r = 0; r < rows; r++) {
          let cells = ''
          for (let c = 0; c < cols; c++) cells += '<td>' + empty(k++) + '</td>'
          lines.push('  <tr>' + cells + '</tr>')
        }
        return lines.concat(['</table>', '', D + '0'])
      }
    },
    {
      names: ['cards', 'card'],
      syntax: 'cards-N (nombre de cartes)',
      example: [3],
      limits: [[1, 12]],
      scope: 'html',
      category: 'Mise en page',
      title: (n) => plural(n[0], 'carte') + ' .step de couleurs différentes',
      build: ([count]) => {
        let k = 1
        const lines = [
          '<div class="duo" style="grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));">'
        ]
        for (let i = 0; i < count; i++) {
          lines.push('  <div class="' + stepClass(i) + '">')
          lines.push('    <span class="label">' + field(k++, 'Carte ' + (i + 1)) + '</span>')
          lines.push('    ' + field(k++, 'Contenu'))
          lines.push('  </div>')
        }
        return lines.concat(['</div>', '', D + '0'])
      }
    },
    {
      // Cartes au style canvas (fond teinté, bordure de couleur, titre en gras), en rangée
      names: ['cardf'],
      syntax: 'cardf-N (nombre de cartes)',
      example: [3],
      limits: [[1, 12]],
      scope: 'html',
      category: 'Mise en page',
      title: (n) => plural(n[0], 'carte') + ' canvas de couleurs différentes',
      build: ([count]) => {
        let k = 1
        const lines = ['<div class="nodes">']
        for (let i = 0; i < count; i++) {
          lines.push('  <div class="node ' + NODE_COLORS[i % NODE_COLORS.length] + '">')
          lines.push('    <div class="node-title">' + field(k++, 'Carte ' + (i + 1)) + '</div>')
          lines.push('    <p>' + field(k++, 'Contenu') + '</p>')
          lines.push('  </div>')
        }
        return lines.concat(['</div>', '', D + '0'])
      }
    },
    {
      names: ['canvas'],
      syntax: 'canvas-N (nombre de cartes à relier)',
      example: [3],
      limits: [[1, 12]],
      scope: 'html',
      category: 'Mise en page',
      title: (n) => 'Canvas de ' + plural(n[0], 'carte') + ' à relier par des flèches',
      build: ([count]) => {
        // Grille de départ (3 par ligne) ; ensuite les cartes se déplacent et se relient dans l'aperçu
        const COLS = Math.min(count, 3)
        const rows = Math.ceil(count / COLS)
        const height = 24 + rows * 190
        let k = 1
        const lines = [
          '<div class="canvas" style="height: ' + height + 'px;">',
          '  <svg class="canvas-links"></svg>'
        ]
        for (let i = 0; i < count; i++) {
          const left = 24 + (i % COLS) * 290
          const top = 24 + Math.floor(i / COLS) * 190
          lines.push(
            '  <div class="node ' +
              NODE_COLORS[i % NODE_COLORS.length] +
              '" data-node="' +
              (i + 1) +
              '" style="left: ' +
              left +
              'px; top: ' +
              top +
              'px; width: 230px;">'
          )
          lines.push('    <div class="node-title">' + field(k++, 'Titre ' + (i + 1)) + '</div>')
          lines.push('    <p>' + field(k++, 'Texte') + '</p>')
          lines.push('  </div>')
        }
        return lines.concat(['</div>', '', D + '0'])
      }
    },
    {
      names: ['etapes'],
      syntax: 'etapes-N (nombre d’étapes)',
      example: [3],
      limits: [[1, 12]],
      scope: 'html',
      category: 'Blocs',
      title: (n) => 'Étapes 1 → ' + n[0],
      build: ([count]) => {
        let k = 1
        const lines: string[] = []
        for (let i = 0; i < count; i++) {
          lines.push('<div class="' + stepClass(i) + '">')
          lines.push(
            '  <span class="label">Étape ' + (i + 1) + ' : ' + field(k++, 'Titre') + '</span>'
          )
          lines.push('  ' + field(k++, 'Description'))
          lines.push('</div>')
        }
        return lines.concat(['', D + '0'])
      }
    },
    {
      names: ['ul'],
      syntax: 'ul-N (nombre d’éléments)',
      example: [3],
      limits: [[1, 20]],
      scope: 'html',
      category: 'Texte',
      title: (n) => 'Liste à puces de ' + plural(n[0], 'élément'),
      build: ([count]) => list('ul', count)
    },
    {
      names: ['ol'],
      syntax: 'ol-N (nombre d’éléments)',
      example: [3],
      limits: [[1, 20]],
      scope: 'html',
      category: 'Texte',
      title: (n) => 'Liste numérotée de ' + plural(n[0], 'élément'),
      build: ([count]) => list('ol', count)
    },
    {
      names: ['qcm'],
      syntax: 'qcm-N (nombre de choix)',
      example: [4],
      limits: [[2, 26]],
      scope: 'html',
      category: 'Quiz',
      title: (n) => 'Question QCM à ' + n[0] + ' choix',
      build: ([count]) => {
        let k = 3
        const letters: string[] = []
        const choices: string[] = []
        for (let i = 0; i < count; i++) {
          const letter = String.fromCharCode(65 + i)
          letters.push(letter)
          const end = i < count - 1 ? '<br>' : '</p>'
          choices.push((i === 0 ? '  <p>' : '  ') + letter + ') ' + empty(k++) + end)
        }
        return [
          '<div class="quiz-item">',
          '  <div class="q-title">Question ' +
            field(1, '1') +
            ' (QCM) — ' +
            field(2, 'Énoncé ?') +
            '</div>'
        ]
          .concat(choices)
          .concat([
            '  <details><summary>Voir la correction</summary>',
            '    <p><strong>Réponse : ' +
              D +
              '{' +
              k +
              '|' +
              letters.join(',') +
              '|}.</strong> ' +
              field(k + 1, 'Explication') +
              '</p>',
            '  </details>',
            '</div>',
            '',
            D + '0'
          ])
      }
    },
    {
      names: ['colonnes'],
      syntax: 'colonnes-N (nombre de colonnes)',
      example: [3],
      limits: [[2, 6]],
      scope: 'html',
      category: 'Mise en page',
      title: (n) => n[0] + ' colonnes côte à côte',
      build: ([count]) => {
        const lines = [
          '<div class="duo" style="grid-template-columns: repeat(' + count + ', minmax(0, 1fr));">'
        ]
        for (let i = 0; i < count; i++) {
          lines.push('  <div>', '    ' + field(i + 1, 'Colonne ' + (i + 1)), '  </div>')
        }
        return lines.concat(['</div>', '', D + '0'])
      }
    },
    {
      names: ['tbl'],
      syntax: 'tbl-C-L (colonnes, lignes)',
      example: [3, 3],
      limits: [
        [1, 10],
        [1, 30]
      ],
      scope: 'markdown',
      category: 'Markdown',
      title: (n) => 'Tableau Markdown ' + plural(n[0], 'colonne') + ' × ' + plural(n[1], 'ligne'),
      build: ([cols, rows]) => {
        let k = 1
        const head: string[] = []
        const sep: string[] = []
        for (let c = 1; c <= cols; c++) {
          head.push(field(k++, 'Col ' + c))
          sep.push('---')
        }
        const lines = ['| ' + head.join(' | ') + ' |', '| ' + sep.join(' | ') + ' |']
        for (let r = 0; r < rows; r++) {
          const cells: string[] = []
          for (let c = 0; c < cols; c++) cells.push(empty(k++))
          lines.push('| ' + cells.join(' | ') + ' |')
        }
        return lines.concat(['', D + '0'])
      }
    }
  ]

  const q = String(query || '')
    .trim()
    .toLowerCase()
  if (q.length < 2) return []

  const results: DynamicSnippet[] = []
  for (const gen of generators) {
    const count = gen.limits.length
    let chosenName: string | null = null
    let values: number[] | null = null
    let exact = false
    for (const name of gen.names) {
      const full = new RegExp('^' + name + '((?:-\\d+){' + count + '})$').exec(q)
      if (full) {
        chosenName = name
        values = full[1]
          .slice(1)
          .split('-')
          .map((v, i) => clamp(parseInt(v, 10), gen.limits[i][0], gen.limits[i][1]))
        exact = true
        break
      }
    }
    if (!values) {
      // Début de nom, ou nom suivi de nombres incomplets : un exemple
      const partial = gen.names.some((name) => name.indexOf(q) === 0 || q.indexOf(name + '-') === 0)
      if (!partial) continue
      chosenName = gen.names[0]
      values = gen.example.slice()
    }
    const prefix = chosenName + '-' + values.join('-')
    const syntax = gen.syntax.replace(gen.names[0], String(chosenName))
    results.push({
      prefix,
      id: prefix,
      name: gen.title(values),
      description: exact
        ? 'Généré pour /' + prefix + ' — syntaxe : /' + syntax
        : 'Exemple — tape /' + syntax + ' pour choisir le nombre',
      category: gen.category,
      scope: gen.scope,
      body: gen.build(values)
    })
  }
  return results
}
