import { afterEach, describe, expect, it, vi } from 'vitest'

import { type ColumnDef,createGrid } from '../src/core/index'
import { createHarness, type Harness } from './helpers'

let harness: Harness | null = null

afterEach(() => {
  harness?.cleanup()
  harness = null
})

function setup(columns: ColumnDef[] = [{ key: 'a', width: 100 }, { key: 'b', width: 200 }]) {
  harness = createHarness()
  const grid = createGrid({ ...harness, columns, rowHeight: 20, rowCount: 100, overscan: 0 })

  return { grid, harness }
}

describe('Grid', () => {
  it('positions a cell as soon as it is registered', () => {
    const { grid, harness: h } = setup()
    const cell = h.headerCell('b')

    grid.registerHeaderCell(cell, 'b')

    expect(cell.style.transform).toBe('translateX(100px)')
    expect(cell.style.width).toBe('200px')
  })

  it('places rows by index and row height', () => {
    const { grid, harness: h } = setup()
    const row = h.row(3)

    grid.registerRow(row, 3)

    expect(row.style.transform).toBe('translateY(60px)')
    expect(row.style.height).toBe('20px')
  })

  it('applies scroll synchronously, within the event', () => {
    const { grid, harness: h } = setup()
    const row = h.row(0)
    grid.registerRow(row, 0)

    h.verticalScrollbar!.scrollTop = 40
    h.verticalScrollbar!.dispatchEvent(new Event('scroll'))

    // No frame is awaited: the value is already in the DOM.
    expect(row.style.transform).toBe('translateY(-40px)')
  })

  it('keeps pinned columns still while the flow scrolls', () => {
    const { grid, harness: h } = setup([
      { key: 'pin', width: 60, pinned: 'left' },
      { key: 'a', width: 100 },
    ])

    const pinned = h.headerCell('pin')
    const flowing = h.headerCell('a')
    grid.registerHeaderCell(pinned, 'pin')
    grid.registerHeaderCell(flowing, 'a')

    h.horizontalScrollbar!.scrollLeft = 30
    h.horizontalScrollbar!.dispatchEvent(new Event('scroll'))

    // The container shifts by -30, so the pinned column cancels it out,
    // while the flow starts after the pinned zone and moves with the content.
    expect(pinned.style.transform).toBe('translateX(30px)')
    expect(flowing.style.transform).toBe('translateX(60px)')
    expect(h.body.style.transform).toBe('translateX(-30px)')
  })

  it('reports a new row range on scroll', () => {
    harness = createHarness(500, 200)
    const onRangeChange = vi.fn()
    const grid = createGrid({
      ...harness,
      columns: [{ key: 'a' }],
      rowHeight: 20,
      rowCount: 1000,
      overscan: 0,
      onRangeChange,
    })

    harness.verticalScrollbar!.scrollTop = 400
    harness.verticalScrollbar!.dispatchEvent(new Event('scroll'))

    expect(grid.range.start).toBe(20)
    expect(onRangeChange).toHaveBeenCalled()
  })

  it('resizes a column while the pointer moves', () => {
    const { grid, harness: h } = setup()
    const cell = h.headerCell('a')
    grid.registerHeaderCell(cell, 'a')

    grid.startColumnResize('a', new PointerEvent('pointerdown', { clientX: 0 }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 40 }))

    expect(cell.style.width).toBe('140px')

    window.dispatchEvent(new PointerEvent('pointerup'))
  })

  it('reports the final width once the drag ends', () => {
    const onColumnResize = vi.fn()
    harness = createHarness()
    const grid = createGrid({
      ...harness,
      columns: [{ key: 'a', width: 100 }],
      rowHeight: 20,
      rowCount: 10,
      onColumnResize,
    })

    grid.startColumnResize('a', new PointerEvent('pointerdown', { clientX: 0 }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 25 }))
    window.dispatchEvent(new PointerEvent('pointerup'))

    expect(onColumnResize).toHaveBeenCalledWith('a', 125)
  })

  it('drags a row and reports where it landed', () => {
    const onRowDrop = vi.fn()
    harness = createHarness()
    const grid = createGrid({
      ...harness,
      columns: [{ key: 'a', width: 100 }],
      rowHeight: 20,
      rowCount: 10,
      onRowDrop,
    })

    const dragged = harness.row(0)
    const neighbour = harness.row(1)
    grid.registerRow(dragged, 0)
    grid.registerRow(neighbour, 1)

    const top = harness.body.getBoundingClientRect().top
    grid.startRowDrag(0, new PointerEvent('pointerdown', { clientY: top + 5 }))
    expect(grid.draggingRow).toBe(0)

    // Pointer sits in the lower half of row 2.
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: top + 55 }))

    expect(dragged.hasAttribute('data-dragging')).toBe(true)
    expect(neighbour.style.transform).toBe('translateY(0px)')

    window.dispatchEvent(new PointerEvent('pointerup'))

    expect(onRowDrop).toHaveBeenCalledWith(0, 2)
    expect(grid.draggingRow).toBeNull()
    expect(dragged.hasAttribute('data-dragging')).toBe(false)
  })

  it('stops listening after destroy', () => {
    const { grid, harness: h } = setup()
    const row = h.row(0)
    grid.registerRow(row, 0)

    grid.destroy()
    h.verticalScrollbar!.scrollTop = 40
    h.verticalScrollbar!.dispatchEvent(new Event('scroll'))

    expect(row.style.transform).toBe('translateY(0px)')
  })
})

