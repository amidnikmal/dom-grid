import type { RowRange } from './types'

/**
 * Which rows have to exist in the DOM for the current scroll position.
 * Overscan keeps a few rows beyond the viewport so fast scrolling does not
 * expose gaps before the next range is applied.
 */
export function computeRange(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  rowCount: number,
  overscan = 4,
): RowRange {
  if (rowHeight <= 0 || rowCount <= 0) return { start: 0, end: 0 }

  const first = Math.floor(scrollTop / rowHeight)
  const visible = Math.ceil(viewportHeight / rowHeight)

  const start = Math.max(first - overscan, 0)
  const end = Math.min(first + visible + overscan, rowCount)

  return { start, end: Math.max(end, start) }
}

export function isSameRange(a: RowRange, b: RowRange): boolean {
  return a.start === b.start && a.end === b.end
}
