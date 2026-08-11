export type DocumentSide = 'left' | 'right'

export type DocumentTarget =
  | {
      kind: 'local'
      sessionId: string
      entryId: string
      side: DocumentSide
    }
  | {
      kind: 'gitWorktree'
      sessionId: string
      entryId: string
    }
  | {
      kind: 'gitIndex'
      sessionId: string
      entryId: string
    }
  | {
      kind: 'scratch'
      sourceSessionId: string
      sourceEntryId: string
      sourceSide: DocumentSide
    }

export interface DocumentRevision {
  sha256: string
  size: number
  modifiedNs: string | null
  gitOid: string | null
  indexOid: string | null
}

export type DocumentEncoding = 'utf8' | 'utf8-bom' | 'utf16le' | 'utf16be'
export type DocumentLineEnding = 'lf' | 'crlf' | 'cr'

export interface DocumentFormat {
  encoding: DocumentEncoding
  lineEnding: DocumentLineEnding
  hasTrailingNewline: boolean
  mode: number | null
}

export interface EditableDocument {
  target: DocumentTarget
  name: string
  displayPath: string
  contents: string
  revision: DocumentRevision
  format: DocumentFormat
  readOnly: boolean
  cacheKey: string
}

export type MutationError =
  | { code: 'STALE_DOCUMENT'; currentRevision: DocumentRevision }
  | { code: 'NO_LONGER_CONFLICTED' }
  | { code: 'PATH_OUTSIDE_SESSION' }
  | { code: 'READ_ONLY_SOURCE' }
  | { code: 'UNSUPPORTED_ENCODING' }
  | { code: 'PATCH_DOES_NOT_APPLY' }

export interface SaveDocumentRequest {
  target: DocumentTarget
  contents: string
  expectedRevision: DocumentRevision
  format?: Partial<Pick<DocumentFormat, 'encoding' | 'lineEnding' | 'hasTrailingNewline'>>
  overwrite?: boolean
}

export interface SaveDocumentsRequest {
  documents: SaveDocumentRequest[]
}

export interface SaveDocumentResult {
  document: EditableDocument
}

export interface SaveDocumentAsRequest {
  target: DocumentTarget
  contents: string
  format: DocumentFormat
  suggestedName: string
}

export interface SaveDocumentAsResult {
  canceled: boolean
  path: string | null
  revision: DocumentRevision | null
}

export interface ExternalDocumentChange {
  target: DocumentTarget
  revision: DocumentRevision | null
}

export type MutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: MutationError }

export interface DiffEntryCapabilities {
  editLeft: boolean
  editRight: boolean
  editIndex: boolean
  save: boolean
  saveAs: boolean
  partialApplyLeftToRight: boolean
  partialApplyRightToLeft: boolean
  stageHunks: boolean
  unstageHunks: boolean
  discardHunks: boolean
  resolveConflict: boolean
  comment: boolean
  search: boolean
}

export interface DocumentDraft {
  schemaVersion: 1
  id: string
  target: DocumentTarget
  contents: string
  originalRevision: DocumentRevision
  format: DocumentFormat
  selections: Array<{
    start: { line: number; character: number }
    end: { line: number; character: number }
    direction: -1 | 0 | 1
  }>
  scrollTop: number
  updatedAt: string
}

export interface DraftSummary {
  id: string
  target: DocumentTarget
  updatedAt: string
  size: number
}

export type SaveDraftRequest = Omit<DocumentDraft, 'schemaVersion' | 'id' | 'updatedAt'> & {
  id?: string
}
