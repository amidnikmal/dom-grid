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
