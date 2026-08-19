import {
  computed,
  type ComputedRef,
  onBeforeUnmount,
  onMounted,
  type Ref,
  ref,
  shallowRef,
  watch,
} from 'vue'

import {
  type ColumnDef,
  type ColumnKey,
  createGrid,
  type Grid,
  type RowHeightSource,
  type RowId,
  type RowRange,
  SelectionModel,
  type SelectionOptions,
  type SortDirection,
  type SortEntry,
  type SortOptions,
  SortState,
} from '../../core/index'

export interface UseGridConfig<Row> {
  columns: () => ColumnDef[]
  rows: () => Row[]
  rowHeight: () => RowHeightSource
  overscan?: number
  minColumnWidth?: number
  rowKey?: (row: Row, index: number) => string | number
  onColumnResize?: (key: ColumnKey, width: number) => void
  onRowDragStart?: (index: number) => void
  onRowDragMove?: (from: number, to: number) => void
  /** Fires on release. Reordering the data is up to the caller. */
  onRowDrop?: (from: number, to: number) => void
}

export interface VisibleRow<Row> {
  index: number
  id: string | number
  data: Row
}

export interface UseGrid<Row> {
  grid: Ref<Grid | null>
  rootRef: Ref<HTMLElement | undefined>
  bodyRef: Ref<HTMLElement | undefined>
  headerRef: Ref<HTMLElement | undefined>
  vScrollRef: Ref<HTMLElement | undefined>
  hScrollRef: Ref<HTMLElement | undefined>
  visibleRows: ComputedRef<VisibleRow<Row>[]>
  contentWidth: Ref<number>
  contentHeight: Ref<number>
  registerHeaderCell: (element: unknown, key: ColumnKey) => void
  registerRow: (element: unknown, index: number) => void
  registerCell: (element: unknown, index: number, key: ColumnKey) => void
}

function asElement(value: unknown): HTMLElement | null {
  if (value instanceof HTMLElement) return value

  // Component instances expose their root node through $el.
  const root = (value as { $el?: unknown } | null)?.$el
  return root instanceof HTMLElement ? root : null
}

/**
 * Wires a grid to the elements of the surrounding template.
 *
 * The engine positions nodes synchronously; Vue only decides which rows and
 * columns exist. Nodes are handed over through ref callbacks, so nothing is
 * ever looked up in the DOM.
 */
export function useGrid<Row>(config: UseGridConfig<Row>): UseGrid<Row> {
  const grid = shallowRef<Grid | null>(null)

  const rootRef = ref<HTMLElement>()
  const bodyRef = ref<HTMLElement>()
  const headerRef = ref<HTMLElement>()
  const vScrollRef = ref<HTMLElement>()
  const hScrollRef = ref<HTMLElement>()

  const range = ref<RowRange>({ start: 0, end: 0 })
  const contentWidth = ref(0)

  const contentHeight = ref(0)

  // Sizes come from the engine: with variable row heights they are not a
  // multiplication, and only the engine keeps the running totals.
  const syncSizes = () => {
    contentWidth.value = grid.value?.contentWidth ?? 0
    contentHeight.value = grid.value?.contentHeight ?? 0
  }

  const visibleRows = computed<VisibleRow<Row>[]>(() => {
    const rows = config.rows()
    const result: VisibleRow<Row>[] = []

    for (let index = range.value.start; index < range.value.end; index++) {
      const data = rows[index]
      if (!data) continue

      result.push({ index, data, id: config.rowKey?.(data, index) ?? index })
    }

    return result
  })

  onMounted(() => {
    if (!rootRef.value || !bodyRef.value) return

    const instance = createGrid({
      root: rootRef.value,
      body: bodyRef.value,
      headerRow: headerRef.value,
      verticalScrollbar: vScrollRef.value,
      horizontalScrollbar: hScrollRef.value,
      columns: config.columns(),
      rowHeight: config.rowHeight(),
      rowCount: config.rows().length,
      overscan: config.overscan,
      minColumnWidth: config.minColumnWidth,
      // The engine reports a first range from its constructor, before the
      // instance is assigned, so sizes are read through the ref.
      onRangeChange: (next) => {
        range.value = next
        contentHeight.value = grid.value?.contentHeight ?? contentHeight.value
      },
      onColumnResize: config.onColumnResize,
      onRowDragStart: config.onRowDragStart,
      onRowDragMove: config.onRowDragMove,
      onRowDrop: config.onRowDrop,
    })

    grid.value = instance
    range.value = instance.range
    syncSizes()
  })

  watch(config.columns, (columns) => {
    grid.value?.setColumns(columns)
    syncSizes()
  })

  watch(() => config.rows().length, (count) => {
    grid.value?.setRowCount(count)
    syncSizes()
  })

  watch(config.rowHeight, (source) => {
    grid.value?.setRowHeightSource(source)
    syncSizes()
  })

  onBeforeUnmount(() => {
    grid.value?.destroy()
    grid.value = null
  })

  return {
    grid,
    rootRef,
    bodyRef,
    headerRef,
    vScrollRef,
    hScrollRef,
    visibleRows,
    contentWidth,
    contentHeight,
    registerHeaderCell: (element, key) => grid.value?.registerHeaderCell(asElement(element), key),
    registerRow: (element, index) => grid.value?.registerRow(asElement(element), index),
    registerCell: (element, index, key) => grid.value?.registerCell(asElement(element), index, key),
  }
}

/* sorting and selection */

export interface UseSort {
  entries: Ref<SortEntry[]>
  toggle: (key: ColumnKey) => void
  directionOf: (key: ColumnKey) => SortDirection | null
  priorityOf: (key: ColumnKey) => number | null
  clear: () => void
}

/** Reactive wrapper over the sort state. Sorting the data stays with the caller. */
export function useSort(options: SortOptions = {}): UseSort {
  const state = new SortState(options)
  const entries = ref<SortEntry[]>([])

  const sync = () => { entries.value = [...state.value] }

  return {
    entries,
    toggle: (key) => { state.toggle(key); sync() },
    directionOf: (key) => {
      void entries.value
      return state.directionOf(key)
    },
    priorityOf: (key) => {
      void entries.value
      return state.priorityOf(key)
    },
    clear: () => { state.clear(); sync() },
  }
}

export interface UseSelection {
  selected: Ref<RowId[]>
  has: (id: RowId) => boolean
  toggle: (id: RowId) => void
  selectRange: (id: RowId, ordered: RowId[]) => void
  selectAll: (ordered: RowId[]) => void
  allSelected: (ordered: RowId[]) => boolean
  someSelected: (ordered: RowId[]) => boolean
  clear: () => void
}

/** Reactive wrapper over the selection model. */
export function useSelection(options: SelectionOptions = {}): UseSelection {
  const model = new SelectionModel(options)
  const selected = ref<RowId[]>([])

  const sync = () => { selected.value = model.value }

  return {
    selected,
    has: (id) => {
      void selected.value
      return model.has(id)
    },
    toggle: (id) => { model.toggle(id); sync() },
    selectRange: (id, ordered) => { model.selectRange(id, ordered); sync() },
    selectAll: (ordered) => { model.selectAll(ordered); sync() },
    allSelected: (ordered) => {
      void selected.value
      return model.allSelected(ordered)
    },
    someSelected: (ordered) => {
      void selected.value
      return model.someSelected(ordered)
    },
    clear: () => { model.clear(); sync() },
  }
}
