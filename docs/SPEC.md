# NOTE-APP — Spécification (vision cible)

> **Statut : brouillon rédigé par Claude le 2026-10-28**, à partir du code, de la description du projet et des
> décisions prises lors de l'audit. Ce document décrit la **cible**, pas l'état réel (voir `docs/STATUS.md`,
> à produire). Les points marqués *(à confirmer)* sont des hypothèses : corrige-les.

## 1. Vision

Une application desktop Windows pour écrire, organiser et réviser des fiches de cours, stockées comme de
simples fichiers locaux. Le format principal est une note HTML autonome au design sombre (voir
`docs/reference/exemple-note.html`) ; le Markdown est aussi pris en charge. L'IA (locale via Ollama, ou
services web dans des panneaux) aide à produire et retrouver le contenu, sans jamais en prendre le contrôle.

## 2. Principes

1. **Les fichiers sont la vérité.** Une note est un fichier `.html` ou `.md` lisible sans l'application.
   Pas de base de données propriétaire ; les métadonnées vivent dans des dossiers cachés du dossier de notes.
2. **Aucune modification silencieuse.** L'application ne réécrit jamais une note sans action explicite de
   l'utilisateur (pas de reformatage automatique à l'ouverture, au focus ou à la perte de focus).
3. **Aucune perte de données.** Écritures atomiques, historique de versions, corbeille restaurable,
   détection des modifications faites hors de l'application.
4. **Hors ligne d'abord.** L'interface fonctionne sans réseau : aucune police, aucun script, aucune ressource
   chargée depuis un CDN. Seules les fonctions explicitement en ligne (panneaux IA web, YouTube, recherche web)
   utilisent le réseau, et leur échec ne bloque jamais l'édition.
5. **Une note n'est pas un programme de confiance.** Le HTML d'une note (y compris téléchargé ou généré par
   une IA) ne peut accéder ni au disque, ni à l'IPC, ni aux autres notes.
6. **Windows uniquement.**

## 3. Fonctions

### Édition
- Note HTML : éditeur de code Monaco + aperçu fidèle éditable, synchronisés dans les deux sens.
- Note Markdown : éditeur avec aperçu, liens wiki `[[note]]`.
- Formatage HTML à la demande uniquement (Shift+Alt+F), qui préserve le contenu (entités, attributs, espaces).
- Snippets « / » : blocs du design system (step, note, result, duo, cards, quiz-item, code…), variables et
  tabstops navigables au clavier. Snippets par défaut + snippets personnels modifiables.
- Sauvegarde automatique, indicateur de modifications non enregistrées, sauvegarde à la fermeture.

### Organisation
- Arborescence de dossiers, création, renommage et déplacement avec mise à jour automatique des liens
  (annulable).
- Favoris, tags, récents, modèles de notes, tableau de suivi (workflow) des notes.
- Plan (outline) de la note courante.

### Recherche
- Recherche plein texte dans toutes les notes, rapide et tolérante aux fautes, via un index MiniSearch
  maintenu à jour *(à confirmer : aujourd'hui seule la recherche par nom de fichier existe)*.

### Sécurité des données
- **Time Travel** : historique automatique des versions de chaque note, comparaison et restauration
  (un instantané de l'état courant est pris avant toute restauration).
- **Corbeille** `.trash` : suppression réversible, restauration dans le dossier d'origine.

### PDF et export
- Lecture des PDF avec annotations stockées à côté du fichier (`<pdf>.annotations.json`).
- Export d'une note en PDF, DOCX ou HTML.

### IA
- Panneaux web (Claude, ChatGPT, Gemini) dans l'application, avec import de réponses en notes.
- Copilote Ollama local : complétion en ligne dans l'éditeur.
- Agent Ollama : recherche, lit et crée des notes (jamais de suppression ni d'écrasement), actions annulables,
  recherche web optionnelle.
- Espace YouTube pour suivre des vidéos de cours *(à confirmer)*.

## 4. Données

Tout est dans le dossier de notes : par défaut `~/Notes`, configurable avec la variable d'environnement
`NOTE_APP_NOTES_DIR` (dossier de test : `./test-vault` via `npm run dev:safe`).

| Chemin | Contenu |
|---|---|
| `**/*.html`, `**/*.md` | Notes |
| `.history/` | Versions (Time Travel) |
| `.trash/` | Corbeille |
| `.snippets/snippets.json` | Snippets de l'utilisateur |
| `.templates/` | Modèles de notes |
| `.config.json` | Favoris, tags, réglages (fusionnés, jamais écrasés partiellement) |

## 5. Sécurité Electron (cible)

- Tout chemin reçu par IPC est confiné au dossier de notes.
- L'aperçu d'une note est isolé (iframe sans `allow-same-origin`, communication par messages vérifiés).
- Webviews contrôlées (`will-attach-webview`), liens externes limités à `http(s)`, noms de fichiers
  téléchargés assainis, protocole `note-pdf` limité au dossier de notes.
- Pas d'accès générique à l'IPC depuis le renderer ; secrets (clé API) hors du `localStorage`
  *(à confirmer : stockage chiffré via `safeStorage`)*.

## 6. Hors périmètre *(à confirmer)*

- Synchronisation cloud ou multi-appareils (le dossier peut être synchronisé par un outil externe).
- Collaboration temps réel.
- macOS et Linux.

## 7. Questions ouvertes

- Recherche plein texte : index persistant ou reconstruit au démarrage ?
- Quelle place pour l'espace YouTube et le tableau de workflow à long terme ?
- Faut-il un mode lecture seule / révision (quiz interactifs) distinct de l'édition ?
