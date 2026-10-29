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
- `src/shared/` : logique pure partagée (liens, plan, annotations PDF). Les fichiers `renderer/src/utils/*.ts`
  d'une seule ligne ne font que la réexporter : modifier `src/shared/`.
- Dossier de notes : `src/main/notesDir.ts` (`NOTE_APP_NOTES_DIR`, sinon `~/Notes`), résolu une fois dans
  `NOTES_DIR` (`src/main/index.ts`). Tout le main en dérive.
- Données à l'exécution, toutes dans le dossier de notes : `.trash/`, `.history/`, `.snippets/snippets.json`,
  `.templates/`, `.recovery/` (temporaires orphelins récupérés au démarrage), `.config.json`.
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
### 3b (sécurité, relevé lors du bug de la regex PDF)
- Fenêtre principale sans garde de navigation (`src/main/index.ts`, `browser-window-created`) : un lien web
  cliqué hors des aperçus remplace toute l'interface par la page, et un fichier servi en téléchargement
  atterrit dans le vault via `will-download`. Bloquer `will-navigate` hors de l'URL de l'app.
- `mainWindow.webContents.setWindowOpenHandler` appelle `shell.openExternal(details.url)` sans filtre :
  limiter à `http(s)` (comme `assertWebUrl`).
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
- L'aperçu iframe utilise `sandbox="allow-scripts allow-same-origin"` : le JS d'une note atteint `window.parent.api`.
- `save-config` fusionne avec l'existant (`src/main/configStore.ts`) : on ne peut pas supprimer une clé,
  seulement la remplacer. Un `.config.json` illisible est mis de côté (`.config.corrupt-<n>.json`).
- Snippets : `src/main/defaultSnippets.json` et `src/renderer/src/assets/snippets.default.json` doivent rester
  identiques. À l'exécution, c'est `<notes>/.snippets/snippets.json` qui fait foi : il n'est créé qu'une fois,
  donc un nouveau snippet par défaut n'arrive pas chez un utilisateur existant.
- Trois moteurs de snippets : textarea Markdown (`snippetEngine.ts`), Monaco (`monacoCompletions.ts`),
  iframe (`CodeWorkspace.tsx`, sans tabstops : le premier choix est pris).
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
