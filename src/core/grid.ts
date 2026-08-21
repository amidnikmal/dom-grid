import { computeLayout, DEFAULT_MIN_COLUMN_WIDTH } from './geometry'
import { NodeRegistry } from './registry'
import {
  autoScrollSpeed,
  type DropTarget,
  dropTargetAt,
  reorderShift,
  resolveDropIndex,
} from './rowDrag'
import { type RowHeightSource, RowMetrics } from './rows'
import type {
  ColumnDef,
  ColumnKey,
  GridLayout,
  GridOptions,
  Pinned,
  RowLayer,
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
  /**
   * Widths produced by dragging a column edge. Kept apart from the column
   * definitions so that a structural update from the caller does not silently
   * throw away what the user resized by hand.
   */
  private readonly widthOverrides = new Map<ColumnKey, number>()
  private readonly metrics: RowMetrics
  private layoutValue: GridLayout
  private rangeValue: RowRange = { start: 0, end: 0 }
  private scroll: ScrollPosition = { scrollTop: 0, scrollLeft: 0 }
  private viewportWidth = 0
  private viewportHeight = 0
  private resizeSession: { key: ColumnKey, startX: number, startWidth: number } | null = null
  private dragSession: {
    from: number
    pointerY: number
    offsetInRow: number
    target: DropTarget
  } | null = null
  private autoScrollFrame = 0
  private rangeFrame = 0

  constructor(options: GridOptions) {
    this.options = options
    this.columns = options.columns
    this.metrics = new RowMetrics(options.rowHeight, options.rowCount)

    this.measureViewport()
    this.layoutValue = this.computeLayout()

    this.resizeObserver = new ResizeObserver(() => this.handleViewportResize())
    this.resizeObserver.observe(options.viewport ?? options.root)

    options.verticalScrollbar?.addEventListener('scroll', this.handleScroll)
    options.horizontalScrollbar?.addEventListener('scroll', this.handleScroll)

    // A native scroller already handles the wheel; intercepting it would
    // fight the browser instead of helping.
    if (options.wheel !== false && options.scrollMode !== 'native') {
      options.root.addEventListener('wheel', this.handleWheel, { passive: false })
      options.root.addEventListener('touchstart', this.handleTouchStart, { passive: true })
      options.root.addEventListener('touchmove', this.handleTouchMove, { passive: false })
    }

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
    // With strips of their own, pinned columns are outside the scrolling area
    // and take no width from it.
    if (this.pinnedOutside) return this.layoutValue.flowWidth

    // Otherwise the pinned zones sit above the flow, and the scrollable width
    // has to include them: otherwise the last flow column can never be
    // scrolled into view.
    return this.layoutValue.leftWidth + this.layoutValue.flowWidth + this.layoutValue.rightWidth
  }

  get contentHeight(): number {
    return this.metrics.totalHeight
  }

  private get native(): boolean {
    return this.options.scrollMode === 'native'
  }

  /** Whether the scroller carries the header itself. */
  private get headerScrolls(): boolean {
    const { headerRow, viewport, root } = this.options
    const scroller = this.native ? (viewport ?? root) : undefined

    return Boolean(headerRow && scroller?.contains(headerRow))
  }

  /** Diagnostics: registered nodes whose place no longer matches. Always 0. */
  get staleRecords(): number {
    return this.registry.countStale()
  }

  /** Diagnostics: width the layout is computed in. */
  get measuredWidth(): number {
    return this.viewportWidth
  }

  get scrollPosition(): ScrollPosition {
    return this.scroll
  }

  /* registration */

  registerHeaderCell(element: HTMLElement | null, key: ColumnKey): void {
    this.registry.setHeaderCell(key, element)
    if (element) this.applyHeaderCell(element, key)
  }

  registerRow(element: HTMLElement | null, index: number, layer: RowLayer = 'flow'): void {
    this.registry.setRow(index, element, layer)
    if (element) this.applyRow(element, index, layer)
  }

  registerCell(element: HTMLElement | null, rowIndex: number, key: ColumnKey): void {
    this.registry.setCell(rowIndex, key, element)
    if (element) this.applyCell(element, key)
  }

  /* input */

  /**
   * Strips may come and go with the columns they hold: a pinned column can be
   * hidden, and the whole side goes away with it. Told about it, the engine
   * changes what the scrolling area is; left unaware, it would keep reserving
   * room for a zone that no longer exists.
   */
  setPinnedLayers(left?: HTMLElement, right?: HTMLElement): void {
    if (this.options.pinnedLeftLayer === left && this.options.pinnedRightLayer === right) return

    this.options.pinnedLeftLayer = left
    this.options.pinnedRightLayer = right
    this.updateLayout()
    this.apply()
  }

  setColumns(columns: ColumnDef[]): void {
    this.columns = columns
    this.updateLayout()
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

  /** Drops hand-resized widths, so columns fall back to their definitions. */
  resetColumnWidths(key?: ColumnKey): void {
    if (key === undefined) this.widthOverrides.clear()
    else this.widthOverrides.delete(key)

    this.updateLayout()
    this.apply()
  }

  /** Widths that differ from the column definitions, for persisting them. */
  getResizedWidths(): Record<ColumnKey, number> {
    return Object.fromEntries(this.widthOverrides)
  }

  /** Restores widths saved earlier, e.g. from user settings. */
  setResizedWidths(widths: Record<ColumnKey, number>): void {
    Object.entries(widths).forEach(([key, width]) => this.widthOverrides.set(key, width))

    this.updateLayout()
    this.apply()
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
    if (!column || this.columns.find((item) => item.key === key)?.resizable === false) return

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

    this.widthOverrides.set(session.key, width)
    this.updateLayout()
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

  /* row dragging */

  get draggingRow(): number | null {
    return this.dragSession?.from ?? null
  }

  /**
   * Starts dragging a row. The engine moves the row under the pointer, opens a
   * gap at the drop position and scrolls when the pointer nears an edge.
   * Reordering the data itself is left to the caller via onRowDrop.
   */
  startRowDrag(index: number, event: PointerEvent): void {
    const rowTop = this.dragOrigin().top + this.metrics.offsetOf(index) - this.scroll.scrollTop

    this.dragSession = {
      from: index,
      pointerY: event.clientY,
      offsetInRow: event.clientY - rowTop,
      target: { index, half: 'top' },
    }

    event.preventDefault()
    this.options.onRowDragStart?.(index)

    window.addEventListener('pointermove', this.handleDragMove)
    window.addEventListener('pointerup', this.handleDragEnd, { once: true })

    this.apply()
  }

  /**
   * The element the pointer is measured against: the one that stays put on
   * screen. With a native scroller that is the viewport, while the body inside
   * it moves with the content; in overlay mode the body is the one that stays.
   * Measuring against a moving element would count the scroll twice.
   */
  private dragOrigin(): DOMRect {
    const element = this.native
      ? (this.options.viewport ?? this.options.root)
      : this.options.body

    return element.getBoundingClientRect()
  }

  private contentYOf(pointerY: number): number {
    return pointerY - this.dragOrigin().top + this.scroll.scrollTop
  }

  private readonly handleDragMove = (event: PointerEvent): void => {
    const session = this.dragSession
    if (!session) return

    session.pointerY = event.clientY

    const rect = this.dragOrigin()
    const target = dropTargetAt(this.contentYOf(event.clientY), this.metrics)

    if (target.index !== session.target.index || target.half !== session.target.half) {
      session.target = target
      this.options.onRowDragMove?.(session.from, resolveDropIndex(session.from, target, this.metrics.rowCount))
    }

    this.scheduleAutoScroll(rect.top, rect.bottom)
    this.apply()
  }

  private readonly handleDragEnd = (): void => {
    const session = this.dragSession
    window.removeEventListener('pointermove', this.handleDragMove)
    cancelAnimationFrame(this.autoScrollFrame)
    this.autoScrollFrame = 0
    this.dragSession = null

    if (session) {
      const to = resolveDropIndex(session.from, session.target, this.metrics.rowCount)
      this.options.onRowDrop?.(session.from, to)
    }

    this.apply()
  }

  /** Autoscroll is inherently per-frame, so it is the one place using rAF. */
  private scheduleAutoScroll(top: number, bottom: number): void {
    if (this.autoScrollFrame) return

    const step = () => {
      const session = this.dragSession
      const scrollbar = this.options.verticalScrollbar
      if (!session || !scrollbar) {
        this.autoScrollFrame = 0
        return
      }

      const speed = autoScrollSpeed(session.pointerY, top, bottom)
      if (speed !== 0) scrollbar.scrollTop += speed

      this.autoScrollFrame = requestAnimationFrame(step)
    }

    this.autoScrollFrame = requestAnimationFrame(step)
  }

  /* wheel and touch */

  /** Pixel deltas: a wheel may report lines or pages instead. */
  private static readonly LINE_HEIGHT = 16
  private static readonly PAGE_HEIGHT = 400

  private toPixels(delta: number, mode: number): number {
    if (mode === 1) return delta * Grid.LINE_HEIGHT
    if (mode === 2) return delta * Grid.PAGE_HEIGHT

    return delta
  }

  private scrollBy(dx: number, dy: number): boolean {
    const vertical = this.options.verticalScrollbar
    const horizontal = this.options.horizontalScrollbar
    let moved = false

    if (vertical && dy) {
      const before = vertical.scrollTop
      vertical.scrollTop += dy
      moved ||= vertical.scrollTop !== before
    }

    if (horizontal && dx) {
      const before = horizontal.scrollLeft
      horizontal.scrollLeft += dx
      moved ||= horizontal.scrollLeft !== before
    }

    return moved
  }

  private readonly handleWheel = (event: WheelEvent): void => {
    const dy = this.toPixels(event.deltaY, event.deltaMode)
    const dx = this.toPixels(event.deltaX, event.deltaMode)

    // Shift turns a vertical wheel into horizontal scrolling, as elsewhere.
    const moved = event.shiftKey && !dx
      ? this.scrollBy(dy, 0)
      : this.scrollBy(dx, dy)

    // Only swallow the event when the table actually moved, so a table
    // scrolled to its end still lets the page scroll.
    if (moved) event.preventDefault()
  }

  private touchAnchor: { x: number, y: number } | null = null

  private readonly handleTouchStart = (event: TouchEvent): void => {
    const touch = event.touches[0]
    this.touchAnchor = touch ? { x: touch.clientX, y: touch.clientY } : null
  }

  private readonly handleTouchMove = (event: TouchEvent): void => {
    const touch = event.touches[0]
    const anchor = this.touchAnchor
    if (!touch || !anchor) return

    const moved = this.scrollBy(anchor.x - touch.clientX, anchor.y - touch.clientY)
    this.touchAnchor = { x: touch.clientX, y: touch.clientY }

    if (moved) event.preventDefault()
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
    const window = this.metrics.rangeFor(
      this.scroll.scrollTop,
      this.viewportHeight,
      this.options.overscan,
    )

    // A dragged row must stay rendered even when autoscroll carries the
    // viewport away from it, otherwise the pointer ends up holding nothing.
    const dragged = this.dragSession?.from
    const next = dragged === undefined
      ? window
      : {
          start: Math.min(window.start, dragged),
          end: Math.max(window.end, dragged + 1),
        }

    if (isSameRange(next, this.rangeValue)) return

    this.rangeValue = next

    // Positions are written synchronously, but which rows exist is a job for
    // the framework: a browser delivers scroll events in bursts, and telling
    // it to rebuild the list several times per frame is wasted work.
    if (this.rangeFrame) return

    this.rangeFrame = requestAnimationFrame(() => {
      this.rangeFrame = 0
      this.options.onRangeChange?.(this.rangeValue)
    })
  }

  /* layout application */

  private computeLayout(): GridLayout {
    const columns = this.widthOverrides.size
      ? this.columns.map((column) => {
          const width = this.widthOverrides.get(column.key)
          return width === undefined ? column : { ...column, width }
        })
      : this.columns

    return computeLayout(
      columns,
      this.viewportWidth,
      this.options.minColumnWidth,
      this.pinnedOutside,
    )
  }

  /**
   * A zero-sized viewport means the measurement happened before styles
   * applied. Living with it would leave the table empty, so the size is
   * taken again on the next frame.
   */
  private remeasureFrame = 0

  private scheduleRemeasure(): void {
    if (this.remeasureFrame || !this.options.root.isConnected) return

    this.remeasureFrame = requestAnimationFrame(() => {
      this.remeasureFrame = 0
      this.handleViewportResize()
    })
  }

  private measureViewport(): void {
    // Scrollbars usually overlay the body, so the space available to columns is
    // smaller than the root: measuring the root would size columns to a width
    // the content never gets.
    const element = this.options.viewport ?? this.options.root
    const rect = element.getBoundingClientRect()

    // A native scroller keeps its scrollbars inside itself, and the client box
    // is what is left for the content. Measuring the border box instead would
    // size columns a scrollbar wider than the space they get, and the table
    // would scroll sideways by those few pixels for no reason at all.
    const client = this.native
      ? { width: element.clientWidth, height: element.clientHeight }
      : { width: 0, height: 0 }

    this.viewportWidth = client.width || rect.width
    this.viewportHeight = client.height || rect.height

    if (!this.viewportHeight || !this.viewportWidth) this.scheduleRemeasure()
  }

  private handleViewportResize(): void {
    this.measureViewport()
    this.updateLayout()
    this.updateRange()
    this.apply()
  }

  /** Recomputes column geometry and tells the caller its sizes moved. */
  private updateLayout(): void {
    this.layoutValue = this.computeLayout()
    this.options.onLayoutChange?.(this.layoutValue)
  }

  /** Writes the current geometry into every registered node, synchronously. */
  apply(): void {
    const { body, headerRow } = this.options

    // In native mode the container scrolls itself, so only the header, which
    // sits outside it, has to be nudged. A header placed inside the scroller
    // is carried by the browser like everything else, and nudging it would
    // shift it twice over.
    if (body && !this.native) body.style.transform = `translateX(${-this.scroll.scrollLeft}px)`
    if (headerRow && !this.headerScrolls) {
      headerRow.style.transform = `translateX(${-this.scroll.scrollLeft}px)`
    }

    this.applyLayers()
    this.registry.headerCells.forEach((element, key) => this.applyHeaderCell(element, key))
    this.registry.eachRow((element, index, layer) => this.applyRow(element, index, layer))
    this.registry.eachCell((element, key) => this.applyCell(element, key))
  }

  /** The strip a pinned column lives in, if the caller supplied one. */
  private layerOf(pinned: Pinned): HTMLElement | undefined {
    return pinned === 'left' ? this.options.pinnedLeftLayer : this.options.pinnedRightLayer
  }

  /**
   * Whether pinned columns are drawn in strips of their own. Then the scrolling
   * area holds the flow and nothing else: it neither reserves room for the
   * pinned zones nor lets the flow slide underneath them, so the scrollbars the
   * browser draws for it stay between the pinned columns.
   */
  private get pinnedOutside(): boolean {
    return Boolean(this.options.pinnedLeftLayer || this.options.pinnedRightLayer)
  }

  /**
   * Pinned columns must stay put while the flow scrolls. Given a strip of their
   * own they simply sit at their offset inside it and never move; without one
   * they cancel out the container shift, which is the only thing a single
   * scrolling layer allows.
   */
  private offsetOf(key: ColumnKey): number | null {
    const column = this.layoutValue.columns.find((item) => item.key === key)
    if (!column) return null

    if (column.pinned && this.layerOf(column.pinned)) return column.left

    if (column.pinned === 'left') return this.scroll.scrollLeft + column.left

    if (column.pinned === 'right') {
      const zoneStart = this.viewportWidth - this.layoutValue.rightWidth
      return this.scroll.scrollLeft + zoneStart + column.left
    }

    // The scrolling area is the flow's own, so the flow starts at its very
    // beginning; nothing has to be reserved for the pinned zones.
    if (this.pinnedOutside) return column.left

    // Otherwise the flow starts after the left zone, so nothing hides
    // underneath it while the table is scrolled to the very left.
    return this.layoutValue.leftWidth + column.left
  }

  /**
   * Strips are only ever sized here. Where they sit is the page's business —
   * anything the engine wrote would have to be rewritten on every scroll event,
   * which is exactly the lag the strips exist to avoid.
   */
  private applyLayers(): void {
    const { pinnedLeftLayer, pinnedRightLayer } = this.options

    if (pinnedLeftLayer) pinnedLeftLayer.style.width = `${this.layoutValue.leftWidth}px`
    if (pinnedRightLayer) pinnedRightLayer.style.width = `${this.layoutValue.rightWidth}px`
  }

  private applyCell(element: HTMLElement, key: ColumnKey): void {
    const column = this.layoutValue.columns.find((item) => item.key === key)
    const offset = this.offsetOf(key)
    if (!column || offset === null) return

    element.style.transform = `translateX(${offset}px)`
    element.style.width = `${column.width}px`
    // Pinned columns stay above the flow they overlap.
    element.style.zIndex = column.pinned ? '1' : '0'
  }

  private applyHeaderCell(element: HTMLElement, key: ColumnKey): void {
    this.applyCell(element, key)
  }

  /**
   * Whether the browser moves this strip's rows by itself. A strip placed
   * outside the scroller does not move at all — which is the point of it, and
   * the reason its rows have to be told where the scroll has got to.
   */
  private layerScrolls(layer: RowLayer): boolean {
    if (!this.native) return false
    if (layer === 'flow') return true

    const strip = this.layerOf(layer === 'left' ? 'left' : 'right')
    const scroller = this.options.viewport ?? this.options.root

    return !strip || scroller.contains(strip)
  }

  private applyRow(element: HTMLElement, index: number, layer: RowLayer = 'flow'): void {
    const base = this.metrics.offsetOf(index) - (this.layerScrolls(layer) ? 0 : this.scroll.scrollTop)
    const top = base + this.dragOffsetOf(index, element)

    element.style.transform = `translateY(${top}px)`
    element.style.height = `${this.metrics.heightOf(index)}px`
  }

  /** The dragged row follows the pointer, the rest step aside to open a gap. */
  private dragOffsetOf(index: number, element: HTMLElement): number {
    const session = this.dragSession
    if (!session) {
      element.removeAttribute('data-dragging')
      return 0
    }

    if (index === session.from) {
      element.setAttribute('data-dragging', '')

      // Both modes want the row to sit where the pointer holds it; the
      // difference between content and screen coordinates cancels out.
      const wanted = this.contentYOf(session.pointerY) - session.offsetInRow

      return wanted - this.metrics.offsetOf(index)
    }

    element.removeAttribute('data-dragging')

    const to = resolveDropIndex(session.from, session.target, this.metrics.rowCount)
    return reorderShift(index, session.from, to, this.metrics.heightOf(session.from))
  }

  destroy(): void {
    cancelAnimationFrame(this.rangeFrame)
    cancelAnimationFrame(this.remeasureFrame)
    this.options.root.removeEventListener('wheel', this.handleWheel)
    this.options.root.removeEventListener('touchstart', this.handleTouchStart)
    this.options.root.removeEventListener('touchmove', this.handleTouchMove)
    cancelAnimationFrame(this.autoScrollFrame)
    window.removeEventListener('pointermove', this.handleDragMove)
    window.removeEventListener('pointerup', this.handleDragEnd)
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
