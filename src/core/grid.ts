import { computeLayout, DEFAULT_MIN_COLUMN_WIDTH } from './geometry'
import { NodeRegistry } from './registry'
import { type RowHeightSource,RowMetrics } from './rows'
import type {
  ColumnDef,
  ColumnKey,
  GridLayout,
  GridOptions,
  RowRange,
  ScrollPosition,
} from './types'
import { isSameRange } from './virtual'

/**
 * Table geometry engine.
 *
 * Everything the engine does is synchronous: a scroll event, a resize drag or
 * a column change is reflected in the DOM within the same task. That is the
 * whole reason it writes to nodes directly instead of going through a
 * framework, where an update lands a frame later and the header visibly lags
 * behind the body.
 *
 * The markup stays with the caller. The engine only positions nodes that were
 * registered with it, so it never queries the DOM and survives re-renders.
 */
export class Grid {
  private readonly registry = new NodeRegistry()
  private readonly options: GridOptions
  private readonly resizeObserver: ResizeObserver

  private columns: ColumnDef[]
  private readonly metrics: RowMetrics
  private layoutValue: GridLayout
  private rangeValue: RowRange = { start: 0, end: 0 }
  private scroll: ScrollPosition = { scrollTop: 0, scrollLeft: 0 }
  private viewportWidth = 0
  private viewportHeight = 0
  private resizeSession: { key: ColumnKey, startX: number, startWidth: number } | null = null

  constructor(options: GridOptions) {
    this.options = options
    this.columns = options.columns
    this.metrics = new RowMetrics(options.rowHeight, options.rowCount)

    this.measureViewport()
    this.layoutValue = this.computeLayout()

    this.resizeObserver = new ResizeObserver(() => this.handleViewportResize())
    this.resizeObserver.observe(options.root)

    options.verticalScrollbar?.addEventListener('scroll', this.handleScroll)
    options.horizontalScrollbar?.addEventListener('scroll', this.handleScroll)

    this.updateRange()
    this.apply()
  }

  get layout(): GridLayout {
    return this.layoutValue
  }

  get range(): RowRange {
    return this.rangeValue
  }

  get contentWidth(): number {
    return this.layoutValue.flowWidth
  }

  get contentHeight(): number {
    return this.metrics.totalHeight
  }

  get scrollPosition(): ScrollPosition {
    return this.scroll
  }

  /* registration */

  registerHeaderCell(element: HTMLElement | null, key: ColumnKey): void {
    this.registry.setHeaderCell(key, element)
    if (element) this.applyHeaderCell(element, key)
  }

  registerRow(element: HTMLElement | null, index: number): void {
    this.registry.setRow(index, element)
    if (element) this.applyRow(element, index)
  }

  registerCell(element: HTMLElement | null, rowIndex: number, key: ColumnKey): void {
    this.registry.setCell(rowIndex, key, element)
    if (element) this.applyCell(element, key)
  }

  /* input */

  setColumns(columns: ColumnDef[]): void {
    this.columns = columns
    this.layoutValue = this.computeLayout()
    this.apply()
  }

  setRowCount(rowCount: number): void {
    this.metrics.setCount(rowCount)
    this.updateRange()
    this.apply()
  }

  setRowHeightSource(source: RowHeightSource): void {
    this.metrics.setSource(source)
    this.updateRange()
    this.apply()
  }

  /**
   * Overrides the height of one row, typically after measuring it.
   * Rows below shift accordingly, within the same task.
   */
  setRowHeight(index: number, height: number): void {
    if (!this.metrics.setRowHeight(index, height)) return

    this.updateRange()
    this.apply()
  }

  rowOffset(index: number): number {
    return this.metrics.offsetOf(index)
  }

  rowHeight(index: number): number {
    return this.metrics.heightOf(index)
  }

  getColumnWidths(): Record<ColumnKey, number> {
    return Object.fromEntries(this.layoutValue.columns.map((column) => [column.key, column.width]))
  }

  scrollToRow(index: number): void {
    const scrollbar = this.options.verticalScrollbar
    if (scrollbar) scrollbar.scrollTop = this.metrics.offsetOf(index)
  }

  /* column resizing */

  /**
   * Starts a drag on a column edge. Width follows the pointer within the same
   * event, so the edge never trails behind the cursor.
   */
  startColumnResize(key: ColumnKey, event: PointerEvent): void {
    const column = this.layoutValue.columns.find((item) => item.key === key)
    if (!column) return

    this.resizeSession = { key, startX: event.clientX, startWidth: column.width }
    event.preventDefault()

    window.addEventListener('pointermove', this.handleResizeMove)
    window.addEventListener('pointerup', this.handleResizeEnd, { once: true })
  }

