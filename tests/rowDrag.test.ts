import { describe, expect, it } from 'vitest'

import {
  autoScrollSpeed,
  dropTargetAt,
  reorderShift,
  resolveDropIndex,
  RowMetrics,
} from '../src/core/index'

const metrics = new RowMetrics(20, 10)

describe('dropTargetAt', () => {
  it('tells which half of a row the pointer is over', () => {
    expect(dropTargetAt(5, metrics)).toEqual({ index: 0, half: 'top' })
    expect(dropTargetAt(15, metrics)).toEqual({ index: 0, half: 'bottom' })
    expect(dropTargetAt(45, metrics)).toEqual({ index: 2, half: 'top' })
  })

  it('works with variable heights', () => {
    const variable = new RowMetrics((index) => (index === 0 ? 100 : 20), 5)

    expect(dropTargetAt(40, variable)).toEqual({ index: 0, half: 'top' })
    expect(dropTargetAt(60, variable)).toEqual({ index: 0, half: 'bottom' })
    expect(dropTargetAt(105, variable)).toEqual({ index: 1, half: 'top' })
  })
})

describe('resolveDropIndex', () => {
  it('lands after the row when dropped on its lower half', () => {
    expect(resolveDropIndex(0, { index: 3, half: 'top' }, 10)).toBe(2)
    expect(resolveDropIndex(0, { index: 3, half: 'bottom' }, 10)).toBe(3)
  })

  it('does not shift when moving upwards', () => {
    expect(resolveDropIndex(5, { index: 2, half: 'top' }, 10)).toBe(2)
    expect(resolveDropIndex(5, { index: 2, half: 'bottom' }, 10)).toBe(3)
  })

  it('stays inside the list', () => {
    expect(resolveDropIndex(0, { index: 9, half: 'bottom' }, 10)).toBe(9)
    expect(resolveDropIndex(9, { index: 0, half: 'top' }, 10)).toBe(0)
  })
})

describe('reorderShift', () => {
  it('opens a gap by moving the rows in between', () => {
    // Row 1 moves down to 3: rows 2 and 3 step up.
    expect(reorderShift(2, 1, 3, 20)).toBe(-20)
    expect(reorderShift(3, 1, 3, 20)).toBe(-20)
    expect(reorderShift(4, 1, 3, 20)).toBe(0)
  })

  it('moves rows down when dragging upwards', () => {
    expect(reorderShift(2, 4, 2, 20)).toBe(20)
    expect(reorderShift(3, 4, 2, 20)).toBe(20)
    expect(reorderShift(1, 4, 2, 20)).toBe(0)
  })

  it('leaves the dragged row to the pointer', () => {
    expect(reorderShift(1, 1, 3, 20)).toBe(0)
  })
})

describe('autoScrollSpeed', () => {
  it('is zero away from the edges', () => {
    expect(autoScrollSpeed(200, 100, 400)).toBe(0)
  })

  it('accelerates towards the edge', () => {
    expect(autoScrollSpeed(105, 100, 400)).toBeLessThan(0)
    expect(autoScrollSpeed(101, 100, 400)).toBeLessThan(autoScrollSpeed(120, 100, 400))
    expect(autoScrollSpeed(395, 100, 400)).toBeGreaterThan(0)
  })
})
