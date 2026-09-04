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

export interface ReviewChangeRange {
  changeIndex: number
  leftStart: number
  leftCount: number
  rightStart: number
  rightCount: number
}

export interface ReviewHunkSummary {
  index: number
  header: string
  fingerprint: HunkFingerprint
  changes: ReviewChangeRange[]
  changeCount: number
}

export type PartialChangeOperation =
  | 'applyRightToLeft'
  | 'applyLeftToRight'
  | 'applyBothToLeft'
  | 'applyBothToRight'
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

export interface ReviewAuthor {
  id: string
  name: string
  avatar: string | null
}

export interface ReviewAnchor {
  side: 'deletions' | 'additions'
  lineNumber: number
  revision: string
  lineHash: string
  contextBefore: string[]
  contextAfter: string[]
}

export interface ReviewComment {
  id: string
  author: ReviewAuthor
  body: string
  createdAt: string
  editedAt: string | null
}

export interface ReviewThread {
  id: string
  compareIdentity: string
  entryIdentity: string
  anchor: ReviewAnchor
  state: 'open' | 'resolved' | 'outdated'
  comments: ReviewComment[]
  createdAt: string
  updatedAt: string
}

export interface ReviewThreadCount {
  open: number
  resolved: number
  outdated: number
  total: number
}

export interface ReviewBundle {
  schemaVersion: 1
  compareIdentity: string
  threads: ReviewThread[]
  decisions: ReviewDecision[]
  exportedAt: string
}

export interface ReviewCommentDraft {
  key: string
  body: string
  updatedAt: string
}

export type ReviewDecisionStatus = 'accepted' | 'rejected' | 'needsChanges'

export interface ReviewDecision {
  entryIdentity: string
  fingerprint: HunkFingerprint
  changeIndex: number | null
  status: ReviewDecisionStatus
  updatedAt: string
}

export interface CreateReviewThreadRequest {
  sessionId: string
  entryId: string
  side: ReviewAnchor['side']
  lineNumber: number
  body: string
  author: ReviewAuthor
}

export interface ReplyReviewThreadRequest {
  sessionId: string
  threadId: string
  body: string
  author: ReviewAuthor
}

export interface ReattachReviewThreadRequest {
  sessionId: string
  entryId: string
  threadId: string
  side: ReviewAnchor['side']
  lineNumber: number
}