  private readonly handleResizeMove = (event: PointerEvent): void => {
    const session = this.resizeSession
    if (!session) return

    const minWidth = this.options.minColumnWidth ?? DEFAULT_MIN_COLUMN_WIDTH
    const width = Math.max(session.startWidth + (event.clientX - session.startX), minWidth)

    this.columns = this.columns.map((column) =>
      column.key === session.key ? { ...column, width } : column,
    )

    this.layoutValue = this.computeLayout()
    this.apply()
  }

  private readonly handleResizeEnd = (): void => {
    const session = this.resizeSession
    window.removeEventListener('pointermove', this.handleResizeMove)
    this.resizeSession = null

    if (!session) return

    const column = this.layoutValue.columns.find((item) => item.key === session.key)
    if (column) this.options.onColumnResize?.(session.key, column.width)
  }

  /* scrolling */

  private readonly handleScroll = (): void => {
    const { verticalScrollbar, horizontalScrollbar } = this.options

    this.scroll = {
      scrollTop: verticalScrollbar?.scrollTop ?? 0,
      scrollLeft: horizontalScrollbar?.scrollLeft ?? 0,
    }

    this.updateRange()
    this.apply()
    this.options.onScroll?.(this.scroll)
  }

  private updateRange(): void {
    const next = this.metrics.rangeFor(
      this.scroll.scrollTop,
      this.viewportHeight,
      this.options.overscan,
    )

    if (isSameRange(next, this.rangeValue)) return

    this.rangeValue = next
    this.options.onRangeChange?.(next)
  }

  /* layout application */

  private computeLayout(): GridLayout {
    return computeLayout(this.columns, this.viewportWidth, this.options.minColumnWidth)
  }

  private measureViewport(): void {
    const rect = this.options.root.getBoundingClientRect()
    this.viewportWidth = rect.width
    this.viewportHeight = rect.height
  }

  private handleViewportResize(): void {
    this.measureViewport()
    this.layoutValue = this.computeLayout()
    this.updateRange()
    this.apply()
  }

  /** Writes the current geometry into every registered node, synchronously. */
  apply(): void {
    const { body, headerRow } = this.options

    if (body) body.style.transform = `translateX(${-this.scroll.scrollLeft}px)`
    if (headerRow) headerRow.style.transform = `translateX(${-this.scroll.scrollLeft}px)`

    this.registry.headerCells.forEach((element, key) => this.applyHeaderCell(element, key))
    this.registry.rows.forEach((element, index) => this.applyRow(element, index))
    this.registry.eachCell((element, key) => this.applyCell(element, key))
  }

  /**
   * Pinned columns must stay put while the flow scrolls, so they cancel out the
   * container shift instead of being moved into a separate scrolling layer.
   */
  private offsetOf(key: ColumnKey): number | null {
    const column = this.layoutValue.columns.find((item) => item.key === key)
    if (!column) return null

    if (column.pinned === 'left') return this.scroll.scrollLeft + column.left

    if (column.pinned === 'right') {
      const zoneStart = this.viewportWidth - this.layoutValue.rightWidth
      return this.scroll.scrollLeft + zoneStart + column.left
    }

    return column.left
  }

  private applyCell(element: HTMLElement, key: ColumnKey): void {
    const column = this.layoutValue.columns.find((item) => item.key === key)
    const offset = this.offsetOf(key)
    if (!column || offset === null) return

    element.style.transform = `translateX(${offset}px)`
    element.style.width = `${column.width}px`
  }

  private applyHeaderCell(element: HTMLElement, key: ColumnKey): void {
    this.applyCell(element, key)
  }

  private applyRow(element: HTMLElement, index: number): void {
    const top = this.metrics.offsetOf(index) - this.scroll.scrollTop
    element.style.transform = `translateY(${top}px)`
    element.style.height = `${this.metrics.heightOf(index)}px`
  }

  destroy(): void {
    this.resizeObserver.disconnect()
    this.options.verticalScrollbar?.removeEventListener('scroll', this.handleScroll)
    this.options.horizontalScrollbar?.removeEventListener('scroll', this.handleScroll)
    window.removeEventListener('pointermove', this.handleResizeMove)
    window.removeEventListener('pointerup', this.handleResizeEnd)
    this.registry.clear()
  }
}

export function createGrid(options: GridOptions): Grid {
  return new Grid(options)
}
