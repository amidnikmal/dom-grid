<template>
  <div>
    <p data-testid="stats">
      rows in DOM: {{ visibleRows.length }} / {{ rows.length }}
    </p>

    <div ref="rootRef" class="grid">
      <div ref="headerRef" class="grid__header">
        <div
          v-for="col in columns"
          :key="col.key"
          :ref="(el) => registerHeaderCell(el, col.key)"
          class="grid__th"
          :data-testid="`th-${col.key}`"
        >
          {{ col.key }}
          <span
            class="grid__resizer"
            :data-testid="`resizer-${col.key}`"
            @pointerdown="grid?.startColumnResize(col.key, $event)"
          />
        </div>
      </div>

      <div ref="bodyRef" class="grid__body">
        <div
          v-for="row in visibleRows"
          :key="row.id"
          :ref="(el) => registerRow(el, row.index)"
          class="grid__tr"
          :data-testid="`row-${row.index}`"
        >
          <div
            v-for="col in columns"
            :key="col.key"
            :ref="(el) => registerCell(el, row.index, col.key)"
            class="grid__td"
          >
            {{ row.data[col.key] }}
          </div>
        </div>
      </div>

      <div ref="vScrollRef" class="grid__scroll-v" data-testid="scroll-v">
        <div :style="{ height: `${contentHeight}px` }" />
      </div>

      <div ref="hScrollRef" class="grid__scroll-h" data-testid="scroll-h">
        <div :style="{ width: `${contentWidth}px` }" />
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { useGrid } from '../src/adapters/vue/index'
import type { ColumnDef } from '../src/core/index'

type Row = Record<string, string>

const columns: ColumnDef[] = [
  { key: 'id', width: 80, pinned: 'left' },
  { key: 'name', width: 200 },
  { key: 'city', width: 200 },
  { key: 'note', width: 400 },
  { key: 'tag', width: 200 },
  { key: 'state', width: 100, pinned: 'right' },
]

const rows: Row[] = Array.from({ length: 5_000 }, (_, index) => ({
  id: String(index),
  name: `name ${index}`,
  city: `city ${index % 50}`,
  note: `note for row ${index}`,
  tag: `tag ${index % 7}`,
  state: index % 2 ? 'on' : 'off',
}))

const {
  grid,
  rootRef,
  bodyRef,
  headerRef,
  vScrollRef,
  hScrollRef,
  visibleRows,
  contentWidth,
  contentHeight,
  registerHeaderCell,
  registerRow,
  registerCell,
} = useGrid<Row>({
  columns: () => columns,
  rows: () => rows,
  rowHeight: () => 28,
  rowKey: (_row, index) => index,
})
</script>

<style>
body {
  font: 13px/1.4 system-ui, sans-serif;
  margin: 16px;
}

.grid {
  position: relative;
  overflow: hidden;
  width: 720px;
  height: 420px;
  border: 1px solid #ccc;
}

.grid__header {
  position: relative;
  height: 32px;
  border-bottom: 1px solid #ccc;
  background: #f4f4f4;
}

.grid__th,
.grid__td {
  position: absolute;
  top: 0;
  overflow: hidden;
  white-space: nowrap;
  padding: 6px 8px;
  box-sizing: border-box;
}

.grid__th {
  height: 32px;
  font-weight: 600;
  background: #f4f4f4;
}

.grid__body {
  position: absolute;
  top: 32px;
  left: 0;
  right: 0;
  bottom: 0;
}

.grid__tr {
  position: absolute;
  left: 0;
  right: 0;
  border-bottom: 1px solid #eee;
}

.grid__resizer {
  position: absolute;
  top: 0;
  right: 0;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  background: #ddd;
}

.grid__scroll-v {
  position: absolute;
  top: 32px;
  right: 0;
  bottom: 0;
  width: 14px;
  overflow-y: auto;
}

.grid__scroll-h {
  position: absolute;
  left: 0;
  right: 14px;
  bottom: 0;
  height: 14px;
  overflow-x: auto;
}
</style>
