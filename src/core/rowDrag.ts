import type { RowMetrics } from './rows'

export interface DropTarget {
  /** Index the dragged row would land on. */
  index: number
  /** Whether the pointer sits in the upper or lower half of that row. */
  half: 'top' | 'bottom'
}

/**
 * Which row the pointer is over, in content coordinates.
 * Works with the metrics rather than the DOM, so variable heights and
 * scrolling are handled the same way.
 */
export function dropTargetAt(
  contentY: number,
  metrics: RowMetrics,
): DropTarget {
  const index = metrics.indexAt(Math.max(contentY, 0))
  const top = metrics.offsetOf(index)
  const half = contentY - top < metrics.heightOf(index) / 2 ? 'top' : 'bottom'

  return { index, half }
}

/**
 * Final index for a move, expressed the way arrays behave after a splice.
 * Dropping on the lower half of a row means landing after it, and removing the
 * dragged row first shifts everything below it up by one.
 */
export function resolveDropIndex(from: number, target: DropTarget, rowCount: number): number {
  const raw = target.half === 'bottom' ? target.index + 1 : target.index
  const adjusted = raw > from ? raw - 1 : raw

  return Math.min(Math.max(adjusted, 0), Math.max(rowCount - 1, 0))
}

/**
 * How far a row shifts while another one is dragged over it: rows between the
 * source and the target move by one row height to open a gap.
 */
export function reorderShift(index: number, from: number, to: number, height: number): number {
  if (index === from) return 0

  if (from < to && index > from && index <= to) return -height
  if (from > to && index >= to && index < from) return height

  return 0
}

/** Distance-based autoscroll speed, in pixels per frame. */
export function autoScrollSpeed(pointerY: number, top: number, bottom: number, zone = 40): number {
  if (pointerY < top + zone) return -Math.ceil((top + zone - pointerY) / 4)
  if (pointerY > bottom - zone) return Math.ceil((pointerY - (bottom - zone)) / 4)

  return 0
}
