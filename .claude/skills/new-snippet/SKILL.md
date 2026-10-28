---
name: new-snippet
description: Ajoute un snippet « / » par défaut à NOTE-APP en respectant le format du moteur de snippets et les blocs réels du design system (.step, .note, .result, .duo, .quiz-item…). À utiliser quand l'utilisateur demande un nouveau snippet, raccourci « / » ou bloc insérable.
---

# Ajouter un snippet par défaut

## Où
Ajouter **la même entrée** dans les deux fichiers, qui doivent rester identiques octet pour octet :
- `src/main/defaultSnippets.json`
- `src/renderer/src/assets/snippets.default.json`

Ne jamais toucher à `<dossier de notes>/.snippets/snippets.json` (données utilisateur).

## Format (`src/renderer/src/types/snippets.ts`)
{ "prefix": "…", "name": "…", "description": "…", "category": "…",
  "scope": "html" | "markdown" | "all", "body": ["ligne 1", "ligne 2", "", "$0"], "id": "<= prefix>" }

- `prefix` et `id` identiques, en minuscules avec tirets, uniques : vérifier par une recherche dans le fichier.
- `category` parmi celles qui existent : Structure, Blocs, Mise en page, Code, Texte, Quiz, Markdown, Divers.
- `body` : tableau de lignes, indentation de 2 espaces ; un bloc se termine par `""` puis `"$0"`,
  un élément en ligne par `$0` collé (ex. `"<span class=\"tag b\">${1:TAG}</span>$0"`).
- Variables possibles : `$1`, `${1:défaut}`, `${1|a,b,c|}`, `$0`, `${CURRENT_DATE}`, `${CURRENT_YEAR}`,
  `${CURRENT_MONTH}`, `${TM_SELECTED_TEXT}`, `${TM_SELECTED_TEXT:$1}`. Rien d'autre (pas de `$DATE`).
- Dans l'aperçu iframe, les tabstops sont aplatis : chaque `${n:défaut}` doit avoir un défaut lisible,
  et le premier choix d'un `${n|…|}` doit être le bon par défaut.
- Échapper les `"` en `\"` dans le JSON. Les `<pre>` restent collés à gauche (pas d'indentation dans le bloc).

## Design system
Référence : `docs/reference/exemple-note.html` (CSS = `src/renderer/src/assets/theme.css`).
Ne jamais inventer de classe : si le bloc demandé n'existe pas ci-dessous, demander le HTML et le CSS voulus,
et prévenir qu'un nouveau style doit aussi être ajouté à `theme.css` et au snippet `page`.

| Nom courant | Balisage réel |
|---|---|
| card / carte | `<div class="step [purple\|orange\|green\|red]"><span class="label">Titre</span> contenu</div>` |
| grille de cartes | `.duo` avec `style="grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr));"` contenant des `.step` (snippet `cards`) |
| callout / analogie / piège | `<div class="note"><span class="label">🧠 …</span><p>…</p></div>` (⚠️ pour un piège) |
| à retenir / erreur | `<div class="result [warn\|bad]"><span class="label">…</span><div class="value">…</div></div>` |
| duo | `<div class="duo"><div>…</div><div>…</div></div>` |
| qcm | `<div class="quiz-item"><div class="q-title">Question N (QCM) — …</div><p>A) …<br>…</p><details><summary>Voir la correction</summary><p><strong>Réponse : X.</strong> …</p></details></div>` |
| code | `<span class="lang java\|py\|c">JAVA</span>` puis `<pre>…</pre>` ; coloration `span.k/.t/.f/.s/.n/.c` |
| texte | `.keyword`, `<code>`, `<span class="tag b\|p\|o\|g">`, `.figure` + `.caption`, `.divider`, `footer` |

Aucune ressource externe (CDN, police, image distante) dans un snippet.

## Vérifier
node -e "const a=require('./src/main/defaultSnippets.json'),b=require('./src/renderer/src/assets/snippets.default.json');const p=a.snippets.map(s=>s.prefix);if(JSON.stringify(a)!==JSON.stringify(b))throw 'fichiers différents';if(new Set(p).size!==p.length)throw 'prefix en double';console.log('OK',p.length)"

## Prévenir l'utilisateur
Le fichier `<dossier de notes>/.snippets/snippets.json` n'est créé qu'une fois : le nouveau snippet
n'apparaîtra qu'après l'avoir ajouté via l'app ou dans ce fichier. Donner l'entrée JSON à coller.
