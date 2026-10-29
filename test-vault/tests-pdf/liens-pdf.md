# Liens PDF — note Markdown

Note de test du bug de détection des liens PDF (src/shared/pdfLink.ts). Cliquer chaque lien dans l'aperçu.

## Doivent ouvrir le PDF

1. [Relatif vers le dossier parent, page 2](../cours/CAHIER_DES_CHARGES.pdf#page=2)
2. [Casse différente](../cours/cahier_des_charges.PDF)
3. [Espaces et accents encodés, page 2](mes%20cours%20%C3%A9t%C3%A9.pdf#page=2)
4. [Espaces entre chevrons](<mes cours été.pdf>)
5. [Avec paramètre ?v=2, page 2](../cours/CAHIER_DES_CHARGES.pdf?v=2#page=2)
6. [Depuis la racine, page 2](/cours/CAHIER_DES_CHARGES.pdf#page=2)

## Doivent être refusés proprement (toast, rien ne s'ouvre)

1. [Sort du dossier de notes → « Lien PDF refusé »](../../Windows/secret.pdf)
2. [PDF inexistant → « PDF introuvable »](absent.pdf)

## Ne sont pas des PDF du vault (pas de toast « Ouverture du PDF »)

1. [Note HTML avec « .pdf » dans l'ancre](../cours/liens.html#voir-cours.pdf)
2. [PDF externe](https://example.com/document.pdf)
