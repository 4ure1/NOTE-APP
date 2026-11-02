/**
 * Géométrie des flèches entre cartes d'un canvas (.canvas > .node) : points d'accroche au milieu des
 * bords, courbes de Bézier souples, pointe de flèche, et distance d'un point à une flèche.
 *
 * Fonction autonome (aucun import ni constante externe) : sa source est injectée dans l'iframe
 * d'aperçu (CodeWorkspace.tsx) via toString().
 */

export type CanvasSide = 'top' | 'right' | 'bottom' | 'left'
export interface CanvasBox {
  x: number
  y: number
  w: number
  h: number
}
export interface CanvasPoint {
  x: number
  y: number
}
export interface CanvasEnd {
  node: string
  side: CanvasSide
}

export interface CanvasGeometry {
  SIDES: CanvasSide[]
  anchor(box: CanvasBox, side: CanvasSide): CanvasPoint
  normal(side: CanvasSide): CanvasPoint
  nearestSide(box: CanvasBox, p: CanvasPoint): CanvasSide
  /** Tracé d'une flèche ; endSide null = extrémité libre (pendant le glisser). */
  linkPath(
    from: CanvasPoint,
    fromSide: CanvasSide,
    to: CanvasPoint,
    toSide: CanvasSide | null
  ): { line: string; head: string }
  parseEnd(value: string | null): CanvasEnd | null
  formatEnd(end: CanvasEnd): string
  /** Distance d'un point à la courbe d'un tracé produit par linkPath (Infinity si illisible). */
  distanceToLine(line: string, p: CanvasPoint): number
  contains(box: CanvasBox, p: CanvasPoint, margin: number): boolean
}

export function createCanvasGeometry(): CanvasGeometry {
  const SIDES: CanvasSide[] = ['top', 'right', 'bottom', 'left']
  const HEAD = 11

  const round = (v: number): number => Math.round(v * 10) / 10
  const fmt = (p: CanvasPoint): string => round(p.x) + ' ' + round(p.y)

  function normal(side: CanvasSide): CanvasPoint {
    if (side === 'top') return { x: 0, y: -1 }
    if (side === 'right') return { x: 1, y: 0 }
    if (side === 'bottom') return { x: 0, y: 1 }
    return { x: -1, y: 0 }
  }

  function anchor(box: CanvasBox, side: CanvasSide): CanvasPoint {
    if (side === 'top') return { x: box.x + box.w / 2, y: box.y }
    if (side === 'right') return { x: box.x + box.w, y: box.y + box.h / 2 }
    if (side === 'bottom') return { x: box.x + box.w / 2, y: box.y + box.h }
    return { x: box.x, y: box.y + box.h / 2 }
  }

  function nearestSide(box: CanvasBox, p: CanvasPoint): CanvasSide {
    let best: CanvasSide = 'top'
    let bestDist = Infinity
    for (const side of SIDES) {
      const a = anchor(box, side)
      const d = Math.hypot(a.x - p.x, a.y - p.y)
      if (d < bestDist) {
        bestDist = d
        best = side
      }
    }
    return best
  }

  function linkPath(
    from: CanvasPoint,
    fromSide: CanvasSide,
    to: CanvasPoint,
    toSide: CanvasSide | null
  ): { line: string; head: string } {
    const dist = Math.hypot(to.x - from.x, to.y - from.y)
    const pull = Math.max(30, Math.min(170, dist * 0.45))
    const n1 = normal(fromSide)
    const c1 = { x: from.x + n1.x * pull, y: from.y + n1.y * pull }
    let n2: CanvasPoint
    if (toSide) {
      n2 = normal(toSide)
    } else {
      // Extrémité libre : la courbe arrive dans l'axe du premier point de contrôle
      const dx = c1.x - to.x
      const dy = c1.y - to.y
      const len = Math.hypot(dx, dy) || 1
      n2 = { x: dx / len, y: dy / len }
    }
    const c2 = { x: to.x + n2.x * pull, y: to.y + n2.y * pull }
    // Le trait s'arrête à la base de la pointe
    const base = { x: to.x + n2.x * HEAD, y: to.y + n2.y * HEAD }
    const perp = { x: -n2.y * HEAD * 0.5, y: n2.x * HEAD * 0.5 }
    const line = 'M ' + fmt(from) + ' C ' + fmt(c1) + ' ' + fmt(c2) + ' ' + fmt(base)
    const head =
      'M ' +
      fmt(to) +
      ' L ' +
      fmt({ x: base.x + perp.x, y: base.y + perp.y }) +
      ' L ' +
      fmt({ x: base.x - perp.x, y: base.y - perp.y }) +
      ' Z'
    return { line, head }
  }

  function parseEnd(value: string | null): CanvasEnd | null {
    if (!value) return null
    const i = value.lastIndexOf(':')
    if (i <= 0) return null
    const node = value.slice(0, i).trim()
    const side = value.slice(i + 1).trim() as CanvasSide
    if (!node || SIDES.indexOf(side) === -1) return null
    return { node, side }
  }

  function formatEnd(end: CanvasEnd): string {
    return end.node + ':' + end.side
  }

  function distanceToLine(line: string, p: CanvasPoint): number {
    const nums = line
      .split(/[^0-9.eE+-]+/)
      .filter((s) => s !== '')
      .map(Number)
    if (nums.length !== 8 || nums.some((v) => isNaN(v))) return Infinity
    const [x0, y0, x1, y1, x2, y2, x3, y3] = nums
    let best = Infinity
    const STEPS = 48
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS
      const u = 1 - t
      const x = u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3
      const y = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3
      best = Math.min(best, Math.hypot(x - p.x, y - p.y))
    }
    return best
  }

  function contains(box: CanvasBox, p: CanvasPoint, margin: number): boolean {
    return (
      p.x >= box.x - margin &&
      p.x <= box.x + box.w + margin &&
      p.y >= box.y - margin &&
      p.y <= box.y + box.h + margin
    )
  }

  return {
    SIDES,
    anchor,
    normal,
    nearestSide,
    linkPath,
    parseEnd,
    formatEnd,
    distanceToLine,
    contains
  }
}
