import { describe, it, expect } from 'vitest'
import {
  updateLinksInContent,
  buildRenamePlan,
  computePosixRelativePath,
  resolvePosixPath
} from './linkUpdater'

describe('linkUpdater - Utilitaires de chemins POSIX', () => {
  it('calcule correctement les chemins relatifs entre dossiers', () => {
    expect(computePosixRelativePath('cours/maths', 'cours/maths/algebre.html')).toBe('algebre.html')
    expect(computePosixRelativePath('cours/maths', 'cours/physique/optique.html')).toBe(
      '../physique/optique.html'
    )
    expect(computePosixRelativePath('cours/maths/tp', 'assets/image.png')).toBe(
      '../../../assets/image.png'
    )
    expect(computePosixRelativePath('', 'cours/note.html')).toBe('cours/note.html')
  })

  it('résout correctement les chemins relatifs dans la vault', () => {
    expect(resolvePosixPath('cours/maths', '../physique/optique.html')).toBe(
      'cours/physique/optique.html'
    )
    expect(resolvePosixPath('cours', 'note.html')).toBe('cours/note.html')
    expect(resolvePosixPath('cours/maths/tp', '../../assets/img.png')).toBe('cours/assets/img.png')
    expect(resolvePosixPath('', 'note.html')).toBe('note.html')
  })
})

describe('linkUpdater - Protection du code et scripts', () => {
  it('ignore strictement les liens dans <pre>, <code>, ```, et <script>/<style>', () => {
    const raw = `
<p>Voir <a href="ancien.html">Ma Note</a></p>
<pre>
  &lt;a href="ancien.html"&gt;Ne pas toucher&lt;/a&gt;
  [[ancien]]
</pre>
<code>[[ancien]] et <a href="ancien.html">ici</a></code>
\`\`\`javascript
const x = "[[ancien]]";
const link = "ancien.html";
\`\`\`
\`[[ancien]]\`
<style>
  /* [[ancien]] href="ancien.html" */
</style>
<script>
  console.log('[[ancien]]');
</script>
<p>Fin [[ancien#Section]]</p>
`
    const { updatedContent, changes } = updateLinksInContent(
      'index.html',
      raw,
      'ancien.html',
      'nouveau.html',
      false
    )

    // Seuls les 2 liens hors zones protégées doivent être changés
    expect(changes.length).toBe(2)
    expect(updatedContent).toContain('<a href="nouveau.html">Ma Note</a>')
    expect(updatedContent).toContain('Fin [[nouveau#Section]]')

    // Les zones protégées doivent être parfaitement intactes
    expect(updatedContent).toContain('&lt;a href="ancien.html"&gt;Ne pas toucher&lt;/a&gt;')
    expect(updatedContent).toContain(
      '<pre>\n  &lt;a href="ancien.html"&gt;Ne pas toucher&lt;/a&gt;\n  [[ancien]]\n</pre>'
    )
    expect(updatedContent).toContain('<code>[[ancien]] et <a href="ancien.html">ici</a></code>')
    expect(updatedContent).toContain('const x = "[[ancien]]";')
    expect(updatedContent).toContain('`[[ancien]]`')
    expect(updatedContent).toContain('/* [[ancien]] href="ancien.html" */')
    expect(updatedContent).toContain("console.log('[[ancien]]');")
  })
})

describe('linkUpdater - WikiLinks', () => {
  it('met à jour [[Nom]], [[Nom|alias]], [[Nom#titre]], ![[Nom]]', () => {
    const content = `
Bienvenue sur [[Ancienne Note]].
Consultez aussi [[Ancienne Note|Le Guide]] ou [[Ancienne Note#Chapitre 1]].
Et même [[Ancienne Note#Chapitre 2|Section 2]].
Image intégrée : ![[Ancienne Note]].
`
    const { updatedContent, changes } = updateLinksInContent(
      'sommaire.md',
      content,
      'Ancienne Note.html',
      'Nouvelle Note.html',
      false
    )

    expect(changes.length).toBe(5)
    expect(updatedContent).toContain('[[Nouvelle Note]]')
    expect(updatedContent).toContain('[[Nouvelle Note|Le Guide]]')
    expect(updatedContent).toContain('[[Nouvelle Note#Chapitre 1]]')
    expect(updatedContent).toContain('[[Nouvelle Note#Chapitre 2|Section 2]]')
    expect(updatedContent).toContain('![[Nouvelle Note]]')
  })

  it('gère les caractères accentués, espaces et différences de casse', () => {
    const content = `
Voir [[Algèbre Linéaire]] et [[algèbre linéaire#intro|Intro]].
`
    const { updatedContent, changes } = updateLinksInContent(
      'index.html',
      content,
      'Algèbre Linéaire.html',
      'Géométrie & Topologie.html',
      false
    )

    expect(changes.length).toBe(2)
    expect(updatedContent).toContain('[[Géométrie & Topologie]]')
    expect(updatedContent).toContain('[[Géométrie & Topologie#intro|Intro]]')
  })
})

