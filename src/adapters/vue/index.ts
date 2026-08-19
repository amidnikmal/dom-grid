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
  type RowRange,
} from '../../core/index'

export interface UseGridConfig<Row> {
  columns: () => ColumnDef[]
  rows: () => Row[]
  rowHeight: () => number
  overscan?: number
  minColumnWidth?: number
  rowKey?: (row: Row, index: number) => string | number
  onColumnResize?: (key: ColumnKey, width: number) => void
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
  contentHeight: ComputedRef<number>
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

  const contentHeight = computed(() => config.rows().length * config.rowHeight())

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
      onRangeChange: (next) => { range.value = next },
      onColumnResize: config.onColumnResize,
    })

    grid.value = instance
    range.value = instance.range
    contentWidth.value = instance.contentWidth
  })

  watch(config.columns, (columns) => {
    grid.value?.setColumns(columns)
    contentWidth.value = grid.value?.contentWidth ?? 0
  })

  watch(() => config.rows().length, (count) => grid.value?.setRowCount(count))

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
