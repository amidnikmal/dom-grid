# dom-grid

Table geometry engine: synchronous layout, scrolling, pinned columns, resizing and
virtualization over markup you own.

## Why

A table has two kinds of change, and they want opposite things.

**Structure** changes rarely: which columns exist, how many rows there are, what sits in a
cell. Declarative rendering fits it perfectly.

**Geometry** changes every frame: offsets while scrolling, a column edge following the
pointer, the window of rows that has to exist. Here a framework update lands a frame late,
and the header visibly trails the body.

`dom-grid` takes the second half. It writes to the DOM directly and synchronously, within
the same event, so nothing ever drifts apart by a frame. The markup stays yours: the engine
never queries the DOM, it only positions nodes handed to it.

## Install

```sh
npm i dom-grid
```

## Core (no framework)

```ts
import { createGrid } from 'dom-grid'

const grid = createGrid({
  root, body, headerRow, verticalScrollbar, horizontalScrollbar,
  columns: [
    { key: 'id', width: 80, pinned: 'left' },
    { key: 'name' },                       // 'auto' shares the leftover space
    { key: 'state', width: 100, pinned: 'right' },
  ],
  rowHeight: 28,
  rowCount: 5_000,
  onRangeChange: ({ start, end }) => renderRows(start, end),
})

grid.registerHeaderCell(element, 'name')   // the view hands nodes over as it creates them
grid.registerRow(element, rowIndex)
grid.registerCell(element, rowIndex, 'name')
```

| Method | What it does |
|---|---|
| `registerHeaderCell` / `registerRow` / `registerCell` | hand a node over, or pass `null` to drop it |
| `setColumns` / `setRowCount` | structure changed |
| `startColumnResize(key, event)` | begin a drag on a column edge |
| `startRowDrag(index, event)` | begin dragging a row, reported through `onRowDrop` |
| `setRowHeight(index, height)` | correct one row after measuring it |
| `scrollToRow(index)` | move the viewport |
| `getColumnWidths()` | current widths, for persisting them |
| `getResizedWidths()` / `setResizedWidths()` | only the hand-resized ones, to save and restore |
| `resetColumnWidths(key?)` | drop hand-resized widths |
| `layout` / `range` / `contentWidth` / `contentHeight` | current geometry |
| `destroy()` | detach every listener |

Pure helpers are exported too, so the maths can be used on its own: `computeLayout(columns,
availableWidth)`, `computeRange(...)` and `RowMetrics` for variable row offsets.

## Sorting and selection

The engine does not touch your data, so it tracks state rather than doing the work.

```ts
import { SortState, SelectionModel } from 'dom-grid'

const sort = new SortState({ multiple: true })
sort.toggle('name')            // asc -> desc -> unsorted on repeated clicks
sort.value                     // [{ key: 'name', direction: 'asc' }], click order is priority

const selection = new SelectionModel({ isDisabled: (id) => locked.has(id) })
selection.toggle(id)
selection.selectRange(id, visibleIds)   // shift-click, ids in the order shown
selection.allSelected(visibleIds)
```

Selection works with row ids rather than indices, so it survives sorting and filtering.
In Vue both come as `useSort()` and `useSelection()` with the same API, wrapped in refs.

## Vue

```vue
<script setup lang="ts">
import { useGrid } from 'dom-grid/vue'

const {
  rootRef, bodyRef, headerRef, vScrollRef, hScrollRef,
  visibleRows, contentWidth, contentHeight,
  registerHeaderCell, registerRow, registerCell, grid,
} = useGrid({
  columns: () => props.columns,
  rows: () => props.data,
  rowHeight: () => 28,
})
</script>

<template>
  <div ref="rootRef" class="grid">
    <div ref="headerRef">
      <div v-for="col in columns" :key="col.key" :ref="(el) => registerHeaderCell(el, col.key)">
        {{ col.key }}
      </div>
    </div>

    <div ref="bodyRef">
      <div v-for="row in visibleRows" :key="row.id" :ref="(el) => registerRow(el, row.index)">
        <div v-for="col in columns" :key="col.key" :ref="(el) => registerCell(el, row.index, col.key)">
          {{ row.data[col.key] }}
        </div>
      </div>
    </div>

    <div ref="vScrollRef"><div :style="{ height: `${contentHeight}px` }" /></div>
    <div ref="hScrollRef"><div :style="{ width: `${contentWidth}px` }" /></div>
  </div>
</template>
```

Vue decides which rows and columns exist; the engine places them. Nodes travel through ref
callbacks, so a re-render never leaves stale positions behind.

## Row reordering

```ts
createGrid({
  ...,
  onRowDrop: (from, to) => moveRow(from, to),   // reordering the data is yours
})

grid.startRowDrag(index, pointerEvent)          // from a drag handle
```

While a row is dragged the engine moves it under the pointer, opens a gap at the drop
position and scrolls when the pointer nears an edge. The dragged row carries a
`data-dragging` attribute so it can be styled. Drop indices are reported the way an array
behaves after a splice, so `rows.splice(to, 0, rows.splice(from, 1)[0])` is all the caller
has to do.

## Input

Wheel and touch scrolling are handled on the root out of the box, including shift-wheel for
horizontal movement; the event is only swallowed when the table actually moved, so a table
scrolled to its end still lets the page scroll. Pass `wheel: false` to opt out.

Columns are laid out in the width of `viewport` (the Vue adapter defaults it to the body,
`layoutFrom: 'root'` switches back). Measure the element the content actually gets: overlay
scrollbars make the root wider than the space columns can use.

## Markup contract

The engine positions nodes but does not style them. Your CSS has to provide:

- `root` with `position: relative` and `overflow: hidden`, it defines the available width;
- header cells and body cells with `position: absolute`, the engine sets `transform` and `width`;
- rows with `position: absolute`, the engine sets `transform` and `height`;
- scrollbars as separate scrollable elements with an inner spacer sized from
  `contentWidth` / `contentHeight`.

Rows may be uniform or variable: pass a number as `rowHeight`, or a function of the row
index. A row measured in the DOM can be corrected afterwards with `grid.setRowHeight(index,
height)`, and everything below shifts within the same task.

## Working with heavy cells

Virtualization removes rows from the DOM, which destroys whatever lived inside them. When
cells are expensive (a select with thousands of options, an editor), pair this with
[`dom-attic`](https://www.npmjs.com/package/dom-attic): `dom-grid` owns where a cell sits,
`dom-attic` keeps what is inside it alive.

## Development

```sh
npm run dev        # playground
npm test           # unit tests, run in a real browser
npm run test:e2e   # scroll, pinning and resize scenarios
npm run build
```

## License

MIT
