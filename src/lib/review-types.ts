import type { DocumentRevision } from './workspace-types'

export interface HunkFingerprint {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  contextHash: string
  changeHash: string
}

export interface PartialChangeSelection {
  fingerprint: HunkFingerprint
  changeIndex?: number
}

export interface ReviewHunkSummary {
  index: number
  header: string
  fingerprint: HunkFingerprint
  changeCount: number
}

export type PartialChangeOperation =
  | 'applyRightToLeft'
  | 'applyLeftToRight'
  | 'stage'
  | 'unstage'
  | 'discard'

export interface ApplyPartialChangeRequest {
  sessionId: string
  entryId: string
  operation: PartialChangeOperation
  selections: PartialChangeSelection[]
  leftRevision: DocumentRevision | null
  rightRevision: DocumentRevision | null
}

export interface OperationJournalEntry {
  id: string
  kind: 'partialChange' | 'conflictResolution' | 'replaceAll'
  sessionId: string
  entryId: string | null
  createdAt: string
  payload: unknown
}
