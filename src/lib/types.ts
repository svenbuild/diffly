import type { AppearanceMode, AppearanceSettings } from './theme'

export type CompareMode = 'file' | 'directory'
export type ViewMode = 'sideBySide' | 'unified'
export type ThemeMode = AppearanceMode
export type ContextLinesSetting = 3 | 10 | 20
export type EntryStatus = 'modified' | 'leftOnly' | 'rightOnly' | 'unsupported'
export type ContentKind = 'text' | 'unsupported'
export type PathKind = 'file' | 'directory'
export type ExplorerEntryKind = 'drive' | 'directory' | 'file'
export type UpdateChannel = 'stable' | 'prerelease'

export interface CompareViewerSettings {
  diffStyle: 'split' | 'unified'
  codeOverflow: 'scroll' | 'wrap'
  diffIndicators: 'bars' | 'classic' | 'none'
  lineDiffType: 'word-alt' | 'word' | 'char' | 'none'
  hunkSeparators: 'line-info' | 'line-info-basic' | 'metadata' | 'simple'
  expandUnchanged: boolean
  collapsedContextThreshold: number
  expansionLineCount: number
  disableLineNumbers: boolean
  disableFileHeader: boolean
  disableBackground: boolean
  disableVirtualizationBuffers: boolean
  stickyHeader: boolean
  syntaxMode: 'shiki' | 'plain'
  preferredHighlighter: 'shiki-js' | 'shiki-wasm'
  useCSSClasses: boolean
  tokenizeMaxLineLength: number
  tokenizeMaxLength: number
  maxLineDiffLength: number
  lineHoverHighlight: 'disabled' | 'both' | 'number' | 'line'
  enableTokenInteractionsOnWhitespace: boolean
  enableGutterUtility: boolean
  enableLineSelection: boolean
  controlledSelection: boolean
}

export interface CompareTreeSettings {
  density: 'compact' | 'default' | 'relaxed' | 'custom'
  customDensity: number
  flattenEmptyDirectories: boolean
  stickyFolders: boolean
  initialExpansion: 'closed' | 'open' | 'depth'
  initialExpansionDepth: number
  initialExpandedPaths: string[]
  sortMode: 'path' | 'default'
  searchMode: 'expand-matches' | 'collapse-non-matches' | 'hide-non-matches'
  search: boolean
  searchFakeFocus: boolean
  searchBlurBehavior: 'close' | 'retain'
  initialSearchQuery: string
  initialVisibleRowCount: number
  itemHeight: number
  overscan: number
  dragAndDrop: boolean
  renaming: boolean
}

export type CompareSource =
  | {
      kind: 'localPaths'
      leftPath: string
      rightPath: string
      mode: CompareMode
    }
  | {
      kind: 'gitRepository'
      repoPath: string
      baseRef: string
      headRef: string
      pathFilter?: string[]
    }
  | {
      kind: 'githubPullRequest'
      owner: string
      repo: string
      pullNumber: number
      pathFilter?: string[]
    }

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
  source?: CompareSource
  viewMode?: ViewMode
  viewerSettings?: CompareViewerSettings
  treeSettings?: CompareTreeSettings
  themeMode?: ThemeMode
  appearance?: AppearanceSettings
  ignoreWhitespace: boolean
  ignoreCase: boolean
  showFullFile?: boolean
  showInlineHighlights?: boolean
  wrapSideBySideLines?: boolean
  showSyntaxHighlighting?: boolean
  syncSideBySideScroll?: boolean
  viewerTextSize?: number
  contextLines?: ContextLinesSetting
  checkForUpdatesOnLaunch?: boolean
  updateChannel?: UpdateChannel
  lastUpdateCheckAt?: string
  lastUpdateStatus?: string
  lastUpdateMetadata?: UpdateMetadata | null
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

export interface UnsupportedDiffPayload {
  reason: 'binary' | 'image' | 'tooLarge' | 'missing' | 'readError'
  leftPath: string | null
  rightPath: string | null
  leftSize: number | null
  rightSize: number | null
}

export interface FileDiffResult {
  contentKind: ContentKind
  summary: string
  leftLabel: string
  rightLabel: string
  text?: TextDiffPayload | null
  unsupported?: UnsupportedDiffPayload | null
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

export interface DirectoryCompareUpdate {
  index: number
  entry: DirectoryEntryResult | null
}

export interface StartDirectoryCompareResponse {
  jobId: string
}

export interface PollDirectoryCompareResponse {
  totalCount: number | null
  completedCount: number
  updates: DirectoryCompareUpdate[]
  done: boolean
  error: string | null
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
