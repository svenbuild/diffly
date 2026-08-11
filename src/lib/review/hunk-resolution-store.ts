import { writable } from 'svelte/store'
import type { PartialChangeOperation, PartialChangeSelection, ReviewHunkSummary } from '../review-types'

export interface PlannedHunkOperation {
  entryId: string
  operation: PartialChangeOperation
  selection: PartialChangeSelection
}

export interface HunkResolutionState {
  hunksByEntry: Map<string, ReviewHunkSummary[]>
  planned: Map<string, PlannedHunkOperation>
  loadingEntryId: string | null
  applying: boolean
  error: string | null
}

export const hunkResolution = writable<HunkResolutionState>({
  hunksByEntry: new Map(),
  planned: new Map(),
  loadingEntryId: null,
  applying: false,
  error: null,
})

export function hunkSelectionKey(entryId: string, selection: PartialChangeSelection) {
  const value = selection.fingerprint
  return [entryId, value.oldStart, value.oldCount, value.newStart, value.newCount, value.contextHash, value.changeHash, selection.changeIndex ?? 'all'].join(':')
}
