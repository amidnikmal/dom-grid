export type RowId = string | number

export interface SelectionOptions {
  /** Rows that cannot be selected, by id. */
  isDisabled?: (id: RowId) => boolean
}

/**
 * Which rows are selected.
 *
 * Works with ids rather than indices, so selection survives sorting and
 * filtering. Range selection takes the ordered list of ids the view currently
 * shows, which is the only thing the engine cannot know on its own.
 */
export class SelectionModel {
  private selected = new Set<RowId>()
  private anchor: RowId | null = null
  private readonly isDisabled: (id: RowId) => boolean

  constructor(options: SelectionOptions = {}) {
    this.isDisabled = options.isDisabled ?? (() => false)
  }

  get value(): RowId[] {
    return [...this.selected]
  }

  get size(): number {
    return this.selected.size
  }

  has(id: RowId): boolean {
    return this.selected.has(id)
  }

  toggle(id: RowId): void {
    if (this.isDisabled(id)) return

    if (this.selected.has(id)) this.selected.delete(id)
    else this.selected.add(id)

    this.anchor = id
  }

  select(id: RowId): void {
    if (this.isDisabled(id)) return

    this.selected.add(id)
    this.anchor = id
  }

  /** Shift-click: everything between the anchor and the given row. */
  selectRange(id: RowId, ordered: RowId[]): void {
    const to = ordered.indexOf(id)
    const from = this.anchor === null ? to : ordered.indexOf(this.anchor)
    if (to === -1 || from === -1) return this.select(id)

    const [start, end] = from <= to ? [from, to] : [to, from]

    for (let index = start; index <= end; index++) {
      const current = ordered[index]
      if (current !== undefined && !this.isDisabled(current)) this.selected.add(current)
    }
  }

  selectAll(ordered: RowId[]): void {
    ordered.forEach((id) => {
      if (!this.isDisabled(id)) this.selected.add(id)
    })
  }

  /** True when every selectable row of the list is selected. */
  allSelected(ordered: RowId[]): boolean {
    const selectable = ordered.filter((id) => !this.isDisabled(id))
    return selectable.length > 0 && selectable.every((id) => this.selected.has(id))
  }

  someSelected(ordered: RowId[]): boolean {
    return !this.allSelected(ordered) && ordered.some((id) => this.selected.has(id))
  }

  clear(): void {
    this.selected.clear()
    this.anchor = null
  }

  set(ids: RowId[]): void {
    this.selected = new Set(ids.filter((id) => !this.isDisabled(id)))
  }
}
