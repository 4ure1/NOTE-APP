# NOTE-APP

Application desktop Windows de prise de notes locale (Electron 39, React 19, TypeScript 5.9, electron-vite / Vite 7).
Les notes sont des fichiers dans `~/Notes` (C:\Users\amvre\Notes), surtout en HTML avec un design system
sombre, parfois en Markdown. Éditeurs : Monaco + aperçu HTML éditable (iframe), @uiw/react-md-editor pour le
Markdown. Extras : historique « Time Travel », corbeille, export PDF/DOCX, panneaux IA (webviews), copilote et
agent Ollama locaux. Cible Windows 11 uniquement ; shell principal PowerShell.

- `docs/SPEC.md` : vision cible (brouillon à valider), pas l'état réel. Le code fait foi.
- `docs/reference/exemple-note.html` : référence des classes et du balisage du design system
  (prime sur les noms cités dans la SPEC). Son `<style>` est identique à `src/renderer/src/assets/theme.css`.
  Correspondances : card = `.step`, callout = `.note` / `.result`, qcm = `.quiz-item`.

## Commandes
- `npm run typecheck` : tsc node + web, doit rester à 0 erreur.
- `npx eslint <fichiers>` : lint ciblé. `npm run lint` a une dette tolérée (~550 erreurs au 2026-10-28) :
  ne juger que les fichiers touchés, ne lancer ni `--fix` ni `npm run format` sur tout le dépôt.
- `npm test` : Vitest (happy-dom). Les tests de linkRefactorService écrivent dans %TEMP% uniquement.
- `npx electron-vite build` : build vers `out/` (`npm run build` refait le typecheck).
- `npm run build:win` : installeur electron-builder dans `dist/`. Seulement sur demande.
- Skills : `/verify` (typecheck, lint, tests, build), `/review-changes` (checklist du diff).

## Façon de travailler
- Un chantier à la fois : plan court d'abord (fichiers touchés, risques, tests à ajouter), puis attendre l'accord.
- Après implémentation : `/verify`, puis `/review-changes`. L'utilisateur commite lui-même.
- Toute logique pure corrigée reçoit des tests Vitest.

## Architecture
- `src/main/index.ts` : quasiment tout le main (fenêtres, ~60 `ipcMain.handle`, fs, watcher, protocole
  `note-pdf`, sessions et webviews). Modules à côté : `versionHistory.ts` (Time Travel),
  `linkRefactorService.ts` (renommage avec mise à jour des liens, contient `writeAtomic`), `exportNote.ts`,
  `aiTools.ts` (Ollama, recherche web/YouTube), `agent/` (agent Ollama + outils, `security.ts`).
- `src/preload/index.ts` : expose uniquement `window.api` (camelCase, un canal IPC kebab-case par méthode),
  jamais d'accès générique à `ipcRenderer`. Tout nouveau canal doit être ajouté à la fois dans
  `src/main/index.ts`, `src/preload/index.ts` et `src/preload/index.d.ts`. Les chemins reçus passent par
  `notePath()` / `activeTargetDir()` (main) ; côté renderer, les erreurs s'affichent avec `notifyApiError`
  (`renderer/src/utils/apiError.ts`).
- Renommage avec liens : le plan est conservé côté main (`planId`, usage unique, 10 min) ; `apply` ignore
  le contenu renvoyé par le renderer et abandonne si une note a changé depuis `prepare`.
- `src/renderer/src/App.tsx` (~6 200 lignes) : tout l'état de l'app (useState, pas de store),
  passé aux composants par props. `components/CodeWorkspace.tsx` = Monaco + aperçu iframe.
