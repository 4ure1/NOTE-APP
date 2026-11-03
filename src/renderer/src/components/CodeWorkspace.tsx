/*! NOTE-APP — © 2026 4URE1 — https://github.com/4ure1 — Tous droits réservés. */
import { useState, useEffect, useRef, useMemo } from 'react'
import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import themeCss from '@renderer/assets/theme.css?raw'
import defaultSnippetsJson from '@renderer/assets/snippets.default.json'
import { Snippet } from '../types/snippets'
import { registerEnhancedCompletions, registerInlineCopilot } from '../utils/monacoCompletions'
import { highlightAllCodeBlocksInHtml } from '../utils/codeHighlighter'
import { normalizeHtml } from '../utils/normalizeHtml'
import { OutlineHeading } from '../utils/outlineExtractor'
import { parsePdfHref } from '../utils/pdfLink'
import { cleanPreviewDocument } from '../utils/previewClean'
import { isUserScrollIntent } from '../utils/scrollIntent'
import { buildSnippetFragment } from '../utils/snippetFields'
import { generateDynamicSnippets } from '../utils/dynamicSnippets'
import { createPreviewEditing } from '../utils/previewEditing'
import { createCanvasGeometry } from '../utils/canvasGeometry'
import { installCanvasEditor } from '../utils/canvasEditor'
import { installBlockDrag } from '../utils/blockDrag'
import { createUndoHistory } from '../utils/undoHistory'
import { installTableTools } from '../utils/tableTools'
import { sanitizePastedHtml } from '../utils/pasteSanitize'
import { rankSnippets } from '../utils/snippetRanking'
import { notesThemeHref } from '../utils/notesTheme'
import { previewMatchesNote } from '../utils/noteSaveGuard'
import { notifyApiError } from '../utils/apiError'

loader.config({ monaco })

interface CodeWorkspaceProps {
  value: string
  onChange: (val: string) => void
  currentFilePath: string
  editorMode: 'preview' | 'live' | 'edit' // edit = Code only, live = Split, preview = Live preview only
  onChangeEditorMode?: (mode: 'preview' | 'live' | 'edit') => void
  onOpenInBrowser?: () => void
  // Note dont `value` est issu (lecture terminée) ; null pendant le chargement d'une autre note
  contentFilePath?: string | null
  isHtmlFullscreen?: boolean
  onToggleHtmlFullscreen?: () => void
  zoomLevel?: number
  isZenMode?: boolean
  isTypewriterMode?: boolean
  isCopilotEnabled?: boolean
  copilotModel?: string
  onHighlightCode?: () => void
  snippets?: Snippet[]
  targetHeading?: OutlineHeading | null
  headings?: OutlineHeading[]
  onActiveHeadingChange?: (id: string | null) => void
}

// Découpage et marquage des balises de bloc HTML avec leur numéro de ligne source d'origine
const injectSourceLines = (html: string): string => {
  const lines = html.split('\n')
  let inScript = false
  let inStyle = false
  const hasBodyTag = html.toLowerCase().includes('<body')
  let inBody = !hasBodyTag
  const blockTags = new Set([
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'div',
    'section',
    'article',
    'main',
    'header',
    'footer',
    'nav',
    'aside',
    'table',
    'tr',
    'pre',
    'blockquote',
    'ul',
    'ol',
    'li',
    'figure',
    'details',
    'hr',
    'form'
  ])

  const output = lines.map((line, idx) => {
    const lineNum = idx + 1
    const lower = line.toLowerCase()
    if (lower.includes('<body')) inBody = true
    if (lower.includes('</body>')) inBody = false
    if (lower.includes('<script')) inScript = true
    if (lower.includes('</script>')) inScript = false
    if (lower.includes('<style')) inStyle = true
    if (lower.includes('</style>')) inStyle = false

    if (!inBody || inScript || inStyle) return line

    return line.replace(/<([a-zA-Z0-9]+)(\s|>)/, (match, tag, rest) => {
      if (blockTags.has(tag.toLowerCase())) {
        return `<${tag} data-source-line="${lineNum}"${rest}`
      }
      return match
    })
  })

  return output.join('\n')
}

// Aperçu neutre pendant le chargement d'une note : aucun script, rien à éditer ni à enregistrer
export const PREVIEW_LOADING_SRCDOC =
  '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;background:#09090b"></body></html>'

