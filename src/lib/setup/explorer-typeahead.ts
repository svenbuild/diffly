// Shared type-ahead filtering + keyboard reducer for the setup explorers
// (Local PickerPane and the Git repository browser). Keeping the pure logic in
// one place ensures both explorers behave identically; each component supplies
// its own filtered-list rendering and action callbacks.

export interface TypeAheadRow {
  entry: { name: string }
}

// Case-insensitive substring filter on entry names. An empty query returns the
// original array reference so callers can skip work when nothing is filtered.
export function filterRows<T extends TypeAheadRow>(rows: T[], query: string): T[] {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return rows
  }
  return rows.filter((row) => row.entry.name.toLowerCase().includes(needle))
}

export type TypeAheadAction = 'none' | 'open' | 'select' | 'goUp'

export interface TypeAheadState {
  query: string
  highlightedIndex: number
  rowCount: number
}

export interface TypeAheadResult {
  query: string
  highlightedIndex: number
  action: TypeAheadAction
  // Whether the key was consumed (caller should preventDefault).
  handled: boolean
}

// Reduce a keydown event into the next type-ahead state plus an action for the
// component to perform. Pure: never touches the DOM. Modifier combos (Ctrl/Cmd/
// Alt) are passed through so system shortcuts (copy/paste, etc.) keep working.
export function reduceTypeAheadKey(
  event: KeyboardEvent,
  state: TypeAheadState,
): TypeAheadResult {
  const { query, rowCount } = state
  const passthrough: TypeAheadResult = {
    query,
    highlightedIndex: state.highlightedIndex,
    action: 'none',
    handled: false,
  }

  if (event.ctrlKey || event.metaKey || event.altKey) {
    return passthrough
  }

  const clamp = (index: number) => Math.max(0, Math.min(index, rowCount - 1))
  const firstIndex = rowCount > 0 ? 0 : -1

  switch (event.key) {
    case 'ArrowDown':
      return { query, highlightedIndex: rowCount ? clamp(state.highlightedIndex + 1) : -1, action: 'none', handled: true }
    case 'ArrowUp':
      return { query, highlightedIndex: rowCount ? clamp(state.highlightedIndex - 1) : -1, action: 'none', handled: true }
    case 'Home':
      return { query, highlightedIndex: firstIndex, action: 'none', handled: true }
    case 'End':
      return { query, highlightedIndex: rowCount ? rowCount - 1 : -1, action: 'none', handled: true }
    case 'Enter':
      return { query, highlightedIndex: state.highlightedIndex, action: 'open', handled: true }
    case ' ':
      return { query, highlightedIndex: state.highlightedIndex, action: 'select', handled: true }
    case 'Escape':
      return { query: '', highlightedIndex: firstIndex, action: 'none', handled: query.length > 0 }
    case 'Backspace':
      if (query.length > 0) {
        return { query: query.slice(0, -1), highlightedIndex: firstIndex, action: 'none', handled: true }
      }
      return { query, highlightedIndex: state.highlightedIndex, action: 'goUp', handled: true }
    default:
      // A single printable character extends the filter and resets the
      // highlight to the first match.
      if (event.key.length === 1) {
        return { query: query + event.key, highlightedIndex: firstIndex, action: 'none', handled: true }
      }
      return passthrough
  }
}