- Auteur : 4URE1 (https://github.com/4ure1), tous droits réservés (`LICENSE`). Nom et liens dans
  `src/shared/credits.ts` (Paramètres, fenêtre « À propos », console) ; `package.json` (author, repository) et
  `electron-builder.yml` (copyright) le reprennent. En-tête `/*! … */` (gardé au build) dans les fichiers essentiels.
- Nouvelle note : HTML par défaut (`create-note`, Sidebar, App ; Markdown seulement pour un nom en `.md` ou sur
  demande), contenu tiré de `buildNewHtmlNote` (`src/shared/newNoteTemplate.ts` : lien vers le thème partagé,
  repères, carte animée `.nf-credit` du thème). Visite guidée au premier lancement : `WelcomeTour.tsx`
  (écran du choix du dossier de notes ; `onboardingDone` dans `app-setup.json`, relançable depuis les Paramètres
  par l'événement `nf-open-tour`).
- `src/shared/` : logique pure partagée (liens, plan, annotations PDF). Les fichiers `renderer/src/utils/*.ts`
  d'une seule ligne ne font que la réexporter : modifier `src/shared/`.
- Dossier de notes : `src/main/notesDir.ts` (`NOTE_APP_NOTES_DIR`, sinon le dossier choisi au premier lancement,
  sinon `~/Notes`), résolu une fois dans `NOTES_DIR` (`src/main/index.ts`). Tout le main en dérive. Le choix et
  la visite vue sont dans `<userData>/app-setup.json` (hors des notes) ; `finish-app-setup` n'accepte que le
  dossier rendu par `choose-notes-folder` (ou l'actuel, ou `~/Notes`) et relance l'app s'il change. En mode test
  (variable définie), le choix est désactivé et le titre porte `[TEST-VAULT]`.
- Données à l'exécution, toutes dans le dossier de notes : `.trash/`, `.history/`, `.snippets/snippets.json`,
  `.templates/`, `.recovery/` (temporaires orphelins récupérés au démarrage), `.theme/notes.css` (copie de
  `theme.css` réécrite au démarrage si elle diffère), `.config.json`.
  Temporaires d'écriture : `.<nom>.<pid>-<aléa>.nftmp`, nettoyés au démarrage (`cleanupTempFiles`).

## Conventions
- Prettier : sans points-virgules, guillemets simples, largeur 100, pas de virgule finale.
- Commentaires et textes d'interface en français ; identifiants en anglais.
- Canaux IPC en kebab-case ; méthodes preload en camelCase dérivé du canal.
- Chemins relatifs aux notes toujours en POSIX (`/`) côté renderer.
- Nouveau code main : renvoyer `{ success: true, ... } | { success: false, error }` plutôt que `null`/`false`/`''`,
  et ne pas ajouter de `catch {}` vide (au minimum `console.error('[Tag]', err)`).
- Les tests sont à côté du fichier (`*.test.ts`) ; la logique testable va dans `src/shared/`.

## Règles à ne jamais enfreindre
1. Ne jamais lire, lister, modifier ni supprimer quoi que ce soit dans `C:\Users\amvre\Notes`,
   ni par les outils, ni par le shell, ni par un script.
2. En développement, l'app se lance uniquement sur le dossier de test : `npm run dev:safe` ou
   `relancer-safe.bat` (`NOTE_APP_NOTES_DIR=./test-vault`, titre de fenêtre suffixé `[TEST-VAULT]`), et seulement
   si l'utilisateur le demande (il fait les contrôles visuels). Jamais `npm run dev`, `npm start` ni
   `relancer.bat` : sans la variable, l'app travaille sur les vraies notes. Les `.bat` tuent tous les
   processus `electron.exe` : ne jamais exécuter `relancer.bat`.
   `test-vault/securite/note-piegee.html` est un test de sécurité : ne jamais la copier hors de `test-vault`.
3. Toute écriture de fichier de note ou de donnée utilisateur doit être atomique : fichier temporaire dans le
   même dossier, puis `rename`. Utiliser `writeFileAtomic` / `copyFileAtomic` (`src/main/atomicWrite.ts` ;
   `preserveFormat` pour les notes : BOM, CRLF, refus du non-UTF-8). `writeAtomic` n'en est qu'un alias.
4. Tout chemin reçu par IPC doit être confiné au dossier de notes avec `assertSafeNotePath`
   (`src/main/agent/security.ts`) avant de lire, écrire ou supprimer.
5. Hors ligne : aucune ressource d'interface chargée depuis un CDN ou le réseau (scripts, CSS, polices, workers,
   cMaps, MathJax). Embarquer localement via npm ou Vite. Ne pas élargir la CSP de `src/renderer/index.html`.
   Exceptions voulues : webviews IA, YouTube, recherche web, Ollama. Dette existante : Google Fonts
   (`index.html`), MathJax cdnjs (`CodeWorkspace.tsx`), cMaps pdfjs jsdelivr (`PdfViewer.tsx`).
6. Ne jamais modifier le contenu d'une note sans action explicite de l'utilisateur : pas de reformatage ni de
   normalisation automatique sur ouverture, focus ou blur.
7. Ne pas affaiblir la sécurité Electron : pas de `nodeIntegration`, pas de nouvel accès générique à IPC
   dans le preload, pas de `allow-same-origin` supplémentaire sur des iframes de contenu.
8. Git : aucune commande qui modifie le dépôt (commit, push, rm --cached, reset, checkout de fichiers…).
   L'utilisateur s'en charge.

## Chantiers en attente
### 3b (isoler le JavaScript des notes ; 3b-1, gardes du main : fait)
- 3b-2 : iframes d'aperçu sans `allow-same-origin`, protocole de messages fermé et validé
  (`src/shared/previewProtocol.ts`), jeton par rendu, geste réel (2 s), substitut `localStorage` en mémoire,
  refus journalisés côté main, note piégée étendue.
- 3b-3 : SSRF (`downloadPdfFromUrl`, `download-pdf-from-url`, `web_fetch` de l'agent) : adresses privées
  refusées, `lookup` personnalisé (résoudre, valider, se connecter sur la même IP), redirections revérifiées.
- 3b-4 : CSP sans `unsafe-eval` (`isEvalSupported: false` pour pdf.js).
- Message `OPEN_PDF_PAGE` (`App.tsx`, `handleMessage`) traité sans vérifier `event.source` : le JS d'une note
  peut le forger. Le restreindre aux iframes d'aperçu, comme `OPEN_EXTERNAL_URL`.
- Le JS d'une note peut forger `PREVIEW_DOC_MUTATED` (donc réécrire la note ; `App.tsx` et
  `CodeWorkspace.tsx` ne vérifient pas `event.source`), et appeler `closeReady` / `setUnsavedChanges` via
  `window.parent.api` (fermeture sans écrire la saisie en attente).

### Dette
- Les clés `localStorage` indexées par chemin (`pdf_page_<chemin>`, `html_scroll_<chemin>`) ne suivent pas
  les renommages ni les déplacements : la page PDF et la position de défilement mémorisées sont oubliées.
- `hasDoctype` / `hasHtmlTag` (`prepareHtmlPreview`, `CodeWorkspace.tsx`) cherchent `<!doctype` / `<html` dans
  tout le texte de la note : un exemple de code qui en contient fait ajouter un doctype ou un `<html>` à la
  première vraie modification dans l'aperçu.

## Pièges connus
- Thème unique : `src/renderer/src/assets/theme.css`, injecté dans l'aperçu, embarqué dans l'export (le main
  l'importe en `?raw`) et copié dans `<notes>/.theme/notes.css`. `/page` ne copie plus de CSS : il insère
  `<link rel="stylesheet" href="${NOTES_THEME}" data-nf-theme>`, chemin relatif calculé par les trois
  moteurs (`src/shared/notesTheme.ts`), retiré à l'export, recalculé par le renommage avec liens.
  Les anciennes notes gardent leur `<style>` copié (inoffensif).
- Couleurs par initiale dans le thème : `.b .t .y .o .l .g .p .a .r` (bleu, turquoise, jaune, orange, vert
  clair, vert, violet, bleu clair, rouge ; `:not(.tag)`), utilisées par `/hb /ht /hy /ho /hl /hg /hp /ha /hr`
  (`<span>`), par le gras `/g` (couleur normale) et `/gb /gt /gy /go /gl /gg /gp /ga /gr` (`<strong class>`),
  `/hx`, `/couleur`, `/h2-couleur`, `/h3-couleur`. `/hblank` (classe `.base`) remet la couleur normale du texte. Les classes de rôle `.k .t .f .s .n .c` restent pour
  les anciennes notes et Ctrl+Maj+H ; `.c` reste le vert des commentaires (jamais une couleur cyan).
- `normalizeHtml` (`renderer/src/utils/normalizeHtml.ts`) ne fait que réindenter (Shift+Alt+F uniquement) :
  zones brutes, commentaires et doctype recopiés à l'octet près. Ne jamais l'appeler automatiquement.
- Sauvegarde de la note ouverte : uniquement via `persistOpenNote` / `saveOpenNote` / `flushPendingSave`
  (`App.tsx`), qui n'écrivent rien si le contenu est identique à `savedContentRef` (dernier contenu lu ou
  écrit) ni avant la fin de la lecture. Toute modification de `activeLoadedFileRef` doit mettre à jour
  `savedContentRef`. Après un renommage ou un déplacement (note ou dossier), passer par `followMovedPath`
  (`App.tsx`, logique dans `src/shared/movedPath.ts`) : note ouverte, sélection, panneau côte à côte,
  favoris, tags et statuts suivent. Sinon la sauvegarde suivante recrée la note à l'ancien chemin.
- Restauration d'une version : la saisie en attente est écrite d'abord (`onBeforeRestore`), puis le main
  fait un instantané forcé de l'état courant (`ensureSnapshot`, sans le délai de 90 s de `saveSnapshot`) et
  abandonne la restauration s'il échoue. L'historique est indexé par chemin : renommer une note lui fait
  perdre l'accès à ses anciennes versions (dette).
- L'aperçu n'envoie `PREVIEW_DOC_MUTATED` que sur une vraie saisie ; rien au blur ni à l'ouverture. Ce
  qu'il ajoute au DOM doit être marqué `data-injected-preview-helpers` ou `data-nf-pending` pour que
  `cleanPreviewDocument` (`src/shared/previewClean.ts`) le retire.
- Première vraie modification dans l'aperçu : toute la note est re-sérialisée par le navigateur (sens
  conservé, forme non : `&eacute;` devient `é`, `<br/>` devient `<br>`…).
- L'aperçu iframe utilise `sandbox="allow-scripts allow-same-origin"` : le JS d'une note atteint `window.parent.api`
  (corrigé en 3b-2).
- Gardes posées sur tous les webContents dans `app.on('web-contents-created')` (`src/main/index.ts`, règles
  pures dans `src/main/navigationGuard.ts`) : nouvelles fenêtres refusées par défaut, la fenêtre de l'app ne
  navigue que vers elle-même et ses iframes que vers `about:srcdoc` / `about:blank`, `<webview>` forcée sans
  preload ni Node. Ouvrir une URL dans le système : `openExternalSafe` (http, https, mailto), jamais
  `shell.openExternal` directement. Hôtes comparés sur `new URL().hostname`, jamais par `includes`.
- `save-config` fusionne avec l'existant (`src/main/configStore.ts`) : on ne peut pas supprimer une clé,
  seulement la remplacer. Un `.config.json` illisible est mis de côté (`.config.corrupt-<n>.json`).
- Snippets : `src/main/defaultSnippets.json` et `src/renderer/src/assets/snippets.default.json` doivent rester
  identiques. À l'exécution, `<notes>/.snippets/snippets.json` n'est créé qu'une fois ; `get-snippets` y ajoute
  en mémoire les snippets par défaut absents (`src/shared/snippetsMerge.ts`, même préfixe ou id : celui de
  l'utilisateur gagne ; `"disabledDefaults": [ids]` en masque). Le fichier n'est jamais modifié par cette fusion.
- Trois moteurs de snippets : textarea Markdown (`snippetEngine.ts`), Monaco (`monacoCompletions.ts`),
  iframe (`CodeWorkspace.tsx`). Dans l'iframe, `buildSnippetFragment` (`src/shared/snippetFields.ts`) garde
  les champs : marqueurs `<span data-nf-field>` surlignés (Tab / Maj+Tab, Échap, clic ailleurs) et choix
  `${n|…|}` en menu appliqué en direct, y compris dans un attribut (couleur). Les marqueurs ne doivent jamais
  être enregistrés : `cleanPreviewDocument` les retire. Les valeurs par défaut `${n:…}` ne peuvent pas
  contenir d'accolade (pas d'imbrication) dans aucun des trois moteurs.
- Snippets « à nombre » (`/table-3-2`, `/cards-4` (`.step`), `/cardf-4` (cartes canvas `.nodes`), `/canvas-4`, `/etapes-5`, `/ul-6`, `/ol-6`, `/qcm-5`, `/colonnes-3`,
  `/tbl-3-2` en Markdown) : générés à la saisie par `generateDynamicSnippets` (`src/shared/dynamicSnippets.ts`),
  dans les trois moteurs, jamais écrits dans les JSON. Fonction autonome (injectée par `toString()` dans
  l'iframe) : aucun import ni constante externe. Un préfixe défini par l'utilisateur gagne.
- Saisie dans l'aperçu : `createPreviewEditing` (`src/shared/previewEditing.ts`). Entrée crée des `<p>` (ou `<li>`)
  en reprenant l'indentation du voisin, sans prolonger une coloration sur la ligne vide ; Maj+Entrée garde le
  `<br>` ; code, cellules et zones non éditables restent au navigateur. Flèche droite au bout d'un texte coloré
  « arme » la sortie : la frappe suivante s'écrit après le `<span>`. Après un effacement, les `<span style>` /
  `<font>` que Chrome invente en fusionnant des blocs sont retirés (seulement les nouveaux, sans classe).
- Canvas (`.canvas` > `.node[data-node]` + `<svg class="canvas-links">` > `g.link[data-from="1:right"][data-to]`) :
  tout est statique dans la note (positions en style, tracés `d`). `installCanvasEditor`
  (`src/shared/canvasEditor.ts`, géométrie dans `canvasGeometry.ts`) ajoute dans l'aperçu les points de bord,
  la barre de carte et la sélection de flèche, marqués `data-injected-preview-helpers`. Les flèches ne sont
  recalculées qu'après un geste (relier, déplacer, élargir, saisie dans le canvas), jamais à l'ouverture.
  Poignées de taille : coin bas-droit d'une carte (largeur + `min-height`), coin bas-droit du canvas (hauteur, et
  largeur jusqu'à la pleine largeur). Cartes d'une rangée `.nodes` (flex) : poignée de taille dans `blockDrag.ts`.
- Zoom de l'aperçu = `zoom` CSS sur le `<body>` : tout repère positionné en coordonnées d'écran (poignées, menus,
  sélections, fantôme) va dans `<html>` (`document.documentElement`), jamais dans le `<body>` ; les mesures
  `offsetLeft`/`offsetWidth` (pixels CSS) et la souris (pixels d'écran) se convertissent par le facteur
  `getBoundingClientRect().width / offsetWidth`.
- Entrée dans un `<pre>` : `insertCodeNewline` (saut de ligne dans le même `<code>`, indentation reprise ;
  `execCommand('insertText', '\n')` coupait le bloc en deux). Glisser-déposer des tableaux et blocs :
  `installBlockDrag` (`src/shared/blockDrag.ts`), poignée et repères en éléments d'interface, jamais de classe
  posée sur la note pendant un geste ; les cartes d'une grille (`.duo > *`, `.nodes > *`) se déplacent une par
  une (le groupe a sa seconde poignée). Clic sur la poignée : sélection de blocs (Ctrl/Maj+clic pour en ajouter),
  Suppr / Ctrl+D / barre d'actions, glisser déplace toute la sélection. Tableaux : `installTableTools` (`src/shared/tableTools.ts`), sélection de
  cases (glisser, Ctrl+clic) et clic droit (fond `bg-*`, lignes, colonnes ; couleur des `.node` / `.step`).
  `cleanPreviewDocument` sépare d'un saut de ligne deux blocs collés (`</div><p>`) ; hors `<pre>`, `<script>`,
  `<style>` ; les `<p></p>` de la note restent. Il coupe aussi un `<p>`/titre qui contiendrait un bloc (sans
  laisser de `<p></p>`) et retire le `<br>` final invisible d'un bloc ; rien n'est ajouté à côté d'un bloc
  inline-block ou dans un conteneur `white-space: pre` (marquage temporaire `data-nf-keep-space`). À l'insertion,
  un bloc (snippet, collage) passe par `insertFragment` : jamais dans un `<p>`. Collage riche :
  `sanitizePastedHtml` (`src/shared/pasteSanitize.ts`, structure et classes du thème gardées) ; plusieurs lignes
  de texte brut : `pasteText` (un paragraphe par ligne). Conversion des balises tapées et Emmet : seulement dans un bloc sans balise
  (sinon perte de la mise en forme). Surlignage des champs de snippet en `background-image` : Chrome recopiait
  un `background-color` en style inline (fond bleu resté) ; `cleanPreviewDocument` retire ces anciens fonds.
- Annuler dans l'aperçu (Ctrl+Z, Ctrl+Y, Ctrl+Maj+Z) : `createUndoHistory` (`src/shared/undoHistory.ts`), pas celui
  du navigateur. Toute modification de la note dans l'aperçu doit appeler `recordUndo()` AVANT de toucher au DOM
  (beforeinput, touches Entrée/Retour/Suppr/Tab, insertSnippet, collage, `beforeChange` du canvas et du
  glisser-déposer). La restauration remplace le contenu du `<body>` (l'interface ajoutée est gardée ; les
  écouteurs posés par le JS d'une note sur ses éléments sont perdus).
- Menu « / » de l'aperçu : trié par `rankSnippets` (`src/shared/snippetRanking.ts`), liste reconstruite seulement
  quand la saisie change ; les flèches ne font que déplacer l'élément actif.
- La note ouverte n'est jamais relue automatiquement depuis le disque. Une écriture externe (agent, autre
  éditeur) est détectée à la sauvegarde suivante par l'empreinte SHA-256 (`src/main/noteFingerprints.ts`) :
  `write-note` renvoie `code: 'EXTERNAL_CHANGE'` et la barre de conflit (`ExternalChangeBar`) propose
  Recharger / Garder ma version (`force`) / Enregistrer une copie. L'empreinte suit la version sur laquelle
  s'appuie l'éditeur : read-note, write-note, restauration, renommage/déplacement la mettent à jour ; jamais
  l'agent. Une nouvelle écriture de note côté main doit respecter cette règle.
- `write-note` renvoie `{ success, error, code?, reason? }` sans lever d'exception (sauf chemin refusé) :
  vérifier le résultat (`ensureSuccess`, `renderer/src/utils/apiError.ts`).
- Le fs du main est synchrone ; l'arbre est rescanné à chaque écriture, focus et toutes les 5 s.
- `core.autocrlf=true` → avertissements LF/CRLF dans les diffs (normal). `.gitattributes` marque `-text`
  les notes de `test-vault/tests-sauvegarde/` (BOM, CRLF, LF) : ne pas les ouvrir dans un éditeur qui
  convertit les fins de ligne.
