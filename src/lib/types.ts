import type { AppearanceMode, AppearanceSettings } from './theme'

export type CompareMode = 'file' | 'directory'
export type InteractionMode = 'compare' | 'merge' | 'edit'
export type ViewMode = 'sideBySide' | 'unified'
export type ThemeMode = AppearanceMode
export type ContextLinesSetting = 3 | 10 | 20
export type EntryStatus = 'modified' | 'leftOnly' | 'rightOnly' | 'binary' | 'tooLarge'
export type ContentKind = 'text' | 'image' | 'binary' | 'tooLarge'
export type DiffChange = 'context' | 'delete' | 'insert'
export type PathKind = 'file' | 'directory'
export type ExplorerEntryKind = 'drive' | 'directory' | 'file'
export type UpdateChannel = 'stable' | 'prerelease'

export interface LaunchContext {
  openHerePath: string
}

export interface PersistedExplorerPane {
  currentPath: string
  history: string[]
  historyIndex: number
  selectedTargetPath: string
  selectedTargetKind: PathKind | null
}

export interface PersistedSession {
  mode: CompareMode
  viewMode: ViewMode
  themeMode?: ThemeMode
  appearance?: AppearanceSettings
  ignoreWhitespace: boolean
  ignoreCase: boolean
  showFullFile: boolean
  showInlineHighlights: boolean
  wrapSideBySideLines?: boolean
  showSyntaxHighlighting?: boolean
  syncSideBySideScroll?: boolean
  viewerTextSize?: number
  contextLines?: ContextLinesSetting
  checkForUpdatesOnLaunch?: boolean
  updateChannel?: UpdateChannel
  lastUpdateCheckAt?: string
  leftPane: PersistedExplorerPane
  rightPane: PersistedExplorerPane
}

export interface CompareOptions {
  ignoreWhitespace: boolean
  ignoreCase: boolean
}

export interface ExplorerEntry {
  name: string
  path: string
  kind: ExplorerEntryKind
  size: number | null
  modifiedMs: number | null
}

export interface DirectoryListing {
  path: string
  parentPath: string | null
  directories: ExplorerEntry[]
  files: ExplorerEntry[]
}

export interface PathInfo {
  path: string
  exists: boolean
  isDirectory: boolean
  isFile: boolean
  parentPath: string | null
  name: string
}

export interface DirectoryEntryResult {
  relativePath: string
  status: EntryStatus
  leftPath: string | null
  rightPath: string | null
  leftSize: number | null
  rightSize: number | null
}

export interface BinaryFileMeta {
  exists: boolean
  path: string
  size: number | null
  sha256: string | null
  format: string | null
  identicalToOtherSide: boolean
}

export interface ImageDiffPayload {
  leftAssetUrl: string | null
  rightAssetUrl: string | null
  leftMeta: BinaryFileMeta
  rightMeta: BinaryFileMeta
}

export interface HexCell {
  hex: string
  ascii: string
  changed: boolean
}

export interface HexRow {
  offset: number
  left: HexCell[]
  right: HexCell[]
}

export interface BinaryDiffPayload {
  leftMeta: BinaryFileMeta
  rightMeta: BinaryFileMeta
  rows: HexRow[]
  bytesPerRow: 16
  changedByteCount: number | null
  firstDifferenceOffset: number | null
  truncated: boolean
}

export interface TextDiffPayload {
  leftText: string
  rightText: string
  leftExists: boolean
  rightExists: boolean
  leftSha256: string | null
  rightSha256: string | null
  leftLineEnding: 'lf' | 'crlf'
  rightLineEnding: 'lf' | 'crlf'
  leftHasTrailingNewline: boolean
  rightHasTrailingNewline: boolean
}

export interface DiffCell {
  lineNumber: number | null
  prefix: string
  text: string
  segments: DiffSegment[]
  change: DiffChange
}

export interface DiffSegment {
  text: string
  highlighted: boolean
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
  segments: DiffSegment[]
  change: DiffChange
}

export interface FileDiffResult {
  contentKind: ContentKind
  summary: string
  leftLabel: string
  rightLabel: string
  sideBySide: SideBySideRow[]
  unified: UnifiedLine[]
  text?: TextDiffPayload | null
  image?: ImageDiffPayload | null
  binary?: BinaryDiffPayload | null
}

export interface UpdateMetadata {
  version: string
  currentVersion: string
  body?: string | null
  date?: string | null
}

export interface UpdateCheckResult {
  kind: 'available' | 'upToDate' | 'unavailable' | 'error'
  available: boolean
  metadata: UpdateMetadata | null
  message?: string | null
}

export interface UpdateActionResult {
  kind: 'downloaded' | 'installed' | 'unavailable' | 'error'
  message?: string | null
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
