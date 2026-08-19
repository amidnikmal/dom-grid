import type { ColumnKey } from './types'

/**
 * A ref callback is recreated on every render, and the framework calls the
 * previous one with null after the new one already registered the live node.
 * Dropping a record blindly would then unregister an element that is very much
 * in the document, so only detached nodes are forgotten.
 */
function isStale(element: HTMLElement | undefined): boolean {
  return element === undefined || !element.isConnected
}

/**
 * Nodes the markup handed over, addressed directly instead of being looked up.
 * A grid never queries the DOM: the view registers nodes as it creates them,
 * which keeps the engine independent of the markup structure.
 */
export class NodeRegistry {
  readonly headerCells = new Map<ColumnKey, HTMLElement>()
  readonly rows = new Map<number, HTMLElement>()
  private readonly cells = new Map<number, Map<ColumnKey, HTMLElement>>()

  setHeaderCell(key: ColumnKey, element: HTMLElement | null): void {
    if (element) {
      this.headerCells.set(key, element)
      return
    }

    if (isStale(this.headerCells.get(key))) this.headerCells.delete(key)
  }

  setRow(index: number, element: HTMLElement | null): void {
    if (element) {
      this.rows.set(index, element)
      return
    }

    if (isStale(this.rows.get(index))) this.rows.delete(index)
  }

  setCell(rowIndex: number, key: ColumnKey, element: HTMLElement | null): void {
    if (element) {
      const row = this.cells.get(rowIndex) ?? new Map<ColumnKey, HTMLElement>()
      row.set(key, element)
      this.cells.set(rowIndex, row)
      return
    }

    const row = this.cells.get(rowIndex)
    if (!isStale(row?.get(key))) return

    row?.delete(key)
    if (row?.size === 0) this.cells.delete(rowIndex)
  }

  rowCells(rowIndex: number): Map<ColumnKey, HTMLElement> | undefined {
    return this.cells.get(rowIndex)
  }

  eachCell(visit: (element: HTMLElement, key: ColumnKey, rowIndex: number) => void): void {
    this.cells.forEach((row, rowIndex) => {
      row.forEach((element, key) => visit(element, key, rowIndex))
    })
  }

  clear(): void {
    this.headerCells.clear()
    this.rows.clear()
    this.cells.clear()
  }
}
