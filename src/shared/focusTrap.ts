/**
 * Piège à focus des fenêtres modales (WCAG 2.1.2 / 2.4.3) : Tab et Maj+Tab tournent dans la fenêtre
 * au lieu de partir vers l'interface masquée derrière.
 *
 * Logique pure : `useModalA11y` (renderer/src/utils) fournit la liste des éléments focalisables et la
 * position du focus, et applique la décision.
 */

/** Éléments qui peuvent recevoir le focus clavier (les éléments masqués ou désactivés sont filtrés après). */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]'
].join(',')

/** Champs de saisie à focaliser en priorité à l'ouverture d'une fenêtre. */
export const FIELD_SELECTOR =
  'input:not([disabled]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]),select:not([disabled]),textarea:not([disabled])'

export type TrapMove =
  /** Le navigateur peut déplacer le focus lui-même (on reste dans la fenêtre). */
  | { kind: 'native' }
  /** Empêcher le déplacement natif et focaliser l'élément à cet index. */
  | { kind: 'focus'; index: number }
  /** Rien de focalisable : empêcher le déplacement, le focus reste sur la fenêtre. */
  | { kind: 'stay' }

/**
 * Décide où va le focus après Tab (ou Maj+Tab si `backwards`).
 * `currentIndex` : position de l'élément focalisé dans la liste, -1 s'il n'y est pas
 * (focus sur la fenêtre elle-même ou hors de la liste).
 */
export function nextTrapMove(count: number, currentIndex: number, backwards: boolean): TrapMove {
  if (count <= 0) return { kind: 'stay' }
  if (currentIndex < 0) return { kind: 'focus', index: backwards ? count - 1 : 0 }
  if (backwards && currentIndex === 0) return { kind: 'focus', index: count - 1 }
  if (!backwards && currentIndex >= count - 1) return { kind: 'focus', index: 0 }
  return { kind: 'native' }
}
