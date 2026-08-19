import type { ColumnKey } from './types'

export type SortDirection = 'asc' | 'desc'

export interface SortEntry {
  key: ColumnKey
  direction: SortDirection
}

export interface SortOptions {
  /** Allow sorting by several columns at once, in click order. */
  multiple?: boolean
}

/**
 * Sort state, not sorting itself.
 *
 * The engine knows nothing about the data, so it tracks which columns are
 * sorted and in what order; applying that to rows is up to the caller. Clicking
 * a column cycles through ascending, descending and unsorted.
 */
export class SortState {
  private entries: SortEntry[] = []
  private readonly multiple: boolean

  constructor(options: SortOptions = {}) {
    this.multiple = options.multiple ?? false
  }

  get value(): SortEntry[] {
    return this.entries
  }

  directionOf(key: ColumnKey): SortDirection | null {
    return this.entries.find((entry) => entry.key === key)?.direction ?? null
  }

  /** Priority of a column when several are sorted, or null if it is not. */
  priorityOf(key: ColumnKey): number | null {
    const index = this.entries.findIndex((entry) => entry.key === key)
    return index === -1 ? null : index + 1
  }

  toggle(key: ColumnKey): SortEntry[] {
    const current = this.directionOf(key)
    const next: SortDirection | null =
      current === null ? 'asc' : current === 'asc' ? 'desc' : null

    if (!this.multiple) {
      this.entries = next ? [{ key, direction: next }] : []
      return this.entries
    }

    if (!next) {
      this.entries = this.entries.filter((entry) => entry.key !== key)
      return this.entries
    }

    // Flipping the direction keeps the column where it is: priority follows
    // the order columns were added to the sort, not the latest click.
    const existing = this.entries.findIndex((entry) => entry.key === key)
    if (existing === -1) this.entries = [...this.entries, { key, direction: next }]
    else {
      this.entries = this.entries.map((entry) =>
        entry.key === key ? { key, direction: next } : entry,
      )
    }

    return this.entries
  }

  set(entries: SortEntry[]): void {
    this.entries = this.multiple ? entries : entries.slice(0, 1)
  }

  clear(): void {
    this.entries = []
  }
}
