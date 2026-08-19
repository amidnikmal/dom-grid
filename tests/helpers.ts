import type { GridElements } from '../src/core/index'

export interface Harness extends GridElements {
  cell: (rowIndex: number, key: string) => HTMLElement
  headerCell: (key: string) => HTMLElement
  row: (index: number) => HTMLElement
  cleanup: () => void
}

/** Minimal markup a grid can drive: a viewport, a header, a body, two scrollbars. */
export function createHarness(width = 500, height = 200): Harness {
  const root = document.createElement('div')
  root.style.cssText = `position:relative;overflow:hidden;width:${width}px;height:${height}px`

  const headerRow = document.createElement('div')
  const body = document.createElement('div')
  const verticalScrollbar = document.createElement('div')
  const horizontalScrollbar = document.createElement('div')

  verticalScrollbar.style.cssText = `position:absolute;right:0;top:0;width:16px;height:${height}px;overflow-y:auto`
  horizontalScrollbar.style.cssText = `position:absolute;bottom:0;left:0;height:16px;width:${width}px;overflow-x:auto`

  const vInner = document.createElement('div')
  const hInner = document.createElement('div')
  vInner.style.height = '10000px'
  hInner.style.width = '10000px'
  verticalScrollbar.append(vInner)
  horizontalScrollbar.append(hInner)

  root.append(headerRow, body, verticalScrollbar, horizontalScrollbar)
  document.body.append(root)

  const make = (parent: HTMLElement) => {
    const element = document.createElement('div')
    element.style.position = 'absolute'
    parent.append(element)
    return element
  }

  const rows = new Map<number, HTMLElement>()

  return {
    root,
    body,
    headerRow,
    verticalScrollbar,
    horizontalScrollbar,
    headerCell: () => make(headerRow),
    row: (index) => {
      const element = make(body)
      rows.set(index, element)
      return element
    },
    cell: (rowIndex) => make(rows.get(rowIndex) ?? body),
    cleanup: () => root.remove(),
  }
}
