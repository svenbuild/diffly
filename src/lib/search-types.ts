import type { DocumentRevision, DocumentTarget, EditableDocument, MutationResult } from './workspace-types'

export type ComparisonSearchScope = 'all' | 'changed' | 'added' | 'deleted' | 'context'

export interface ComparisonSearchQuery {
  text: string
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
  scope: ComparisonSearchScope
  pathFilter: string
}

export interface StartComparisonSearchRequest {
  sessionId: string
  query: ComparisonSearchQuery
}

export interface SearchMatch {
  id: string
  entryId: string
  path: string
  target: DocumentTarget
  side: 'left' | 'right'
  lineNumber: number
  startColumn: number
  endColumn: number
  preview: string
}

export interface SearchBatch {
  matches: SearchMatch[]
  scannedDocuments: number
  totalDocuments: number
  totalMatches: number
  done: boolean
  cancelled: boolean
  error: string | null
}

export interface SearchJobStarted {
  jobId: string
}

export interface ReplaceAllFilePreview {
  target: DocumentTarget
  path: string
  revision: DocumentRevision
  matchCount: number
  before: string
  after: string
}

export interface ReplaceAllPreview {
  files: ReplaceAllFilePreview[]
  totalMatches: number
}

export interface PreviewComparisonReplaceRequest {
  sessionId: string
  query: ComparisonSearchQuery
  replacement: string
}

export interface ApplyComparisonReplaceRequest extends PreviewComparisonReplaceRequest {
  documents: Array<{ target: DocumentTarget; expectedRevision: DocumentRevision }>
}

export type ApplyComparisonReplaceResult = MutationResult<EditableDocument[]>
