import { describe, expect, it } from 'vitest'

import { RowMetrics } from '../src/core/index'

describe('RowMetrics', () => {
  it('treats a uniform height as plain arithmetic', () => {
    const metrics = new RowMetrics(20, 100)

    expect(metrics.uniform).toBe(true)
    expect(metrics.offsetOf(5)).toBe(100)
    expect(metrics.totalHeight).toBe(2_000)
    expect(metrics.indexAt(45)).toBe(2)
  })

  it('accumulates variable heights', () => {
    const metrics = new RowMetrics((index) => (index % 2 ? 30 : 10), 4)

    expect(metrics.uniform).toBe(false)
    expect(metrics.offsetOf(1)).toBe(10)
    expect(metrics.offsetOf(2)).toBe(40)
    expect(metrics.totalHeight).toBe(80)
  })

  it('finds the row covering an offset', () => {
    const metrics = new RowMetrics((index) => (index === 0 ? 100 : 20), 5)

    expect(metrics.indexAt(0)).toBe(0)
    expect(metrics.indexAt(99)).toBe(0)
    expect(metrics.indexAt(100)).toBe(1)
    expect(metrics.indexAt(121)).toBe(2)
  })

  it('overriding one row shifts the ones below', () => {
    const metrics = new RowMetrics(20, 10)

    expect(metrics.setRowHeight(2, 50)).toBe(true)
    expect(metrics.uniform).toBe(false)
    expect(metrics.offsetOf(3)).toBe(90)
    expect(metrics.totalHeight).toBe(230)
  })

  it('ignores an override that changes nothing', () => {
    const metrics = new RowMetrics(20, 10)

    expect(metrics.setRowHeight(2, 20)).toBe(false)
    expect(metrics.uniform).toBe(true)
  })

  it('ranges over variable heights', () => {
    const metrics = new RowMetrics((index) => (index < 2 ? 100 : 20), 50)

    // Row 2 starts exactly at 200, so it falls outside a 200px viewport.
    expect(metrics.rangeFor(0, 200, 0)).toEqual({ start: 0, end: 2 })
    expect(metrics.rangeFor(0, 220, 0)).toEqual({ start: 0, end: 3 })
    expect(metrics.rangeFor(0, 0, 0).start).toBe(0)
    expect(metrics.rangeFor(0, 100, 2).end).toBeGreaterThan(1)
  })

  it('handles an empty list', () => {
    const metrics = new RowMetrics(20, 0)

    expect(metrics.rangeFor(0, 100)).toEqual({ start: 0, end: 0 })
    expect(metrics.totalHeight).toBe(0)
  })
})
