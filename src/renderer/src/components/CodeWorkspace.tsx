import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import themeCss from '@renderer/assets/theme.css?raw'
import defaultSnippetsJson from '@renderer/assets/snippets.default.json'
import { Snippet } from '../types/snippets'
import { registerEnhancedCompletions, registerInlineCopilot } from '../utils/monacoCompletions'
import { highlightAllCodeBlocksInHtml } from '../utils/codeHighlighter'
import { normalizeHtml } from '../utils/normalizeHtml'
import { OutlineHeading } from '../utils/outlineExtractor'

loader.config({ monaco })

interface CodeWorkspaceProps {
  value: string
  onChange: (val: string) => void
  currentFilePath: string
  editorMode: 'preview' | 'live' | 'edit' // edit = Code only, live = Split, preview = Live preview only
  onChangeEditorMode?: (mode: 'preview' | 'live' | 'edit') => void
  onOpenInBrowser?: () => void
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

// Helper exportable pour préparer le document HTML avec MathJax conditionnel, écouteur Esc/Ctrl+J, édition directe et moteur de snippets Obsidian
export const prepareHtmlPreview = (
  rawCode: string,
  initialScrollRatio?: number,
  initialScrollY?: number,
  snippets?: Snippet[],
  isEditable: boolean = true
) => {
  const effectiveCode = rawCode.trim() === '' ? '<div class="container"><p><br></p></div>' : rawCode
  const taggedCode = injectSourceLines(effectiveCode)
  const hasMath =
    taggedCode.includes('$') || taggedCode.includes('\\(') || taggedCode.includes('\\[')
  const mathJaxScript = hasMath
    ? `
      <script>
        window.MathJax = window.MathJax || {
          tex: {
            inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
            displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']]
          },
          svg: { fontCache: 'global' }
        };
      </script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-mml-chtml.js"></script>
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

      /* Menu flottant de Snippets Obsidian */
      #preview-snippet-menu {
        position: fixed !important;
        z-index: 9999999 !important;
        width: 320px;
        max-height: 290px;
        background: #18181b;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 8px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.7);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #e4e4e7;
        user-select: none;
        animation: snippetMenuFadeIn 0.1s ease-out;
      }
      @keyframes snippetMenuFadeIn {
        from { opacity: 0; transform: translateY(-4px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .psm-header {
        padding: 7px 10px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #38bdf8;
        background: rgba(56, 189, 248, 0.08);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .psm-list {
        flex: 1;
        overflow-y: auto;
        padding: 4px;
        max-height: 240px;
      }
      .psm-list::-webkit-scrollbar { width: 4px; }
      .psm-list::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 4px; }
      .psm-item {
        display: flex;
        flex-direction: column;
        padding: 6px 8px;
        border-radius: 6px;
        cursor: pointer;
        transition: background 0.1s ease;
        margin-bottom: 2px;
      }
      .psm-item:hover, .psm-item.active {
        background: rgba(56, 189, 248, 0.15);
      }
      .psm-item.active {
        border-left: 2px solid #38bdf8;
      }
      .psm-row1 {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .psm-name {
        font-size: 12.5px;
        font-weight: 600;
        color: #f4f4f5;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .psm-prefix {
        font-size: 11px;
        font-family: monospace;
        color: #38bdf8;
        background: rgba(56, 189, 248, 0.12);
        padding: 1px 5px;
        border-radius: 3px;
      }
      .psm-cat {
        font-size: 10px;
        color: #a1a1aa;
        background: rgba(255, 255, 255, 0.06);
        padding: 1px 4px;
        border-radius: 3px;
      }
      .psm-desc {
        font-size: 11px;
        color: #94a3b8;
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
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
    </style>
    <script data-injected-preview-helpers="true">
      (function() {
        var isLiveEditEnabled = ${isEditable ? 'true' : 'false'};
        var snippetsData = ${safeSnippetsJson};
        var originalHadHtml = ${hasHtmlTag ? 'true' : 'false'};
        var originalHadDoctype = ${hasDoctype ? 'true' : 'false'};

        // Fonction pour extraire le code propre sans aucun helper injecté
        function getCleanHtml() {
          var clone = document.documentElement.cloneNode(true);
          var helpers = clone.querySelectorAll('#preview-snippet-menu, [data-injected-theme], [data-injected-preview-helpers], script[src*="mathjax"], style#mathjax-styles');
          for (var i = 0; i < helpers.length; i++) {
            helpers[i].remove();
          }
          var tagged = clone.querySelectorAll('[data-source-line]');
          for (var j = 0; j < tagged.length; j++) {
            tagged[j].removeAttribute('data-source-line');
          }
          var ce = clone.querySelectorAll('[contenteditable]');
          for (var k = 0; k < ce.length; k++) {
            ce[k].removeAttribute('contenteditable');
          }
          var body = clone.querySelector('body');
          if (body) {
            body.removeAttribute('contenteditable');
            body.removeAttribute('spellcheck');
            if (body.style.zoom) body.style.zoom = '';
          }
          // Nettoyer les balises <p></p> fantômes créées par contenteditable
          var emptyPs = clone.querySelectorAll('p');
          for (var pIdx = 0; pIdx < emptyPs.length; pIdx++) {
            var ep = emptyPs[pIdx];
            if (!ep.children.length && !ep.textContent.trim()) {
              ep.remove();
            }
          }
          if (originalHadHtml) {
            return (originalHadDoctype ? '<!DOCTYPE html>\\n' : '') + clone.outerHTML;
          } else {
            return body ? body.innerHTML.trim() : clone.innerHTML.trim();
          }
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

        window.addEventListener('blur', function() {
          var html = getCleanHtml();
          window.parent.postMessage({
            type: 'PREVIEW_DOC_BLUR',
            html: html
          }, '*');
        });

        // Activer contenteditable sur le body pour l'édition directe Obsidian Live
        function makeEditable() {
          try {
            if (document.body) {
              document.body.contentEditable = isLiveEditEnabled ? 'true' : 'false';
              document.body.spellcheck = false;
              sanitizeTypedTagsOnLoad();
            }
          } catch(e) {}
        }

        // Nettoyage automatique à l'ouverture des balises qui auraient été saisies en texte brut (ex: <p>&lt;h1&gt;&lt;/h1&gt;</p>)
        function sanitizeTypedTagsOnLoad() {
          try {
            var ps = document.querySelectorAll('p');
            for (var i = 0; i < ps.length; i++) {
              var t = ps[i].textContent.trim();
              if (/^<([a-zA-Z1-6]+)(?:\\s+[^>]*)?>[\\s\\S]*?<\\/\\1>$/i.test(t)) {
                var tmpl = document.createElement('template');
                tmpl.innerHTML = t;
                if (tmpl.content.childNodes.length > 0) {
                  ps[i].replaceWith(tmpl.content);
                }
              }
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
            document.body.appendChild(snippetMenuEl);
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
        }

        function escapeHtml(str) {
          if (!str) return '';
          return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        function renderSnippetMenu(query, rect) {
          var menu = ensureSnippetMenu();
          var q = (query || '').toLowerCase().trim();

          currentFilteredSnippets = snippetsData.filter(function(s) {
            if (s.scope && s.scope !== 'all' && s.scope !== 'html') return false;
            if (!q) return true;
            return s.prefix.toLowerCase().includes(q) ||
                   s.name.toLowerCase().includes(q) ||
                   s.description.toLowerCase().includes(q) ||
                   s.category.toLowerCase().includes(q);
          });

          if (currentFilteredSnippets.length === 0) {
            closeSnippetMenu();
            return;
          }

          if (currentSelectedIndex >= currentFilteredSnippets.length) {
            currentSelectedIndex = 0;
          }

          var html = '<div class="psm-header">' +
                     '<span>⚡ Snippets (' + currentFilteredSnippets.length + ')</span>' +
                     '<span style="font-size:10px;opacity:0.7;">Entrée ⏎ pour insérer</span>' +
                     '</div><div class="psm-list">';

          currentFilteredSnippets.forEach(function(snip, idx) {
            var isActive = idx === currentSelectedIndex;
            html += '<div class="psm-item ' + (isActive ? 'active' : '') + '" data-index="' + idx + '">' +
                    '  <div class="psm-row1">' +
                    '    <span class="psm-prefix">/' + escapeHtml(snip.prefix) + '</span>' +
                    '    <span class="psm-name">' + escapeHtml(snip.name) + '</span>' +
                    '    <span class="psm-cat">' + escapeHtml(snip.category) + '</span>' +
                    '  </div>' +
                    (snip.description ? '  <div class="psm-desc">' + escapeHtml(snip.description) + '</div>' : '') +
                    '</div>';
          });

          html += '</div>';
          menu.innerHTML = html;

          var menuHeight = 260;
          var menuWidth = 320;
          var spaceBelow = window.innerHeight - rect.bottom;
          var top = (spaceBelow >= 220 || spaceBelow >= rect.top)
            ? (rect.bottom + 6)
            : Math.max(10, rect.top - menuHeight - 6);
          var left = Math.max(10, Math.min(rect.left, window.innerWidth - menuWidth - 20));

          menu.style.position = 'fixed';
          menu.style.top = top + 'px';
          menu.style.left = left + 'px';
          menu.style.display = 'flex';

          var items = menu.querySelectorAll('.psm-item');
          items.forEach(function(item) {
            item.addEventListener('mousedown', function(e) {
              e.preventDefault();
              e.stopPropagation();
              var idx = parseInt(item.getAttribute('data-index'), 10);
              if (!isNaN(idx) && currentFilteredSnippets[idx]) {
                insertSnippet(currentFilteredSnippets[idx]);
              }
            });
          });

          var activeEl = menu.querySelector('.psm-item.active');
          if (activeEl) {
            activeEl.scrollIntoView({ block: 'nearest' });
          }
        }

        function expandSnippetText(snip, selectedText) {
          var body = snip.body;
          var text = Array.isArray(body) ? body.join('\\n') : String(body || '');
          var now = new Date();
          var D = String.fromCharCode(36);
          text = text.replace(new RegExp('\\\\' + D + '\\\\{CURRENT_YEAR\\\\}', 'g'), String(now.getFullYear()));
          text = text.replace(new RegExp('\\\\' + D + '\\\\{CURRENT_MONTH\\\\}', 'g'), String(now.getMonth() + 1).padStart(2, '0'));
          text = text.replace(new RegExp('\\\\' + D + '\\\\{CURRENT_DATE\\\\}', 'g'), String(now.getDate()).padStart(2, '0'));

          if (selectedText) {
            text = text.replace(new RegExp('\\\\' + D + '\\\\{TM_SELECTED_TEXT(?::([^}]*))?\\\\}', 'g'), selectedText);
            text = text.replace(new RegExp('\\\\' + D + 'TM_SELECTED_TEXT\\\\b', 'g'), selectedText);
          } else {
            text = text.replace(new RegExp('\\\\' + D + '\\\\{TM_SELECTED_TEXT(?::([^}]*))?\\\\}', 'g'), function(_m, fb) { return fb !== undefined ? fb : ''; });
            text = text.replace(new RegExp('\\\\' + D + 'TM_SELECTED_TEXT\\\\b', 'g'), '');
          }

          text = text.replace(new RegExp('\\\\' + D + '\\\\{[0-9]+:(.*?)\\\\}', 'g'), '$1');
          text = text.replace(new RegExp('\\\\' + D + '\\\\{[0-9]+\\\\|(.*?)\\\\|\\\\}', 'g'), function(_m, choices) {
            return choices ? choices.split(',')[0] : '';
          });
          text = text.replace(new RegExp('\\\\' + D + '[0-9]+', 'g'), '');

          return text;
        }

        function insertSnippet(snip) {
          if (!snip) return;
          var sel = window.getSelection();
          var selectedText = sel ? sel.toString() : '';
          var expanded = expandSnippetText(snip, selectedText);

          if (currentTriggerRange) {
            sel.removeAllRanges();
            sel.addRange(currentTriggerRange);
            currentTriggerRange.deleteContents();
          }

          if (sel && sel.rangeCount > 0) {
            var range = sel.getRangeAt(0);
            var template = document.createElement('template');
            template.innerHTML = expanded.trim();
            var fragment = template.content;
            var firstNode = fragment.firstChild;

            var isBlockSnippet = /^<(div|pre|table|figure|section|article|blockquote|header|footer|details)[\\s>]/i.test(expanded.trim());
            var pParent = null;
            var anc = range.commonAncestorContainer;
            while (anc && anc !== document.body) {
              if (anc.nodeName === 'P') {
                pParent = anc;
                break;
              }
              anc = anc.parentNode;
            }

            if (isBlockSnippet && pParent && (pParent.textContent.trim() === '' || pParent.textContent.trim() === snip.prefix || pParent.textContent.trim() === '/' + snip.prefix)) {
              pParent.replaceWith(fragment);
            } else {
              range.insertNode(fragment);
            }

            if (firstNode) {
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

        // Navigation clavier pour les snippets, blocs de code, titres et protection des structures Obsidian
        window.addEventListener('keydown', function(e) {
          if (snippetMenuEl && snippetMenuEl.style.display !== 'none') {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              e.stopPropagation();
              currentSelectedIndex = (currentSelectedIndex + 1) % currentFilteredSnippets.length;
              renderSnippetMenu(lastSnippetQuery, lastSnippetRect);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              e.stopPropagation();
              currentSelectedIndex = (currentSelectedIndex - 1 + currentFilteredSnippets.length) % currentFilteredSnippets.length;
              renderSnippetMenu(lastSnippetQuery, lastSnippetRect);
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
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                document.execCommand('insertText', false, '\\n');
                emitDocChange();
                return;
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
              if ((e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) && (!snippetMenuEl || snippetMenuEl.style.display === 'none')) {
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
                  'card': '<div class="card"><h3>Titre</h3><p><br></p></div>',
                  'qcm': '<div class="qcm"><p>Question</p><label><input type="radio" name="q1"> Option A</label></div>',
                  'callout': '<div class="callout"><p>Information importante</p></div>',
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
                    ? (newEl.querySelector('.label, code, p, h1, h2, h3, h4, h5, h6, li') || newEl)
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

              // 4. Entrée dans un titre (H1-H6) : créer proprement un paragraphe <p> sous le titre (style Obsidian)
              if (e.key === 'Enter' && !e.shiftKey && /^H[1-6]$/i.test(currentBlock.nodeName)) {
                e.preventDefault();
                e.stopPropagation();
                var p = document.createElement('p');
                p.innerHTML = '<br>';
                currentBlock.after(p);
                var newRange = document.createRange();
                newRange.setStart(p, 0);
                newRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(newRange);
                emitDocChange();
                return;
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

          var text = block.textContent || '';
          var trimmed = text.trim();

          // 1. Tag ouvrant seul tapé dans un paragraphe : ex. "<h1>", "<h2>", "<pre>", etc.
          var openTagMatch = trimmed.match(/^<([a-zA-Z1-6]+)(?:\s+[^>]*)?>$/);
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
          var fullTagRegex = /<([a-zA-Z1-6]+)(?:\\s+[^>]*)?>[\\s\\S]*?<\\/\\1>|<(hr|br|img|input)[^>]*\\/?>/i;
          if (fullTagRegex.test(trimmed)) {
            var template = document.createElement('template');
            template.innerHTML = trimmed;
            if (template.content.childNodes.length > 0) {
              var lastChild = template.content.lastChild;
              block.replaceWith(template.content);
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

        document.addEventListener('input', function() {
          emitDocChange();
          checkForSnippetTrigger();
          checkForHtmlTagTransform();
        }, true);

        document.addEventListener('paste', function(e) {
          if (!isLiveEditEnabled) return;
          var text = (e.clipboardData || window.clipboardData).getData('text/plain');
          if (!text) return;
          var trimmed = text.trim();
          if (/<([a-zA-Z1-6]+)(?:\\s+[^>]*)?>[\\s\\S]*<\\/\\1>/i.test(trimmed) || /^<(div|style|pre|table|h[1-6]|p|section|article|blockquote|figure)[\\s>]/i.test(trimmed)) {
            e.preventDefault();
            var template = document.createElement('template');
            template.innerHTML = trimmed;
            var fragment = template.content;
            var sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
              var range = sel.getRangeAt(0);
              range.deleteContents();
              range.insertNode(fragment);
              emitDocChange();
            }
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
        });

        document.addEventListener('pointerdown', function(e) {
          if (snippetMenuEl && !snippetMenuEl.contains(e.target)) {
            closeSnippetMenu();
          }
        });

        // Interception des clics sur les liens vers un document PDF (ex: cours.pdf#page=12)
        document.addEventListener('click', function(e) {
          var a = e.target && e.target.closest ? e.target.closest('a') : null;
          if (a) {
            var href = a.getAttribute('href') || '';
            if (/\.pdf(#|\?|$)/i.test(href)) {
              e.preventDefault();
              e.stopPropagation();
              window.parent.postMessage({
                type: 'OPEN_PDF_PAGE',
                href: href
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
              var p = document.createElement('p');
              p.innerHTML = '<br>';
              insertAfter.after(p);
              var r2 = document.createRange();
              r2.setStart(p, 0);
              r2.collapse(true);
              var s2 = window.getSelection();
              s2.removeAllRanges();
              s2.addRange(r2);
              emitDocChange();
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
            var z = event.data.zoom || 100;
            if (document.documentElement) document.documentElement.style.zoom = '';
            if (document.body) {
              document.body.style.zoom = z + '%';
              document.body.style.margin = '0 auto';
              updateLineMap();
            }
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

  // État et références pour l'Aperçu Interactif Obsidian (écriture directe de texte/code et snippets dans le preview)
  const isLivePreviewEditable = true
  const lastEmittedPreviewHtmlRef = useRef<string>('')
  const lastMemoizedSrcDocRef = useRef<string>('')
  const lastPreviewMutationTimeRef = useRef<number>(0)
  const isSyncingToMonacoRef = useRef<boolean>(false)
  const normalizationTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const latestRawPreviewHtmlRef = useRef<string>('')

  const applyNormalization = useCallback(() => {
    const raw =
      latestRawPreviewHtmlRef.current || (editorRef.current ? editorRef.current.getValue() : '')
    if (!raw) return
    const normalized = normalizeHtml(raw)
    if (!normalized || normalized === lastEmittedPreviewHtmlRef.current) return

    lastEmittedPreviewHtmlRef.current = normalized
    localEmittedValuesRef.current.add(normalized)
    setDebouncedSrc(normalized)
    onChange(normalized)

    if (editorRef.current && editorRef.current.getValue() !== normalized) {
      const model = editorRef.current.getModel()
      if (model) {
        isSyncingToMonacoRef.current = true
        const pos = editorRef.current.getPosition()
        try {
          editorRef.current.executeEdits('preview-normalization', [
            {
              range: model.getFullModelRange(),
              text: normalized,
              forceMoveMarkers: true
            }
          ])
          if (pos) editorRef.current.setPosition(pos)
        } finally {
          setTimeout(() => {
            isSyncingToMonacoRef.current = false
          }, 60)
        }
      }
    }
  }, [onChange])

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
    const cleanup = registerEnhancedCompletions(snippets)
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

  // Debounce iframe updates for smooth typing (uniquement si le preview est visible)
  useEffect(() => {
    if (editorMode === 'edit') return
    const handler = setTimeout(() => {
      setDebouncedSrc(value)
    }, 700)
    return () => clearTimeout(handler)
  }, [value, editorMode])

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
        const rawNewHtml = event.data.html
        if (!rawNewHtml) return
        const newHtml = rawNewHtml.replace(/\r\n/g, '\n')
        latestRawPreviewHtmlRef.current = newHtml

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

        // Déclencher la normalisation complète après ~800ms d'inactivité (JAMAIS pendant la frappe active)
        if (normalizationTimeoutRef.current) clearTimeout(normalizationTimeoutRef.current)
        normalizationTimeoutRef.current = setTimeout(() => {
          applyNormalization()
        }, 800)
      } else if (event.data?.type === 'PREVIEW_DOC_BLUR') {
        if (event.data.html) {
          latestRawPreviewHtmlRef.current = event.data.html.replace(/\r\n/g, '\n')
        }
        if (normalizationTimeoutRef.current) clearTimeout(normalizationTimeoutRef.current)
        applyNormalization()
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

    // Si la modification provient directement de l'aperçu interactif (dernières 3 secondes ou HTML équivalent),
    // figer strictement le srcDoc actuel pour ne jamais recharger l'iframe pendant que l'utilisateur tape
    const isRecentlyEditedInPreview = Date.now() - lastPreviewMutationTimeRef.current < 3000
    if (
      lastMemoizedSrcDocRef.current &&
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
      isLivePreviewEditable
    )
    lastMemoizedSrcDocRef.current = prepared
    return prepared
  }, [debouncedSrc, currentFilePath, isHtml, snippets, isLivePreviewEditable])

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
