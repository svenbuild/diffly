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
  SearchBatch,
  SearchJobStarted,
  StartComparisonSearchRequest,
  ApplyPartialChangeRequest,
  ReviewHunkSummary,
  ConflictDocument,
  ResolveConflictRequest,
  CreateReviewThreadRequest,
  ReplyReviewThreadRequest,
  ReattachReviewThreadRequest,
  ReviewBundle,
  ReviewThread,
  ReviewAuthor,
  ReviewCommentDraft,
  PreviewComparisonReplaceRequest,
  ApplyComparisonReplaceRequest,
  ApplyComparisonReplaceResult,
  ReplaceAllPreview,
  SaveDocumentAsRequest,
  SaveDocumentAsResult,
  ExternalDocumentChange,
  HunkFingerprint,
  ReviewDecision,
  ReviewDecisionStatus,
  ReviewThreadCount,
} from './lib/types'

declare global {
  interface Window {
    __difflyStartupProfile?: import('./lib/app/startup-profile').StartupProfileSnapshot
    diffly: {
      clipboard: { readText(): Promise<string>; writeText(text: string): Promise<void> }
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
        saveAs(request: SaveDocumentAsRequest): Promise<SaveDocumentAsResult>
        watch(target: DocumentTarget): Promise<boolean>
        unwatch(target: DocumentTarget): Promise<void>
        onExternalChange(callback: (change: ExternalDocumentChange) => void): () => void
        listDrafts(): Promise<DraftSummary[]>
        loadDraft(id: string): Promise<DocumentDraft | null>
        saveDraft(draft: SaveDraftRequest): Promise<DraftSummary>
        deleteDraft(id: string): Promise<void>
      }
      search: {
        start(request: StartComparisonSearchRequest): Promise<SearchJobStarted>
        poll(jobId: string): Promise<SearchBatch>
        cancel(jobId: string): Promise<void>
        previewReplace(request: PreviewComparisonReplaceRequest): Promise<ReplaceAllPreview>
        replaceAll(request: ApplyComparisonReplaceRequest): Promise<ApplyComparisonReplaceResult>
      }
      review: {
        listHunks(sessionId: string, entryId: string): Promise<ReviewHunkSummary[]>
        applyPartialChange(request: ApplyPartialChangeRequest): Promise<CreateDiffSessionResponse>
        undoOperation(sessionId: string): Promise<CreateDiffSessionResponse>
        listThreads(sessionId: string, entryId?: string): Promise<ReviewThread[]>
        listThreadCounts(sessionId: string): Promise<Record<string, ReviewThreadCount>>
        createThread(request: CreateReviewThreadRequest): Promise<ReviewThread>
        reply(request: ReplyReviewThreadRequest): Promise<ReviewThread>
        editComment(sessionId: string, threadId: string, commentId: string, body: string): Promise<ReviewThread>
        deleteComment(sessionId: string, threadId: string, commentId: string): Promise<ReviewThread | null>
        resolveThread(sessionId: string, threadId: string): Promise<ReviewThread>
        reopenThread(sessionId: string, threadId: string): Promise<ReviewThread>
        reattachThread(request: ReattachReviewThreadRequest): Promise<ReviewThread>
        export(sessionId: string): Promise<{ json: string; markdown: string; bundle: ReviewBundle }>
        import(sessionId: string, bundle: ReviewBundle): Promise<ReviewThread[]>
        getProfile(): Promise<ReviewAuthor>
        saveProfile(author: ReviewAuthor): Promise<ReviewAuthor>
        listDrafts(sessionId: string): Promise<ReviewCommentDraft[]>
        saveDraft(sessionId: string, key: string, body: string): Promise<ReviewCommentDraft>
        deleteDraft(sessionId: string, key: string): Promise<void>
        listDecisions(sessionId: string, entryId: string): Promise<ReviewDecision[]>
        setDecision(sessionId: string, entryId: string, fingerprint: HunkFingerprint, changeIndex: number | null, status: ReviewDecisionStatus | null): Promise<ReviewDecision[]>
        resetDecisions(sessionId: string, entryId: string): Promise<void>
      }
      conflicts: {
        open(sessionId: string, entryId: string): Promise<ConflictDocument>
        resolve(request: ResolveConflictRequest): Promise<CreateDiffSessionResponse>
        undoResolution(sessionId: string): Promise<CreateDiffSessionResponse>
      }
      workspaceLifecycle: {
        onCloseRequested(callback: () => void): () => void
        respondToClose(allow: boolean): Promise<void>
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
