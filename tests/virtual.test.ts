import { describe, expect, it } from 'vitest'

import { computeRange, isSameRange } from '../src/core/index'

describe('computeRange', () => {
  it('covers the viewport plus overscan', () => {
    expect(computeRange(0, 100, 10, 1000, 2)).toEqual({ start: 0, end: 12 })
    expect(computeRange(500, 100, 10, 1000, 2)).toEqual({ start: 48, end: 62 })
  })

  it('clamps to the ends of the list', () => {
    expect(computeRange(0, 100, 10, 5, 4)).toEqual({ start: 0, end: 5 })
    expect(computeRange(9_950, 100, 10, 1000, 0)).toEqual({ start: 995, end: 1000 })
  })

  it('returns an empty range for an empty list', () => {
    expect(computeRange(0, 100, 10, 0)).toEqual({ start: 0, end: 0 })
  })

  it('compares ranges', () => {
    expect(isSameRange({ start: 1, end: 2 }, { start: 1, end: 2 })).toBe(true)
    expect(isSameRange({ start: 1, end: 2 }, { start: 1, end: 3 })).toBe(false)
  })
})
