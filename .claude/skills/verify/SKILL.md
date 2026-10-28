---
name: verify
description: Vérifie NOTE-APP (typecheck, lint des fichiers modifiés, tests Vitest, build electron-vite) puis résume les échecs. À utiliser après toute modification de code, avant de proposer un commit, ou quand l'utilisateur demande de vérifier, compiler ou tester.
---

# Vérification

Lance toutes les étapes, même si l'une échoue, puis résume. Ne corrige rien automatiquement.

1. **Typecheck** : `npm run typecheck`. La référence est 0 erreur : toute erreur est une régression.
2. **Lint** : le dépôt a une dette tolérée (~550 erreurs, ~650 avertissements au 2026-10-28).
   - Fichiers à juger : `git diff --name-only HEAD` + `git ls-files --others --exclude-standard`,
     filtrés sur `*.ts` / `*.tsx`.
   - `npx eslint <ces fichiers>`.
   - Signaler comme nouveaux les problèmes situés sur des lignes modifiées (`git diff -U0`), le reste comme dette.
     Pour un fichier non suivi, tout problème compte comme dette sauf dans les lignes écrites pendant la session.
3. **Tests** : `npm test`.
4. **Build** : `npx electron-vite build` (écrit dans `out/`, ignoré par git).

Interdit dans ce skill : `npm run dev`, `npm start`, `relancer.bat` (vraies notes), `npm run format`,
`eslint --fix`, `build:win` / electron-builder, toute commande git qui modifie le dépôt.

## Résumé attendu
| Étape | Statut | Erreurs nouvelles | Dette |
Puis, pour chaque échec nouveau : `fichier:ligne`, message, cause probable en une phrase.
Terminer par une ligne de conclusion : « prêt à commiter » ou la liste de ce qui bloque.
