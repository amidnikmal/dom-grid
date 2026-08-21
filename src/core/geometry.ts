import type { ColumnDef, ColumnLayout, GridLayout } from './types'

export const DEFAULT_MIN_COLUMN_WIDTH = 24

function clampWidth(width: number, column: ColumnDef, minWidth: number): number {
  const lower = Math.max(column.minWidth ?? minWidth, minWidth)
  const upper = column.maxWidth ?? Number.POSITIVE_INFINITY

  return Math.min(Math.max(width, lower), upper)
}

function isAuto(column: ColumnDef): boolean {
  return column.width === undefined || column.width === 'auto'
}

/**
 * Shares the leftover space between the automatic columns.
 *
 * A single division is not enough: a column that hits its minimum or maximum
 * stops taking part, and what it did not take has to go to the others. Each
 * pass fixes the columns that clamped and divides the rest again, until every
 * remaining column fits within its bounds — the usual flex-style resolution.
 */
function shareSpace(
  columns: ColumnDef[],
  spare: number,
  minColumnWidth: number,
): Map<string, number> {
  const resolved = new Map<string, number>()
  let free = spare
  let sharing = [...columns]

  while (sharing.length) {
    const each = free / sharing.length
    const clamped = sharing.filter((column) => clampWidth(each, column, minColumnWidth) !== each)

    if (!clamped.length) {
      sharing.forEach((column) => resolved.set(column.key, each))
      return resolved
    }

    clamped.forEach((column) => {
      const width = clampWidth(each, column, minColumnWidth)
      resolved.set(column.key, width)
      free -= width
    })

    sharing = sharing.filter((column) => !resolved.has(column.key))
  }

  return resolved
}

/**
 * Resolves column widths and offsets.
 *
 * A pure function of the column definitions and the available width, so the
 * result is trivially testable and can be applied whenever the caller wants.
 * Pinned columns live in their own zones and never shift the scrollable flow.
 */
export function computeLayout(
  columns: ColumnDef[],
  availableWidth: number,
  minColumnWidth = DEFAULT_MIN_COLUMN_WIDTH,
): GridLayout {
  const explicitWidth = columns
    .filter((column) => !isAuto(column))
    .reduce((sum, column) => sum + clampWidth(column.width as number, column, minColumnWidth), 0)

  const autoColumns = columns.filter(isAuto)
  const spare = Math.max(availableWidth - explicitWidth, 0)
  const autoWidths = shareSpace(autoColumns, spare, minColumnWidth)

  let flowOffset = 0
  let leftOffset = 0
  let rightOffset = 0

  const resolved: ColumnLayout[] = columns.map((column) => {
    const width = isAuto(column)
      ? (autoWidths.get(column.key) ?? minColumnWidth)
      : clampWidth(column.width as number, column, minColumnWidth)

    let left: number
    if (column.pinned === 'left') {
      left = leftOffset
      leftOffset += width
    } else if (column.pinned === 'right') {
      left = rightOffset
      rightOffset += width
    } else {
      left = flowOffset
      flowOffset += width
    }

    return { key: column.key, width, left, pinned: column.pinned }
  })

  // Right-pinned columns are laid out from the right edge, so their offsets
  // are mirrored once the total width of that zone is known.
  resolved.forEach((column) => {
    if (column.pinned === 'right') column.left = rightOffset - column.left - column.width
  })

  return {
    columns: resolved,
    flowWidth: flowOffset,
    leftWidth: leftOffset,
    rightWidth: rightOffset,
  }
}

export function findColumn(layout: GridLayout, key: string): ColumnLayout | undefined {
  return layout.columns.find((column) => column.key === key)
}
