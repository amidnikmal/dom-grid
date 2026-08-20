export type ColumnKey = string

/** Which edge a column is pinned to, if any. */
export type Pinned = 'left' | 'right'

export interface ColumnDef {
  key: ColumnKey
  /** Pixels, or 'auto' to share the leftover space. Defaults to 'auto'. */
  width?: number | 'auto'
  minWidth?: number
  maxWidth?: number
  pinned?: Pinned
  resizable?: boolean
}

/** Resolved geometry of a column. Offsets are relative to the column's own zone. */
export interface ColumnLayout {
  key: ColumnKey
  width: number
  left: number
  pinned?: Pinned
}

export interface GridLayout {
  columns: ColumnLayout[]
  /** Total width of the scrollable zone, pinned columns excluded. */
  flowWidth: number
  leftWidth: number
  rightWidth: number
}

export interface RowRange {
  start: number
  /** Exclusive. */
  end: number
}

export interface ScrollPosition {
  scrollTop: number
  scrollLeft: number
}

export interface GridElements {
  /** Viewport that clips the table and receives wheel and touch input. */
  root: HTMLElement
  body: HTMLElement
  /**
   * Element whose size defines the space columns are laid out in.
   * Defaults to root; pass the body when scrollbars overlay it, otherwise
   * columns are sized to a width the content never actually gets.
   */
  viewport?: HTMLElement
  headerRow?: HTMLElement
  verticalScrollbar?: HTMLElement
  horizontalScrollbar?: HTMLElement
}

export interface GridOptions extends GridElements {
  columns: ColumnDef[]
  /** A number for uniform rows, or a function for variable ones. */
  rowHeight: number | ((index: number) => number)
  rowCount: number
  /** Extra rows rendered beyond the viewport on each side. */
  overscan?: number
  minColumnWidth?: number
  /** Wheel and touch scrolling, on by default. */
  wheel?: boolean
  onRangeChange?: (range: RowRange) => void
  /** Fires whenever column geometry changes, including during a resize drag. */
  onLayoutChange?: (layout: GridLayout) => void
  onRowDragStart?: (index: number) => void
  /** Fires while dragging, whenever the drop position changes. */
  onRowDragMove?: (from: number, to: number) => void
  /** Fires on release. Reordering the data is up to the caller. */
  onRowDrop?: (from: number, to: number) => void
  onColumnResize?: (key: ColumnKey, width: number) => void
  onScroll?: (position: ScrollPosition) => void
}
