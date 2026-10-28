import React, { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
import 'pdfjs-dist/web/pdf_viewer.css'
import {
  PdfIcon,
  ExternalLinkIcon,
  TrashIcon,
  ClaudeIcon,
  ChatGPTIcon,
  GeminiIcon,
  ZoomInIcon,
  ZoomOutIcon,
  RotateCwIcon,
  MoonIcon,
  FolderIcon,
  SparklesIcon
} from './Icons'
import {
  PdfAnnotation,
  HighlightColor,
  HighlightRect,
  HIGHLIGHT_COLORS,
  formatPdfQuoteBlock,
  insertQuoteIntoNoteContent,
  upsertAnnotation,
  removeAnnotation
} from '../utils/pdfAnnotations'

// Configurer le worker PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

export interface PdfViewerProps {
  currentFilePath: string
  fileSize?: number
  modifiedAt?: string
  initialPageNumber?: number
  lastActiveNote?: string | null
  allNotes?: string[]
  onDelete?: () => void
  showAIWorkspace?: boolean
  onToggleAIWorkspace?: () => void
  activeAI?: 'agent' | 'claude' | 'chatgpt' | 'gemini'
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
  isResizing?: boolean
  isSideBySide?: boolean
  onOpenSideBySide?: () => void
  onShowToast?: (message: string) => void
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return ''
  const k = 1024
  const sizes = ['o', 'Ko', 'Mo', 'Go']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function createAnnotationId(): string {
  return `ann_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

// Composant de rendu pour une page individuelle
function PdfPageCanvas({
  pdfDoc,
  pageNumber,
  scale,
  rotation,
  darkMode,
  annotations,
  onVisible,
  onHighlightClick
}: {
  pdfDoc: pdfjsLib.PDFDocumentProxy
  pageNumber: number
  scale: number
  rotation: number
  darkMode: boolean
  annotations: PdfAnnotation[]
  onVisible?: (pageNumber: number) => void
  onHighlightClick: (ann: PdfAnnotation, e: React.MouseEvent) => void
}): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 600,
    height: 800
  })
  const [isRendered, setIsRendered] = useState(false)
  const [isInView, setIsInView] = useState(false)
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null)
  const textLayerTaskRef = useRef<pdfjsLib.TextLayer | null>(null)

  // Observer pour détecter quand la page est proche de l'écran (rendu lazy)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry.isIntersecting) {
          setIsInView(true)
          onVisible?.(pageNumber)
        }
      },
      { rootMargin: '600px 0px' }
    )
    observer.observe(el)
    return (): void => observer.disconnect()
  }, [pageNumber, onVisible])

  // Obtenir les dimensions initiales de la page
  useEffect(() => {
    let active = true
    pdfDoc.getPage(pageNumber).then((page) => {
      if (!active) return
      const vp = page.getViewport({ scale: 1, rotation })
      setDimensions({ width: vp.width, height: vp.height })
    })
    return (): void => {
      active = false
    }
  }, [pdfDoc, pageNumber, rotation])

  // Rendu ultra-net haute résolution de la page sur canvas + Couche de texte
  useEffect(() => {
    if (!isInView) return
    let active = true

    // Débouncing court (40ms) pour éviter les re-rendus en boucle et annulations saccadées pendant le pinch-to-zoom
    const timer = setTimeout(async (): Promise<void> => {
      try {
        const page = await pdfDoc.getPage(pageNumber)
        if (!active || !canvasRef.current) return

        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d', { alpha: false }) || canvas.getContext('2d')
        if (!ctx) return

        // Annuler le rendu précédent s'il était en cours
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel()
          } catch {
            /* ignore */
          }
        }

        // Multiplicateur Haute Définition : minimum 2x ou DPR système pour éliminer tout flou
        const dpr = Math.max(window.devicePixelRatio || 1, 2)
        const viewport = page.getViewport({ scale, rotation })

        // Dimensions physiques en pixels pour le bitmap (ultra-haute résolution)
        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor(viewport.height * dpr)

        // Dimensions logiques CSS
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`

        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'

        const renderContext = {
          canvasContext: ctx,
          transform: [dpr, 0, 0, dpr, 0, 0],
          viewport
        }

        const task = page.render(renderContext)
        renderTaskRef.current = task
        await task.promise
        if (active) {
          setIsRendered(true)

          // Rendu de la couche de texte PDF.js pour permettre la sélection de texte
          if (textLayerRef.current) {
            textLayerRef.current.innerHTML = ''
            try {
              if (textLayerTaskRef.current) {
                try {
                  textLayerTaskRef.current.cancel()
                } catch {
                  /* ignore */
                }
              }
              const textContent = await page.getTextContent()
              if (active && textContent.items.length > 0 && textLayerRef.current) {
                const textLayer = new pdfjsLib.TextLayer({
                  textContentSource: textContent,
                  container: textLayerRef.current,
                  viewport
                })
                textLayerTaskRef.current = textLayer
                await textLayer.render()
              }
            } catch (textErr: unknown) {
              const errName = (textErr as { name?: string })?.name
              if (errName !== 'RenderingCancelledException') {
                console.warn(`[textLayer] page ${pageNumber}:`, textErr)
              }
            }
          }
        }
      } catch (err: unknown) {
        const errName = (err as { name?: string })?.name
        if (errName !== 'RenderingCancelledException') {
          console.warn(`Erreur rendu page ${pageNumber}:`, err)
        }
      }
    }, 40)

    return (): void => {
      active = false
      clearTimeout(timer)
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel()
        } catch {
          /* ignore */
        }
      }
      if (textLayerTaskRef.current) {
        try {
          textLayerTaskRef.current.cancel()
        } catch {
          /* ignore */
        }
      }
    }
  }, [pdfDoc, pageNumber, scale, rotation, isInView])

  const scaledWidth = Math.floor(dimensions.width * scale)
  const scaledHeight = Math.floor(dimensions.height * scale)
  const pageAnnotations = annotations.filter((a) => a.pageNumber === pageNumber)

  return (
    <div
      ref={containerRef}
      data-page-number={pageNumber}
      style={{
        width: `${scaledWidth}px`,
        height: `${scaledHeight}px`,
        margin: '16px auto',
        backgroundColor: '#ffffff',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.3)',
        borderRadius: '3px',
        position: 'relative',
        filter: darkMode ? 'invert(0.92) hue-rotate(180deg)' : 'none',
        transition: 'filter 0.2s ease',
        overflow: 'hidden'
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: `${scaledWidth}px`,
          height: `${scaledHeight}px`,
          display: isRendered ? 'block' : 'none',
          imageRendering: 'auto'
        }}
      />

      {/* Couche de surlignages / Annotations */}
      <div
        className="pdf-highlights-layer"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
          zIndex: 2
        }}
      >
        {pageAnnotations.map((ann) => (
          <div key={ann.id}>
            {ann.rects.map((rect, idx) => (
              <div
                key={`${ann.id}-${idx}`}
                onClick={(e): void => {
                  e.stopPropagation()
                  onHighlightClick(ann, e)
                }}
                title={`Surligné (${HIGHLIGHT_COLORS[ann.color]?.name || ann.color}) — Cliquer pour options`}
                style={{
                  position: 'absolute',
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.width * 100}%`,
                  height: `${rect.height * 100}%`,
                  backgroundColor: HIGHLIGHT_COLORS[ann.color]?.bg || HIGHLIGHT_COLORS.yellow.bg,
                  borderBottom: `2px solid ${HIGHLIGHT_COLORS[ann.color]?.border || HIGHLIGHT_COLORS.yellow.border}`,
                  borderRadius: '2px',
                  mixBlendMode: 'multiply',
                  pointerEvents: 'auto',
                  cursor: 'pointer'
                }}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Couche de texte PDF.js (sélection native alignée au canvas) */}
      <div
        ref={textLayerRef}
        className="textLayer"
        style={{
          position: 'absolute',
          inset: 0,
          width: `${scaledWidth}px`,
          height: `${scaledHeight}px`,
          overflow: 'hidden',
          opacity: 1,
          lineHeight: 1,
          transformOrigin: '0 0',
          pointerEvents: 'auto',
          userSelect: 'text',
          zIndex: 3
        }}
      />

      {!isRendered && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#a1a1aa',
            fontSize: '12px',
            fontFamily: 'sans-serif'
          }}
        >
          Page {pageNumber}
        </div>
      )}
    </div>
  )
}

export default function PdfViewer({
  currentFilePath,
  fileSize,
  modifiedAt,
  initialPageNumber,
  lastActiveNote,
  allNotes = [],
  onDelete,
  showAIWorkspace = false,
  onToggleAIWorkspace,
  activeAI = 'claude',
  isResizing = false,
  onShowToast
}: PdfViewerProps): ReactNode {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [scale, setScale] = useState<number>(1.0)
  const [rotation, setRotation] = useState<number>(0)
  const [darkMode, setDarkMode] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isScannedPdf, setIsScannedPdf] = useState<boolean>(false)

  // Annotations
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([])

  // Popover de sélection flottante
  const [selectionPopover, setSelectionPopover] = useState<{
    text: string
    pageNumber: number
    rects: HighlightRect[]
    x: number
    y: number
  } | null>(null)

  // Popover de surlignage existant
  const [activeHighlight, setActiveHighlight] = useState<{
    ann: PdfAnnotation
    x: number
    y: number
  } | null>(null)

  // Modale "Envoyer vers la note"
  const [sendToNoteTarget, setSendToNoteTarget] = useState<{
    text: string
    pageNumber: number
    rects?: HighlightRect[]
  } | null>(null)
  const [selectedDestNote, setSelectedDestNote] = useState<string>('')
  const [isCreatingNewNote, setIsCreatingNewNote] = useState<boolean>(false)
  const [newNoteName, setNewNoteName] = useState<string>('')
  const [quoteComment, setQuoteComment] = useState<string>('')

  const containerRef = useRef<HTMLDivElement>(null)
  const touchStartDistRef = useRef<number | null>(null)
  const initialTouchScaleRef = useRef<number>(1.0)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleContainerScroll = useCallback((): void => {
    const el = containerRef.current
    if (!el) return
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    scrollTimeoutRef.current = setTimeout((): void => {
      const max = el.scrollHeight - el.clientHeight
      const ratio = max > 0 ? el.scrollTop / max : 0
      try {
        localStorage.setItem(
          'pdf_scroll_' + currentFilePath,
          JSON.stringify({ scrollTop: el.scrollTop, ratio })
        )
      } catch {
        /* ignore */
      }
    }, 50)
  }, [currentFilePath])

  // Extraire le nom de fichier
  const fileName = currentFilePath.includes('/')
    ? currentFilePath.substring(currentFilePath.lastIndexOf('/') + 1)
    : currentFilePath

  // Charger les annotations existantes pour ce PDF
  useEffect(() => {
    let isMounted = true
    if (window.api?.getPdfAnnotations) {
      window.api
        .getPdfAnnotations(currentFilePath)
        .then((anns) => {
          if (isMounted && Array.isArray(anns)) {
            setAnnotations(anns)
          }
        })
        .catch((err) => {
          console.warn('Erreur chargement annotations PDF:', err)
        })
    }
    return (): void => {
      isMounted = false
    }
  }, [currentFilePath])

  // Sauvegarder les annotations
  const persistAnnotations = useCallback(
    async (newAnns: PdfAnnotation[]): Promise<void> => {
      setAnnotations(newAnns)
      if (window.api?.savePdfAnnotations) {
        await window.api.savePdfAnnotations(currentFilePath, newAnns)
      }
    },
    [currentFilePath]
  )

  // Charger le document PDF via PDF.js
  useEffect(() => {
    let isMounted = true

    const loadDoc = async (): Promise<void> => {
      setLoading(true)
      setLoadError(null)
      setIsScannedPdf(false)

      try {
        let uint8Array: Uint8Array | null = null

        // Lecture en binaire direct via preload
        if (window.api?.readBinaryFile) {
          const base64 = await window.api.readBinaryFile(currentFilePath)
          if (base64) {
            const binaryString = atob(base64)
            const len = binaryString.length
            const bytes = new Uint8Array(len)
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryString.charCodeAt(i)
            }
            uint8Array = bytes
          }
        }

        if (!uint8Array) {
          // Fallback fetch note-pdf://
          const resp = await fetch(`note-pdf://notes/${encodeURIComponent(currentFilePath)}`)
          if (resp.ok) {
            uint8Array = new Uint8Array(await resp.arrayBuffer())
          }
        }

        if (!uint8Array || uint8Array.length === 0) {
          throw new Error('Fichier PDF introuvable ou vide')
        }

        const loadingTask = pdfjsLib.getDocument({
          data: uint8Array,
          cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
          cMapPacked: true
        })

        const doc = await loadingTask.promise
        if (isMounted) {
          setPdfDoc(doc)
          setNumPages(doc.numPages)

          // Vérifier si le document PDF est un scan sans couche de texte
          try {
            let foundText = false
            const checkPages = Math.min(doc.numPages, 3)
            for (let p = 1; p <= checkPages; p++) {
              const testPage = await doc.getPage(p)
              const tc = await testPage.getTextContent()
              if (tc.items.length > 0) {
                foundText = true
                break
              }
            }
            if (isMounted) {
              setIsScannedPdf(!foundText)
            }
          } catch {
            /* ignore */
          }

          let initialPage = initialPageNumber || 1
          let savedScrollTop: number | null = null
          let savedRatio: number | null = null
          try {
            if (!initialPageNumber) {
              const savedPageStr = localStorage.getItem('pdf_page_' + currentFilePath)
              if (savedPageStr) {
                const p = parseInt(savedPageStr, 10)
                if (p >= 1 && p <= doc.numPages) initialPage = p
              }
            }
            const savedScrollStr = localStorage.getItem('pdf_scroll_' + currentFilePath)
            if (savedScrollStr && !initialPageNumber) {
              const parsed = JSON.parse(savedScrollStr)
              if (typeof parsed.scrollTop === 'number') savedScrollTop = parsed.scrollTop
              if (typeof parsed.ratio === 'number') savedRatio = parsed.ratio
            }
          } catch {
            /* ignore */
          }

          setCurrentPage(initialPage)
          setLoading(false)

          const restorePdfScroll = (): void => {
            if (!isMounted || !containerRef.current) return
            if (initialPage > 1) {
              const pageEl = containerRef.current.querySelector(
                `[data-page-number="${initialPage}"]`
              )
              if (pageEl) {
                pageEl.scrollIntoView({ behavior: 'auto', block: 'start' })
                return
              }
            }
            if (savedScrollTop !== null && savedScrollTop > 0) {
              containerRef.current.scrollTop = savedScrollTop
            } else if (savedRatio !== null && savedRatio > 0) {
              const max = containerRef.current.scrollHeight - containerRef.current.clientHeight
              if (max > 0) containerRef.current.scrollTop = savedRatio * max
            }
          }

          setTimeout(restorePdfScroll, 100)
          setTimeout(restorePdfScroll, 350)
          setTimeout(restorePdfScroll, 700)

          // Calculer le zoom initial adapté à la largeur de l'écran
          doc.getPage(1).then((firstPage) => {
            if (!isMounted || !containerRef.current) return
            const vp = firstPage.getViewport({ scale: 1 })
            const containerWidth = containerRef.current.clientWidth - 64
            if (containerWidth > 0 && vp.width > 0) {
              const fitScale = Math.min(Math.max(containerWidth / vp.width, 0.6), 1.5)
              setScale(parseFloat(fitScale.toFixed(2)))
            }
          })
        }
      } catch (err: unknown) {
        console.error('Erreur chargement PDF.js:', err)
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Erreur inconnue'
          setLoadError(msg)
          setLoading(false)
        }
      }
    }

    loadDoc()

    return (): void => {
      isMounted = false
    }
  }, [currentFilePath, initialPageNumber])

  // Déplacement direct si initialPageNumber change
  useEffect(() => {
    if (initialPageNumber && initialPageNumber >= 1 && numPages > 0) {
      const clamped = Math.min(Math.max(initialPageNumber, 1), numPages)
      const pageEl = containerRef.current?.querySelector(`[data-page-number="${clamped}"]`)
      if (pageEl) {
        pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      const timer = window.setTimeout(() => {
        setCurrentPage(clamped)
      }, 0)
      return (): void => {
        window.clearTimeout(timer)
      }
    }
    return undefined
  }, [initialPageNumber, numPages])

  // ── GESTION PINCH-TO-ZOOM (Touchpad / Trackpad Ctrl+Wheel) ─────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent): void => {
      if (e.ctrlKey) {
        e.preventDefault()
        const factor = Math.exp(-e.deltaY * 0.0035)
        setScale((prev) => {
          const next = Math.min(Math.max(prev * factor, 0.25), 4.5)
          return parseFloat(next.toFixed(2))
        })
      }
    }

    const handleTouchStart = (e: TouchEvent): void => {
      if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        )
        touchStartDistRef.current = dist
        initialTouchScaleRef.current = scale
      }
    }

    const handleTouchMove = (e: TouchEvent): void => {
      if (e.touches.length === 2 && touchStartDistRef.current) {
        e.preventDefault()
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        )
        const factor = dist / touchStartDistRef.current
        const next = Math.min(Math.max(initialTouchScaleRef.current * factor, 0.25), 4.5)
        setScale(parseFloat(next.toFixed(2)))
      }
    }

    const handleTouchEnd = (): void => {
      touchStartDistRef.current = null
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    container.addEventListener('touchstart', handleTouchStart, { passive: false })
    container.addEventListener('touchmove', handleTouchMove, { passive: false })
    container.addEventListener('touchend', handleTouchEnd)

    return (): void => {
      container.removeEventListener('wheel', handleWheel)
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchmove', handleTouchMove)
      container.removeEventListener('touchend', handleTouchEnd)
    }
  }, [scale])

  // Ajuster le zoom à la largeur du conteneur
  const handleFitWidth = useCallback((): void => {
    if (!pdfDoc || !containerRef.current) return
    pdfDoc.getPage(currentPage).then((page) => {
      if (!containerRef.current) return
      const vp = page.getViewport({ scale: 1, rotation })
      const containerWidth = containerRef.current.clientWidth - 80
      if (containerWidth > 0 && vp.width > 0) {
        setScale(parseFloat((containerWidth / vp.width).toFixed(2)))
      }
    })
  }, [pdfDoc, currentPage, rotation])

  // Zoomer vers une page spécifique
  const scrollToPage = (pageNum: number): void => {
    const clamped = Math.min(Math.max(pageNum, 1), numPages)
    setCurrentPage(clamped)
    const pageEl = containerRef.current?.querySelector(`[data-page-number="${clamped}"]`)
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  // Ouvrir dans le lecteur système
  const handleOpenExternal = (): void => {
    if (window.api?.openInBrowser) {
      window.api.openInBrowser(currentFilePath)
    }
  }

  const handleShowInFolder = (): void => {
    if (window.api?.showItemInFolder) {
      window.api.showItemInFolder(currentFilePath)
    }
  }

  const handleRotate = (): void => {
    setRotation((prev) => (prev + 90) % 360)
  }

  // ── GESTION DES ANNOTATIONS & SÉLECTION DE TEXTE ─────────────────────

  const handleMouseUp = useCallback((): void => {
    setTimeout((): void => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) return
      const text = sel.toString().trim()
      if (!text || text.length === 0) return

      try {
        const range = sel.getRangeAt(0)
        const clientRects = Array.from(range.getClientRects()).filter(
          (r) => r.width > 2 && r.height > 2
        )
        if (clientRects.length === 0) return

        const anchor = sel.anchorNode
        const el = (
          anchor?.nodeType === Node.ELEMENT_NODE ? (anchor as HTMLElement) : anchor?.parentElement
        )?.closest('[data-page-number]') as HTMLElement | null
        if (!el) return

        const pageNum = parseInt(el.getAttribute('data-page-number') || '1', 10)
        const pageRect = el.getBoundingClientRect()

        const normRects: HighlightRect[] = clientRects.map((r) => ({
          x: Math.max(0, Math.min(1, (r.left - pageRect.left) / pageRect.width)),
          y: Math.max(0, Math.min(1, (r.top - pageRect.top) / pageRect.height)),
          width: Math.min(1, r.width / pageRect.width),
          height: Math.min(1, r.height / pageRect.height)
        }))

        const bounding = range.getBoundingClientRect()
        setActiveHighlight(null)
        setSelectionPopover({
          text,
          pageNumber: pageNum,
          rects: normRects,
          x: Math.min(
            window.innerWidth - 340,
            Math.max(16, bounding.left + bounding.width / 2 - 130)
          ),
          y: Math.max(16, bounding.top - 52)
        })
      } catch (err) {
        console.warn('Erreur détection sélection PDF:', err)
      }
    }, 20)
  }, [])

  // Création d'un surlignage
  const handleCreateHighlight = (color: HighlightColor): void => {
    if (!selectionPopover) return
    const newAnn: PdfAnnotation = {
      id: createAnnotationId(),
      pageNumber: selectionPopover.pageNumber,
      text: selectionPopover.text,
      color,
      rects: selectionPopover.rects,
      createdAt: new Date().toISOString()
    }
    const next = upsertAnnotation(annotations, newAnn)
    persistAnnotations(next)
    window.getSelection()?.removeAllRanges()
    setSelectionPopover(null)
    onShowToast?.(`Passage surligné en ${HIGHLIGHT_COLORS[color].name} !`)
  }

  // Clic sur un surlignage existant
  const handleHighlightClick = useCallback((ann: PdfAnnotation, e: React.MouseEvent): void => {
    const target = e.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    setSelectionPopover(null)
    setActiveHighlight({
      ann,
      x: Math.min(window.innerWidth - 300, Math.max(16, rect.left + rect.width / 2 - 120)),
      y: Math.max(16, rect.top - 48)
    })
  }, [])

  const handleChangeHighlightColor = (id: string, color: HighlightColor): void => {
    const target = annotations.find((a) => a.id === id)
    if (target) {
      const updated = { ...target, color }
      const next = upsertAnnotation(annotations, updated)
      persistAnnotations(next)
      setActiveHighlight({
        ann: updated,
        x: activeHighlight?.x || 100,
        y: activeHighlight?.y || 100
      })
      onShowToast?.(`Couleur modifiée en ${HIGHLIGHT_COLORS[color].name}`)
    }
  }

  const handleDeleteHighlight = (id: string): void => {
    const next = removeAnnotation(annotations, id)
    persistAnnotations(next)
    setActiveHighlight(null)
    onShowToast?.('Surlignage supprimé')
  }

  // Copier la citation avec lien de retour
  const handleCopyQuote = (quoteText: string, pageNum: number): void => {
    const isHtml = lastActiveNote ? lastActiveNote.endsWith('.html') : false
    const quoteBlock = formatPdfQuoteBlock({
      quoteText,
      pdfRelativePath: currentFilePath,
      targetNotePath: lastActiveNote || 'note.md',
      pageNumber: pageNum,
      isHtml
    })
    navigator.clipboard
      .writeText(quoteBlock)
      .then(() => {
        onShowToast?.('Citation copiée dans le presse-papier !')
      })
      .catch(() => {
        navigator.clipboard.writeText(quoteText)
        onShowToast?.('Texte copié !')
      })
    setSelectionPopover(null)
    setActiveHighlight(null)
  }

  // Ouvrir la modale d'envoi vers une note
  const handleOpenSendToNote = (): void => {
    if (!selectionPopover) return
    setSendToNoteTarget({
      text: selectionPopover.text,
      pageNumber: selectionPopover.pageNumber,
      rects: selectionPopover.rects
    })
    setSelectedDestNote(lastActiveNote || '')
    setSelectionPopover(null)
  }

  // Exécuter l'insertion de l'extrait dans la note
  const handleExecuteSend = async (targetOverride?: string): Promise<void> => {
    if (!sendToNoteTarget) return
    const destNote = isCreatingNewNote
      ? newNoteName.trim()
      : targetOverride || selectedDestNote || lastActiveNote

    if (!destNote) {
      onShowToast?.('Veuillez sélectionner ou nommer une note de destination.')
      return
    }

    const isHtml =
      destNote.toLowerCase().endsWith('.html') || destNote.toLowerCase().endsWith('.htm')
    const quoteBlock = formatPdfQuoteBlock({
      quoteText: sendToNoteTarget.text,
      pdfRelativePath: currentFilePath,
      targetNotePath: destNote,
      pageNumber: sendToNoteTarget.pageNumber,
      isHtml,
      comment: quoteComment.trim() || undefined
    })

    try {
      if (isCreatingNewNote) {
        if (window.api?.createNoteWithContent) {
          await window.api.createNoteWithContent(destNote, quoteBlock)
        }
      } else {
        let existingContent = ''
        try {
          if (window.api?.readNote) {
            existingContent = await window.api.readNote(destNote)
          }
        } catch {
          /* ignore */
        }

        const updated = insertQuoteIntoNoteContent(existingContent, quoteBlock, isHtml)
        if (window.api?.writeNote) {
          await window.api.writeNote(destNote, updated)
        }
      }

      // Créer également le surlignage sur le PDF s'il n'existe pas encore
      if (sendToNoteTarget.rects && sendToNoteTarget.rects.length > 0) {
        const newAnn: PdfAnnotation = {
          id: createAnnotationId(),
          pageNumber: sendToNoteTarget.pageNumber,
          text: sendToNoteTarget.text,
          color: 'yellow',
          rects: sendToNoteTarget.rects,
          createdAt: new Date().toISOString(),
          comment: quoteComment.trim() || undefined
        }
        const updatedList = upsertAnnotation(annotations, newAnn)
        persistAnnotations(updatedList)
      }

      onShowToast?.(`Extrait inséré dans "${destNote.split('/').pop()}" 📌`)
      window.getSelection()?.removeAllRanges()
      setSendToNoteTarget(null)
      setQuoteComment('')
      setIsCreatingNewNote(false)
      setNewNoteName('')
    } catch (err: unknown) {
      console.error('Erreur insertion citation:', err)
      onShowToast?.('Erreur lors de l’insertion de l’extrait')
    }
  }

  // Fermer les popovers au clic en dehors
  const handlePointerDownContainer = (e: React.PointerEvent): void => {
    const target = e.target as HTMLElement
    if (!target.closest('.pdf-popover') && !target.closest('.pdf-modal')) {
      if (selectionPopover) setSelectionPopover(null)
      if (activeHighlight) setActiveHighlight(null)
    }
  }

  // Branding dynamique IA
  const aiData = {
    agent: { name: 'Agent IA', color: '#10b981', icon: <SparklesIcon size={14} color="#10b981" /> },
    claude: { name: 'Claude', color: '#D97757', icon: <ClaudeIcon size={14} color="#D97757" /> },
    chatgpt: {
      name: 'ChatGPT',
      color: '#ffffff',
      icon: <ChatGPTIcon size={14} style={{ color: '#ffffff' }} />
    },
    gemini: {
      name: 'Gemini',
      color: '#4285f4',
      icon: <GeminiIcon size={14} style={{ color: '#4285f4' }} />
    }
  }[activeAI] || {
    name: 'Agent IA',
    color: '#10b981',
    icon: <SparklesIcon size={14} color="#10b981" />
  }

  return (
    <div
      onPointerDown={handlePointerDownContainer}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: 'var(--editor-bg)',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {/* ── BARRE D'OUTILS SUPÉRIEURE DU LECTEUR PDF ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '46px',
          padding: '0 10px',
          backgroundColor: 'var(--sidebar-bg)',
          borderBottom: '1px solid var(--border-color)',
          gap: '8px',
          flexShrink: 0,
          boxSizing: 'border-box',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          userSelect: 'none'
        }}
      >
        {/* Titre & Info fichier */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            minWidth: 0,
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              flexShrink: 0
            }}
          >
            <PdfIcon size={16} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '180px'
                }}
                title={fileName}
              >
                {fileName}
              </span>
              <span
                style={{
                  fontSize: '9.5px',
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  color: '#f87171',
                  border: '1px solid rgba(239, 68, 68, 0.3)'
                }}
              >
                PDF
              </span>
              {annotations.length > 0 && (
                <span
                  title={`${annotations.length} passage(s) surligné(s)`}
                  style={{
                    fontSize: '9.5px',
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(250, 204, 21, 0.15)',
                    color: '#facc15',
                    border: '1px solid rgba(250, 204, 21, 0.3)'
                  }}
                >
                  ✏️ {annotations.length}
                </span>
              )}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '10.5px',
                color: 'var(--text-muted)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {fileSize ? <span>{formatBytes(fileSize)}</span> : null}
              {fileSize && (numPages > 0 || modifiedAt) ? <span>•</span> : null}
              {numPages > 0 ? (
                <span>
                  {numPages} page{numPages > 1 ? 's' : ''}
                </span>
              ) : null}
              {modifiedAt ? <span>• {modifiedAt}</span> : null}
            </div>
          </div>
        </div>

        {/* ── CONTRÔLES CENTRAUX : ZOOM PINCH + NAVIGATION ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Navigation Pages */}
          {numPages > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                padding: '2px 6px',
                borderRadius: '6px',
                fontSize: '12px',
                color: 'var(--text-secondary)'
              }}
            >
              <button
                onClick={(): void => scrollToPage(currentPage - 1)}
                disabled={currentPage <= 1}
                title="Page précédente"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: currentPage <= 1 ? 'rgba(255, 255, 255, 0.2)' : 'var(--text-primary)',
                  cursor: currentPage <= 1 ? 'default' : 'pointer',
                  padding: '2px 4px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  flexShrink: 0
                }}
              >
                ◀
              </button>
              <span
                style={{ fontWeight: 600, color: '#ffffff', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                {currentPage}
              </span>
              <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                &nbsp;/ {numPages}
              </span>
              <button
                onClick={(): void => scrollToPage(currentPage + 1)}
                disabled={currentPage >= numPages}
                title="Page suivante"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color:
                    currentPage >= numPages ? 'rgba(255, 255, 255, 0.2)' : 'var(--text-primary)',
                  cursor: currentPage >= numPages ? 'default' : 'pointer',
                  padding: '2px 4px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  flexShrink: 0
                }}
              >
                ▶
              </button>
            </div>
          )}

          {/* Contrôles de zoom */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              padding: '2px 4px',
              borderRadius: '6px'
            }}
          >
            <button
              onClick={(): void =>
                setScale((prev) => Math.max(parseFloat((prev - 0.15).toFixed(2)), 0.25))
              }
              title="Zoom arrière (ou pincez vers l'intérieur)"
              style={{
                width: '26px',
                height: '26px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
              onMouseEnter={(e): void => {
                e.currentTarget.style.color = '#fff'
              }}
              onMouseLeave={(e): void => {
                e.currentTarget.style.color = 'var(--text-secondary)'
              }}
            >
              <ZoomOutIcon size={14} />
            </button>

            <span
              onClick={handleFitWidth}
              title="Cliquer pour ajuster à la largeur (ou zoomez avec pincement)"
              style={{
                fontSize: '11.5px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                minWidth: '42px',
                textAlign: 'center',
                cursor: 'pointer',
                padding: '2px 4px',
                borderRadius: '4px'
              }}
            >
              {Math.round(scale * 100)}%
            </span>

            <button
              onClick={(): void =>
                setScale((prev) => Math.min(parseFloat((prev + 0.15).toFixed(2)), 4.5))
              }
              title="Zoom avant (ou pincez vers l'extérieur)"
              style={{
                width: '26px',
                height: '26px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
              onMouseEnter={(e): void => {
                e.currentTarget.style.color = '#fff'
              }}
              onMouseLeave={(e): void => {
                e.currentTarget.style.color = 'var(--text-secondary)'
              }}
            >
              <ZoomInIcon size={14} />
            </button>

            {/* Bouton Ajuster Largeur */}
            <button
              onClick={handleFitWidth}
              title="Ajuster à la largeur de l'écran"
              style={{
                height: '24px',
                padding: '0 6px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                borderRadius: '4px'
              }}
              onMouseEnter={(e): void => {
                e.currentTarget.style.color = '#fff'
              }}
              onMouseLeave={(e): void => {
                e.currentTarget.style.color = 'var(--text-muted)'
              }}
            >
              Largeur
            </button>
          </div>

          {/* Rotation 90° */}
          <button
            onClick={handleRotate}
            title="Pivoter de 90°"
            style={{
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '6px',
              color: 'var(--text-secondary)',
              cursor: 'pointer'
            }}
            onMouseEnter={(e): void => {
              e.currentTarget.style.color = '#fff'
            }}
            onMouseLeave={(e): void => {
              e.currentTarget.style.color = 'var(--text-secondary)'
            }}
          >
            <RotateCwIcon size={13} />
          </button>

          {/* Mode Sombre (inversion douce du papier) */}
          <button
            onClick={(): void => setDarkMode((prev) => !prev)}
            title={
              darkMode ? 'Désactiver le mode sombre PDF' : 'Activer le mode sombre PDF (inversion)'
            }
            style={{
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: darkMode ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
              border: `1px solid ${darkMode ? 'rgba(99, 102, 241, 0.4)' : 'rgba(255, 255, 255, 0.08)'}`,
              borderRadius: '6px',
              color: darkMode ? '#818cf8' : 'var(--text-secondary)',
              cursor: 'pointer'
            }}
          >
            <MoonIcon size={13} />
          </button>
        </div>

        {/* ── ACTIONS DROITE : EXTERNE / EXPLORATEUR / IA ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {/* Ouvrir en externe */}
          <button
            onClick={handleOpenExternal}
            title="Ouvrir dans l'application système (Adobe, Edge...)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              height: '28px',
              padding: '0 8px',
              backgroundColor: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              color: 'var(--text-secondary)',
              fontSize: '11.5px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
            onMouseEnter={(e): void => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'
              e.currentTarget.style.color = '#fff'
            }}
            onMouseLeave={(e): void => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }}
          >
            <ExternalLinkIcon size={12} />
            <span>Ouvrir</span>
          </button>

          {/* Révéler dossier */}
          <button
            onClick={handleShowInFolder}
            title="Afficher dans l'explorateur Windows"
            style={{
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              color: 'var(--text-secondary)',
              cursor: 'pointer'
            }}
            onMouseEnter={(e): void => {
              e.currentTarget.style.color = '#fff'
            }}
            onMouseLeave={(e): void => {
              e.currentTarget.style.color = 'var(--text-secondary)'
            }}
          >
            <FolderIcon size={14} />
          </button>

          {/* Supprimer */}
          {onDelete && (
            <button
              onClick={onDelete}
              title="Mettre ce PDF à la corbeille"
              style={{
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'transparent',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '6px',
                color: '#f87171',
                cursor: 'pointer'
              }}
            >
              <TrashIcon size={13} />
            </button>
          )}

          {/* Assistant IA toggle */}
          {onToggleAIWorkspace && (
            <button
              onClick={onToggleAIWorkspace}
              title={`Afficher/masquer ${aiData.name}`}
              style={{
                height: '28px',
                padding: '0 10px',
                backgroundColor: showAIWorkspace ? `${aiData.color}29` : `${aiData.color}14`,
                border: `1px solid ${showAIWorkspace ? `${aiData.color}80` : `${aiData.color}40`}`,
                borderRadius: '6px',
                color: aiData.color,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 600,
                boxShadow: showAIWorkspace ? `0 0 10px ${aiData.color}40` : 'none'
              }}
            >
              {aiData.icon}
              <span>{aiData.name}</span>
            </button>
          )}
        </div>
      </div>

      {/* Bannière d'alerte pour les PDF scannés sans couche de texte */}
      {isScannedPdf && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '6px 14px',
            backgroundColor: 'rgba(234, 179, 8, 0.1)',
            borderBottom: '1px solid rgba(234, 179, 8, 0.25)',
            color: '#facc15',
            fontSize: '12px',
            flexShrink: 0
          }}
        >
          <span>
            ℹ️ Document scanné : aucune couche de texte sélectionnable n&apos;a été trouvée dans ce
            PDF.
          </span>
        </div>
      )}

      {/* ── ZONE DE CONTENU / PAGES PDF SCROLLABLE AVEC PINCH-TO-ZOOM ── */}
      <div
        ref={containerRef}
        onScroll={handleContainerScroll}
        onMouseUp={handleMouseUp}
        style={{
          flex: 1,
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'auto',
          backgroundColor: '#121215',
          pointerEvents: isResizing ? 'none' : 'auto',
          touchAction: 'none'
        }}
      >
        {/* Indicateur de chargement */}
        {loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#111114',
              color: 'var(--text-secondary)',
              gap: '12px',
              zIndex: 10
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                border: '3px solid rgba(255, 255, 255, 0.1)',
                borderTopColor: '#ef4444',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite'
              }}
            />
            <span style={{ fontSize: '13px' }}>Chargement du document PDF...</span>
          </div>
        )}

        {/* Message d'erreur */}
        {loadError && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#111114',
              color: 'var(--text-secondary)',
              gap: '12px',
              padding: '20px',
              textAlign: 'center',
              zIndex: 10
            }}
          >
            <PdfIcon size={36} />
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Impossible de charger le document PDF
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{loadError}</span>
            <button
              onClick={handleOpenExternal}
              style={{
                marginTop: '10px',
                padding: '8px 16px',
                backgroundColor: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Ouvrir avec le lecteur système
            </button>
          </div>
        )}

        {/* ── RENDU DE TOUTES LES PAGES AVEC LAZY LOADING & PINCH ZOOM ── */}
        {pdfDoc && numPages > 0 && (
          <div
            style={{
              padding: '24px 16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              minWidth: 'fit-content'
            }}
          >
            {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
              <PdfPageCanvas
                key={`${pageNum}-${rotation}`}
                pdfDoc={pdfDoc}
                pageNumber={pageNum}
                scale={scale}
                rotation={rotation}
                darkMode={darkMode}
                annotations={annotations}
                onHighlightClick={handleHighlightClick}
                onVisible={(page): void => {
                  setCurrentPage(page)
                  try {
                    localStorage.setItem('pdf_page_' + currentFilePath, String(page))
                  } catch {
                    /* ignore */
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── POPOVER FLOTTANT DE SÉLECTION DE TEXTE ── */}
      {selectionPopover && (
        <div
          className="pdf-popover"
          style={{
            position: 'fixed',
            left: `${selectionPopover.x}px`,
            top: `${selectionPopover.y}px`,
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#18181b',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.75), 0 2px 6px rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(10px)',
            borderRadius: '8px',
            padding: '6px 10px'
          }}
        >
          {/* Pastilles de couleur pour surligner */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {(['yellow', 'green', 'pink', 'cyan', 'purple'] as HighlightColor[]).map((col) => (
              <button
                key={col}
                onClick={(): void => handleCreateHighlight(col)}
                title={`Surligner en ${HIGHLIGHT_COLORS[col].name}`}
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  backgroundColor: HIGHLIGHT_COLORS[col].dot,
                  border: '2px solid rgba(255, 255, 255, 0.2)',
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'transform 0.15s ease'
                }}
                onMouseEnter={(e): void => {
                  e.currentTarget.style.transform = 'scale(1.25)'
                }}
                onMouseLeave={(e): void => {
                  e.currentTarget.style.transform = 'scale(1)'
                }}
              />
            ))}
          </div>

          <div
            style={{ width: '1px', height: '18px', backgroundColor: 'rgba(255, 255, 255, 0.15)' }}
          />

          {/* Bouton Envoyer vers la note */}
          <button
            onClick={handleOpenSendToNote}
            title="Insérer cette citation dans une note active ou choisie"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              color: '#38bdf8',
              borderRadius: '5px',
              padding: '3px 8px',
              fontSize: '11.5px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
            onMouseEnter={(e): void => {
              e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.22)'
            }}
            onMouseLeave={(e): void => {
              e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.12)'
            }}
          >
            <span>📌</span>
            <span>Envoyer vers la note</span>
          </button>

          {/* Bouton Copier la citation */}
          <button
            onClick={(): void =>
              handleCopyQuote(selectionPopover.text, selectionPopover.pageNumber)
            }
            title="Copier la citation formatée avec le lien retour vers cette page"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: 'var(--text-secondary)',
              borderRadius: '5px',
              padding: '3px 7px',
              fontSize: '11.5px',
              cursor: 'pointer'
            }}
            onMouseEnter={(e): void => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'
              e.currentTarget.style.color = '#fff'
            }}
            onMouseLeave={(e): void => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }}
          >
            <span>Copier</span>
          </button>
        </div>
      )}

      {/* ── POPOVER D'ACTION SUR SURLIGNAGE EXISTANT ── */}
      {activeHighlight && (
        <div
          className="pdf-popover"
          style={{
            position: 'fixed',
            left: `${activeHighlight.x}px`,
            top: `${activeHighlight.y}px`,
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#18181b',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(10px)',
            borderRadius: '8px',
            padding: '6px 10px'
          }}
        >
          {/* Changer de couleur */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            {(['yellow', 'green', 'pink', 'cyan', 'purple'] as HighlightColor[]).map((col) => (
              <button
                key={col}
                onClick={(): void => handleChangeHighlightColor(activeHighlight.ann.id, col)}
                title={`Changer pour ${HIGHLIGHT_COLORS[col].name}`}
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  backgroundColor: HIGHLIGHT_COLORS[col].dot,
                  border:
                    activeHighlight.ann.color === col ? '2px solid #fff' : '2px solid transparent',
                  cursor: 'pointer',
                  padding: 0
                }}
              />
            ))}
          </div>

          <div
            style={{ width: '1px', height: '16px', backgroundColor: 'rgba(255, 255, 255, 0.15)' }}
          />

          {/* Envoyer vers la note */}
          <button
            onClick={(): void => {
              setSendToNoteTarget({
                text: activeHighlight.ann.text,
                pageNumber: activeHighlight.ann.pageNumber,
                rects: activeHighlight.ann.rects
              })
              setSelectedDestNote(lastActiveNote || '')
              setActiveHighlight(null)
            }}
            title="Envoyer cet extrait vers une note"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: 'transparent',
              border: 'none',
              color: '#38bdf8',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '2px 6px'
            }}
          >
            <span>📌 Note</span>
          </button>

          {/* Copier */}
          <button
            onClick={(): void =>
              handleCopyQuote(activeHighlight.ann.text, activeHighlight.ann.pageNumber)
            }
            title="Copier la citation"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: '11px',
              cursor: 'pointer',
              padding: '2px 6px'
            }}
          >
            <span>Copier</span>
          </button>

          {/* Supprimer le surlignage */}
          <button
            onClick={(): void => handleDeleteHighlight(activeHighlight.ann.id)}
            title="Supprimer ce surlignage"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '22px',
              height: '22px',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '4px',
              color: '#f87171',
              cursor: 'pointer',
              padding: 0
            }}
          >
            <TrashIcon size={12} />
          </button>
        </div>
      )}

      {/* ── MODALE "ENVOYER VERS LA NOTE" ── */}
      {sendToNoteTarget && (
        <div
          className="pdf-modal"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999999
          }}
        >
          <div
            style={{
              width: '460px',
              maxWidth: '90vw',
              backgroundColor: '#18181b',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
              color: '#e4e4e7',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: '15px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <span>📌</span>
                <span>Insérer l&apos;extrait dans une note (p. {sendToNoteTarget.pageNumber})</span>
              </h3>
              <button
                onClick={(): void => setSendToNoteTarget(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#a1a1aa',
                  cursor: 'pointer',
                  fontSize: '16px'
                }}
              >
                ✕
              </button>
            </div>

            {/* Extrait de texte sélectionné */}
            <div
              style={{
                maxHeight: '110px',
                overflowY: 'auto',
                padding: '10px 12px',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                borderLeft: '3px solid #38bdf8',
                borderRadius: '4px',
                fontSize: '12px',
                fontStyle: 'italic',
                color: '#cbd5e1',
                lineHeight: 1.5
              }}
            >
              &quot;{sendToNoteTarget.text}&quot;
            </div>

            {/* Choix de la note cible */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#94a3b8',
                  marginBottom: '6px'
                }}
              >
                Note de destination :
              </label>

              {lastActiveNote && (
                <button
                  onClick={(): Promise<void> => handleExecuteSend(lastActiveNote)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '9px 12px',
                    backgroundColor: 'rgba(56, 189, 248, 0.1)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    borderRadius: '6px',
                    color: '#38bdf8',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginBottom: '10px'
                  }}
                >
                  <span>📌 Insérer dans la note active : {lastActiveNote.split('/').pop()}</span>
                  <span style={{ fontSize: '11px', opacity: 0.8 }}>Entrée ↵</span>
                </button>
              )}

              <select
                value={selectedDestNote}
                onChange={(e): void => setSelectedDestNote(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: '#09090b',
                  color: '#f4f4f5',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  padding: '7px 10px',
                  fontSize: '12px',
                  boxSizing: 'border-box'
                }}
              >
                <option value="">-- Choisir une autre note existante --</option>
                {allNotes
                  ?.filter((n) => !n.toLowerCase().endsWith('.pdf'))
                  .map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
              </select>
            </div>

            {/* Option créer nouvelle note */}
            <div>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}
              >
                <input
                  type="checkbox"
                  id="create-new-toggle"
                  checked={isCreatingNewNote}
                  onChange={(e): void => setIsCreatingNewNote(e.target.checked)}
                />
                <label
                  htmlFor="create-new-toggle"
                  style={{ fontSize: '12px', color: '#94a3b8', cursor: 'pointer' }}
                >
                  Créer une nouvelle note pour cet extrait
                </label>
              </div>
              {isCreatingNewNote && (
                <input
                  type="text"
                  placeholder="Nom de la note (ex: algo-seance-01.html ou note.md)"
                  value={newNoteName}
                  onChange={(e): void => setNewNoteName(e.target.value)}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    backgroundColor: '#09090b',
                    color: '#f4f4f5',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    padding: '7px 10px',
                    fontSize: '12px',
                    marginTop: '4px'
                  }}
                />
              )}
            </div>

            {/* Commentaire optionnel */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#94a3b8',
                  marginBottom: '4px'
                }}
              >
                Remarque ou note personnelle (facultatif) :
              </label>
              <input
                type="text"
                placeholder="Ex: Formule à retenir, sujet d'examen..."
                value={quoteComment}
                onChange={(e): void => setQuoteComment(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  backgroundColor: '#09090b',
                  color: '#f4f4f5',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  padding: '7px 10px',
                  fontSize: '12px'
                }}
              />
            </div>

            {/* Boutons d'action */}
            <div
              style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}
            >
              <button
                onClick={(): void => setSendToNoteTarget(null)}
                style={{
                  padding: '7px 14px',
                  backgroundColor: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  color: '#a1a1aa',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Annuler
              </button>
              <button
                onClick={(): Promise<void> => handleExecuteSend()}
                style={{
                  padding: '7px 16px',
                  backgroundColor: '#38bdf8',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#09090b',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Insérer dans la note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
