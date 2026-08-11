import type {
  ApplyFileChangePayload,
  ApplyGitWorkingTreeActionPayload,
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
  GitRefValidation,
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
  DocumentTarget,
  EditableDocument,
  MutationResult,
  SaveDocumentRequest,
  SaveDocumentResult,
  SaveDocumentsRequest,
  DocumentDraft,
  DraftSummary,
  SaveDraftRequest,
} from './lib/types'

declare global {
  interface Window {
    __difflyStartupProfile?: import('./lib/app/startup-profile').StartupProfileSnapshot
    diffly: {
      choosePath(kind: PathKind): Promise<string | null>
      getPathForFile(file: File): string
      openExternal(url: string): Promise<void>
      /** Optional: absent on older preload builds; feature-detect before use. */
      openPath?(path: string): Promise<void>
      /** Optional: absent on older preload builds; feature-detect before use. */
      revealPath?(path: string): Promise<void>
      /** Optional: absent on older preload builds; feature-detect before use. */
      applyFileChange?(payload: ApplyFileChangePayload): Promise<void>
      /** Optional: absent on older preload builds; feature-detect before use. */
      applyGitWorkingTreeAction?(payload: ApplyGitWorkingTreeActionPayload): Promise<void>
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
      validateGitRef(repoPath: string, ref: string): Promise<GitRefValidation>
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
      documents: {
        open(target: DocumentTarget): Promise<EditableDocument>
        save(request: SaveDocumentRequest): Promise<MutationResult<SaveDocumentResult>>
        saveAll(request: SaveDocumentsRequest): Promise<MutationResult<EditableDocument[]>>
        listDrafts(): Promise<DraftSummary[]>
        loadDraft(id: string): Promise<DocumentDraft | null>
        saveDraft(draft: SaveDraftRequest): Promise<DraftSummary>
        deleteDraft(id: string): Promise<void>
      }
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
