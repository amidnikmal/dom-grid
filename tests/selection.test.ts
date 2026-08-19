import { describe, expect, it } from 'vitest'

import { SelectionModel } from '../src/core/index'

const ordered = ['a', 'b', 'c', 'd', 'e']

describe('SelectionModel', () => {
  it('toggles rows', () => {
    const selection = new SelectionModel()

    selection.toggle('a')
    expect(selection.has('a')).toBe(true)

    selection.toggle('a')
    expect(selection.has('a')).toBe(false)
  })

  it('selects a range from the last touched row', () => {
    const selection = new SelectionModel()

    selection.select('b')
    selection.selectRange('d', ordered)

    expect(selection.value.sort()).toEqual(['b', 'c', 'd'])
  })

  it('selects a range backwards too', () => {
    const selection = new SelectionModel()

    selection.select('d')
    selection.selectRange('b', ordered)

    expect(selection.value.sort()).toEqual(['b', 'c', 'd'])
  })

  it('never selects disabled rows', () => {
    const selection = new SelectionModel({ isDisabled: (id) => id === 'c' })

    selection.selectAll(ordered)

    expect(selection.has('c')).toBe(false)
    expect(selection.allSelected(ordered)).toBe(true)
  })

  it('reports partial selection', () => {
    const selection = new SelectionModel()

    selection.select('a')

    expect(selection.someSelected(ordered)).toBe(true)
    expect(selection.allSelected(ordered)).toBe(false)
  })
})
