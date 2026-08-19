import type { RowRange } from './types'

export type RowHeightSource = number | ((index: number) => number)

/**
 * Row offsets along the vertical axis.
 *
 * A uniform height needs no bookkeeping: an offset is a multiplication. Once
 * heights differ, offsets are kept as a prefix sum, so a lookup stays a binary
 * search instead of a walk over every row above.
 */
export class RowMetrics {
  private source: RowHeightSource
  private count: number
  /** Prefix sums, built lazily and only for variable heights. */
  private offsets: number[] = []
  private overrides = new Map<number, number>()

  constructor(source: RowHeightSource, count: number) {
    this.source = source
    this.count = count
    this.rebuild()
  }

  get uniform(): boolean {
    return typeof this.source === 'number' && this.overrides.size === 0
  }

  get rowCount(): number {
    return this.count
  }

  setCount(count: number): void {
    this.count = count
    this.rebuild()
  }

  setSource(source: RowHeightSource): void {
    this.source = source
    this.overrides.clear()
    this.rebuild()
  }

  /** Replaces the height of a single row, e.g. after measuring it in the DOM. */
  setRowHeight(index: number, height: number): boolean {
    if (this.heightOf(index) === height) return false

    this.overrides.set(index, height)
    this.rebuild()

    return true
  }

  heightOf(index: number): number {
    const override = this.overrides.get(index)
    if (override !== undefined) return override

    return typeof this.source === 'number' ? this.source : this.source(index)
  }

  offsetOf(index: number): number {
    if (this.uniform) return index * (this.source as number)

    const clamped = Math.min(Math.max(index, 0), this.count)
    return this.offsets[clamped] ?? 0
  }

  get totalHeight(): number {
    return this.uniform ? this.count * (this.source as number) : (this.offsets[this.count] ?? 0)
  }

  /** Index of the row covering the given offset. */
  indexAt(offset: number): number {
    if (this.count <= 0) return 0

    if (this.uniform) {
      const height = this.source as number
      return height > 0 ? Math.min(Math.floor(offset / height), this.count - 1) : 0
    }

    let low = 0
    let high = this.count - 1

    while (low < high) {
      const middle = (low + high) >> 1
      if ((this.offsets[middle + 1] ?? 0) <= offset) low = middle + 1
      else high = middle
    }

    return low
  }

  /** Rows that must exist in the DOM for the given viewport. */
  rangeFor(scrollTop: number, viewportHeight: number, overscan = 4): RowRange {
    if (this.count <= 0) return { start: 0, end: 0 }

    const first = this.indexAt(scrollTop)
    const bottom = scrollTop + viewportHeight

    let last = first
    while (last < this.count && this.offsetOf(last) < bottom) last++

    return {
      start: Math.max(first - overscan, 0),
      end: Math.min(last + overscan, this.count),
    }
  }

  private rebuild(): void {
    if (this.uniform) {
      this.offsets = []
      return
    }

    this.offsets = new Array(this.count + 1)
    this.offsets[0] = 0

    for (let index = 0; index < this.count; index++) {
      this.offsets[index + 1] = (this.offsets[index] ?? 0) + this.heightOf(index)
    }
  }
}