describe('linkUpdater - Liens HTML et Markdown', () => {
  it('met à jour href, src et liens Markdown avec recalcul de chemin relatif', () => {
    const content = `
<p><a href="../cours/ancien.html">Lien HTML</a></p>
<img src="../cours/ancien.html" alt="img" />
[Mon doc](../cours/ancien.html#sec)
![Mon image](../cours/ancien.html)
`
    // Fichier référençant situé dans 'tp/lab1.html'
    // Ancienne cible : 'cours/ancien.html' -> relative : '../cours/ancien.html'
    // Nouvelle cible : 'archives/nouveau.html' -> relative depuis 'tp' : '../archives/nouveau.html'
    const { updatedContent, changes } = updateLinksInContent(
      'tp/lab1.html',
      content,
      'cours/ancien.html',
      'archives/nouveau.html',
      false
    )

    expect(changes.length).toBe(4)
    expect(updatedContent).toContain('href="../archives/nouveau.html"')
    expect(updatedContent).toContain('src="../archives/nouveau.html"')
    expect(updatedContent).toContain('[Mon doc](../archives/nouveau.html#sec)')
    expect(updatedContent).toContain('![Mon image](../archives/nouveau.html)')
  })

  it('ne touche pas aux URLs externes et ancres pures', () => {
    const content = `
<a href="https://example.com/ancien.html">Externe</a>
<a href="mailto:test@example.com">Email</a>
<a href="#section-locale">Ancre même page</a>
`
    const { updatedContent, changes } = updateLinksInContent(
      'note.html',
      content,
      'ancien.html',
      'nouveau.html',
      false
    )

    expect(changes.length).toBe(0)
    expect(updatedContent).toBe(content)
  })
})

describe('linkUpdater - Déplacement de la note elle-même (liens sortants)', () => {
  it('recalcule les liens relatifs dans la note déplacée lorsqu’elle change de profondeur', () => {
    // La note était dans 'dossierA/note.html'
    // Elle avait un lien relatif vers 'dossierA/autre.html' (donc href="autre.html")
    // et vers 'images/logo.png' (donc src="../images/logo.png")
    const content = `
<a href="autre.html">Autre note</a>
<img src="../images/logo.png" />
`
    // Elle est déplacée dans 'dossierB/sousDossier/note.html'
    // Les cibles 'dossierA/autre.html' et 'images/logo.png' ne bougent pas
    // Nouveau chemin relatif depuis 'dossierB/sousDossier' vers 'dossierA/autre.html' : '../../dossierA/autre.html'
    // Nouveau chemin relatif vers 'images/logo.png' : '../../images/logo.png'
    const { updatedContent, changes } = updateLinksInContent(
      'dossierA/note.html',
      content,
      'dossierA/note.html',
      'dossierB/sousDossier/note.html',
      false
    )

    expect(changes.length).toBe(2)
    expect(updatedContent).toContain('href="../../dossierA/autre.html"')
    expect(updatedContent).toContain('src="../../images/logo.png"')
  })
})

describe('linkUpdater - Déplacement d’un dossier complet', () => {
  it('met à jour les liens vers les fichiers contenus dans le dossier déplacé', () => {
    const referencingContent = `
<a href="cours/algo/tri.html">Tri</a>
[[cours/algo/graphes]]
`
    const { updatedContent, changes } = updateLinksInContent(
      'index.html',
      referencingContent,
      'cours/algo',
      'archives/2026/algo',
      true // isFolder
    )

    expect(changes.length).toBe(2)
    expect(updatedContent).toContain('href="archives/2026/algo/tri.html"')
    expect(updatedContent).toContain('[[archives/2026/algo/graphes]]')
  })
})

