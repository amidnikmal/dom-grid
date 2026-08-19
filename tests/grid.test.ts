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

    // The container shifts by -30, so the pinned column cancels it out.
    expect(pinned.style.transform).toBe('translateX(30px)')
    expect(flowing.style.transform).toBe('translateX(0px)')
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
