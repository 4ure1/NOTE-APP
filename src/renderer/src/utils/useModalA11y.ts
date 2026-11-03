import { useEffect, useRef } from 'react'
import { FIELD_SELECTOR, FOCUSABLE_SELECTOR, nextTrapMove } from '../../../shared/focusTrap'

interface ModalA11yOptions {
  /** Échap ferme la fenêtre (false si la fenêtre gère déjà Échap elle-même). */
  closeOnEscape?: boolean
  /** À l'ouverture : focaliser le premier champ de saisie ('field') ou le premier élément ('first'). */
  initialFocus?: 'field' | 'first'
}

function visibleFocusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.getClientRects().length > 0 && !el.closest('[aria-hidden="true"]')
  )
}

/**
 * Comportement clavier d'une fenêtre modale (WCAG 2.1.2, 2.4.3) : focus placé dans la fenêtre à
 * l'ouverture, Tab piégé dedans, Échap pour fermer, focus rendu à l'élément d'origine à la fermeture.
 * Le ref se pose sur le panneau qui porte role="dialog".
 */
export function useModalA11y<T extends HTMLElement = HTMLDivElement>(
  isOpen: boolean,
  onClose: () => void,
  options: ModalA11yOptions = {}
): React.RefObject<T | null> {
  const ref = useRef<T | null>(null)
  const onCloseRef = useRef(onClose)
  const { closeOnEscape = true, initialFocus = 'field' } = options

  // Toujours la dernière version de onClose, sans relancer l'effet principal (qui rendrait le focus)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!isOpen) return
    const node = ref.current
    if (!node) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null

    const frame = requestAnimationFrame(() => {
      if (node.contains(document.activeElement)) return
      const preferred = node.querySelector<HTMLElement>('[data-autofocus]')
      const field =
        initialFocus === 'field'
          ? Array.from(node.querySelectorAll<HTMLElement>(FIELD_SELECTOR)).find(
              (el) => el.getClientRects().length > 0
            )
          : undefined
      const target = preferred ?? field ?? visibleFocusables(node)[0] ?? node
      target.focus()
    })

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && closeOnEscape) {
        e.preventDefault()
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = visibleFocusables(node)
      const current = items.indexOf(document.activeElement as HTMLElement)
      const move = nextTrapMove(items.length, current, e.shiftKey)
      if (move.kind === 'native') return
      e.preventDefault()
      if (move.kind === 'focus') items[move.index].focus()
    }

    node.addEventListener('keydown', handleKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      node.removeEventListener('keydown', handleKeyDown)
      if (previous && previous.isConnected) previous.focus()
    }
  }, [isOpen, closeOnEscape, initialFocus])

  return ref
}