describe('linkUpdater - Idempotence et Collisions', () => {
  it('est idempotent : réappliquer la même transformation ne change plus rien', () => {
    const raw = `<p>Lien vers <a href="ancien.html">Note</a> et [[ancien#titre]]</p>`
    const firstPass = updateLinksInContent('root.html', raw, 'ancien.html', 'nouveau.html', false)
    expect(firstPass.changes.length).toBe(2)

    const secondPass = updateLinksInContent(
      'root.html',
      firstPass.updatedContent,
      'ancien.html',
      'nouveau.html',
      false
    )
    expect(secondPass.changes.length).toBe(0)
    expect(secondPass.updatedContent).toBe(firstPass.updatedContent)
  })

  it('détecte les collisions de nom à la destination dans buildRenamePlan', () => {
    const vault = [
      { relativePath: 'A/note1.html', content: 'Contenu 1' },
      { relativePath: 'A/note2.html', content: 'Contenu 2' }
    ]

    const plan = buildRenamePlan(vault, 'A/note1.html', 'A/note2.html', false)
    expect(plan.hasCollision).toBe(true)
    expect(plan.collisionError).toContain('existe déjà')
  })

  it('distingue deux notes de même nom dans des dossiers différents', () => {
    const content = `
Lien vers [[dossierA/commune]] et [[dossierB/commune]].
`
    // On renomme uniquement commune dans dossierA
    const { updatedContent, changes } = updateLinksInContent(
      'index.html',
      content,
      'dossierA/commune.html',
      'dossierA/renommee.html',
      false
    )

    expect(changes.length).toBe(1)
    expect(updatedContent).toContain('[[dossierA/renommee]]')
    expect(updatedContent).toContain('[[dossierB/commune]]')
  })

  it('gère correctement les liens non qualifiés vers une note homonyme selon le dossier appelant', () => {
    const vault = [
      { relativePath: 'dossierA/commune.html', content: 'Note A' },
      { relativePath: 'dossierB/commune.html', content: 'Note B' },
      // Ce fichier est dans dossierB et pointe vers [[commune]] sans préfixe
      { relativePath: 'dossierB/sommaire.html', content: 'Voir [[commune]] ici' },
      // Ce fichier est dans dossierA et pointe vers [[commune]] sans préfixe
      { relativePath: 'dossierA/sommaire.html', content: 'Voir [[commune]] là' }
    ]

    // Renommage de dossierA/commune.html -> dossierA/renommee.html
    const plan = buildRenamePlan(vault, 'dossierA/commune.html', 'dossierA/renommee.html', false)

    // Seul dossierA/sommaire.html doit être impacté, dossierB/sommaire.html ne doit PAS être touché !
    const modifiedFiles = plan.affectedFiles.map((f) => f.relativePath)
    expect(modifiedFiles).toContain('dossierA/sommaire.html')
    expect(modifiedFiles).not.toContain('dossierB/sommaire.html')

    const fileA = plan.affectedFiles.find((f) => f.relativePath === 'dossierA/sommaire.html')
    expect(fileA?.newContent).toContain('Voir [[renommee]] là')
  })

  it('préserve strictement les ancres et sections (#titre)', () => {
    const raw = `
- [[Guide#Installation]]
- [[Guide#Configuration avancée|Config]]
- <a href="Guide.html#faq">FAQ</a>
- [Lien Markdown](Guide.md#conclusion)
`
    const { updatedContent, changes } = updateLinksInContent(
      'index.html',
      raw,
      'Guide.html',
      'Manuel.html',
      false
    )

    expect(changes.length).toBe(4)
    expect(updatedContent).toContain('[[Manuel#Installation]]')
    expect(updatedContent).toContain('[[Manuel#Configuration avancée|Config]]')
    expect(updatedContent).toContain('<a href="Manuel.html#faq">FAQ</a>')
    expect(updatedContent).toContain('[Lien Markdown](Manuel.html#conclusion)')
  })
})
