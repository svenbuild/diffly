import type {
  ApplyFileChangePayload,
  CompareOptions,
  CompareResponse,
  CreateDiffSessionResponse,
  DiffEntry,
  DiffEntryFilter,
  DiffSource,
  DirectoryListing,
  ExplorerEntry,
  FileDiffResult,
  GithubPullRequestMetadata,
  GitRefsResponse,
  GitRepositoryValidation,
  LaunchContext,
  PathInfo,
  PathKind,
  PersistedSession,
  PollDirectoryCompareResponse,
  RecentSources,
  StartDirectoryCompareResponse,
  UpdateActionResult,
  UpdateChannel,
  UpdateCheckResult,
} from './lib/types'

declare global {
  interface Window {
    diffly: {
      choosePath(kind: PathKind): Promise<string | null>
      openExternal(url: string): Promise<void>
      /** Optional: absent on older preload builds; feature-detect before use. */
      openPath?(path: string): Promise<void>
      /** Optional: absent on older preload builds; feature-detect before use. */
      revealPath?(path: string): Promise<void>
      /** Optional: absent on older preload builds; feature-detect before use. */
      applyFileChange?(payload: ApplyFileChangePayload): Promise<void>
      listRoots(): Promise<ExplorerEntry[]>
      listDirectory(path: string): Promise<DirectoryListing>
      pathInfo(path: string): Promise<PathInfo>
      loadSessionState(): Promise<PersistedSession | null>
      loadLaunchContext(): Promise<LaunchContext | null>
      onLaunchContext(callback: (context: LaunchContext) => void): () => void
      saveSessionState(session: PersistedSession): Promise<void>
      loadRecentSources(): Promise<RecentSources>
      addRecentSource(source: DiffSource, metadata?: unknown): Promise<RecentSources>
      removeRecentSource(id: string): Promise<RecentSources>
      validateGitRepository(path: string): Promise<GitRepositoryValidation>
      listGitRefs(repoPath: string): Promise<GitRefsResponse>
      detectGitRepositories(paths: string[]): Promise<string[]>
      fetchGithubPullRequestMetadata(url: string): Promise<GithubPullRequestMetadata>
      getAppVersion(): Promise<string>
      checkForUpdates(channel: UpdateChannel): Promise<UpdateCheckResult>
      downloadUpdate(channel: UpdateChannel): Promise<UpdateActionResult>
      installUpdate(channel: UpdateChannel): Promise<UpdateActionResult>
      comparePaths(
        leftPath: string,
        rightPath: string,
        mode: 'file' | 'directory',
        options: CompareOptions,
      ): Promise<CompareResponse>
      startDirectoryCompare(
        leftPath: string,
        rightPath: string,
        options: CompareOptions,
      ): Promise<StartDirectoryCompareResponse>
      pollDirectoryCompare(jobId: string): Promise<PollDirectoryCompareResponse>
      cancelDirectoryCompare(jobId: string): Promise<boolean>
      openCompareItem(
        leftBase: string,
        rightBase: string,
        relativePath: string,
        options: CompareOptions,
      ): Promise<FileDiffResult>
      createDiffSession(
        source: DiffSource,
        options: CompareOptions,
      ): Promise<CreateDiffSessionResponse>
      listDiffEntries(
        sessionId: string,
        filter?: DiffEntryFilter,
      ): Promise<DiffEntry[]>
      openDiffEntry(
        sessionId: string,
        entryId: string,
        options: CompareOptions,
      ): Promise<FileDiffResult>
      refreshDiffSession(sessionId: string): Promise<CreateDiffSessionResponse>
      disposeDiffSession(sessionId: string): Promise<void>
      /** Present only on frameless (Windows) builds. */
      windowControls?: {
        minimize(): Promise<void>
        toggleMaximize(): Promise<void>
        close(): Promise<void>
        isMaximized(): Promise<boolean>
        onMaximizedChange(callback: (maximized: boolean) => void): () => void
      }
    }
  }
}

export {}
