import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { prepareRenameOrMove, applyRenameOrMove, undoRenameOrMove } from './linkRefactorService'

describe('linkRefactorService - Tests d’intégration sur dossier temporaire', () => {
  let tempVaultDir: string

  beforeEach(() => {
    // Création d'un dossier temporaire isolé pour ne JAMAIS toucher aux vraies notes
    tempVaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'note-app-test-vault-'))
  })

  afterEach(() => {
    // Nettoyage complet du dossier temporaire
    if (fs.existsSync(tempVaultDir)) {
      fs.rmSync(tempVaultDir, { recursive: true, force: true })
    }
  })

  it('exécute un renommage sûr, met à jour les liens sur disque et permet l’annulation en 1 clic', async () => {
    // 1. Initialiser une vault de test avec des notes interconnectées
    const noteAPath = path.join(tempVaultDir, 'NoteA.html')
    const noteBPath = path.join(tempVaultDir, 'NoteB.html')
    const subFolder = path.join(tempVaultDir, 'dossier')
    fs.mkdirSync(subFolder, { recursive: true })
    const noteCPath = path.join(subFolder, 'NoteC.html')

    const initialContentA = `
<h1>Note A</h1>
<p>Lien vers <a href="NoteB.html#section1">Note B</a></p>
<p>Wikilink : [[NoteB|Alias B]]</p>
<pre><code>[[NoteB]] non modifiable</code></pre>
`
    const initialContentC = `
<p>Depuis le sous-dossier vers <a href="../NoteB.html">Note B</a></p>
<p>Image : <img src="../images/schema.png" /></p>
`
    const initialContentB = `<h1>Note B</h1><p>Contenu cible</p>`

    fs.writeFileSync(noteAPath, initialContentA, 'utf-8')
    fs.writeFileSync(noteBPath, initialContentB, 'utf-8')
    fs.writeFileSync(noteCPath, initialContentC, 'utf-8')

    // 2. Préparer le plan de renommage de NoteB.html -> NouveauB.html
    const plan = prepareRenameOrMove(tempVaultDir, 'NoteB.html', 'NouveauB', false, false)

    expect(plan.hasCollision).toBe(false)
    expect(plan.newPath).toBe('NouveauB.html')
    expect(plan.affectedFiles.length).toBe(2) // NoteA.html et dossier/NoteC.html
    expect(plan.totalChanges).toBe(3) // 2 dans NoteA, 1 dans NoteC

    // 3. Appliquer le renommage
    const applyResult = await applyRenameOrMove(tempVaultDir, plan)
    expect(applyResult.success).toBe(true)
    expect(applyResult.operationId).toBeDefined()

    // Vérifier l'état sur disque après application
    expect(fs.existsSync(path.join(tempVaultDir, 'NoteB.html'))).toBe(false)
    expect(fs.existsSync(path.join(tempVaultDir, 'NouveauB.html'))).toBe(true)

    const updatedContentA = fs.readFileSync(noteAPath, 'utf-8')
    expect(updatedContentA).toContain('<a href="NouveauB.html#section1">Note B</a>')
    expect(updatedContentA).toContain('[[NouveauB|Alias B]]')
    expect(updatedContentA).toContain('<pre><code>[[NoteB]] non modifiable</code></pre>')

    const updatedContentC = fs.readFileSync(noteCPath, 'utf-8')
    expect(updatedContentC).toContain('<a href="../NouveauB.html">Note B</a>')

    // Vérifier qu'un snapshot Time Travel a bien été créé
    const historyDir = path.join(tempVaultDir, '.history')
    expect(fs.existsSync(historyDir)).toBe(true)

    // 4. Tester l'annulation (Undo)
    const undoResult = await undoRenameOrMove(tempVaultDir, applyResult.operationId)
    expect(undoResult.success).toBe(true)
    expect(undoResult.restoredPath).toBe('NoteB.html')

    // Vérifier que tout est restauré à l'état initial sur le disque
    expect(fs.existsSync(path.join(tempVaultDir, 'NoteB.html'))).toBe(true)
    expect(fs.existsSync(path.join(tempVaultDir, 'NouveauB.html'))).toBe(false)

    const restoredContentA = fs.readFileSync(noteAPath, 'utf-8')
    expect(restoredContentA).toBe(initialContentA)

    const restoredContentC = fs.readFileSync(noteCPath, 'utf-8')
    expect(restoredContentC).toBe(initialContentC)
  })

  it('gère le déplacement d’un dossier complet avec mise à jour des chemins relatifs', async () => {
    const coursDir = path.join(tempVaultDir, 'cours')
    fs.mkdirSync(coursDir, { recursive: true })

    const note1 = path.join(coursDir, 'algo.html')
    fs.writeFileSync(note1, '<p>Algorithmique</p>', 'utf-8')

    const rootNote = path.join(tempVaultDir, 'sommaire.html')
    fs.writeFileSync(rootNote, '<a href="cours/algo.html">Lien Algo</a>', 'utf-8')

    // Déplacer cours -> archives/cours
    const plan = prepareRenameOrMove(tempVaultDir, 'cours', 'archives', true, true)
    expect(plan.newPath).toBe('archives/cours')
    expect(plan.totalChanges).toBe(1)

    const applyRes = await applyRenameOrMove(tempVaultDir, plan)
    expect(applyRes.success).toBe(true)

    expect(fs.existsSync(path.join(tempVaultDir, 'archives', 'cours', 'algo.html'))).toBe(true)
    const updatedSommaire = fs.readFileSync(rootNote, 'utf-8')
    expect(updatedSommaire).toContain('href="archives/cours/algo.html"')

    // Annuler
    const undoRes = await undoRenameOrMove(tempVaultDir, applyRes.operationId)
    expect(undoRes.success).toBe(true)
    expect(fs.existsSync(path.join(tempVaultDir, 'cours', 'algo.html'))).toBe(true)
    expect(fs.readFileSync(rootNote, 'utf-8')).toContain('href="cours/algo.html"')
  })
})
