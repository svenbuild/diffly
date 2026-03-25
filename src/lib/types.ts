import type { AppearanceMode, AppearanceSettings } from './theme'

export type CompareMode = 'file' | 'directory'
export type ViewMode = 'sideBySide' | 'unified'
export type ThemeMode = AppearanceMode
export type ContextLinesSetting = 3 | 10 | 20
export type EntryStatus = 'modified' | 'leftOnly' | 'rightOnly' | 'binary' | 'tooLarge'
export type ContentKind = 'text' | 'binary' | 'tooLarge'
export type DiffChange = 'context' | 'delete' | 'insert'
export type PathKind = 'file' | 'directory'
export type ExplorerEntryKind = 'drive' | 'directory' | 'file'
export type UpdateChannel = 'stable' | 'prerelease'

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
