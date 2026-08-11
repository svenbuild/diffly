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

export interface ReviewBundle {
  schemaVersion: 1
  compareIdentity: string
  threads: ReviewThread[]
  exportedAt: string
}

export interface ReviewCommentDraft {
  key: string
  body: string
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
