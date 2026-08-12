import type { AppearanceMode, AppearanceSettings } from './theme'
import type { DiffEntryCapabilities } from './workspace-types'

export type * from './workspace-types'
export type * from './search-types'
export type * from './review-types'
export type * from './conflict-types'

export type CompareMode = 'file' | 'directory'
export type SetupMode = 'git' | 'local' | 'github'
export type ViewMode = 'sideBySide' | 'unified'
export type ThemeMode = AppearanceMode
export type ContextLinesSetting = 3 | 10 | 20
export type EntryStatus = 'modified' | 'leftOnly' | 'rightOnly' | 'unsupported' | 'unchanged'
export type ContentKind = 'text' | 'unsupported'
export type PathKind = 'file' | 'directory'
export type ExplorerEntryKind = 'drive' | 'directory' | 'file'
export type UpdateChannel = 'stable' | 'prerelease'

export type DiffSource =
  | LocalDiffSource
  | GitDiffSource
  | GithubPullRequestSource
  | GithubCompareSource
  | GithubCommitSource

export interface LocalDiffSource {
  kind: 'local'
  leftPath: string
  rightPath: string
  compareMode: 'file' | 'directory'
}

export interface GitDiffSource {
  kind: 'git'
  repoPath: string
  repositoryRoot: string
  selection: GitSelection
}

export interface GitRepositoryValidation {
  valid: boolean
  inputPath: string
  repositoryRoot: string | null
  gitDir: string | null
  currentBranch: string | null
  headSha: string | null
  isBare: boolean
  isWorktree: boolean
  error: string | null
}

export type GitRefKind = 'localBranch' | 'remoteBranch' | 'tag'

export interface GitRef {
  name: string
  fullName: string
  sha: string
  kind: GitRefKind
}

export interface GitCommitSummary {
  sha: string
  shortSha: string
  subject: string
  decorations: string[]
}

export interface GitRefsResponse {
  currentBranch: string | null
  headSha: string | null
  localBranches: GitRef[]
  remoteBranches: GitRef[]
  tags: GitRef[]
  recentCommits: GitCommitSummary[]
}

export interface GitRefValidation {
  valid: boolean
  resolvedSha: string | null
}

export interface GitSetupDraft {
  advancedOpen: boolean
  inputPath: string
  selectionKind: 'refRange' | 'commit'
  baseRef: string
  headRef: string
  notation: 'twoDot' | 'threeDot'
  commitRef: string
}

export type GitSelection =
  | {
      kind: 'workingTree'
      initialScope: GitWorkingTreeScope
      currentBranch?: string | null
    }
  | {
      kind: 'refRange'
      baseRef: string
      headRef: string
      notation: 'twoDot' | 'threeDot'
    }
  | {
      kind: 'commit'
      commitRef: string
    }

export type GitWorkingTreeScope =
  | 'all'
  | 'staged'
  | 'unstaged'
  | 'untracked'

export type GitWorkingTreeReviewAction =
  | 'stage'
  | 'unstage'
  | 'discard'

export interface GitWorkingTreeReviewCapabilities {
  stage: boolean
  unstage: boolean
  discard: boolean
}

export interface GithubPullRequestSource {
  kind: 'githubPullRequest'
  owner: string
  repo: string
  pullNumber: number
  url: string
}

export interface GithubCompareSource {
  kind: 'githubCompare'
  owner: string
  repo: string
  baseRef: string
  headRef: string
  notation: 'twoDot' | 'threeDot'
  url: string
}

export interface GithubCommitSource {
  kind: 'githubCommit'
  owner: string
  repo: string
  commitRef: string
  url: string
}

export type GithubDiffSource = GithubPullRequestSource | GithubCompareSource | GithubCommitSource

export interface GithubPullRequestMetadata {
  owner: string
  repo: string
  pullNumber: number
  title: string
  state: 'open' | 'closed' | 'merged' | string
  baseRef: string
  headRef: string
  baseSha: string
  headSha: string
  htmlUrl: string
  changedFiles: number | null
}

export interface RecentSources {
  defaultSetupMode: SetupMode
  gitRepositories: RecentGitRepository[]
  githubPullRequests: RecentGithubPullRequest[]
  githubCompares: RecentGithubCompare[]
  localTargets: RecentLocalTarget[]
}

export interface RecentGitRepository {
  id: string
  repoPath: string
  repositoryRoot: string
  name: string
  lastBranch: string | null
  lastUsedAt: string
}

export interface RecentGithubPullRequest {
  id: string
  url: string
  owner: string
  repo: string
  pullNumber: number
  title: string | null
  lastUsedAt: string
}

