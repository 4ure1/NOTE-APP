import { describe, it, expect } from 'vitest'
import { detectNextSession, expandTemplate } from './sessionDetector'

describe('sessionDetector', () => {
  describe('detectNextSession', () => {
    it('détecte la séance suivante dans un dossier avec motif classique poo-seance-XX', () => {
      const files = ['poo-seance-01.html', 'poo-seance-02.html', 'poo-seance-03.html', 'readme.md']
      const suggestion = detectNextSession('POO', files)

      expect(suggestion.nextSessionNumber).toBe(4)
      expect(suggestion.suggestedFileName).toBe('poo-seance-04.html')
      expect(suggestion.suggestedTitle).toBe('POO - Séance 04')
      expect(suggestion.extension).toBe('html')
    })

    it('gère les chemins avec sous-dossiers et extensions Markdown', () => {
      const files = ['universite/l3/algo/algo-cours-01.md', 'universite/l3/algo/algo-cours-02.md']
      const suggestion = detectNextSession('universite/l3/algo', files)

      expect(suggestion.nextSessionNumber).toBe(3)
      expect(suggestion.suggestedFileName).toBe('algo-cours-03.md')
      expect(suggestion.suggestedTitle).toBe('Algo - Séance 03')
      expect(suggestion.extension).toBe('md')
    })

    it('détecte les motifs courts comme S01, S02', () => {
      const files = ['S01.html', 'S02.html']
      const suggestion = detectNextSession('Mathematiques', files)

      expect(suggestion.nextSessionNumber).toBe(3)
      expect(suggestion.suggestedFileName).toBe('S03.html')
      expect(suggestion.extension).toBe('html')
    })

    it("propose la séance 01 par défaut si aucun fichier de séance n'existe dans le dossier", () => {
      const files = ['intro.html', 'notes.md', 'ressources.pdf']
      const suggestion = detectNextSession('Systemes-Exploitation', files)

      expect(suggestion.nextSessionNumber).toBe(1)
      expect(suggestion.suggestedFileName).toBe('systemes-exploitation-seance-01.html')
      expect(suggestion.suggestedTitle).toBe('Systemes Exploitation - Séance 01')
      expect(suggestion.extension).toBe('html')
    })

    it('gère un dossier complètement vide', () => {
      const suggestion = detectNextSession('Intelligence-Artificielle', [])

      expect(suggestion.nextSessionNumber).toBe(1)
      expect(suggestion.suggestedFileName).toBe('intelligence-artificielle-seance-01.html')
      expect(suggestion.suggestedTitle).toBe('Intelligence Artificielle - Séance 01')
    })
  })

  describe('expandTemplate', () => {
    it('remplace toutes les variables contextuelles du modèle', () => {
      const template = `<h1>\${NOTE_TITLE}</h1>
<p>Matière : \${FOLDER_NAME}</p>
<p>Séance n°\${SESSION_NUMBER} (\${SESSION_NUMBER_PAD})</p>
<p>Date : \${CURRENT_DATE}</p>
<p>Tags : \${TAGS}</p>`

      const result = expandTemplate(template, {
        noteTitle: 'POO - Séance 04',
        folderName: 'POO',
        sessionNumber: 4,
        tags: ['java', 'cours'],
        currentDate: '2026-10-28'
      })

      expect(result).toContain('<h1>POO - Séance 04</h1>')
      expect(result).toContain('<p>Matière : POO</p>')
      expect(result).toContain('<p>Séance n°4 (04)</p>')
      expect(result).toContain('<p>Date : 2026-10-28</p>')
      expect(result).toContain('<p>Tags : java, cours</p>')
    })

    it('nettoie les tabstops TextMate (${1:placeholder} et $0)', () => {
      const template = `<h2>\${1:Titre par défaut}</h2>
<p>\${2:Contenu initial}</p>
$0`

      const result = expandTemplate(template, {
        noteTitle: 'Test'
      })

      expect(result).toBe(`<h2>Titre par défaut</h2>
<p>Contenu initial</p>
`)
    })
  })
})
