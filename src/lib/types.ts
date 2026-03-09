export type CompareMode = 'file' | 'directory'
export type ViewMode = 'sideBySide' | 'unified'
export type EntryStatus = 'modified' | 'leftOnly' | 'rightOnly' | 'binary' | 'tooLarge'
export type ContentKind = 'text' | 'binary' | 'tooLarge'
export type DiffChange = 'context' | 'delete' | 'insert'
export type PathKind = 'file' | 'directory'

export interface CompareOptions {
  ignoreWhitespace: boolean
  ignoreCase: boolean
}

export interface DirectoryEntryResult {
  relativePath: string
  status: EntryStatus
  leftPath: string | null
  rightPath: string | null
  leftSize: number | null
  rightSize: number | null
}

export interface DiffCell {
  lineNumber: number | null
  prefix: string
  text: string
  change: DiffChange
}

export interface SideBySideRow {
  left: DiffCell | null
  right: DiffCell | null
}

export interface UnifiedLine {
  leftLineNumber: number | null
  rightLineNumber: number | null
  prefix: string
  text: string
  change: DiffChange
}

export interface FileDiffResult {
  contentKind: ContentKind
  summary: string
  leftLabel: string
  rightLabel: string
  sideBySide: SideBySideRow[]
  unified: UnifiedLine[]
}

export type CompareResponse =
  | {
      kind: 'directory'
      entries: DirectoryEntryResult[]
    }
  | {
      kind: 'file'
      result: FileDiffResult
    }