describe('Grid regressions', () => {
  it('keeps a node registered when a stale ref callback passes null', () => {
    const { grid, harness: h } = setup()
    const cell = h.headerCell('a')

    grid.registerHeaderCell(cell, 'a')
    // Vue calls the previous ref callback with null after the new one ran.
    grid.registerHeaderCell(null, 'a')

    grid.setColumns([{ key: 'a', width: 150 }])

    expect(cell.style.width).toBe('150px')
  })

  it('forgets a node once it really left the document', () => {
    const { grid, harness: h } = setup()
    const cell = h.headerCell('a')

    grid.registerHeaderCell(cell, 'a')
    cell.remove()
    grid.registerHeaderCell(null, 'a')

    grid.setColumns([{ key: 'a', width: 150 }])

    expect(cell.style.width).toBe('100px')
  })

  it('reports layout changes, including during a resize drag', () => {
    const onLayoutChange = vi.fn()
    harness = createHarness()
    const grid = createGrid({
      ...harness,
      columns: [{ key: 'a', width: 100 }],
      rowHeight: 20,
      rowCount: 10,
      onLayoutChange,
    })

    grid.startColumnResize('a', new PointerEvent('pointerdown', { clientX: 0 }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 30 }))
    window.dispatchEvent(new PointerEvent('pointerup'))

    expect(onLayoutChange).toHaveBeenCalled()
    expect(grid.contentWidth).toBe(130)
  })

  it('ignores a resize on a column that forbids it', () => {
    const { grid, harness: h } = setup([{ key: 'a', width: 100, resizable: false }])
    const cell = h.headerCell('a')
    grid.registerHeaderCell(cell, 'a')

    grid.startColumnResize('a', new PointerEvent('pointerdown', { clientX: 0 }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 40 }))

    expect(cell.style.width).toBe('100px')
    window.dispatchEvent(new PointerEvent('pointerup'))
  })

  it('keeps the dragged row inside the range while autoscrolling away', () => {
    harness = createHarness(500, 100)
    const grid = createGrid({
      ...harness,
      columns: [{ key: 'a', width: 100 }],
      rowHeight: 20,
      rowCount: 500,
      overscan: 0,
    })

    const row = harness.row(0)
    grid.registerRow(row, 0)
    grid.startRowDrag(0, new PointerEvent('pointerdown', { clientY: 0 }))

    harness.verticalScrollbar!.scrollTop = 4_000
    harness.verticalScrollbar!.dispatchEvent(new Event('scroll'))

    expect(grid.range.start).toBe(0)
    expect(grid.range.end).toBeGreaterThan(200)

    window.dispatchEvent(new PointerEvent('pointerup'))
  })
})