// Helper exportable pour préparer le document HTML avec MathJax conditionnel, écouteur Esc/Ctrl+J, édition directe et moteur de snippets Obsidian
export const prepareHtmlPreview = (
  rawCode: string,
  initialScrollRatio?: number,
  initialScrollY?: number,
  snippets?: Snippet[],
  isEditable: boolean = true,
  // Chemin de la note (relatif au dossier de notes) : sert à ${NOTES_THEME} dans les snippets
  notePath: string = ''
) => {
  const effectiveCode = rawCode.trim() === '' ? '<div class="container"><p><br></p></div>' : rawCode
  const taggedCode = injectSourceLines(effectiveCode)
  const hasMath =
    taggedCode.includes('$') || taggedCode.includes('\\(') || taggedCode.includes('\\[')
  const mathJaxScript = hasMath
    ? `
      <script data-injected-preview-helpers="true">
        window.MathJax = window.MathJax || {
          tex: {
            inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
            displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']]
          },
          svg: { fontCache: 'global' }
        };
      </script>
      <script data-injected-preview-helpers="true" src="https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-mml-chtml.js"></script>
    `
    : ''

  const safeRatio =
    typeof initialScrollRatio === 'number' && !isNaN(initialScrollRatio) ? initialScrollRatio : 0
  const safeScrollY =
    typeof initialScrollY === 'number' && !isNaN(initialScrollY) ? initialScrollY : 0

  const effectiveSnippets =
    snippets && snippets.length > 0 ? snippets : (defaultSnippetsJson.snippets as Snippet[]) || []

  const safeSnippetsJson = JSON.stringify(
    effectiveSnippets.map((s) => ({
      prefix: s.prefix,
      name: s.name,
      description: s.description || '',
      category: s.category || 'Général',
      scope: s.scope || 'all',
      body: s.body
    }))
  )

  const hasHtmlTag = rawCode.toLowerCase().includes('<html')
  const hasDoctype = rawCode.toLowerCase().includes('<!doctype')

  const enhancementBundle = `
    <style data-injected-theme="snippets">
      ${themeCss}
    </style>
    <style data-injected-preview-helpers="true">
      /* Éviter les barres horizontales parasites tout en conservant le centrage naturel */
      html {
        width: 100%;
        height: 100%;
        overflow-x: hidden !important;
      }
      body {
        width: 100%;
        min-height: 100%;
        margin: 0 auto !important;
        overflow-x: hidden !important;
        overflow-y: auto !important;
        transition: zoom 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      }
      /* Mode Édition directe Obsidian Live */
      body[contenteditable="true"],
      body {
        outline: none !important;
        caret-color: #38bdf8 !important;
        cursor: text !important;
        min-height: 100vh;
        -webkit-user-select: text !important;
        user-select: text !important;
      }
      body[contenteditable="true"] *,
      body * {
        cursor: text;
        -webkit-user-select: text;
        user-select: text;
      }
      body[contenteditable="true"] a,
      body[contenteditable="true"] button,
      body[contenteditable="true"] input[type="checkbox"] {
        cursor: pointer;
      }
      body[contenteditable="true"] pre,
      body[contenteditable="true"] code {
        cursor: text !important;
        font-family: Consolas, 'Courier New', monospace;
      }
      body[contenteditable="true"] pre {
        position: relative;
        outline: none;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      body[contenteditable="true"] pre:focus-within {
        border-color: #38bdf8;
        box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.25);
      }
      body[contenteditable="true"] .step:hover,
      body[contenteditable="true"] .card:hover,
      body[contenteditable="true"] .qcm:hover,
      body[contenteditable="true"] .callout:hover,
      body[contenteditable="true"] .result:hover,
      body[contenteditable="true"] .duo:hover {
        outline: 1px dashed rgba(56, 189, 248, 0.35);
        outline-offset: 3px;
        border-radius: 4px;
      }

      /* Menu « / » des snippets */
      #preview-snippet-menu {
        position: fixed !important;
        z-index: 9999999 !important;
        width: 400px;
        max-width: calc(100vw - 20px);
        background: rgba(24, 24, 27, 0.98);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        box-shadow: 0 18px 44px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(0, 0, 0, 0.35);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-family: 'Segoe UI', system-ui, sans-serif;
        color: #e4e4e7;
        user-select: none;
        animation: snippetMenuFadeIn 0.08s ease-out;
      }
      @keyframes snippetMenuFadeIn {
        from { opacity: 0; transform: translateY(-3px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .psm-list {
        position: relative;
        overflow-y: auto;
        max-height: 300px;
        padding: 4px;
      }
      .psm-list::-webkit-scrollbar { width: 4px; }
      .psm-list::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.18); border-radius: 4px; }
      .psm-item {
        display: grid;
        grid-template-columns: minmax(72px, auto) 1fr auto;
        column-gap: 10px;
        align-items: center;
        padding: 6px 10px;
        border-radius: 6px;
        cursor: pointer;
      }
      .psm-item.active {
        background: rgba(56, 189, 248, 0.14);
        box-shadow: inset 2px 0 0 #38bdf8;
      }
      .psm-prefix {
        font: 12px Consolas, 'Courier New', monospace;
        color: #7dd3fc;
        white-space: nowrap;
      }
      .psm-prefix mark { background: none; color: #ffffff; font-weight: 700; }
      .psm-name {
        font-size: 13px;
        color: #f4f4f5;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .psm-cat { font-size: 10.5px; color: #71717a; white-space: nowrap; }
      .psm-desc {
        display: none;
        grid-column: 2 / 4;
        margin-top: 2px;
        font-size: 11.5px;
        color: #a1a1aa;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .psm-item.active .psm-desc { display: block; }
      .psm-footer {
        display: flex;
        gap: 14px;
        padding: 6px 10px;
        border-top: 1px solid rgba(255, 255, 255, 0.07);
        font-size: 11px;
        color: #71717a;
      }
      .psm-footer span:first-child { flex: 1; }
      .psm-footer kbd {
        font: 10.5px Consolas, monospace;
        color: #d4d4d8;
        background: rgba(255, 255, 255, 0.08);
        border-radius: 3px;
        padding: 0 4px;
        margin-right: 2px;
      }

      /* Barre de défilement ultra-fine, discrète et élégante */
      ::-webkit-scrollbar {
        width: 5px !important;
        height: 5px !important;
        background: transparent !important;
      }
      ::-webkit-scrollbar-track {
        background: transparent !important;
      }
      ::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2) !important;
        border-radius: 9999px !important;
        border: none !important;
        transition: background 0.2s ease !important;
      }
      ::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.45) !important;
      }
      ::-webkit-scrollbar-button {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
      }
      ::-webkit-scrollbar-corner {
        background: transparent !important;
      }
      * {
        scrollbar-width: thin !important;
        scrollbar-color: rgba(255, 255, 255, 0.2) transparent !important;
        box-sizing: border-box;
      }
      /* Empêcher tout débordement horizontal des médias et blocs sans briser le centrage */
      img, svg, video, canvas {
        max-width: 100%;
      }
      .duo, .grid, [class*="duo"], [class*="grid"] {
        max-width: 100% !important;
      }
      .duo > *, .grid > *, [class*="duo"] > *, [class*="grid"] > * {
        min-width: 0 !important;
        max-width: 100% !important;
      }
      pre {
        max-width: 100% !important;
        overflow-x: auto !important;
        box-sizing: border-box !important;
      }
      @media (max-width: 800px) {
        .duo, [class*="duo"] {
          grid-template-columns: 1fr !important;
        }
      }
      /* Champs d'un snippet en cours de saisie (jamais enregistrés : voir previewClean.ts).
         Fond transparent pour laisser la vraie couleur du texte visible, en conservant les bordures. */
      [data-nf-field] {
        outline: 1px dashed rgba(79, 193, 255, 0.85);
        outline-offset: 1px;
        background: transparent;
        border-radius: 3px;
      }
      [data-nf-field].nf-active {
        outline-style: solid;
        background: transparent;
      }
      [data-nf-field].nf-empty::before {
        content: attr(data-nf-hint);
        opacity: 0.5;
        font-style: italic;
      }
      [data-nf-field][data-nf-final] {
        outline: none;
        background: none;
      }
      /* Balise de couleur en cours d'édition (jamais enregistrée : retirée par cleanPreviewDocument).
         Bordure fine en tirets bleus et fond transparent pour garder la couleur du texte intacte. */
      [data-nf-editing-color] {
        outline: 1px dashed rgba(79, 193, 255, 0.55);
        outline-offset: 2px;
        background: transparent;
        border-radius: 3px;
        transition: outline 0.12s ease;
      }
      #nf-choice-menu {
        position: fixed;
        z-index: 9999999;
        min-width: 170px;
        padding: 4px;
        background: #18181b;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 8px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.7);
        font-family: 'Segoe UI', sans-serif;
        font-size: 13px;
        color: #e4e4e7;
        user-select: none;
      }
      #nf-choice-menu .nf-choice-hint {
        padding: 4px 10px 6px;
        font-size: 11px;
        color: #a1a1aa;
      }
      #nf-choice-menu .nf-choice {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 10px;
        border-radius: 5px;
        cursor: pointer;
      }
      #nf-choice-menu .nf-choice.active {
        background: rgba(79, 193, 255, 0.18);
      }
      #nf-choice-menu .nf-swatch {
        width: 12px;
        height: 12px;
        border-radius: 3px;
        flex: none;
      }
    </style>
    <script data-injected-preview-helpers="true">
      (function() {
        var isLiveEditEnabled = ${isEditable ? 'true' : 'false'};
        var snippetsData = ${safeSnippetsJson};
        var originalHadHtml = ${hasHtmlTag ? 'true' : 'false'};
        var originalHadDoctype = ${hasDoctype ? 'true' : 'false'};
        // Détection des liens PDF : source de src/shared/pdfLink.ts (fonction autonome)
        var parsePdfHref = ${parsePdfHref.toString()};
        // Snippets « à nombre » : source de src/shared/dynamicSnippets.ts (fonction autonome)
        var generateDynamicSnippets = ${generateDynamicSnippets.toString()};
        // Tri du menu « / » : source de src/shared/snippetRanking.ts (fonction autonome)
        var rankSnippets = ${rankSnippets.toString()};
        // Saisie (Entrée, sortie des colorations) et canvas : src/shared/previewEditing.ts,
        // canvasGeometry.ts et canvasEditor.ts (fonctions autonomes)
        var createPreviewEditing = ${createPreviewEditing.toString()};
        var createCanvasGeometry = ${createCanvasGeometry.toString()};
        var installCanvasEditor = ${installCanvasEditor.toString()};
        // Glisser-déposer des tableaux et blocs : src/shared/blockDrag.ts (fonction autonome)
        var installBlockDrag = ${installBlockDrag.toString()};
        // Annuler / rétablir dans l'aperçu : src/shared/undoHistory.ts (fonction autonome)
        var createUndoHistory = ${createUndoHistory.toString()};
        // Tableaux (sélection de cases, clic droit : fond, lignes, colonnes) et couleur des cartes :
        // src/shared/tableTools.ts (fonction autonome)
        var installTableTools = ${installTableTools.toString()};
        // Collage riche nettoyé : src/shared/pasteSanitize.ts (fonction autonome)
        var sanitizePastedHtml = ${sanitizePastedHtml.toString()};
        // Défilement voulu par l'utilisateur : source de src/shared/scrollIntent.ts (fonction autonome)
        var isUserScrollIntent = ${isUserScrollIntent.toString()};
        var lastScrollGestureAt = 0;
        ['wheel', 'touchmove', 'keydown', 'pointerdown'].forEach(function(type) {
          document.addEventListener(type, function(e) {
            if (e.isTrusted) lastScrollGestureAt = Date.now();
          }, { capture: true, passive: true });
        });

        // Nettoyage avant enregistrement : source de src/shared/previewClean.ts (fonction autonome)
        var cleanPreviewDocument = ${cleanPreviewDocument.toString()};
        // Attribut style du <body> tel qu'écrit dans la note, relevé avant toute intervention de l'aperçu
        var originalBodyStyle;
        function captureOriginalBodyStyle() {
          if (originalBodyStyle === undefined && document.body) {
            originalBodyStyle = document.body.getAttribute('style');
          }
        }
        captureOriginalBodyStyle();

        // HTML de la note sans rien de ce que l'aperçu a ajouté
        function getCleanHtml() {
          captureOriginalBodyStyle();
          return cleanPreviewDocument(document, {
            hadHtmlTag: originalHadHtml,
            hadDoctype: originalHadDoctype,
            originalBodyStyle: originalBodyStyle === undefined ? null : originalBodyStyle
          });
        }

        var emitTimer = null;
        function emitDocChange() {
          clearTimeout(emitTimer);
          emitTimer = setTimeout(function() {
            var html = getCleanHtml();
            window.parent.postMessage({
              type: 'PREVIEW_DOC_MUTATED',
              html: html
            }, '*');
          }, 180);
        }

        var previewEditing = createPreviewEditing();
        // Historique propre à l'aperçu : l'annulation du navigateur ne suit pas les modifications faites
        // par script (Entrée, snippets, canvas, glisser-déposer) et se vide dès que le DOM change hors d'elle.
        // Un instantané est pris AVANT chaque modification (recordUndo).
        var undoHistory = createUndoHistory(document);
        function recordUndo(kind, data) {
          if (isLiveEditEnabled) undoHistory.record(kind || 'edit', data);
        }
        window.addEventListener('keydown', function(e) {
          if (!isLiveEditEnabled || e.altKey || !(e.ctrlKey || e.metaKey)) {
            if (e.key && e.key.indexOf('Arrow') === 0) undoHistory.breakGroup();
            return;
          }
          var k = (e.key || '').toLowerCase();
          var isUndo = k === 'z' && !e.shiftKey;
          var isRedo = k === 'y' || (k === 'z' && e.shiftKey);
          if (!isUndo && !isRedo) return;
          e.preventDefault();
          e.stopImmediatePropagation();
          if (snippetSession) endSnippetSession(false);
          closeSnippetMenu();
          if (isUndo ? undoHistory.undo() : undoHistory.redo()) emitDocChange();
        }, true);
        window.addEventListener('pointerdown', function() { undoHistory.breakGroup(); }, true);
        // Position du curseur quand Flèche droite a armé la sortie d'une coloration
        var exitArmedAt = null;
        // Cartes et flèches des .canvas : écouteurs posés avant ceux de l'aperçu (Suppr sur une flèche)
        installCanvasEditor(document, {
          geometry: createCanvasGeometry(),
          onChange: emitDocChange,
          beforeChange: function() { recordUndo('edit'); },
          isEnabled: function() { return isLiveEditEnabled; }
        });
        installTableTools(document, {
          onChange: emitDocChange,
          beforeChange: function() { recordUndo('edit'); },
          isEnabled: function() { return isLiveEditEnabled; }
        });
        installBlockDrag(document, {
          onChange: emitDocChange,
          beforeChange: function() { recordUndo('edit'); },
          isEnabled: function() { return isLiveEditEnabled; }
        });

        // Pas d'envoi au blur : quitter l'aperçu ne doit jamais enregistrer la note.
        // Seules les saisies (input, Entrée, snippets, collage…) appellent emitDocChange.

        // Activer contenteditable sur le body pour l'édition directe Obsidian Live.
        // Rien n'est transformé à l'ouverture : une balise tapée en texte n'est convertie qu'au moment
        // de la saisie (checkForHtmlTagTransform).
        function makeEditable() {
          try {
            if (document.body) {
              captureOriginalBodyStyle();
              document.body.contentEditable = isLiveEditEnabled ? 'true' : 'false';
              document.body.spellcheck = false;
            }
          } catch(e) {}
        }

        makeEditable();
        window.addEventListener('load', makeEditable);
        window.addEventListener('DOMContentLoaded', makeEditable);
        setTimeout(makeEditable, 30);
        setTimeout(makeEditable, 150);

        // --- GESTION DU MENU DE SNIPPETS FLOTTANT ---
        var snippetMenuEl = null;
        var currentTriggerRange = null;
        var currentFilteredSnippets = [];
        var currentSelectedIndex = 0;
        var lastSnippetQuery = '';
        var lastSnippetRect = null;

        function ensureSnippetMenu() {
          if (!snippetMenuEl) {
            snippetMenuEl = document.createElement('div');
            snippetMenuEl.id = 'preview-snippet-menu';
            snippetMenuEl.style.display = 'none';
            snippetMenuEl.setAttribute('data-injected-preview-helpers', 'true');
            snippetMenuEl.setAttribute('contenteditable', 'false');
            // Un seul écouteur pour toute la liste (elle est reconstruite à chaque frappe)
            snippetMenuEl.addEventListener('mousedown', function(e) {
              e.preventDefault();
              e.stopPropagation();
              var item = e.target && e.target.closest ? e.target.closest('.psm-item') : null;
              if (!item) return;
              var idx = parseInt(item.getAttribute('data-index'), 10);
              if (!isNaN(idx) && currentFilteredSnippets[idx]) insertSnippet(currentFilteredSnippets[idx]);
            });
            snippetMenuEl.addEventListener('mousemove', function(e) {
              var item = e.target && e.target.closest ? e.target.closest('.psm-item') : null;
              if (!item) return;
              var idx = parseInt(item.getAttribute('data-index'), 10);
              if (!isNaN(idx) && idx !== currentSelectedIndex) setActiveSnippet(idx, false);
            });
            // Sur <html> : le <body> est zoomé, un menu en position fixe y serait décalé
            document.documentElement.appendChild(snippetMenuEl);
          }
          return snippetMenuEl;
        }

        function closeSnippetMenu() {
          if (snippetMenuEl) {
            snippetMenuEl.style.display = 'none';
            snippetMenuEl.innerHTML = '';
          }
          currentTriggerRange = null;
          currentFilteredSnippets = [];
          currentSelectedIndex = 0;
          renderedMenuQuery = null;
        }

        function escapeHtml(str) {
          if (!str) return '';
          return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        // Saisie affichée par le menu : la même saisie ne reconstruit pas la liste (input, keyup et
        // selectionchange appellent tous checkForSnippetTrigger)
        var renderedMenuQuery = null;

        function snippetsForQuery(q) {
          // Snippets « à nombre » (/table-3-2, /cards-4…) générés d'après la saisie ; un snippet
          // existant de même nom garde la priorité
          var knownPrefixes = {};
          snippetsData.forEach(function(s) { knownPrefixes[String(s.prefix).toLowerCase()] = true; });
          var generated = generateDynamicSnippets(q).filter(function(s) {
            return s.scope === 'html' && !knownPrefixes[s.prefix];
          });
          var usable = snippetsData.filter(function(s) {
            return !s.scope || s.scope === 'all' || s.scope === 'html';
          });
          return rankSnippets(generated.concat(usable), q);
        }

        function highlightMatch(text, q) {
          var s = String(text || '');
          var i = q ? s.toLowerCase().indexOf(q) : -1;
          if (i === -1) return escapeHtml(s);
          return escapeHtml(s.slice(0, i)) + '<mark>' + escapeHtml(s.slice(i, i + q.length)) + '</mark>' +
            escapeHtml(s.slice(i + q.length));
        }

        function positionSnippetMenu(menu, rect) {
          var width = menu.offsetWidth || 400;
          var height = menu.offsetHeight || 320;
          var spaceBelow = window.innerHeight - rect.bottom;
          var top = (spaceBelow >= height + 10 || spaceBelow >= rect.top)
            ? (rect.bottom + 6)
            : Math.max(8, rect.top - height - 6);
          var left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 12));
          menu.style.top = top + 'px';
          menu.style.left = left + 'px';
        }

        // Change l'élément actif sans reconstruire la liste ; fait défiler la liste (pas la page)
        function setActiveSnippet(idx, scroll) {
          var n = currentFilteredSnippets.length;
          if (!snippetMenuEl || !n) return;
          currentSelectedIndex = ((idx % n) + n) % n;
          var items = snippetMenuEl.querySelectorAll('.psm-item');
          for (var i = 0; i < items.length; i++) {
            items[i].classList.toggle('active', i === currentSelectedIndex);
          }
          var list = snippetMenuEl.querySelector('.psm-list');
          var el = items[currentSelectedIndex];
          if (scroll && list && el) {
            if (el.offsetTop < list.scrollTop + 4) {
              list.scrollTop = Math.max(0, el.offsetTop - 4);
            } else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight - 4) {
              list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight + 4;
            }
          }
        }

        function renderSnippetMenu(query, rect) {
          var menu = ensureSnippetMenu();
          var q = (query || '').toLowerCase().trim();
          if (q === renderedMenuQuery && menu.style.display !== 'none') {
            positionSnippetMenu(menu, rect);
            return;
          }

          currentFilteredSnippets = snippetsForQuery(q);
          if (currentFilteredSnippets.length === 0) {
            closeSnippetMenu();
            return;
          }
          if (q !== renderedMenuQuery) currentSelectedIndex = 0;
          renderedMenuQuery = q;

          var html = '<div class="psm-list">';
          currentFilteredSnippets.forEach(function(snip, idx) {
            html += '<div class="psm-item" data-index="' + idx + '">' +
                    '<span class="psm-prefix">/' + highlightMatch(snip.prefix, q) + '</span>' +
                    '<span class="psm-name">' + escapeHtml(snip.name) + '</span>' +
                    '<span class="psm-cat">' + escapeHtml(snip.category) + '</span>' +
                    (snip.description ? '<span class="psm-desc">' + escapeHtml(snip.description) + '</span>' : '') +
                    '</div>';
          });
          var count = currentFilteredSnippets.length;
          html += '</div><div class="psm-footer">' +
                  '<span>' + count + (count > 1 ? ' snippets' : ' snippet') + '</span>' +
                  '<span><kbd>↑</kbd><kbd>↓</kbd>choisir</span>' +
                  '<span><kbd>Entrée</kbd>insérer</span>' +
                  '<span><kbd>Échap</kbd>fermer</span>' +
                  '</div>';
          menu.innerHTML = html;
          menu.style.position = 'fixed';
          menu.style.display = 'flex';
          setActiveSnippet(currentSelectedIndex, true);
          positionSnippetMenu(menu, rect);
        }

        function insertSnippet(snip) {
          if (!snip) return;
          recordUndo('edit');
          var sel = window.getSelection();
          var selectedText = sel ? sel.toString() : '';
          var bodyText = Array.isArray(snip.body) ? snip.body.join(' ') : String(snip.body || '');
          // Champs gardés (et non aplatis) pour pouvoir les remplir dans le rendu
          var built = buildSnippetFragment(document, snip.body, selectedText, new Date(), snippetVariables);

          if (snippetSession) endSnippetSession(false);

          if (currentTriggerRange) {
            sel.removeAllRanges();
            sel.addRange(currentTriggerRange);
            currentTriggerRange.deleteContents();
          }

          if (sel && sel.rangeCount > 0) {
            var range = sel.getRangeAt(0);
            var fragment = built.fragment;
            var firstNode = fragment.firstChild;

            // Bloc tapé dans un paragraphe : le paragraphe est coupé autour (jamais de <div>, <ul>,
            // <table>… dans un <p>, que le navigateur casserait au rechargement en <p></p> vides) ;
            // un paragraphe qui ne contenait que le déclencheur « /… » disparaît.
            previewEditing.insertFragment(document, fragment);

            if (built.groups.length > 0) {
              // Champs à remplir : surlignés, Tab / Maj+Tab pour passer de l'un à l'autre
              startSnippetSession(built);
            } else if (built.finalMarker && built.finalMarker.parentNode) {
              placeCaretAtFinal(built.finalMarker);
            } else if (firstNode) {
              var focusTarget = (firstNode.nodeType === 1)
                ? (firstNode.querySelector('.label, pre code, h1, h2, h3, p, div') || firstNode)
                : firstNode;
              var newRange = document.createRange();
              newRange.selectNodeContents(focusTarget);
              newRange.collapse(false);
              sel.removeAllRanges();
              sel.addRange(newRange);
            }
          }

          closeSnippetMenu();
          emitDocChange();
        }

        // --- Session de champs d'un snippet inséré dans l'aperçu ---
        // Tab / Maj+Tab : champ suivant / précédent ; Échap ou clic ailleurs : fin (le texte reste) ;
        // un choix (couleur…) s'ouvre en menu, les flèches l'appliquent en direct.
        var buildSnippetFragment = ${buildSnippetFragment.toString()};
        var ZERO_WIDTH = String.fromCharCode(8203);
        // Choix de couleur : nom affiché et pastille, pour les noms de variables du thème (purple…)
        // comme pour les classes à une lettre (p, b, o…)
        var CHOICE_LABELS = {
          blue: ['Bleu', 'var(--blue)'], purple: ['Violet', 'var(--purple)'],
          orange: ['Orange', 'var(--orange)'], green: ['Vert', 'var(--green)'],
          yellow: ['Jaune', 'var(--yellow)'], red: ['Rouge', 'var(--red)'],
          b: ['Bleu', '#569cd6'], t: ['Turquoise', '#4ec9b0'], y: ['Jaune', 'var(--yellow)'],
          o: ['Orange', 'var(--orange)'], l: ['Vert clair', '#b5cea8'], g: ['Vert', 'var(--green)'],
          p: ['Violet', 'var(--purple)'], a: ['Bleu clair', '#9cdcfe'], r: ['Rouge', 'var(--red)']
        };
        // Variables des snippets calculées par l'app pour cette note (ex. chemin du thème partagé)
        var snippetVariables = ${JSON.stringify({ NOTES_THEME: notesThemeHref(notePath) })};
        var BLOCK_NAMES = ['DIV', 'P', 'PRE', 'TABLE', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
          'DETAILS', 'FIGURE', 'BLOCKQUOTE', 'SECTION', 'FOOTER'];
        var INLINE_WRAPPERS = ['SPAN', 'STRONG', 'EM', 'B', 'I', 'CODE', 'MARK'];
        var snippetSession = null;
        var choiceMenuEl = null;
        var choiceOccurrence = null;
        var choiceIndex = 0;
        // Suivi et surlignage de la balise de couleur en cours d'édition
        var activeColoredEl = null;
        var COLOR_CLASSES = ['b', 't', 'y', 'o', 'l', 'g', 'p', 'a', 'r', 'k', 'f', 's', 'n', 'c', 'keyword', 'kw'];

        function findColoredAncestor(node) {
          if (!node || node === document.body) return null;
          var el = node.nodeType === 1 ? node : node.parentElement;
          while (el && el !== document.body) {
            if (el.nodeName === 'SPAN' || el.nodeName === 'MARK' || el.nodeName === 'CODE' || el.nodeName === 'FONT') {
              if (el.closest && el.closest('pre')) return null;
              if (!el.hasAttribute('data-nf-field') && !el.classList.contains('tag')) {
                for (var i = 0; i < COLOR_CLASSES.length; i++) {
                  if (el.classList.contains(COLOR_CLASSES[i])) return el;
                }
                var styleAttr = el.getAttribute('style') || '';
                if (styleAttr.indexOf('color') !== -1) return el;
              }
            }
            if (['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH', 'BLOCKQUOTE', 'PRE', 'DIV', 'SECTION'].indexOf(el.nodeName) !== -1) {
              break;
            }
            el = el.parentElement;
          }
          return null;
        }

        function updateEditingColorOutline() {
          if (snippetSession) {
            if (activeColoredEl) {
              activeColoredEl.removeAttribute('data-nf-editing-color');
              activeColoredEl = null;
            }
            return;
          }
          var sel = window.getSelection();
          var found = null;
          if (sel && sel.rangeCount > 0 && isLiveEditEnabled) {
            found = findColoredAncestor(sel.anchorNode);
          }
          if (found !== activeColoredEl) {
            if (activeColoredEl) {
              activeColoredEl.removeAttribute('data-nf-editing-color');
            }
            activeColoredEl = found;
            if (activeColoredEl) {
              activeColoredEl.setAttribute('data-nf-editing-color', '');
            }
          }
        }

        function exitColoredElement(coloredEl, toStart) {
          if (!coloredEl || !coloredEl.parentNode) return;
          if (activeColoredEl) {
            activeColoredEl.removeAttribute('data-nf-editing-color');
            activeColoredEl = null;
          }
          coloredEl.removeAttribute('data-nf-editing-color');
          var parent = coloredEl.parentNode;
          var sel = window.getSelection();
          var r = document.createRange();

          if (toStart) {
            var prev = coloredEl.previousSibling;
            var prevNode = null;
            var prevOffset = 0;
            if (prev && prev.nodeType === 3) {
              var pVal = prev.nodeValue || '';
              if (/[\s\u00A0]$/.test(pVal)) {
                prevNode = prev;
                prevOffset = pVal.length;
              } else {
                prev.nodeValue = pVal + '\u00A0';
                prevNode = prev;
                prevOffset = prev.nodeValue.length;
              }
            } else {
              prevNode = document.createTextNode('\u00A0');
              parent.insertBefore(prevNode, coloredEl);
              prevOffset = 0;
            }
            r.setStart(prevNode, prevOffset);
          } else {
            // Sortir après le span en insérant un espace hors de la balise de couleur
            var next = coloredEl.nextSibling;
            var targetNode = null;
            var targetOffset = 1;

            if (next && next.nodeType === 3) {
              var val = next.nodeValue || '';
              if (/^[\s\u00A0]/.test(val)) {
                targetNode = next;
                targetOffset = 1;
              } else {
                next.nodeValue = '\u00A0' + val;
                targetNode = next;
                targetOffset = 1;
              }
            } else {
              targetNode = document.createTextNode('\u00A0');
              parent.insertBefore(targetNode, next || null);
              targetOffset = 1;
            }

            r.setStart(targetNode, targetOffset);
          }

          r.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r);

          if (typeof previewEditing !== 'undefined' && previewEditing.disarm) {
            previewEditing.disarm();
          }
          exitArmedAt = null;
          emitDocChange();
        }

        function fieldText(el) {
          return (el.textContent || '').split(ZERO_WIDTH).join('');
        }

        function setCaret(range) {
          var s = window.getSelection();
          s.removeAllRanges();
          s.addRange(range);
        }

        // Champ vide : indication grisée + espace de largeur nulle pour y garder le curseur
        function refreshField(el) {
          if (!el || el.hasAttribute('data-nf-final')) return;
          if (fieldText(el) === '') {
            el.classList.add('nf-empty');
            if (el.textContent !== ZERO_WIDTH) el.textContent = ZERO_WIDTH;
            return;
          }
          el.classList.remove('nf-empty');
          if ((el.textContent || '').indexOf(ZERO_WIDTH) !== -1) {
            var walker = document.createTreeWalker(el, 4);
            for (var t = walker.nextNode(); t; t = walker.nextNode()) {
              t.nodeValue = t.nodeValue.split(ZERO_WIDTH).join('');
            }
            var r = document.createRange();
            r.selectNodeContents(el);
            r.collapse(false);
            setCaret(r);
          }
        }

        function startSnippetSession(built) {
          if (activeColoredEl) {
            activeColoredEl.removeAttribute('data-nf-editing-color');
            activeColoredEl = null;
          }
          snippetSession = { groups: built.groups, finalMarker: built.finalMarker, current: -1 };
          built.groups.forEach(function(g) {
            g.occurrences.forEach(function(o) { if (o.kind === 'text') refreshField(o.element); });
          });
          activateField(0);
        }

        function activateField(position) {
          var s = snippetSession;
          if (!s || !s.groups[position]) return;
          closeChoiceMenu();
          s.groups.forEach(function(g) {
            g.occurrences.forEach(function(o) { if (o.kind === 'text') o.element.classList.remove('nf-active'); });
          });
          s.current = position;
          var occ = s.groups[position].occurrences[0];
          if (occ.kind === 'text') {
            occ.element.classList.add('nf-active');
            refreshField(occ.element);
            var r = document.createRange();
            r.selectNodeContents(occ.element);
            // Valeur par défaut sélectionnée : on tape pour la remplacer ; champ vide : curseur dedans
            if (fieldText(occ.element) === '') r.collapse(false);
            setCaret(r);
          }
          if (occ.choices && occ.choices.length > 1) openChoiceMenu(occ);
        }

        function moveField(step) {
          var s = snippetSession;
          if (!s) return;
          var next = s.current + step;
          if (next < 0) next = 0;
          if (next >= s.groups.length) endSnippetSession(true);
          else activateField(next);
        }

        function openChoiceMenu(occ) {
          closeChoiceMenu();
          choiceOccurrence = occ;
          choiceIndex = Math.max(0, occ.choices.indexOf(occ.getValue()));
          var menu = document.createElement('div');
          menu.id = 'nf-choice-menu';
          menu.setAttribute('data-injected-preview-helpers', 'true');
          menu.setAttribute('contenteditable', 'false');
          document.documentElement.appendChild(menu);
          choiceMenuEl = menu;
          renderChoiceMenu();
          var rect = occ.element.getBoundingClientRect();
          menu.style.top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - menu.offsetHeight - 8)) + 'px';
          menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
        }

        function renderChoiceMenu() {
          if (!choiceMenuEl || !choiceOccurrence) return;
          var html = '<div class="nf-choice-hint">↑ ↓ pour choisir · Entrée pour valider</div>';
          choiceOccurrence.choices.forEach(function(choice, i) {
            var known = CHOICE_LABELS[choice];
            var label = known ? known[0] : choice;
            var swatch = known
              ? '<span class="nf-swatch" style="background: ' + known[1] + '"></span>'
              : '';
            html += '<div class="nf-choice' + (i === choiceIndex ? ' active' : '') + '" data-choice="' + i + '">' +
              swatch + '<span>' + label + '</span></div>';
          });
          choiceMenuEl.innerHTML = html;
          choiceMenuEl.querySelectorAll('.nf-choice').forEach(function(item) {
            item.addEventListener('pointerdown', function(ev) {
              ev.preventDefault();
              ev.stopPropagation();
              applyChoice(parseInt(item.getAttribute('data-choice'), 10));
              moveField(1);
            });
          });
        }

        // Appliqué tout de suite : on voit la couleur changer pendant qu'on parcourt la liste
        function applyChoice(i) {
          if (!choiceOccurrence) return;
          var count = choiceOccurrence.choices.length;
          choiceIndex = ((i % count) + count) % count;
          choiceOccurrence.setValue(choiceOccurrence.choices[choiceIndex]);
          if (choiceOccurrence.kind === 'text') refreshField(choiceOccurrence.element);
          renderChoiceMenu();
          emitDocChange();
        }

        function closeChoiceMenu() {
          if (choiceMenuEl && choiceMenuEl.parentNode) choiceMenuEl.parentNode.removeChild(choiceMenuEl);
          choiceMenuEl = null;
          choiceOccurrence = null;
        }

        // Fin de champ : le texte reste, le marqueur part ; vide, il disparaît avec sa balise en ligne
        function unwrapField(el) {
          var parent = el.parentNode;
          if (!parent) return;
          if (fieldText(el) === '') {
            parent.removeChild(el);
            if (parent.nodeType === 1 && INLINE_WRAPPERS.indexOf(parent.nodeName) !== -1 &&
                fieldText(parent) === '' && !parent.querySelector('*') && parent.parentNode) {
              parent.parentNode.removeChild(parent);
            }
            return;
          }
          var walker = document.createTreeWalker(el, 4);
          for (var t = walker.nextNode(); t; t = walker.nextNode()) {
            t.nodeValue = t.nodeValue.split(ZERO_WIDTH).join('');
          }
          while (el.firstChild) parent.insertBefore(el.firstChild, el);
          parent.removeChild(el);
        }

        // $0 : curseur à la fin du snippet ; entre deux blocs, un paragraphe provisoire l'accueille
        function placeCaretAtFinal(marker) {
          var parent = marker.parentNode;
          if (!parent) return;
          var prev = marker.previousElementSibling;
          var r = document.createRange();
          if (prev && BLOCK_NAMES.indexOf(prev.nodeName) !== -1) {
            var p = document.createElement('p');
            p.setAttribute('data-nf-pending', '');
            p.innerHTML = '<br>';
            parent.replaceChild(p, marker);
            r.setStart(p, 0);
          } else if (prev && (prev.nodeName === 'SPAN' || prev.nodeName === 'MARK' || prev.nodeName === 'CODE')) {
            var next = marker.nextSibling;
            var targetNode = null;
            if (next && next.nodeType === 3) {
              var val = next.nodeValue || '';
              if (/^[\s\u00A0]/.test(val)) {
                targetNode = next;
              } else {
                next.nodeValue = '\u00A0' + val;
                targetNode = next;
              }
            } else {
              targetNode = document.createTextNode('\u00A0');
              parent.insertBefore(targetNode, marker);
            }
            parent.removeChild(marker);
            r.setStart(targetNode, 1);
          } else {
            r.setStartBefore(marker);
            parent.removeChild(marker);
          }
          r.collapse(true);
          setCaret(r);
        }

        function endSnippetSession(goToFinal) {
          var s = snippetSession;
          if (!s) return;
          snippetSession = null;
          closeChoiceMenu();
          // Champs répétés : ils reçoivent la valeur du premier
          s.groups.forEach(function(g) {
            var value = g.occurrences[0].getValue().split(ZERO_WIDTH).join('');
            for (var i = 1; i < g.occurrences.length; i++) g.occurrences[i].setValue(value);
          });
          s.groups.forEach(function(g) {
            g.occurrences.forEach(function(o) { if (o.kind === 'text') unwrapField(o.element); });
          });
          if (s.finalMarker && s.finalMarker.parentNode) {
            if (goToFinal) placeCaretAtFinal(s.finalMarker);
            else s.finalMarker.parentNode.removeChild(s.finalMarker);
          }
          // Copies d'encadrés créées par le navigateur (Entrée au milieu d'un champ) : retirées aussi
          sweepStrayFields();
          emitDocChange();
        }

        // Colle du texte brut dans le champ qui contient le curseur ; false si le curseur n'y est pas
        function pasteIntoField(text) {
          var sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return false;
          var position = fieldPositionOf(sel.anchorNode);
          if (position === -1) return false;
          var field = snippetSession.groups[position].occurrences[0].element;
          var range = sel.getRangeAt(0);
          var insideOnly = field.contains(range.startContainer) && field.contains(range.endContainer);
          var covered = document.createRange();
          covered.selectNodeContents(field);
          var wholeField = fieldText(field) === '' || !insideOnly ||
            (range.compareBoundaryPoints(Range.START_TO_START, covered) <= 0 &&
             range.compareBoundaryPoints(Range.END_TO_END, covered) >= 0);
          var node = document.createTextNode(text);
          if (wholeField) {
            field.textContent = '';
            field.appendChild(node);
          } else {
            range.deleteContents();
            range.insertNode(node);
          }
          refreshField(field);
          var after = document.createRange();
          after.setStartAfter(node);
          after.collapse(true);
          setCaret(after);
          emitDocChange();
          return true;
        }

        // Encadrés de champ que la session ne suit plus (Entrée qui coupe un champ et le duplique,
        // session terminée) : on garde leur texte, on retire l'encadré
        function sweepStrayFields() {
          var stray = document.querySelectorAll('[data-nf-field]');
          for (var i = 0; i < stray.length; i++) {
            if (stray[i].hasAttribute('data-nf-final')) {
              if (stray[i].parentNode) stray[i].parentNode.removeChild(stray[i]);
            } else {
              unwrapField(stray[i]);
            }
          }
        }

        // Le curseur a quitté tous les champs (flèches, frappe après le champ) : la saisie est finie
        function endSessionIfCaretLeft() {
          if (!snippetSession || choiceMenuEl) return;
          var sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return;
          if (fieldPositionOf(sel.anchorNode) === -1 && fieldPositionOf(sel.focusNode) === -1) {
            endSnippetSession(false);
          }
        }

        function fieldPositionOf(node) {
          var s = snippetSession;
          if (!s || !node) return -1;
          for (var i = 0; i < s.groups.length; i++) {
            var occ = s.groups[i].occurrences[0];
            if (occ.kind === 'text' && (occ.element === node || occ.element.contains(node))) return i;
          }
          return -1;
        }

        // Navigation clavier pour les snippets, blocs de code, titres et protection des structures Obsidian
        window.addEventListener('keydown', function(e) {
          if (snippetMenuEl && snippetMenuEl.style.display !== 'none') {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              e.stopPropagation();
              setActiveSnippet(currentSelectedIndex + 1, true);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              e.stopPropagation();
              setActiveSnippet(currentSelectedIndex - 1, true);
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              e.stopPropagation();
              if (currentFilteredSnippets[currentSelectedIndex]) {
                insertSnippet(currentFilteredSnippets[currentSelectedIndex]);
              }
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              closeSnippetMenu();
              return;
            }
          }

          // Touches qui modifient la note par script (Entrée, Emmet, effacements protégés, Tab) :
          // instantané avant (sans doublon si le navigateur fait la modification lui-même)
          if ((e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Tab') &&
              !e.ctrlKey && !e.metaKey) {
            // Effacements à la suite : une seule étape d'annulation
            recordUndo(e.key === 'Backspace' || e.key === 'Delete' ? 'deleting' : 'edit');
          }

          // Session de champs d'un snippet : prioritaire sur Tab (indentation, Emmet) et Échap
          if (snippetSession) {
            if (choiceMenuEl && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
              e.preventDefault();
              e.stopPropagation();
              applyChoice(choiceIndex + (e.key === 'ArrowDown' ? 1 : -1));
              return;
            }
            if (e.key === 'Tab' || (e.key === 'Enter' && choiceMenuEl)) {
              e.preventDefault();
              e.stopPropagation();
              moveField(e.shiftKey && e.key === 'Tab' ? -1 : 1);
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              endSnippetSession(false);
              return;
            }
          }

          // Sortie d'une balise de couleur en cours d'édition via la touche Tab
          if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey && isLiveEditEnabled && (!snippetMenuEl || snippetMenuEl.style.display === 'none')) {
            var tabSel = window.getSelection();
            var coloredEl = (tabSel && tabSel.rangeCount > 0) ? (activeColoredEl || findColoredAncestor(tabSel.anchorNode)) : null;
            if (coloredEl) {
              e.preventDefault();
              e.stopPropagation();
              exitColoredElement(coloredEl, e.shiftKey);
              return;
            }
          }

          if (e.key === 'ArrowRight' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && isLiveEditEnabled && !snippetSession) {
            if (previewEditing.armExit(document)) {
              var armedSel = window.getSelection();
              var armedRange = armedSel && armedSel.rangeCount ? armedSel.getRangeAt(0) : null;
              exitArmedAt = armedRange ? { node: armedRange.startContainer, offset: armedRange.startOffset } : null;
              e.preventDefault();
              return;
            }
          } else if (e.key.length > 1 && e.key !== 'Shift' && e.key !== 'Dead' && e.key !== 'Process') {
            previewEditing.disarm();
            exitArmedAt = null;
          }

          var sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            var currentBlock = null;
            var bNode = sel.anchorNode;
            while (bNode && bNode !== document.body) {
              if (['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'DIV', 'SECTION', 'FOOTER'].includes(bNode.nodeName)) {
                currentBlock = bNode;
                break;
              }
              bNode = bNode.parentNode;
            }

            // 1. Gestion de l'édition directe de code dans <pre> ou <code>
            var inCode = currentBlock && (currentBlock.nodeName === 'PRE' || currentBlock.nodeName === 'CODE');
            if (!inCode && bNode) {
              var cCheck = sel.anchorNode;
              while (cCheck && cCheck !== document.body) {
                if (cCheck.nodeName === 'PRE' || cCheck.nodeName === 'CODE') {
                  inCode = true;
                  break;
                }
                cCheck = cCheck.parentNode;
              }
            }

            if (inCode) {
              if (e.key === 'Tab') {
                e.preventDefault();
                e.stopPropagation();
                document.execCommand('insertText', false, '  ');
                emitDocChange();
                return;
              }
              // Entrée dans un <pre> : saut de ligne dans le même bloc (insertText de Chrome coupait le
              // bloc en deux <code>) ; dans un <code> en ligne : coupure du paragraphe, hors du code
              if (e.key === 'Enter' && !e.ctrlKey && !e.altKey && !e.metaKey) {
                if (previewEditing.insertCodeNewline(document) || (!e.shiftKey && previewEditing.handleEnter(document))) {
                  e.preventDefault();
                  e.stopPropagation();
                  emitDocChange();
                  return;
                }
              }
            }

            if (currentBlock) {
              var range = sel.getRangeAt(0);
              var preRange = document.createRange();
              preRange.setStart(currentBlock, 0);
              preRange.setEnd(range.startContainer, range.startOffset);
              var textBefore = preRange.toString().trim();
              var fullBlockText = (currentBlock.textContent || '').trim();

              // 2. Touche Tab ou Entrée pour expansion Emmet (ex: "h1", "h2", "h3", "p", "step", "card", "pre", etc.)
              // (seulement dans un bloc de texte simple : remplacer un bloc qui contient des balises
              // ferait perdre son contenu)
              if ((e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) && (!snippetMenuEl || snippetMenuEl.style.display === 'none') &&
                  onlyBreaks(currentBlock) && ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].indexOf(currentBlock.nodeName) !== -1 &&
                  !currentBlock.closest('.canvas, table')) {
                var emmetTag = fullBlockText.toLowerCase();
                var emmetTemplates = {
                  'h1': '<h1><br></h1>',
                  'h2': '<h2><br></h2>',
                  'h3': '<h3><br></h3>',
                  'h4': '<h4><br></h4>',
                  'h5': '<h5><br></h5>',
                  'h6': '<h6><br></h6>',
                  'p': '<p><br></p>',
                  'pre': '<pre><code><br></code></pre>',
                  'code': '<pre><code><br></code></pre>',
                  'blockquote': '<blockquote><p><br></p></blockquote>',
                  'quote': '<blockquote><p><br></p></blockquote>',
                  'ul': '<ul><li><br></li></ul>',
                  'ol': '<ol><li><br></li></ol>',
                  'table': '<table><thead><tr><th>Titre 1</th><th>Titre 2</th></tr></thead><tbody><tr><td>Donnée 1</td><td>Donnée 2</td></tr></tbody></table>',
                  'hr': '<hr><p><br></p>',
                  'step': '<div class="step"><span class="label">Étape</span><p><br></p></div>',
                  // Blocs du design system (docs/reference/exemple-note.html) : card = .node, qcm = .quiz-item,
                  // callout = .note
                  'card': '<div class="node"><div class="node-title">Titre</div><p><br></p></div>',
                  'qcm': '<div class="quiz-item"><div class="q-title">Question</div><p>A) <br>B) </p><details><summary>Voir la correction</summary><p><br></p></details></div>',
                  'callout': '<div class="note"><span class="label">À retenir</span><p><br></p></div>',
                  'duo': '<div class="duo"><div><h3>Colonne 1</h3><p><br></p></div><div><h3>Colonne 2</h3><p><br></p></div></div>'
                };

                if (emmetTemplates[emmetTag]) {
                  e.preventDefault();
                  e.stopPropagation();
                  var tpl = document.createElement('template');
                  tpl.innerHTML = emmetTemplates[emmetTag];
                  var newEl = tpl.content.firstChild;
                  currentBlock.replaceWith(tpl.content);
                  var focusTarget = (newEl && newEl.nodeType === 1)
                    ? (newEl.querySelector('.node-title, .q-title, .label, code, p, h1, h2, h3, h4, h5, h6, li') || newEl)
                    : newEl;
                  if (focusTarget) {
                    var newR = document.createRange();
                    newR.setStart(focusTarget, 0);
                    newR.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newR);
                  }
                  emitDocChange();
                  return;
                }
              }

              // 2 bis. Tab hors code, hors snippet et hors Emmet : indentation par 4 espaces insécables
              // (des espaces normaux seraient fusionnés par le HTML) ; Maj+Tab retire cette indentation
              if (e.key === 'Tab' && isLiveEditEnabled && (!snippetMenuEl || snippetMenuEl.style.display === 'none')) {
                e.preventDefault();
                e.stopPropagation();
                var NBSP = String.fromCharCode(160);
                if (!e.shiftKey) {
                  document.execCommand('insertText', false, NBSP + NBSP + NBSP + NBSP);
                } else if (sel.isCollapsed && sel.anchorNode && sel.anchorNode.nodeType === 3) {
                  var textNode = sel.anchorNode;
                  var caret = sel.anchorOffset;
                  var start = caret;
                  while (start > 0 && caret - start < 4 && textNode.nodeValue.charAt(start - 1) === NBSP) start--;
                  if (start < caret) {
                    var outdent = document.createRange();
                    outdent.setStart(textNode, start);
                    outdent.setEnd(textNode, caret);
                    sel.removeAllRanges();
                    sel.addRange(outdent);
                    document.execCommand('delete');
                  }
                }
                emitDocChange();
                return;
              }

              // 3. Raccourcis Markdown Obsidian sur frappe de la barre Espace (# , ## , ### , - , 1. , > )
              if (e.key === ' ' && currentBlock.nodeName === 'P') {
                var mdShortcuts = {
                  '#': '<h1><br></h1>',
                  '##': '<h2><br></h2>',
                  '###': '<h3><br></h3>',
                  '####': '<h4><br></h4>',
                  '-': '<ul><li><br></li></ul>',
                  '*': '<ul><li><br></li></ul>',
                  '1.': '<ol><li><br></li></ol>',
                  '>': '<blockquote><p><br></p></blockquote>'
                };
                mdShortcuts[String.fromCharCode(96, 96, 96)] = '<pre><code><br></code></pre>';

                if (mdShortcuts[textBefore] && (fullBlockText === textBefore || fullBlockText === textBefore + ' ')) {
                  e.preventDefault();
                  e.stopPropagation();
                  var tpl2 = document.createElement('template');
                  tpl2.innerHTML = mdShortcuts[textBefore];
                  var newEl2 = tpl2.content.firstChild;
                  currentBlock.replaceWith(tpl2.content);
                  var focusTarget2 = (newEl2 && newEl2.nodeType === 1)
                    ? (newEl2.querySelector('code, p, li, h1, h2, h3, h4') || newEl2)
                    : newEl2;
                  if (focusTarget2) {
                    var newR2 = document.createRange();
                    newR2.setStart(focusTarget2, 0);
                    newR2.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newR2);
                  }
                  emitDocChange();
                  return;
                }
              }

              // 5. Entrée dans une liste <li> : sortie propre de la liste si l'élément est vide
              if (e.key === 'Enter' && !e.shiftKey && currentBlock.nodeName === 'LI') {
                if (fullBlockText === '') {
                  e.preventDefault();
                  e.stopPropagation();
                  var listParent = currentBlock.parentElement;
                  currentBlock.remove();
                  var newP = document.createElement('p');
                  newP.innerHTML = '<br>';
                  if (listParent) {
                    listParent.after(newP);
                    if (listParent.children.length === 0) listParent.remove();
                  } else {
                    document.body.appendChild(newP);
                  }
                  var newR3 = document.createRange();
                  newR3.setStart(newP, 0);
                  newR3.collapse(true);
                  sel.removeAllRanges();
                  sel.addRange(newR3);
                  emitDocChange();
                  return;
                }
              }

              // 4. Entrée : vrais paragraphes <p> (src/shared/previewEditing.ts) ; Maj+Entrée garde le <br>
              if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && isLiveEditEnabled) {
                if (snippetSession) endSnippetSession(false);
                if (previewEditing.handleEnter(document)) {
                  e.preventDefault();
                  e.stopPropagation();
                  emitDocChange();
                  return;
                }
              }

              // 6. Protection anti-fusion des blocs et reconversion des titres vides H1-H6 en <p> sur Backspace
              if (e.key === 'Backspace' && sel.isCollapsed && preRange.toString().length === 0) {
                if (/^H[1-6]$/i.test(currentBlock.nodeName) || currentBlock.nodeName === 'BLOCKQUOTE') {
                  if (fullBlockText === '') {
                    e.preventDefault();
                    e.stopPropagation();
                    var p2 = document.createElement('p');
                    p2.innerHTML = '<br>';
                    currentBlock.replaceWith(p2);
                    var newR4 = document.createRange();
                    newR4.setStart(p2, 0);
                    newR4.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newR4);
                    emitDocChange();
                    return;
                  }
                }
                if (currentBlock.nodeName === 'FOOTER') {
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }
                if (currentBlock.nodeName === 'P' && (currentBlock.textContent.trim() === '' || currentBlock.innerHTML === '<br>')) {
                  e.preventDefault();
                  e.stopPropagation();
                  var prev = currentBlock.previousElementSibling;
                  currentBlock.remove();
                  if (prev) {
                    var r = document.createRange();
                    r.selectNodeContents(prev);
                    r.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(r);
                  }
                  emitDocChange();
                  return;
                }
              }
            }
          }
        }, true);

        // Détection de la frappe du slash '/' pour ouvrir les snippets
        function checkForSnippetTrigger() {
          var sel = window.getSelection();
          if (!sel || !sel.rangeCount) {
            closeSnippetMenu();
            return;
          }
          var range = sel.getRangeAt(0);
          if (!range.collapsed) {
            closeSnippetMenu();
            return;
          }

          var node = range.startContainer;
          var offset = range.startOffset;

          // Si le curseur est dans un élément DOM (ex: <p> ou <div>) au lieu d'un text node direct
          if (node.nodeType === 1) {
            if (offset > 0 && node.childNodes[offset - 1] && node.childNodes[offset - 1].nodeType === Node.TEXT_NODE) {
              node = node.childNodes[offset - 1];
              offset = node.textContent ? node.textContent.length : 0;
            } else if (node.childNodes[offset] && node.childNodes[offset].nodeType === Node.TEXT_NODE) {
              node = node.childNodes[offset];
              offset = 0;
            } else if (node.firstChild && node.firstChild.nodeType === Node.TEXT_NODE) {
              node = node.firstChild;
              offset = node.textContent ? node.textContent.length : 0;
            }
          }

          if (node.nodeType !== Node.TEXT_NODE) {
            closeSnippetMenu();
            return;
          }

          var text = node.textContent || '';
          var textBefore = text.substring(0, offset);
          var slashIdx = textBefore.lastIndexOf('/');

          if (slashIdx === -1) {
            closeSnippetMenu();
            return;
          }

          if (slashIdx > 0) {
            var prevCode = textBefore.charCodeAt(slashIdx - 1);
            if (prevCode > 32 && prevCode !== 160) {
              closeSnippetMenu();
              return;
            }
          }

          var query = textBefore.substring(slashIdx + 1);
          if (query.length > 20) {
            closeSnippetMenu();
            return;
          }
          for (var qi = 0; qi < query.length; qi++) {
            var qc = query.charCodeAt(qi);
            if (qc <= 32 || qc === 160) {
              closeSnippetMenu();
              return;
            }
          }

          var trigRange = document.createRange();
          trigRange.setStart(node, slashIdx);
          trigRange.setEnd(node, offset);
          currentTriggerRange = trigRange;

          var rect = trigRange.getBoundingClientRect();
          if (!rect || (rect.top === 0 && rect.bottom === 0 && rect.left === 0 && rect.width === 0)) {
            var parentEl = node.parentElement;
            if (parentEl) {
              rect = parentEl.getBoundingClientRect();
            }
          }

          lastSnippetQuery = query;
          lastSnippetRect = rect;
          renderSnippetMenu(query, rect);
        }

        // Détection et conversion en direct des balises HTML tapées (ex: <h1> seul, ou <h1>Titre</h1>, ou <style>...)
        // Bloc sans autre balise que des <br> (ligne vide de remplissage) : sûr à remplacer d'après son texte
        function onlyBreaks(el) {
          return Array.prototype.every.call(el.children, function(c) { return c.nodeName === 'BR'; });
        }

        function checkForHtmlTagTransform() {
          var sel = window.getSelection();
          if (!sel || !sel.rangeCount) return;
          var node = sel.anchorNode;
          var block = null;
          while (node && node !== document.body) {
            if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE'].includes(node.nodeName)) {
              block = node;
              break;
            }
            node = node.parentNode;
          }
          if (!block) return;
          // Jamais dans un bloc qui contient déjà des balises : la conversion repart de son texte
          // seul (textContent) et ferait perdre couleurs, liens et sous-blocs. Ni dans le code.
          if (!onlyBreaks(block) || block.closest('pre, code, table')) return;

          var text = block.textContent || '';
          var trimmed = text.trim();

          // 1. Tag ouvrant seul tapé dans un paragraphe : ex. "<h1>", "<h2>", "<pre>", etc.
          var openTagMatch = trimmed.match(/^<([a-zA-Z1-6]+)(?:\\s+[^>]*)?>$/);
          if (openTagMatch) {
            var tag = openTagMatch[1].toLowerCase();
            if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'pre', 'blockquote', 'div', 'ul', 'ol', 'style'].includes(tag)) {
              var template = document.createElement('template');
              if (tag === 'pre') {
                template.innerHTML = '<pre><code><br></code></pre>';
              } else if (tag === 'blockquote') {
                template.innerHTML = '<blockquote><p><br></p></blockquote>';
              } else if (tag === 'ul' || tag === 'ol') {
                template.innerHTML = '<' + tag + '><li><br></li></' + tag + '>';
              } else if (tag === 'style') {
                template.innerHTML = '<style>/* CSS */</style><p><br></p>';
              } else {
                template.innerHTML = '<' + tag + '><br></' + tag + '>';
              }
              var newEl = template.content.firstChild;
              block.replaceWith(template.content);
              var focusTarget = (newEl && newEl.nodeType === 1)
                ? (newEl.querySelector('code, p, li') || newEl)
                : newEl;
              if (focusTarget) {
                var r = document.createRange();
                r.setStart(focusTarget, 0);
                r.collapse(true);
                sel.removeAllRanges();
                sel.addRange(r);
              }
              emitDocChange();
              return;
            }
          }

          // 2. Balise HTML complète tapée : ex. "<h1>Titre</h1>", "<h1></h1>", "<strong>gras</strong>", "<style>...</style>"
          // (tout le texte du bloc doit être la balise : « Utilise <b>x</b> » reste du texte)
          var fullTagRegex = /^(?:<([a-zA-Z1-6]+)(?:\\s+[^>]*)?>[\\s\\S]*?<\\/\\1>|<(hr|br|img|input)[^>]*\\/?>)$/i;
          if (fullTagRegex.test(trimmed)) {
            var template = document.createElement('template');
            template.innerHTML = trimmed;
            if (template.content.childNodes.length > 0) {
              var lastChild = template.content.lastChild;
              var onlyInline = Array.prototype.every.call(template.content.childNodes, function(n) {
                return n.nodeType !== 1 || ['B', 'STRONG', 'I', 'EM', 'U', 'S', 'SPAN', 'A', 'CODE', 'MARK', 'SMALL', 'SUB', 'SUP', 'KBD', 'BR', 'IMG', 'INPUT'].indexOf(n.nodeName) !== -1;
              });
              // Balise en ligne (<strong>…) : dans le paragraphe ; bloc (<h2>…) : à la place du paragraphe
              if (onlyInline && block.nodeName !== 'DIV') {
                while (block.firstChild) block.removeChild(block.firstChild);
                block.appendChild(template.content);
              } else {
                block.replaceWith(template.content);
              }
              if (lastChild) {
                var r = document.createRange();
                r.selectNodeContents(lastChild);
                r.collapse(false);
                sel.removeAllRanges();
                sel.addRange(r);
              }
              emitDocChange();
              return;
            }
          }
        }

        var styledBeforeEdit = null;
        document.addEventListener('beforeinput', function(e) {
          if (!isLiveEditEnabled) return;
          var type = e.inputType || '';
          if (type !== 'historyUndo' && type !== 'historyRedo') {
            recordUndo(type === 'insertText' ? 'typing' : type.indexOf('delete') === 0 ? 'deleting' : 'edit', e.data || '');
          } else {
            // Annuler du menu contextuel : passe par notre historique
            e.preventDefault();
            if (type === 'historyUndo' ? undoHistory.undo() : undoHistory.redo()) emitDocChange();
            return;
          }
          // Toute saisie peut faire inventer à Chrome des <span style> (fusion de blocs, frappe sur un
          // élément stylé supprimé) : retirés après coup s'ils sont nouveaux
          styledBeforeEdit = previewEditing.snapshotStyled(document);
          if (type === 'insertText' && e.data && !snippetSession) {
            if (previewEditing.insertTextOutside(document, e.data)) {
              e.preventDefault();
              exitArmedAt = null;
              emitDocChange();
              checkForSnippetTrigger();
            }
            return;
          }
        }, true);

        document.addEventListener('input', function() {
          // Fusion de blocs par effacement : Chrome ajoute des <span style="…"> recopiant le style calculé
          if (styledBeforeEdit) {
            previewEditing.unwrapNewStyled(document, styledBeforeEdit);
            styledBeforeEdit = null;
          }
          if (snippetSession) {
            var anchor = window.getSelection() ? window.getSelection().anchorNode : null;
            var position = fieldPositionOf(anchor);
            if (position !== -1) refreshField(snippetSession.groups[position].occurrences[0].element);
            else endSessionIfCaretLeft();
          } else if (document.querySelector('[data-nf-field]')) {
            sweepStrayFields();
          }
          emitDocChange();
          checkForSnippetTrigger();
          checkForHtmlTagTransform();
        }, true);

        document.addEventListener('paste', function(e) {
          if (!isLiveEditEnabled) return;
          recordUndo('edit');
          var text = (e.clipboardData || window.clipboardData).getData('text/plain');
          // Sans texte brut, il peut rester du HTML (image copiée d'une page) : nettoyé plus bas
          if (!text && !(e.clipboardData && e.clipboardData.getData('text/html'))) return;
          text = text || '';
          // Collage dans un champ de snippet : texte brut, dans le champ. Le collage du navigateur
          // supprimait le champ (et sa balise colorée) avant de coller à côté.
          if (snippetSession && text && pasteIntoField(text)) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          var trimmed = text.trim();
          if (/<([a-zA-Z1-6]+)(?:\\s+[^>]*)?>[\\s\\S]*<\\/\\1>/i.test(trimmed) || /^<(div|style|pre|table|h[1-6]|p|section|article|blockquote|figure)[\\s>]/i.test(trimmed)) {
            e.preventDefault();
            var template = document.createElement('template');
            template.innerHTML = trimmed;
            var fragment = template.content;
            var sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
              previewEditing.insertFragment(document, fragment);
              emitDocChange();
            }
            return;
          }
          // Collage riche (page web, Word, autre note) : structure et classes du thème gardées, styles,
          // polices et <span> d'origine retirés ; jamais dans un bloc de code (texte brut)
          var richHtml = e.clipboardData ? e.clipboardData.getData('text/html') : '';
          var pasteSel = window.getSelection();
          var pasteAnchor = pasteSel && pasteSel.anchorNode
            ? (pasteSel.anchorNode.nodeType === 1 ? pasteSel.anchorNode : pasteSel.anchorNode.parentElement)
            : null;
          if (richHtml && !(pasteAnchor && pasteAnchor.closest && pasteAnchor.closest('pre, code'))) {
            var cleaned = sanitizePastedHtml(document, richHtml);
            if ((cleaned.textContent || '').trim() || cleaned.querySelector('img, hr, table')) {
              e.preventDefault();
              e.stopPropagation();
              previewEditing.insertFragment(document, cleaned);
              emitDocChange();
              return;
            }
          }
          // Texte brut sur plusieurs lignes : un paragraphe par ligne (le navigateur créait des <div>
          // et des <br>) ; dans un bloc de code, collé tel quel
          if (previewEditing.pasteText(document, text)) {
            e.preventDefault();
            e.stopPropagation();
            emitDocChange();
          }
        }, true);

        document.addEventListener('keyup', function(e) {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter' || e.key === 'Tab' || e.key === 'Escape') {
            return;
          }
          checkForSnippetTrigger();
        }, true);

        document.addEventListener('selectionchange', function() {
          if (snippetMenuEl && snippetMenuEl.style.display !== 'none') {
            checkForSnippetTrigger();
          }
          // Flèches ou clic hors des champs : la session de snippet se termine
          endSessionIfCaretLeft();
          if (exitArmedAt) {
            var cs = window.getSelection();
            var cr = cs && cs.rangeCount ? cs.getRangeAt(0) : null;
            if (!cr || cr.startContainer !== exitArmedAt.node || cr.startOffset !== exitArmedAt.offset) {
              previewEditing.disarm();
              exitArmedAt = null;
            }
          }
          updateEditingColorOutline();
        });

        window.addEventListener('blur', function() {
          if (activeColoredEl) {
            activeColoredEl.removeAttribute('data-nf-editing-color');
            activeColoredEl = null;
          }
        });

        document.addEventListener('pointerdown', function(e) {
          if (snippetMenuEl && !snippetMenuEl.contains(e.target)) {
            closeSnippetMenu();
          }
          // Session de snippet : clic dans un champ = ce champ ; clic ailleurs = fin, le texte reste
          if (snippetSession && !(choiceMenuEl && choiceMenuEl.contains(e.target))) {
            var position = fieldPositionOf(e.target);
            if (position === -1) endSnippetSession(false);
            else if (position !== snippetSession.current) {
              closeChoiceMenu();
              snippetSession.groups.forEach(function(g) {
                g.occurrences.forEach(function(o) { if (o.kind === 'text') o.element.classList.remove('nf-active'); });
              });
              snippetSession.current = position;
              snippetSession.groups[position].occurrences[0].element.classList.add('nf-active');
            }
          }
        });

        // Interception des clics sur les liens vers un document PDF (ex: cours.pdf#page=12)
        document.addEventListener('click', function(e) {
          var a = e.target && e.target.closest ? e.target.closest('a') : null;
          if (a) {
            var href = a.getAttribute('href') || '';
            if (parsePdfHref(href)) {
              e.preventDefault();
              e.stopPropagation();
              window.parent.postMessage({
                type: 'OPEN_PDF_PAGE',
                href: href
              }, '*');
              return;
            }
            // Lien web : ouvert dans le navigateur du système plutôt que dans l'aperçu
            // (pas d'antislash ici : ce script est un template literal qui les consomme)
            if (/^https?:/i.test(href.trim())) {
              e.preventDefault();
              e.stopPropagation();
              window.parent.postMessage({
                type: 'OPEN_EXTERNAL_URL',
                href: href.trim()
              }, '*');
              return;
            }
          }
        }, true);

        // Clic dans les espaces vides entre ou sous les blocs (Obsidian Live Preview)
        document.addEventListener('click', function(e) {
          if (!isLiveEditEnabled) return;
          if (snippetMenuEl && snippetMenuEl.style.display !== 'none') return;

          var target = e.target;
          var container = document.querySelector('.container') || document.body;

          if (target === document.body || target === container || (target.classList && target.classList.contains('container'))) {
            var y = e.clientY + window.scrollY;
            var children = Array.from(container.children).filter(function(el) {
              return el.id !== 'preview-snippet-menu' && !el.hasAttribute('data-injected-preview-helpers');
            });

            var insertAfter = null;
            for (var i = 0; i < children.length; i++) {
              var rect = children[i].getBoundingClientRect();
              var bottom = rect.bottom + window.scrollY;
              if (bottom <= y) {
                insertAfter = children[i];
              }
            }

            if (insertAfter && insertAfter.nodeName !== 'FOOTER') {
              var next = insertAfter.nextElementSibling;
              if (next && next.nodeName === 'P' && (next.textContent.trim() === '' || next.innerHTML === '<br>')) {
                var r = document.createRange();
                r.selectNodeContents(next);
                r.collapse(false);
                var s = window.getSelection();
                s.removeAllRanges();
                s.addRange(r);
                return;
              }
              // Paragraphe provisoire : marqué, non enregistré tant qu'on n'y tape rien
              // (cleanPreviewDocument le retire s'il est resté vide). Un seul à la fois.
              var stale = document.querySelectorAll('p[data-nf-pending]');
              for (var k = 0; k < stale.length; k++) {
                if (stale[k].textContent.trim() === '') stale[k].remove();
              }
              var p = document.createElement('p');
              p.setAttribute('data-nf-pending', '');
              p.innerHTML = '<br>';
              insertAfter.after(p);
              var r2 = document.createRange();
              r2.setStart(p, 0);
              r2.collapse(true);
              var s2 = window.getSelection();
              s2.removeAllRanges();
              s2.addRange(r2);
            }
          }
        });

        function getScrollInfo() {
          var scrollY = window.scrollY || (document.documentElement ? document.documentElement.scrollTop : 0) || (document.body ? document.body.scrollTop : 0);
          var docHeight = Math.max(
            document.documentElement ? document.documentElement.scrollHeight : 0,
            document.body ? document.body.scrollHeight : 0
          );
          var maxScroll = docHeight - window.innerHeight;
          var ratio = maxScroll > 0 ? (scrollY / maxScroll) : 0;
          return { scrollY: scrollY, ratio: ratio };
        }

        // Forward Esc key, Ctrl+F, and Ctrl+J / Cmd+J from inside iframe to parent window
        function handleKey(e) {
          if (e.key === 'Escape' || e.keyCode === 27) {
            if (snippetMenuEl && snippetMenuEl.style.display !== 'none') {
              e.preventDefault();
              e.stopPropagation();
              closeSnippetMenu();
              return;
            }
            // Échap termine d'abord la saisie d'un snippet, sans quitter le plein écran
            if (snippetSession) {
              e.preventDefault();
              e.stopPropagation();
              endSnippetSession(false);
              return;
            }
            e.preventDefault();
            e.stopPropagation();
            var info = getScrollInfo();
            window.parent.postMessage({
              type: 'HTML_EXIT_FULLSCREEN',
              scrollY: info.scrollY,
              ratio: info.ratio
            }, '*');
          }
          if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'f' || e.code === 'KeyF')) {
            e.preventDefault();
            e.stopPropagation();
            var info = getScrollInfo();
            window.parent.postMessage({
              type: 'HTML_TOGGLE_FULLSCREEN',
              scrollY: info.scrollY,
              ratio: info.ratio
            }, '*');
          }
          if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'j' || e.code === 'KeyJ')) {
            e.preventDefault();
            e.stopPropagation();
            window.parent.postMessage({ type: 'TOGGLE_AI_WORKSPACE' }, '*');
          }
          if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key.toLowerCase() === 'o' || e.code === 'KeyO')) {
            e.preventDefault();
            e.stopPropagation();
            window.parent.postMessage({ type: 'TOGGLE_OUTLINE' }, '*');
          }
          if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=' || e.keyCode === 187 || e.keyCode === 107)) {
            e.preventDefault();
            e.stopPropagation();
            window.parent.postMessage({ type: 'REQUEST_ZOOM_CHANGE', zoomChange: 10 }, '*');
          }
          if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.key === '_' || e.keyCode === 189 || e.keyCode === 109)) {
            e.preventDefault();
            e.stopPropagation();
            window.parent.postMessage({ type: 'REQUEST_ZOOM_CHANGE', zoomChange: -10 }, '*');
          }
          if ((e.ctrlKey || e.metaKey) && (e.key === '0' || e.keyCode === 48 || e.keyCode === 96)) {
            e.preventDefault();
            e.stopPropagation();
            window.parent.postMessage({ type: 'REQUEST_ZOOM_RESET' }, '*');
          }
        }
        window.addEventListener('keydown', handleKey, true);
        document.addEventListener('keydown', handleKey, true);

        // Zoom via Ctrl + Wheel / pincement de trackpad à l'intérieur du document
        window.addEventListener('wheel', function(e) {
          if (e.ctrlKey) {
            e.preventDefault();
            var zoomChange = 0;
            if (Math.abs(e.deltaY) >= 40) {
              zoomChange = e.deltaY < 0 ? 5 : -5;
            } else {
              var d = Math.round(-e.deltaY * 0.35);
              if (d === 0) d = e.deltaY < 0 ? 1 : -1;
              zoomChange = Math.max(Math.min(d, 6), -6);
            }
            window.parent.postMessage({
              type: 'REQUEST_ZOOM_CHANGE',
              zoomChange: zoomChange
            }, '*');
          }
        }, { passive: false });

        // Track user interaction to prevent any auto-restore fighting
        var userInteracted = false;
        function cancelRestore() { userInteracted = true; }
        window.addEventListener('wheel', cancelRestore, { passive: true });
        window.addEventListener('touchmove', cancelRestore, { passive: true });
        window.addEventListener('pointerdown', cancelRestore, { passive: true });
        window.addEventListener('keydown', cancelRestore, { passive: true });

        // Restore scroll position smoothly on load without fighting user
        function doScroll(explicitTop, targetRatio) {
          if (userInteracted) return;
          var docHeight = Math.max(
            document.documentElement ? document.documentElement.scrollHeight : 0,
            document.body ? document.body.scrollHeight : 0
          );
          var max = Math.max(0, docHeight - window.innerHeight);
          var top = -1;
          if (typeof explicitTop === 'number' && explicitTop >= 0) {
            top = explicitTop;
          } else if (typeof targetRatio === 'number' && targetRatio > 0 && max > 0) {
            top = targetRatio * max;
          }
          if (top >= 0) {
            window.scrollTo({ top: top, behavior: 'instant' });
            if (document.documentElement) document.documentElement.scrollTop = top;
            if (document.body) document.body.scrollTop = top;
          }
        }

        var initRatio = ${safeRatio};
        var initScrollY = ${safeScrollY};
        if (initScrollY > 0 || initRatio > 0) {
          doScroll(initScrollY, initRatio);
          setTimeout(function() { doScroll(initScrollY, initRatio); }, 30);
          setTimeout(function() { doScroll(initScrollY, initRatio); }, 80);
          setTimeout(function() { doScroll(initScrollY, initRatio); }, 200);
          setTimeout(function() { doScroll(initScrollY, initRatio); }, 500);
        }

        // Synchronisation temps réel 60fps sans délai ni saccade
        var isCodeScrolling = false;
        var codeScrollTimer = null;
        var previewRaf = null;

        var lineMap = [];
        function updateLineMap() {
          var elements = document.querySelectorAll('[data-source-line]');
          lineMap = [];
          for (var i = 0; i < elements.length; i++) {
            var l = parseInt(elements[i].getAttribute('data-source-line'), 10);
            if (!isNaN(l)) {
              var rect = elements[i].getBoundingClientRect();
              lineMap.push({ line: l, top: rect.top + window.scrollY });
            }
          }
          lineMap.sort(function(a, b) { return a.line - b.line; });
        }

        window.addEventListener('load', function() {
          updateLineMap();
          setTimeout(updateLineMap, 80);
          setTimeout(updateLineMap, 400);
        });
        window.addEventListener('resize', updateLineMap);

        // Helper pour rapporter le scroll actuel au parent
        var scrollDebounce = null;
        function reportScroll() {
          var info = getScrollInfo();
          window.parent.postMessage({
            type: 'HTML_SCROLL_UPDATE',
            scrollY: info.scrollY,
            ratio: info.ratio
          }, '*');
        }

        // Écouter les ordres explicites de synchronisation de scroll et de zoom
        window.addEventListener('message', function(event) {
          if (!event.data) return;

          if (event.data.type === 'SYNC_SCROLL_FROM_CODE') {
            isCodeScrolling = true;
            clearTimeout(codeScrollTimer);
            codeScrollTimer = setTimeout(function() {
              isCodeScrolling = false;
            }, 100);

            if (event.data.isAtTop) {
              window.scrollTo(0, 0);
              reportScroll();
              return;
            }

            var maxH = Math.max(
              document.documentElement ? document.documentElement.scrollHeight : 0,
              document.body ? document.body.scrollHeight : 0
            ) - window.innerHeight;

            if (event.data.isAtBottom) {
              window.scrollTo(0, Math.max(0, maxH));
              reportScroll();
              return;
            }

            if (lineMap.length === 0) updateLineMap();
            if (lineMap.length === 0) return;

            var targetLine = event.data.line;
            if (targetLine <= lineMap[0].line) {
              var ratio = targetLine / Math.max(1, lineMap[0].line);
              window.scrollTo(0, Math.max(0, ratio * (lineMap[0].top - 20)));
              reportScroll();
              return;
            }

            if (targetLine >= lineMap[lineMap.length - 1].line) {
              window.scrollTo(0, Math.max(0, maxH));
              reportScroll();
              return;
            }

            var low = 0;
            var high = lineMap.length - 1;
            while (low <= high) {
              var mid = (low + high) >> 1;
              if (lineMap[mid].line <= targetLine) {
                low = mid + 1;
              } else {
                high = mid - 1;
              }
            }
            var i = high;
            if (i >= 0 && i < lineMap.length - 1) {
              var segRatio = (targetLine - lineMap[i].line) / Math.max(1, (lineMap[i + 1].line - lineMap[i].line));
              var targetTop = lineMap[i].top + segRatio * (lineMap[i + 1].top - lineMap[i].top);
              window.scrollTo(0, Math.max(0, targetTop - 25));
              reportScroll();
            } else if (i >= 0) {
              window.scrollTo(0, Math.max(0, lineMap[i].top - 25));
              reportScroll();
            }
          } else if (event.data.type === 'SET_SCROLL') {
            var docHeight = Math.max(
              document.documentElement ? document.documentElement.scrollHeight : 0,
              document.body ? document.body.scrollHeight : 0
            );
            var max = Math.max(0, docHeight - window.innerHeight);
            var target = -1;
            if (event.data.preferRatio && typeof event.data.ratio === 'number' && event.data.ratio >= 0 && max > 0) {
              target = event.data.ratio * max;
            } else if (typeof event.data.scrollY === 'number' && event.data.scrollY >= 0) {
              target = event.data.scrollY;
            } else if (typeof event.data.ratio === 'number' && event.data.ratio >= 0 && max > 0) {
              target = event.data.ratio * max;
            }
            if (target >= 0) {
              window.scrollTo({ top: target, behavior: 'instant' });
              if (document.documentElement) document.documentElement.scrollTop = target;
              if (document.body) document.body.scrollTop = target;
              reportScroll();
            }
          } else if (event.data.type === 'SET_HTML_ZOOM') {
            // Zoom par une feuille de style d'aide (retirée à l'enregistrement), jamais par body.style
            var z = event.data.zoom || 100;
            var zoomStyle = document.getElementById('nf-preview-zoom');
            if (!zoomStyle) {
              zoomStyle = document.createElement('style');
              zoomStyle.id = 'nf-preview-zoom';
              zoomStyle.setAttribute('data-injected-preview-helpers', 'true');
              (document.head || document.documentElement).appendChild(zoomStyle);
            }
            zoomStyle.textContent = 'body { zoom: ' + z + '% !important; margin: 0 auto !important; }';
            if (document.body) updateLineMap();
          } else if (event.data.type === 'UPDATE_PREVIEW_SNIPPETS') {
            if (Array.isArray(event.data.snippets)) {
              snippetsData = event.data.snippets;
            }
          } else if (event.data.type === 'SCROLL_TO_HEADING') {
            var targetEl = null;
            if (event.data.id) {
              targetEl = document.getElementById(event.data.id);
            }
            if (!targetEl && typeof event.data.line === 'number') {
              targetEl = document.querySelector('[data-source-line="' + event.data.line + '"]');
            }
            if (!targetEl && event.data.text) {
              var allH = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
              for (var hi = 0; hi < allH.length; hi++) {
                if (allH[hi].textContent.trim() === event.data.text.trim()) {
                  targetEl = allH[hi];
                  break;
                }
              }
            }
            if (targetEl) {
              targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }
        });

        window.addEventListener('scroll', function() {
          clearTimeout(scrollDebounce);
          scrollDebounce = setTimeout(reportScroll, 40);

          // Scroll-spy: notifier le titre actif
          var allHeadings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
          var topHeadingId = null;
          var topHeadingLine = null;
          for (var k = 0; k < allHeadings.length; k++) {
            var hRect = allHeadings[k].getBoundingClientRect();
            if (hRect.top <= 140) {
              topHeadingId = allHeadings[k].id || null;
              var dl = parseInt(allHeadings[k].getAttribute('data-source-line'), 10);
              if (!isNaN(dl)) topHeadingLine = dl;
            } else {
              break;
            }
          }
          if (topHeadingId || topHeadingLine) {
            window.parent.postMessage({
              type: 'OUTLINE_ACTIVE_HEADING',
              id: topHeadingId,
              line: topHeadingLine
            }, '*');
          }

          if (isCodeScrolling) return;
          // Défilement sans geste récent dans l'aperçu (rechargement, restauration de position) :
          // on ne le transmet pas à Monaco, sinon l'éditeur remonte pendant qu'on écrit
          if (!isUserScrollIntent(Date.now(), lastScrollGestureAt)) return;

          if (previewRaf) cancelAnimationFrame(previewRaf);
          previewRaf = requestAnimationFrame(function() {
            if (isCodeScrolling) return;
            if (lineMap.length === 0) updateLineMap();

            var scrollY = window.scrollY || (document.documentElement ? document.documentElement.scrollTop : 0) || (document.body ? document.body.scrollTop : 0);
            var maxScroll = Math.max(
              document.documentElement ? document.documentElement.scrollHeight : 0,
              document.body ? document.body.scrollHeight : 0
            ) - window.innerHeight;

            var isAtTop = scrollY < 15;
            var isAtBottom = maxScroll > 0 && (maxScroll - scrollY) < 15;

            if (isAtTop) {
              window.parent.postMessage({ type: 'SYNC_SCROLL_FROM_PREVIEW', line: 1, isAtTop: true }, '*');
              return;
            }

            var targetY = scrollY + 25;
            if (lineMap.length === 0) return;

            if (targetY <= lineMap[0].top) {
              var r = targetY / Math.max(1, lineMap[0].top);
              var line = Math.max(1, Math.round(r * lineMap[0].line));
              window.parent.postMessage({ type: 'SYNC_SCROLL_FROM_PREVIEW', line: line }, '*');
              return;
            }

            var low = 0;
            var high = lineMap.length - 1;
            while (low <= high) {
              var mid = (low + high) >> 1;
              if (lineMap[mid].top <= targetY) {
                low = mid + 1;
              } else {
                high = mid - 1;
              }
            }
            var i = high;
            if (i >= 0 && i < lineMap.length - 1) {
              var segRatio = (targetY - lineMap[i].top) / Math.max(1, lineMap[i + 1].top - lineMap[i].top);
              var line = Math.round(lineMap[i].line + segRatio * (lineMap[i + 1].line - lineMap[i].line));
              window.parent.postMessage({ type: 'SYNC_SCROLL_FROM_PREVIEW', line: line, isAtBottom: isAtBottom }, '*');
            } else if (i >= 0) {
              window.parent.postMessage({ type: 'SYNC_SCROLL_FROM_PREVIEW', line: lineMap[i].line, isAtBottom: isAtBottom }, '*');
            }
          });
        }, { passive: true });
      })();
    </script>
    ${mathJaxScript}
  `

  // Injecter contenteditable sur le tag <body> lui-même dans le HTML pour que l'édition soit 100% native dès le parsing
  let htmlWithBodyEditable = taggedCode
  if (/<body\b/i.test(htmlWithBodyEditable)) {
    htmlWithBodyEditable = htmlWithBodyEditable.replace(/<body([^>]*)>/i, (_match, attrs) => {
      const cleanAttrs = attrs
        .replace(/\bcontenteditable=(?:"[^"]*"|'[^']*'|\w+)/gi, '')
        .replace(/\bspellcheck=(?:"[^"]*"|'[^']*'|\w+)/gi, '')
      return `<body${cleanAttrs} contenteditable="${isEditable ? 'true' : 'false'}" spellcheck="false">`
    })
  } else {
    htmlWithBodyEditable = `<body contenteditable="${isEditable ? 'true' : 'false'}" spellcheck="false">${htmlWithBodyEditable}</body>`
  }

  if (htmlWithBodyEditable.includes('</head>')) {
    return htmlWithBodyEditable.replace('</head>', () => enhancementBundle + '</head>')
  } else if (htmlWithBodyEditable.includes('<head>')) {
    return htmlWithBodyEditable.replace('<head>', () => '<head>' + enhancementBundle)
  }
  return enhancementBundle + htmlWithBodyEditable
}

export default function CodeWorkspace({
  value,
  onChange,
  currentFilePath,
  contentFilePath = currentFilePath,
  editorMode,
  isHtmlFullscreen: externalFullscreen,
  onToggleHtmlFullscreen: externalToggleFullscreen,
  zoomLevel,
  isZenMode = false,
  isTypewriterMode = false,
  isCopilotEnabled = true,
  copilotModel = 'qwen2.5:7b-instruct',
  onHighlightCode,
  snippets: externalSnippets,
  targetHeading,
  headings,
  onActiveHeadingChange
}: CodeWorkspaceProps) {
  const isHtml = currentFilePath.endsWith('.html') || currentFilePath.endsWith('.htm')
  const [debouncedSrc, setDebouncedSrc] = useState(value)
  const [splitRatio, setSplitRatio] = useState<number>(50) // percentage for left pane
  const [isDraggingSplit, setIsDraggingSplit] = useState(false)
  const [previewKey] = useState(0)
  const [internalFullscreen, setInternalFullscreen] = useState(false)

  // Références de contrôle du modèle Monaco pour éviter toute perte de frappe
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const localEmittedValuesRef = useRef<Set<string>>(new Set())
  const lastFilePathRef = useRef<string>(currentFilePath)
  // Chemin courant pour les snippets de Monaco (${NOTES_THEME}), lu au moment de l'insertion
  const currentFilePathRef = useRef<string>(currentFilePath)
  currentFilePathRef.current = currentFilePath
  const contentFilePathRef = useRef<string | null>(contentFilePath)
  contentFilePathRef.current = contentFilePath
  // Note dont vient le contenu retenu pour l'aperçu, et note pour laquelle l'aperçu affiché a été construit
  const debouncedFileRef = useRef<string | null>(contentFilePath)
  const srcDocFileRef = useRef<string | null>(null)
  const [debouncedVersion, setDebouncedVersion] = useState(0)

  // État et références pour l'Aperçu Interactif Obsidian (écriture directe de texte/code et snippets dans le preview)
  const isLivePreviewEditable = true
  const lastEmittedPreviewHtmlRef = useRef<string>('')
  const lastMemoizedSrcDocRef = useRef<string>('')
  const lastPreviewMutationTimeRef = useRef<number>(0)
  const isSyncingToMonacoRef = useRef<boolean>(false)

  // Références pour le Copilote IA inline
  const isCopilotEnabledRef = useRef(isCopilotEnabled)
  isCopilotEnabledRef.current = isCopilotEnabled
  const copilotModelRef = useRef(copilotModel)
  copilotModelRef.current = copilotModel

  useEffect(() => {
    const cleanup = registerInlineCopilot(isCopilotEnabledRef, copilotModelRef)
    return () => cleanup()
  }, [])

  const isFullscreen = externalFullscreen !== undefined ? externalFullscreen : internalFullscreen
  const toggleFullscreen = () => {
    if (externalToggleFullscreen) {
      externalToggleFullscreen()
    } else {
      setInternalFullscreen((prev) => !prev)
    }
  }
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Suivi en temps réel de la position de scroll de l'aperçu pour figer l'affichage lors des modifications de code
  const activePreviewScrollYRef = useRef<number>(0)
  const activePreviewRatioRef = useRef<number>(0)

  useEffect(() => {
    activePreviewScrollYRef.current = 0
    activePreviewRatioRef.current = 0
    try {
      const saved = localStorage.getItem('html_scroll_' + currentFilePath)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (typeof parsed.scrollY === 'number') activePreviewScrollYRef.current = parsed.scrollY
        if (typeof parsed.ratio === 'number') activePreviewRatioRef.current = parsed.ratio
      }
    } catch {}
  }, [currentFilePath])

  const [snippets, setSnippets] = useState<Snippet[]>(
    externalSnippets && externalSnippets.length > 0
      ? externalSnippets
      : (defaultSnippetsJson.snippets as Snippet[]) || []
  )

  useEffect(() => {
    if (externalSnippets && externalSnippets.length > 0) {
      setSnippets(externalSnippets)
    }
  }, [externalSnippets])

  useEffect(() => {
    const fetchSnippets = async () => {
      try {
        if (window.api?.getSnippets) {
          const res = await window.api.getSnippets()
          if (res && Array.isArray(res.snippets) && res.snippets.length > 0) {
            setSnippets(res.snippets)
          }
        }
      } catch (err) {
        console.error('Failed to load snippets in CodeWorkspace:', err)
      }
    }
    fetchSnippets()
    let cleanup: (() => void) | undefined
    if (window.api?.onSnippetsUpdated) {
      cleanup = window.api.onSnippetsUpdated(fetchSnippets)
    }
    return () => {
      cleanup?.()
    }
  }, [])

  useEffect(() => {
    if (snippets.length === 0) return
    const cleanup = registerEnhancedCompletions(snippets, () => currentFilePathRef.current)
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        {
          type: 'UPDATE_PREVIEW_SNIPPETS',
          snippets
        },
        '*'
      )
    }
    return () => cleanup()
  }, [snippets])

  // Synchronisation du mode d'édition et verrouillage anti-rebond de défilement split
  const editorModeRef = useRef(editorMode)
  useEffect(() => {
    editorModeRef.current = editorMode
  }, [editorMode])

  const isScrollingFromPreviewRef = useRef(false)
  const previewScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isScrollingFromCodeRef = useRef(false)
  const codeScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Synchronisation du contenu Monaco lors des changements de fichier ou mises à jour externes
  useEffect(() => {
    // Si l'utilisateur change de fichier, charger immédiatement le nouveau contenu
    if (lastFilePathRef.current !== currentFilePath) {
      lastFilePathRef.current = currentFilePath
      localEmittedValuesRef.current.clear()
      // Le gel de l'aperçu pendant une saisie ne vaut que pour la note où l'on écrivait
      lastPreviewMutationTimeRef.current = 0
      lastEmittedPreviewHtmlRef.current = ''
      if (editorRef.current) {
        if (editorRef.current.getValue() !== value) {
          editorRef.current.setValue(value)
        }
      }
      return
    }

    // Si cette valeur a été émise par la frappe dans Monaco lui-même, NE PAS écraser !
    if (localEmittedValuesRef.current.has(value)) {
      localEmittedValuesRef.current.delete(value)
      return
    }

    if (editorRef.current) {
      const cur = editorRef.current.getValue()
      // Si Monaco contient déjà exactement cette valeur, ne rien faire
      if (cur === value) {
        return
      }

      // Si l'utilisateur est activement en train de taper dans Monaco, ne jamais écraser sa frappe
      if (editorRef.current.hasTextFocus()) {
        return
      }

      // Vraie mise à jour externe (ex: revert, import externe)
      const pos = editorRef.current.getPosition()
      editorRef.current.setValue(value)
      if (pos) editorRef.current.setPosition(pos)
    }
  }, [value, currentFilePath])

  // Quitter le plein écran avec Échap
  useEffect(() => {
    if (!isFullscreen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toggleFullscreen()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isFullscreen])

  // Debounce iframe updates for smooth typing (uniquement si le preview est visible).
  // Le contenu retenu est rattaché à la note dont il vient (debouncedFileRef).
  useEffect(() => {
    if (editorMode === 'edit') return
    const sourceFile = contentFilePath
    const handler = setTimeout(() => {
      debouncedFileRef.current = sourceFile
      setDebouncedSrc(value)
      setDebouncedVersion((v) => v + 1)
    }, 700)
    return () => clearTimeout(handler)
  }, [value, editorMode, contentFilePath])

  // Contenu d'une note qu'on vient d'ouvrir : aperçu tout de suite, sans attendre le délai de frappe
  useEffect(() => {
    if (!contentFilePath || contentFilePath !== currentFilePath) return
    debouncedFileRef.current = contentFilePath
    setDebouncedSrc(value)
    setDebouncedVersion((v) => v + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seulement à l'arrivée d'un nouveau contenu
  }, [contentFilePath])

  // Handle split resize drag
  useEffect(() => {
    if (!isDraggingSplit) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const newRatio = ((e.clientX - rect.left) / rect.width) * 100
      if (newRatio > 20 && newRatio < 80) {
        setSplitRatio(newRatio)
      }
    }

    const handleMouseUp = () => {
      setIsDraggingSplit(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDraggingSplit])

  // Escape key handler to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        if (externalToggleFullscreen && externalFullscreen) {
          externalToggleFullscreen()
        } else {
          setInternalFullscreen(false)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen, externalToggleFullscreen, externalFullscreen])

  // Listen for messages from inside the iframe (like Esc press or trigger fullscreen)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OPEN_EXTERNAL_URL') {
        // Seule l'iframe d'aperçu de ce composant peut demander l'ouverture d'un lien web
        if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return
        if (typeof event.data.href !== 'string') return
        window.api.openExternalUrl(event.data.href).catch((err: unknown) => {
          notifyApiError('Ouverture du lien', err)
        })
        return
      }
      if (event.data?.type === 'HTML_EXIT_FULLSCREEN') {
        if (typeof event.data?.scrollY === 'number') {
          activePreviewScrollYRef.current = event.data.scrollY
        }
        if (typeof event.data?.ratio === 'number') {
          activePreviewRatioRef.current = event.data.ratio
        }
        if (event.data?.ratio !== undefined && currentFilePath) {
          try {
            localStorage.setItem(
              'html_scroll_' + currentFilePath,
              JSON.stringify({
                scrollY: event.data.scrollY,
                ratio: event.data.ratio
              })
            )
          } catch {}
        }
        if (externalToggleFullscreen && externalFullscreen) {
          externalToggleFullscreen()
        } else {
          setInternalFullscreen(false)
        }
      } else if (event.data?.type === 'HTML_ENTER_FULLSCREEN') {
        if (typeof event.data?.scrollY === 'number') {
          activePreviewScrollYRef.current = event.data.scrollY
        }
        if (typeof event.data?.ratio === 'number') {
          activePreviewRatioRef.current = event.data.ratio
        }
        if (event.data?.ratio !== undefined && currentFilePath) {
          try {
            localStorage.setItem(
              'html_scroll_' + currentFilePath,
              JSON.stringify({
                scrollY: event.data.scrollY,
                ratio: event.data.ratio
              })
            )
          } catch {}
        }
        if (externalToggleFullscreen && !externalFullscreen) {
          externalToggleFullscreen()
        } else {
          setInternalFullscreen(true)
        }
      } else if (event.data?.type === 'HTML_SCROLL_UPDATE' && currentFilePath) {
        if (typeof event.data?.scrollY === 'number') {
          activePreviewScrollYRef.current = event.data.scrollY
        }
        if (typeof event.data?.ratio === 'number') {
          activePreviewRatioRef.current = event.data.ratio
        }
        try {
          localStorage.setItem(
            'html_scroll_' + currentFilePath,
            JSON.stringify({
              scrollY: event.data.scrollY,
              ratio: event.data.ratio
            })
          )
        } catch {}
      } else if (event.data?.type === 'SYNC_SCROLL_FROM_PREVIEW') {
        if (editorModeRef.current !== 'live') return
        if (isScrollingFromCodeRef.current) return
        if (!editorRef.current) return

        isScrollingFromPreviewRef.current = true
        if (previewScrollTimeoutRef.current) clearTimeout(previewScrollTimeoutRef.current)
        previewScrollTimeoutRef.current = setTimeout(() => {
          isScrollingFromPreviewRef.current = false
        }, 100)

        const targetLine = event.data.line
        if (event.data.isAtTop) {
          editorRef.current.setScrollTop(0)
        } else if (event.data.isAtBottom) {
          editorRef.current.setScrollTop(editorRef.current.getScrollHeight())
        } else if (typeof targetLine === 'number' && targetLine > 0) {
          const top = editorRef.current.getTopForLineNumber(targetLine)
          editorRef.current.setScrollTop(Math.max(0, top - 15))
        }
      } else if (event.data?.type === 'PREVIEW_DOC_MUTATED') {
        // Seulement notre iframe, et seulement si elle affiche la note ouverte (sinon le HTML d'une
        // autre note serait enregistré dans celle-ci)
        if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return
        if (
          !previewMatchesNote({
            previewFile: srcDocFileRef.current,
            currentFile: currentFilePathRef.current,
            contentFile: contentFilePathRef.current
          })
        ) {
          return
        }
        const rawNewHtml = event.data.html
        if (!rawNewHtml) return
        const newHtml = rawNewHtml.replace(/\r\n/g, '\n')

        if (newHtml !== lastEmittedPreviewHtmlRef.current) {
          lastEmittedPreviewHtmlRef.current = newHtml
          lastPreviewMutationTimeRef.current = Date.now()
          localEmittedValuesRef.current.add(newHtml)
          setDebouncedSrc(newHtml)
          onChange(newHtml)

          // Mettre à jour le modèle Monaco en arrière-plan sans perturber la sélection ni créer de boucle
          if (editorRef.current && editorRef.current.getValue() !== newHtml) {
            const model = editorRef.current.getModel()
            if (model) {
              isSyncingToMonacoRef.current = true
              try {
                editorRef.current.executeEdits('preview-live-sync', [
                  {
                    range: model.getFullModelRange(),
                    text: newHtml,
                    forceMoveMarkers: true
                  }
                ])
              } finally {
                setTimeout(() => {
                  isSyncingToMonacoRef.current = false
                }, 60)
              }
            }
          }
        }
        // Plus de normalisation automatique (inactivité, blur) : seul Shift+Alt+F reformate la note
      } else if (event.data?.type === 'OUTLINE_ACTIVE_HEADING') {
        if (onActiveHeadingChange) {
          const activeKey = event.data.id || (event.data.line ? String(event.data.line) : null)
          if (activeKey) onActiveHeadingChange(activeKey)
        }
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [externalToggleFullscreen, externalFullscreen, currentFilePath, onActiveHeadingChange])

  // Navigation ciblée depuis le plan (Outline)
  useEffect(() => {
    if (!targetHeading) return

    if (editorRef.current && typeof targetHeading.line === 'number' && targetHeading.line > 0) {
      editorRef.current.revealLineInCenter(targetHeading.line)
      editorRef.current.setPosition({ lineNumber: targetHeading.line, column: 1 })
      editorRef.current.focus()
    }

    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        {
          type: 'SCROLL_TO_HEADING',
          id: targetHeading.id,
          line: targetHeading.line,
          text: targetHeading.text
        },
        '*'
      )
    }
  }, [targetHeading])

  // Scroll-spy dans l'éditeur Monaco
  useEffect(() => {
    if (!editorRef.current || !headings || headings.length === 0 || !onActiveHeadingChange) return

    const disposable = editorRef.current.onDidScrollChange(() => {
      if (!editorRef.current || isScrollingFromPreviewRef.current) return
      const visibleRanges = editorRef.current.getVisibleRanges()
      if (!visibleRanges || visibleRanges.length === 0) return
      const topVisibleLine = visibleRanges[0].startLineNumber

      let active: OutlineHeading | null = null
      for (const h of headings) {
        if (h.line <= topVisibleLine + 1) {
          active = h
        } else {
          break
        }
      }
      if (active) {
        onActiveHeadingChange(active.id || String(active.line))
      }
    })

    return () => disposable.dispose()
  }, [headings, onActiveHeadingChange])

  // Synchronisation instantanée du scroll quand on quitte le plein écran (0ms de latence)
  const prevFullscreenRef = useRef(isFullscreen)
  useEffect(() => {
    if (prevFullscreenRef.current && !isFullscreen && isHtml) {
      const syncScroll = () => {
        try {
          const saved = localStorage.getItem('html_scroll_' + currentFilePath)
          if (saved && iframeRef.current?.contentWindow) {
            const { ratio, scrollY } = JSON.parse(saved)
            iframeRef.current.contentWindow.postMessage(
              {
                type: 'SET_SCROLL',
                ratio,
                scrollY,
                preferRatio: true
              },
              '*'
            )
          }
        } catch {}
      }
      syncScroll()
      requestAnimationFrame(syncScroll)
      setTimeout(syncScroll, 40)
    }
    prevFullscreenRef.current = isFullscreen
  }, [isFullscreen, currentFilePath, isHtml])

  const handleIframeLoad = () => {
    try {
      if (iframeRef.current?.contentDocument) {
        const doc = iframeRef.current.contentDocument
        if (doc.body) {
          doc.body.contentEditable = isLivePreviewEditable ? 'true' : 'false'
          doc.body.spellcheck = false
        }
      }

      let scrollY = activePreviewScrollYRef.current
      let ratio = activePreviewRatioRef.current
      if ((!scrollY || scrollY === 0) && currentFilePath) {
        const saved = localStorage.getItem('html_scroll_' + currentFilePath)
        if (saved) {
          const parsed = JSON.parse(saved)
          if (typeof parsed.scrollY === 'number') scrollY = parsed.scrollY
          if (typeof parsed.ratio === 'number') ratio = parsed.ratio
        }
      }

      const applyScroll = () => {
        if (iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage(
            {
              type: 'SET_SCROLL',
              scrollY,
              ratio
            },
            '*'
          )
        }
      }

      applyScroll()
      requestAnimationFrame(applyScroll)
      setTimeout(applyScroll, 40)
      setTimeout(applyScroll, 160)

      if (iframeRef.current?.contentWindow && zoomLevel) {
        iframeRef.current.contentWindow.postMessage(
          {
            type: 'SET_HTML_ZOOM',
            zoom: zoomLevel
          },
          '*'
        )
      }
    } catch {}
  }

  // Appliquer le zoom à l'iframe dès que zoomLevel change
  useEffect(() => {
    if (iframeRef.current?.contentWindow && zoomLevel) {
      iframeRef.current.contentWindow.postMessage(
        {
          type: 'SET_HTML_ZOOM',
          zoom: zoomLevel
        },
        '*'
      )
    }
  }, [zoomLevel])

  const memoizedSrcDoc = useMemo(() => {
    if (!isHtml) return debouncedSrc

    // Contenu d'une autre note (chargement en cours, délai de frappe) : écran neutre, jamais éditable
    if (debouncedFileRef.current !== currentFilePath || contentFilePath !== currentFilePath) {
      srcDocFileRef.current = null
      return PREVIEW_LOADING_SRCDOC
    }

    // Si la modification provient directement de l'aperçu interactif (dernières 3 secondes ou HTML équivalent),
    // figer strictement le srcDoc actuel pour ne jamais recharger l'iframe pendant que l'utilisateur tape
    const isRecentlyEditedInPreview = Date.now() - lastPreviewMutationTimeRef.current < 3000
    if (
      lastMemoizedSrcDocRef.current &&
      srcDocFileRef.current === currentFilePath &&
      (isRecentlyEditedInPreview ||
        (lastEmittedPreviewHtmlRef.current && debouncedSrc === lastEmittedPreviewHtmlRef.current))
    ) {
      return lastMemoizedSrcDocRef.current
    }

    let savedRatio = activePreviewRatioRef.current || 0
    let savedScrollY = activePreviewScrollYRef.current || 0
    try {
      const saved = localStorage.getItem('html_scroll_' + currentFilePath)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (!savedScrollY && typeof parsed.scrollY === 'number') savedScrollY = parsed.scrollY
        if (!savedRatio && typeof parsed.ratio === 'number') savedRatio = parsed.ratio
      }
    } catch {}
    const prepared = prepareHtmlPreview(
      debouncedSrc,
      savedRatio,
      savedScrollY,
      snippets,
      isLivePreviewEditable,
      currentFilePath
    )
    lastMemoizedSrcDocRef.current = prepared
    srcDocFileRef.current = currentFilePath
    return prepared
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debouncedVersion porte debouncedFileRef
  }, [
    debouncedSrc,
    debouncedVersion,
    currentFilePath,
    contentFilePath,
    isHtml,
    snippets,
    isLivePreviewEditable
  ])

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flex: 1,
        height: '100%',
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#0f0f11',
        justifyContent: isZenMode && editorMode === 'edit' ? 'center' : undefined
      }}
    >
      {/* LEFT PANE: Monaco Code Editor */}
      {(editorMode === 'edit' || editorMode === 'live') && (
        <div
          style={{
            width: editorMode === 'live' ? `${splitRatio}%` : '100%',
            maxWidth: isZenMode && editorMode === 'edit' ? '920px' : '100%',
            margin: isZenMode && editorMode === 'edit' ? '0 auto' : undefined,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            backgroundColor: '#121214',
            borderRight: editorMode === 'live' ? '1px solid rgba(255,255,255,0.08)' : 'none',
            boxShadow: isZenMode && editorMode === 'edit' ? '0 0 50px rgba(0,0,0,0.6)' : 'none'
          }}
        >
          {/* Monaco Editor Container - Pleine hauteur, épuré sans sous-barre */}
          <div style={{ flex: 1, height: '100%', position: 'relative', overflow: 'hidden' }}>
            <Editor
              height="100%"
              language={isHtml ? 'html' : 'markdown'}
              defaultValue={value}
              theme="vs-dark"
              onMount={(editor) => {
                editorRef.current = editor
                if (editor.getValue() !== value) {
                  editor.setValue(value)
                }
                try {
                  const savedScroll = localStorage.getItem('monaco_scroll_' + currentFilePath)
                  if (savedScroll) {
                    const top = parseFloat(savedScroll)
                    if (!isNaN(top) && top > 0) {
                      setTimeout(() => editor.setScrollTop(top), 60)
                    }
                  }
                } catch {}
                editor.onDidScrollChange((e) => {
                  try {
                    localStorage.setItem('monaco_scroll_' + currentFilePath, String(e.scrollTop))
                  } catch {}

                  if (editorModeRef.current !== 'live') return
                  if (isScrollingFromPreviewRef.current) return

                  isScrollingFromCodeRef.current = true
                  if (codeScrollTimeoutRef.current) clearTimeout(codeScrollTimeoutRef.current)
                  codeScrollTimeoutRef.current = setTimeout(() => {
                    isScrollingFromCodeRef.current = false
                  }, 100)

                  const ranges = editor.getVisibleRanges()
                  if (!ranges || ranges.length === 0) return
                  const topVisibleLine = ranges[0].startLineNumber

                  const maxScroll = editor.getScrollHeight() - editor.getLayoutInfo().height
                  const isAtTop = e.scrollTop < 15
                  const isAtBottom = maxScroll > 0 && Math.abs(e.scrollTop - maxScroll) < 15

                  if (iframeRef.current?.contentWindow) {
                    iframeRef.current.contentWindow.postMessage(
                      {
                        type: 'SYNC_SCROLL_FROM_CODE',
                        line: topVisibleLine,
                        isAtTop,
                        isAtBottom
                      },
                      '*'
                    )
                  }
                })

                // Clic souris dans le code : synchroniser immédiatement l'élément visuel correspondant
                editor.onDidChangeCursorPosition((e) => {
                  if (editorModeRef.current !== 'live') return
                  if (e.source === 'mouse') {
                    if (iframeRef.current?.contentWindow) {
                      iframeRef.current.contentWindow.postMessage(
                        {
                          type: 'SYNC_SCROLL_FROM_CODE',
                          line: e.position.lineNumber,
                          isAtTop: false,
                          isAtBottom: false
                        },
                        '*'
                      )
                    }
                  }
                })

                // Intercepter Ctrl+J, Ctrl+F et Échap directement dans Monaco pour éviter tout conflit d'édition
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyJ, () => {
                  window.parent.postMessage({ type: 'TOGGLE_AI_WORKSPACE' }, '*')
                })
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
                  window.parent.postMessage({ type: 'HTML_TOGGLE_FULLSCREEN' }, '*')
                })
                editor.addCommand(monaco.KeyCode.Escape, () => {
                  window.parent.postMessage({ type: 'HTML_EXIT_FULLSCREEN' }, '*')
                })

                // Raccourci Shift+Alt+F pour formater et indenter proprement tout le code HTML
                editor.addAction({
                  id: 'format-html-document',
                  label: 'Formater le document HTML',
                  keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
                  run: (ed) => {
                    const currentVal = ed.getValue()
                    const formatted = normalizeHtml(currentVal)
                    if (formatted && formatted !== currentVal) {
                      const pos = ed.getPosition()
                      ed.executeEdits('format-html-action', [
                        {
                          range: ed.getModel()!.getFullModelRange(),
                          text: formatted,
                          forceMoveMarkers: true
                        }
                      ])
                      if (pos) ed.setPosition(pos)
                      onChange(formatted)
                    }
                  }
                })

                // Raccourci Ctrl+Shift+H pour colorier le code automatiquement
                editor.addCommand(
                  monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyH,
                  () => {
                    if (onHighlightCode) {
                      onHighlightCode()
                    } else {
                      const { newHtml, count } = highlightAllCodeBlocksInHtml(editor.getValue())
                      if (count > 0) {
                        editor.setValue(newHtml)
                        onChange(newHtml)
                      }
                    }
                  }
                )
              }}
              onChange={(newVal) => {
                if (isSyncingToMonacoRef.current) return
                const text = (newVal || '').replace(/\r\n/g, '\n')
                localEmittedValuesRef.current.add(text)
                if (localEmittedValuesRef.current.size > 150) {
                  const arr = Array.from(localEmittedValuesRef.current)
                  localEmittedValuesRef.current = new Set(arr.slice(-60))
                }
                onChange(text)
              }}
              options={{
                fontSize: 13.5,
                fontFamily: "Consolas, 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
                lineHeight: 22,
                tabSize: 2,
                wordWrap: 'on',
                minimap: { enabled: false },
                scrollBeyondLastLine: isTypewriterMode ? true : false,
                cursorSurroundingLines: isTypewriterMode ? 14 : 2,
                automaticLayout: true,
                lineNumbers: 'on',
                formatOnPaste: false,
                formatOnType: false,
                bracketPairColorization: { enabled: true },
                autoClosingBrackets: 'always',
                autoClosingQuotes: 'never', // Désactive le doublage automatique des apostrophes (') en saisie de texte
                autoClosingComments: 'always',
                quickSuggestions: { other: true, comments: false, strings: true },
                suggestOnTriggerCharacters: true,
                acceptSuggestionOnEnter: 'on',
                tabCompletion: 'on',
                snippetSuggestions: 'top',
                suggest: {
                  showSnippets: true,
                  showWords: true,
                  showClasses: true,
                  showFields: true,
                  showProperties: true,
                  filterGraceful: true,
                  preview: true,
                  showIcons: true
                },
                renderLineHighlight: 'all',
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
                smoothScrolling: true,
                mouseWheelZoom: true,
                padding: { top: 12, bottom: 12 },
                scrollbar: {
                  verticalScrollbarSize: 8,
                  horizontalScrollbarSize: 8
                }
              }}
            />
          </div>
        </div>
      )}

      {/* DRAGGABLE SPLIT DIVIDER */}
      {editorMode === 'live' && (
        <div
          onMouseDown={() => setIsDraggingSplit(true)}
          style={{
            width: '5px',
            cursor: 'col-resize',
            backgroundColor: isDraggingSplit ? '#38bdf8' : 'transparent',
            zIndex: 100,
            transition: 'background-color 0.15s ease',
            position: 'relative',
            userSelect: 'none'
          }}
          title="Glisser pour redimensionner le partage"
        />
      )}

      {/* RIGHT PANE: Sandboxed Live Interactive Preview (for HTML) */}
      {(editorMode === 'preview' || editorMode === 'live') && (
        <div
          style={{
            flex: 1,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#09090b',
            overflow: 'hidden',
            position: 'relative'
          }}
        >
          {/* Iframe Viewport Area - Plein écran sans sous-barre encombrante */}
          <div
            style={{
              flex: 1,
              width: '100%',
              height: '100%',
              display: 'flex',
              backgroundColor: '#09090b',
              overflow: 'hidden',
              position: 'relative'
            }}
          >
            <iframe
              key={previewKey}
              ref={iframeRef}
              title="Live Sandbox Preview"
              srcDoc={memoizedSrcDoc}
              onLoad={handleIframeLoad}
              sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                backgroundColor: 'transparent',
                pointerEvents: isDraggingSplit ? 'none' : 'auto'
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
