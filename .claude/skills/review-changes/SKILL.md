---
name: review-changes
description: Relit le diff courant de NOTE-APP avec une checklist propre au projet (perte de données, IPC et sécurité Electron, hors ligne, régressions des fonctions existantes). À utiliser avant un commit, après une série de modifications, ou quand l'utilisateur demande une relecture.
---

# Relecture des changements

1. Collecter : `git status`, `git diff HEAD`, et le contenu des fichiers non suivis concernés.
   Lire le code autour des changements, pas seulement les lignes du diff.
2. Passer chaque point ci-dessous. Ne rapporter que des problèmes concrets, avec `fichier:ligne` et un
   scénario d'échec. Ne rien corriger sans accord.

## Perte de données
- Écritures de note, configuration, snippets, historique ou corbeille : atomiques (temp + rename, `writeAtomic`) ?
- Une note peut-elle être réécrite sans action de l'utilisateur (ouverture, blur, normalisation, formatage) ?
- `.config.json` : lecture, fusion, puis écriture (jamais un objet partiel) ?
- Courses : sauvegarde automatique (700 ms) contre écriture directe, contre écriture de l'agent ou d'un éditeur externe.
- Suppression : passe par `.trash`, garde le dossier d'origine, n'oublie pas le sidecar `.annotations.json`.
- Restauration de version : snapshot de l'état courant avant d'écraser ?
- Le HTML de l'utilisateur est-il conservé (entités, attributs, espaces, scripts, `<template>`) ?

## IPC et sécurité Electron
- Nouveau canal : ajouté dans main, `preload/index.ts` et `index.d.ts` ; arguments validés.
- Tout chemin confiné au dossier de notes avec `assertSafeNotePath`, y compris `..`, les chemins absolus et
  les noms de fichiers venant du réseau.
- Pas de `nodeIntegration`, pas de nouvel accès IPC générique, pas de `allow-same-origin` sur du contenu.
- `shell.openExternal` limité à `http(s)` ; `postMessage` : vérifier `event.source` / l'origine.
- Pas de nouvelle permission accordée à toute origine ; webviews sans preload ni nodeintegration.

## Hors ligne
- Aucune URL `https://` ajoutée pour une ressource d'interface (script, CSS, police, worker, cMap, MathJax).
- CSP de `src/renderer/index.html` non élargie.
- Les fonctions réseau (IA, recherche web) échouent proprement sans connexion, sans bloquer l'éditeur.

## Régressions
- Snippets : les deux JSON par défaut restent identiques ; les trois moteurs (Markdown, Monaco, iframe) fonctionnent.
- Synchro aperçu ↔ Monaco, Time Travel, corbeille et restauration, renommage avec mise à jour des liens,
  export PDF/DOCX/HTML, PdfViewer et annotations, agent (annulation).
- Typecheck : 0 erreur. Pas de nouveau `catch {}` vide, pas de nouveau `any` évitable.
- Tests ajoutés pour la logique pure modifiée (`src/shared/`, `utils/`).

## Sortie
Tableau : gravité (🔴/🟠/🟡) | fichier:ligne | problème | scénario. Si rien : le dire explicitement.
Suggérer `/verify` si ce n'est pas déjà fait.
