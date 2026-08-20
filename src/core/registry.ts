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
 *
 * Every element holds exactly one place. A recycled row keeps its node and
 * re-registers it under a new index, and its previous record has to go right
 * away: it never leaves the document, so waiting for a null callback would
 * leave the element listed under both indices and positioned by whichever the
 * iteration reached last.
 */
export class NodeRegistry {
  readonly headerCells = new Map<ColumnKey, HTMLElement>()
  readonly rows = new Map<number, HTMLElement>()
  private readonly cells = new Map<number, Map<ColumnKey, HTMLElement>>()

  /** Where each element is currently registered, to drop its old place. */
  private readonly headerPlaces = new WeakMap<HTMLElement, ColumnKey>()
  private readonly rowPlaces = new WeakMap<HTMLElement, number>()
  private readonly cellPlaces = new WeakMap<HTMLElement, { row: number, key: ColumnKey }>()

  setHeaderCell(key: ColumnKey, element: HTMLElement | null): void {
    if (element) {
      const previous = this.headerPlaces.get(element)
      // Only drop the old record if it still points at this very element:
      // another node may already have taken that place in the same patch, and
      // ref callbacks inside one patch fire in no guaranteed order.
      if (previous !== undefined && previous !== key && this.headerCells.get(previous) === element) {
        this.headerCells.delete(previous)
      }

      this.headerPlaces.set(element, key)
      this.headerCells.set(key, element)
      return
    }

    if (isStale(this.headerCells.get(key))) this.headerCells.delete(key)
  }

  setRow(index: number, element: HTMLElement | null): void {
    if (element) {
      const previous = this.rowPlaces.get(element)
      if (previous !== undefined && previous !== index && this.rows.get(previous) === element) {
        this.rows.delete(previous)
      }

      this.rowPlaces.set(element, index)
      this.rows.set(index, element)
      return
    }

    if (isStale(this.rows.get(index))) this.rows.delete(index)
  }

  setCell(rowIndex: number, key: ColumnKey, element: HTMLElement | null): void {
    if (element) {
      const previous = this.cellPlaces.get(element)
      const movedOn = previous && (previous.row !== rowIndex || previous.key !== key)

      if (movedOn && this.cells.get(previous.row)?.get(previous.key) === element) {
        this.dropCell(previous.row, previous.key)
      }

      this.cellPlaces.set(element, { row: rowIndex, key })

      const row = this.cells.get(rowIndex) ?? new Map<ColumnKey, HTMLElement>()
      row.set(key, element)
      this.cells.set(rowIndex, row)
      return
    }

    if (!isStale(this.cells.get(rowIndex)?.get(key))) return

    this.dropCell(rowIndex, key)
  }

  private dropCell(rowIndex: number, key: ColumnKey): void {
    const row = this.cells.get(rowIndex)
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

  /**
   * Records pointing at an element that has moved elsewhere. Should always be
   * zero: anything else means a node is positioned by a stale entry, which is
   * how rows end up drawn far outside the viewport.
   */
  countStale(): number {
    let stale = 0

    this.rows.forEach((element, index) => {
      if (this.rowPlaces.get(element) !== index) stale++
    })

    this.headerCells.forEach((element, key) => {
      if (this.headerPlaces.get(element) !== key) stale++
    })

    this.cells.forEach((row, rowIndex) => {
      row.forEach((element, key) => {
        const place = this.cellPlaces.get(element)
        if (place?.row !== rowIndex || place?.key !== key) stale++
      })
    })

    return stale
  }

  clear(): void {
    this.headerCells.clear()
    this.rows.clear()
    this.cells.clear()
  }
}
