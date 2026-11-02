/*! NOTE-APP — © 2026 4URE1 — https://github.com/4ure1 — Tous droits réservés. */
/**
 * Contenu d'une note HTML fraîchement créée : page reliée au thème partagé des notes
 * (.theme/notes.css, voir notesTheme.ts), un titre, quelques repères pour démarrer et la carte animée
 * « Créé avec NOTE-APP » (.nf-credit, styles et animations dans theme.css) qui renvoie au GitHub de
 * l'auteur. Tout est modifiable ou supprimable comme le reste de la note.
 */
import { AUTHOR, REPOSITORY } from './credits'
import { notesThemeHref } from './notesTheme'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Titre affiché : le nom du fichier, ou « Nouvelle note » pour un nom provisoire (page, page 2…). */
export function displayTitle(fileTitle: string): string {
  const t = fileTitle.trim()
  return !t || /^page( \d+)?$/i.test(t) ? 'Nouvelle note' : t
}

/**
 * @param fileTitle nom du fichier sans extension
 * @param notePath chemin de la note relatif au dossier de notes (POSIX), pour le lien vers le thème
 */
export function buildNewHtmlNote(fileTitle: string, notePath: string): string {
  const title = escapeHtml(displayTitle(fileTitle))
  const theme = notesThemeHref(notePath)
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="${theme}" data-nf-theme>
</head>
<body>
<div class="container">
  <h1>${title}</h1>
  <p class="subtitle">Écris directement ici : tape <code>/</code> pour insérer un bloc (tableau, cartes, canvas, couleurs…).</p>

  <div class="step">
    <span class="label">Pour commencer</span>
    <ul>
      <li><code>/cards-3</code>, <code>/table-3-2</code>, <code>/canvas-4</code> : des blocs prêts à remplir</li>
      <li>La poignée <strong>⠿</strong> à gauche d'un bloc le déplace ; un clic dessus le sélectionne</li>
      <li>Clic droit dans un tableau : couleur des cases, lignes et colonnes</li>
      <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> annule tout, l'historique garde chaque version</li>
    </ul>
  </div>

  <p><br></p>

  <a class="nf-credit" href="${REPOSITORY}">
    <span class="nf-credit-logo">✦</span>
    <span class="nf-credit-text">
      <strong>Créé avec <span class="nf-credit-name">NOTE-APP</span></strong>
      <span>par ${AUTHOR} · retrouve le projet sur GitHub</span>
    </span>
    <span class="nf-credit-cta">github.com/${AUTHOR.toLowerCase()} →</span>
  </a>
</div>
</body>
</html>
`
}
