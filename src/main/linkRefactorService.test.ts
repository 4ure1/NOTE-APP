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

  describe('confiance limitée au plan envoyé par le renderer', () => {
    const setupVault = (): { noteA: string; plan: ReturnType<typeof prepareRenameOrMove> } => {
      const noteA = path.join(tempVaultDir, 'NoteA.html')
      fs.writeFileSync(noteA, '<a href="NoteB.html">B</a>', 'utf-8')
      fs.writeFileSync(path.join(tempVaultDir, 'NoteB.html'), '<p>B</p>', 'utf-8')
      const plan = prepareRenameOrMove(tempVaultDir, 'NoteB.html', 'NouveauB', false, false)
      return { noteA, plan }
    }

    it('refuse un plan sans identifiant ou inconnu', async () => {
      const { plan } = setupVault()
      const forged = { ...plan, planId: undefined }
      expect((await applyRenameOrMove(tempVaultDir, forged)).success).toBe(false)
      const unknown = { ...plan, planId: 'plan_0_inconnu' }
      expect((await applyRenameOrMove(tempVaultDir, unknown)).success).toBe(false)
      expect(fs.existsSync(path.join(tempVaultDir, 'NoteB.html'))).toBe(true)
    })

    it('ignore les chemins et contenus modifiés par le renderer', async () => {
      const { noteA, plan } = setupVault()
      const outside = path.join(path.dirname(tempVaultDir), `hors-vault-${Date.now()}.html`)
      const tampered = {
        ...plan,
        newPath: '../hors-vault.html',
        affectedFiles: plan.affectedFiles.map((f) => ({
          ...f,
          relativePath: path.relative(tempVaultDir, outside),
          newContent: 'PIRATÉ'
        }))
      }
      const res = await applyRenameOrMove(tempVaultDir, tampered)
      expect(res.success).toBe(true)
      expect(res.newPath).toBe('NouveauB.html')
      expect(fs.existsSync(outside)).toBe(false)
      expect(fs.readFileSync(noteA, 'utf-8')).toContain('NouveauB.html')
    })

    it('n’accepte un plan qu’une seule fois', async () => {
      const { plan } = setupVault()
      expect((await applyRenameOrMove(tempVaultDir, plan)).success).toBe(true)
      expect((await applyRenameOrMove(tempVaultDir, plan)).success).toBe(false)
    })

    it('abandonne si une note a changé depuis la préparation', async () => {
      const { noteA, plan } = setupVault()
      fs.writeFileSync(noteA, '<a href="NoteB.html">B</a><p>ajout récent</p>', 'utf-8')
      const res = await applyRenameOrMove(tempVaultDir, plan)
      expect(res.success).toBe(false)
      expect(res.error).toContain('NoteA.html')
      expect(fs.readFileSync(noteA, 'utf-8')).toContain('ajout récent')
      expect(fs.existsSync(path.join(tempVaultDir, 'NoteB.html'))).toBe(true)
    })

    it('refuse de préparer un chemin hors du vault ou un nouveau nom invalide', () => {
      fs.writeFileSync(path.join(tempVaultDir, 'NoteB.html'), '<p>B</p>', 'utf-8')
      const prepare = (oldPath: string, target: string, isMove: boolean) => () =>
        prepareRenameOrMove(tempVaultDir, oldPath, target, false, isMove)
      expect(prepare('../NoteB.html', 'X', false)).toThrow('Accès refusé')
      expect(prepare('NoteB.html', '../../X', false)).toThrow('Accès refusé')
      expect(prepare('NoteB.html', '../dehors', true)).toThrow('Accès refusé')
    })

    it('refuse un identifiant d’opération invalide et un journal falsifié', async () => {
      expect((await undoRenameOrMove(tempVaultDir, '../../x')).success).toBe(false)

      const opDir = path.join(tempVaultDir, '.history', 'link_operations')
      fs.mkdirSync(opDir, { recursive: true })
      const operationId = 'op_1_falsifie'
      const record = {
        operationId,
        timestamp: 1,
        plan: {
          oldPath: '../dehors.html',
          newPath: 'NoteB.html',
          isFolder: false,
          affectedFiles: [],
          totalChanges: 0,
          hasCollision: false
        }
      }
      fs.writeFileSync(path.join(opDir, `${operationId}.json`), JSON.stringify(record), 'utf-8')
      const res = await undoRenameOrMove(tempVaultDir, operationId)
      expect(res.success).toBe(false)
      expect(res.error).toContain('Accès refusé')
    })
  })
})
