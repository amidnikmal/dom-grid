import { describe, expect, it } from 'vitest'

import { computeLayout } from '../src/core/index'

describe('computeLayout', () => {
  it('splits the leftover space between auto columns', () => {
    const layout = computeLayout(
      [{ key: 'a', width: 100 }, { key: 'b' }, { key: 'c' }],
      500,
    )

    expect(layout.columns.map((column) => column.width)).toEqual([100, 200, 200])
    expect(layout.columns.map((column) => column.left)).toEqual([0, 100, 300])
    expect(layout.flowWidth).toBe(500)
  })

  it('respects minWidth and maxWidth', () => {
    const layout = computeLayout(
      [{ key: 'a', maxWidth: 50 }, { key: 'b', minWidth: 300 }],
      400,
    )

    expect(layout.columns[0]!.width).toBe(50)
    expect(layout.columns[1]!.width).toBe(300)
  })

  it('never goes below the minimum column width', () => {
    const layout = computeLayout([{ key: 'a' }, { key: 'b' }], 10, 40)

    expect(layout.columns.every((column) => column.width === 40)).toBe(true)
  })

  it('keeps pinned columns out of the scrollable flow', () => {
    const layout = computeLayout(
      [
        { key: 'pinL', width: 60, pinned: 'left' },
        { key: 'a', width: 100 },
        { key: 'b', width: 100 },
        { key: 'pinR', width: 40, pinned: 'right' },
      ],
      500,
    )

    expect(layout.flowWidth).toBe(200)
    expect(layout.leftWidth).toBe(60)
    expect(layout.rightWidth).toBe(40)
    expect(layout.columns.find((column) => column.key === 'a')!.left).toBe(0)
  })

  it('lays right-pinned columns out from the right edge', () => {
    const layout = computeLayout(
      [
        { key: 'r1', width: 30, pinned: 'right' },
        { key: 'r2', width: 50, pinned: 'right' },
      ],
      500,
    )

    // r1 comes first, so it ends up further from the edge than r2.
    expect(layout.columns[0]!.left).toBe(50)
    expect(layout.columns[1]!.left).toBe(0)
    expect(layout.rightWidth).toBe(80)
  })
})

describe('sharing space between automatic columns', () => {
  it('gives what a capped column did not take to the others', () => {
    // Three columns share 600. An even split would be 200 each, but the first
    // one may not exceed 50 — the leftover has to go to the other two.
    const layout = computeLayout([{ key: 'a', maxWidth: 50 }, { key: 'b' }, { key: 'c' }], 600)

    expect(layout.columns.map((column) => column.width)).toEqual([50, 275, 275])
    expect(layout.flowWidth).toBe(600)
  })

  it('takes from the others when a column demands a minimum', () => {
    const layout = computeLayout([{ key: 'a', minWidth: 400 }, { key: 'b' }, { key: 'c' }], 600)

    expect(layout.columns[0]!.width).toBe(400)
    expect(layout.columns[1]!.width).toBe(100)
    expect(layout.columns[2]!.width).toBe(100)
  })

  it('resolves a chain of caps in one go', () => {
    const layout = computeLayout(
      [{ key: 'a', maxWidth: 40 }, { key: 'b', maxWidth: 60 }, { key: 'c' }, { key: 'd' }],
      800,
    )

    // a and b cap, so c and d divide what is left of 800.
    expect(layout.columns.map((column) => column.width)).toEqual([40, 60, 350, 350])
  })

  it('covers every combination of bounds', () => {
    const layout = computeLayout(
      [
        { key: 'plain' },
        { key: 'min', minWidth: 150 },
        { key: 'max', maxWidth: 80 },
        { key: 'both', minWidth: 100, maxWidth: 120 },
        { key: 'fixed', width: 90 },
      ],
      1000,
    )

    const widths = Object.fromEntries(layout.columns.map((c) => [c.key, c.width]))

    expect(widths.fixed).toBe(90)
    expect(widths.max).toBe(80)
    expect(widths.min).toBeGreaterThanOrEqual(150)
    expect(widths.both).toBeGreaterThanOrEqual(100)
    expect(widths.both).toBeLessThanOrEqual(120)
    expect(layout.flowWidth).toBeCloseTo(1000, 5)
  })

  it('still respects minimums when there is not enough room', () => {
    const layout = computeLayout([{ key: 'a', minWidth: 300 }, { key: 'b', minWidth: 300 }], 100)

    expect(layout.columns.map((column) => column.width)).toEqual([300, 300])
  })
})