export interface RecentGithubCompare {
  id: string
  url: string
  owner: string
  repo: string
  baseRef: string
  headRef: string
  notation: 'twoDot' | 'threeDot'
  lastUsedAt: string
}

export interface RecentLocalTarget {
  id: string
  leftPath: string
  rightPath: string
  compareMode: CompareMode
  name: string
  lastUsedAt: string
}

export type DiffEntryStatus =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'typeChanged'
  | 'untracked'
  | 'conflicted'
  | 'unsupported'

export interface DiffEntry {
  id: string
  path: string
  oldPath?: string | null
  displayPath: string
  status: DiffEntryStatus
  conflictKind?: import('./conflict-types').ConflictKind
  scope?: GitWorkingTreeScope
  gitReviewCapabilities?: GitWorkingTreeReviewCapabilities
  leftSize: number | null
  rightSize: number | null
  binary?: boolean
  diffPatchText?: string | null
  diffPatchCacheKey?: string | null
  capabilities: DiffEntryCapabilities
}

export interface DiffEntryFilter {
  scope?: GitWorkingTreeScope
  search?: string
}

export interface CreateDiffSessionResponse {
  sessionId: string
  source: DiffSource
  entries: DiffEntry[]
  createdAt: number
  updatedAt: number
}

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
  tokenHover: boolean
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
  iconSet: 'minimal' | 'standard' | 'complete' | 'none'
  coloredIcons: boolean
  showUnmodified: boolean
}

export type LegacyCompareSource =
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

export type CompareSource = LegacyCompareSource

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

export interface PersistedGitSetupBrowser {
  currentPath: string
  history: string[]
  historyIndex: number
}

export interface PersistedGitSetup {
  browser?: PersistedGitSetupBrowser
}

export interface PersistedSession {
  mode: CompareMode
  setupMode?: SetupMode
  source?: DiffSource
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
  gitSetup?: PersistedGitSetup
}

export interface CompareOptions {
  ignoreWhitespace: boolean
  ignoreCase: boolean
  // Local directory compare only: also return files that are equal on both
  // sides with status 'unchanged'. Optional so persisted/legacy callers and
  // git/github flows stay unaffected.
  includeUnchanged?: boolean
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
  displayPath?: string
  status: EntryStatus
  leftPath: string | null
  rightPath: string | null
  leftSize: number | null
  rightSize: number | null
  diffEntryId?: string
  diffEntryAliasIds?: string[]
  diffEntryStatus?: DiffEntryStatus
  conflictKind?: import('./conflict-types').ConflictKind
  diffEntryScope?: GitWorkingTreeScope
  gitReviewCapabilities?: GitWorkingTreeReviewCapabilities
  binary?: boolean
  diffPatchText?: string | null
  diffPatchCacheKey?: string | null
  capabilities?: DiffEntryCapabilities
  reviewThreadCount?: import('./review-types').ReviewThreadCount
}

// Selects how the directory diff list loads each entry's details. Local paths
// resolve through the existing base/relativePath loader; session-backed sources
// (git working tree, later GitHub PRs) load by diff-session entry id instead, so
// no local filesystem paths are derived.
export type DirectoryDetailLoader =
  | { kind: 'localPaths' }
  | { kind: 'diffSession'; sessionId: string }

export interface TextDiffPayload {
  leftText: string
  rightText: string
  patchText?: string | null
  patchCacheKey?: string | null
  leftExists: boolean
  rightExists: boolean
  leftCacheKey: string | null
  rightCacheKey: string | null
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

export interface DiffStatsSnapshot {
  files: number
  calculatedFiles: number
  calculating: boolean
  additions: number
  deletions: number
  lines: number
}

export interface SystemMonitorSnapshot {
  busyWorkers: number
  totalWorkers: number
  taskQueue: number
  renderingDiffs: number
  preparedDiffs: number
  diffCache: number
}

export interface DirectoryDiffRuntimeStats {
  activeLoadCount: number
  pendingLoadCount: number
  renderingDiffs: number
  preparedDiffs: number
  workerBusyWorkers: number
  workerTotalWorkers: number
  workerQueuedTasks: number
  workerDiffCacheSize: number
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

// Review-mode whole-file accept: copies sourcePath over targetPath. Both
// endpoints must live inside the compare bases; the main process re-validates
// every field.
export interface ApplyFileChangePayload {
  sourcePath: string
  targetPath: string
  leftBase: string
  rightBase: string
}

export interface ApplyGitWorkingTreeActionPayload {
  sessionId: string
  entryId: string
  action: GitWorkingTreeReviewAction
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
