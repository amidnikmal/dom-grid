import { describe, expect, it } from 'vitest'

import { SortState } from '../src/core/index'

describe('SortState', () => {
  it('cycles through ascending, descending and unsorted', () => {
    const sort = new SortState()

    sort.toggle('name')
    expect(sort.directionOf('name')).toBe('asc')

    sort.toggle('name')
    expect(sort.directionOf('name')).toBe('desc')

    sort.toggle('name')
    expect(sort.directionOf('name')).toBeNull()
  })

  it('keeps a single column by default', () => {
    const sort = new SortState()

    sort.toggle('a')
    sort.toggle('b')

    expect(sort.value).toEqual([{ key: 'b', direction: 'asc' }])
  })

  it('keeps click order as priority when multiple is on', () => {
    const sort = new SortState({ multiple: true })

    sort.toggle('a')
    sort.toggle('b')

    expect(sort.priorityOf('a')).toBe(1)
    expect(sort.priorityOf('b')).toBe(2)

    sort.toggle('a')
    sort.toggle('a')
    expect(sort.priorityOf('a')).toBeNull()
    expect(sort.priorityOf('b')).toBe(1)
  })
})

describe('SortState priority', () => {
  it('keeps a column in place when its direction flips', () => {
    const sort = new SortState({ multiple: true })

    sort.toggle('a')
    sort.toggle('b')
    sort.toggle('a')

    expect(sort.directionOf('a')).toBe('desc')
    expect(sort.priorityOf('a')).toBe(1)
    expect(sort.priorityOf('b')).toBe(2)
  })
})