describe('resized widths', () => {
  it('survive a structural column update', () => {
    const { grid, harness: h } = setup()
    const cell = h.headerCell('a')
    grid.registerHeaderCell(cell, 'a')

    grid.startColumnResize('a', new PointerEvent('pointerdown', { clientX: 0 }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 50 }))
    window.dispatchEvent(new PointerEvent('pointerup'))
    expect(cell.style.width).toBe('150px')

    // The caller re-renders columns, e.g. after toggling visibility elsewhere.
    grid.setColumns([{ key: 'a', width: 100 }, { key: 'b', width: 200 }])

    expect(cell.style.width).toBe('150px')
    expect(grid.getResizedWidths()).toEqual({ a: 150 })
  })

  it('can be reset back to the definitions', () => {
    const { grid, harness: h } = setup()
    const cell = h.headerCell('a')
    grid.registerHeaderCell(cell, 'a')

    grid.setResizedWidths({ a: 300 })
    expect(cell.style.width).toBe('300px')

    grid.resetColumnWidths('a')
    expect(cell.style.width).toBe('100px')
  })
})

describe('wheel and touch', () => {
  it('scrolls on a wheel and swallows the event only when it moved', () => {
    harness = createHarness(500, 200)
    createGrid({ ...harness, columns: [{ key: 'a' }], rowHeight: 20, rowCount: 500 })

    const event = new WheelEvent('wheel', { deltaY: 120, cancelable: true })
    harness.root.dispatchEvent(event)

    expect(harness.verticalScrollbar!.scrollTop).toBe(120)
    expect(event.defaultPrevented).toBe(true)
  })

  it('lets the page scroll when the table cannot move any further', () => {
    harness = createHarness(500, 200)
    createGrid({ ...harness, columns: [{ key: 'a' }], rowHeight: 20, rowCount: 500 })

    const event = new WheelEvent('wheel', { deltaY: -120, cancelable: true })
    harness.root.dispatchEvent(event)

    expect(harness.verticalScrollbar!.scrollTop).toBe(0)
    expect(event.defaultPrevented).toBe(false)
  })

  it('turns a shifted wheel into horizontal scrolling', () => {
    harness = createHarness(500, 200)
    createGrid({ ...harness, columns: [{ key: 'a' }], rowHeight: 20, rowCount: 500 })

    harness.root.dispatchEvent(new WheelEvent('wheel', { deltaY: 90, shiftKey: true, cancelable: true }))

    expect(harness.horizontalScrollbar!.scrollLeft).toBe(90)
    expect(harness.verticalScrollbar!.scrollTop).toBe(0)
  })

  it('lays columns out in the viewport element when one is given', () => {
    harness = createHarness(500, 200)
    harness.body.style.cssText = 'position:absolute;left:0;top:0;width:400px;height:200px'

    const grid = createGrid({
      ...harness,
      viewport: harness.body,
      columns: [{ key: 'a' }],
      rowHeight: 20,
      rowCount: 10,
    })

    expect(grid.layout.columns[0]!.width).toBe(400)
  })
})

describe('native scroll mode', () => {
  it('places rows at their absolute offsets and leaves the body alone', () => {
    harness = createHarness()
    const grid = createGrid({
      ...harness,
      scrollMode: 'native',
      columns: [{ key: 'a', width: 100 }],
      rowHeight: 20,
      rowCount: 500,
    })

    const row = harness.row(10)
    grid.registerRow(row, 10)

    harness.verticalScrollbar!.scrollTop = 60
    harness.verticalScrollbar!.dispatchEvent(new Event('scroll'))

    // The container scrolls itself, so the row keeps its absolute position.
    expect(row.style.transform).toBe('translateY(200px)')
    expect(harness.body.style.transform).toBe('')
  })

  it('does not intercept the wheel', () => {
    harness = createHarness()
    createGrid({
      ...harness,
      scrollMode: 'native',
      columns: [{ key: 'a' }],
      rowHeight: 20,
      rowCount: 500,
    })

    const event = new WheelEvent('wheel', { deltaY: 120, cancelable: true })
    harness.root.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })
})
