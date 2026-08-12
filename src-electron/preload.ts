import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  ApplyFileChangePayload,
  ApplyGitWorkingTreeActionPayload,
  CompareOptions,
  DiffEntryFilter,
  DiffSource,
  GithubPullRequestMetadata,
  GitRefValidation,
  GitRefsResponse,
  GitRepositoryValidation,
  PathKind,
  PersistedSession,
  RecentSources,
  UpdateChannel,
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
  CreateDiffSessionResponse,
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
} from '../src/lib/types'

const invoke = <T>(channel: string, payload?: unknown) =>
  ipcRenderer.invoke(channel, payload) as Promise<T>

contextBridge.exposeInMainWorld('diffly', {
  clipboard: {
    readText: () => invoke<string>('diffly:clipboard:readText'),
    writeText: (text: string) => invoke<void>('diffly:clipboard:writeText', { text }),
  },
  choosePath: (kind: PathKind) =>
    invoke('diffly:choosePath', { kind }),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  openExternal: (url: string) =>
    invoke<void>('diffly:openExternal', { url }),
  openPath: (path: string) =>
    invoke<void>('diffly:openPath', { path }),
  revealPath: (path: string) =>
    invoke<void>('diffly:revealPath', { path }),
  applyFileChange: (payload: ApplyFileChangePayload) =>
    invoke<void>('diffly:applyFileChange', payload),
  applyGitWorkingTreeAction: (payload: ApplyGitWorkingTreeActionPayload) =>
    invoke<void>('diffly:applyGitWorkingTreeAction', payload),
  listRoots: () =>
    invoke('diffly:listRoots'),
  listDirectory: (path: string) =>
    invoke('diffly:listDirectory', { path }),
  pathInfo: (path: string) =>
    invoke('diffly:pathInfo', { path }),
  loadSessionState: () =>
    invoke('diffly:loadSessionState'),
  loadLaunchContext: () =>
    invoke('diffly:loadLaunchContext'),
  onLaunchContext: (callback: (context: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, context: unknown) => {
      callback(context)
    }
    ipcRenderer.on('diffly:launchContext', listener)
    return () => {
      ipcRenderer.removeListener('diffly:launchContext', listener)
    }
  },
  saveSessionState: (session: PersistedSession) =>
    invoke('diffly:saveSessionState', { session }),
  loadRecentSources: () =>
    invoke<RecentSources>('diffly:loadRecentSources'),
  addRecentSource: (
    source: DiffSource,
    metadata?: unknown,
  ) =>
    invoke<RecentSources>('diffly:addRecentSource', { source, metadata }),
  removeRecentSource: (id: string) =>
    invoke<RecentSources>('diffly:removeRecentSource', { id }),
  validateGitRepository: (path: string) =>
    invoke<GitRepositoryValidation>('diffly:validateGitRepository', { path }),
  listGitRefs: (repoPath: string) =>
    invoke<GitRefsResponse>('diffly:listGitRefs', { repoPath }),
  validateGitRef: (repoPath: string, ref: string) =>
    invoke<GitRefValidation>('diffly:validateGitRef', { repoPath, ref }),
  detectGitRepositories: (paths: string[]) =>
    invoke<string[]>('diffly:detectGitRepositories', { paths }),
  fetchGithubPullRequestMetadata: (url: string) =>
    invoke<GithubPullRequestMetadata>('diffly:fetchGithubPullRequestMetadata', { url }),
  getAppVersion: () =>
    invoke('diffly:getAppVersion'),
  checkForUpdates: (channel: UpdateChannel) =>
    invoke('diffly:checkForUpdates', { channel }),
  downloadUpdate: (channel: UpdateChannel) =>
    invoke('diffly:downloadUpdate', { channel }),
  installUpdate: (channel: UpdateChannel) =>
    invoke('diffly:installUpdate', { channel }),
  comparePaths: (
    leftPath: string,
    rightPath: string,
    mode: 'file' | 'directory',
    options: CompareOptions,
  ) =>
    invoke('diffly:comparePaths', { leftPath, rightPath, mode, options }),
  startDirectoryCompare: (
    leftPath: string,
    rightPath: string,
    options: CompareOptions,
  ) =>
    invoke('diffly:startDirectoryCompare', { leftPath, rightPath, options }),
  pollDirectoryCompare: (jobId: string) =>
    invoke('diffly:pollDirectoryCompare', { jobId }),
  cancelDirectoryCompare: (jobId: string) =>
    invoke('diffly:cancelDirectoryCompare', { jobId }),
  openCompareItem: (
    leftBase: string,
    rightBase: string,
    relativePath: string,
    options: CompareOptions,
  ) =>
    invoke('diffly:openCompareItem', {
      leftBase,
      rightBase,
      relativePath,
      options,
    }),
  createDiffSession: (
    source: DiffSource,
    options: CompareOptions,
  ) =>
    invoke('diffly:createDiffSession', { source, options }),
  listDiffEntries: (
    sessionId: string,
    filter?: DiffEntryFilter,
  ) =>
    invoke('diffly:listDiffEntries', { sessionId, filter }),
  openDiffEntry: (
    sessionId: string,
    entryId: string,
    options: CompareOptions,
  ) =>
    invoke('diffly:openDiffEntry', { sessionId, entryId, options }),
  refreshDiffSession: (sessionId: string) =>
    invoke('diffly:refreshDiffSession', { sessionId }),
  disposeDiffSession: (sessionId: string) =>
    invoke('diffly:disposeDiffSession', { sessionId }),
  documents: {
    open: (target: DocumentTarget) =>
      invoke<EditableDocument>('diffly:documents:open', target),
    save: (request: SaveDocumentRequest) =>
      invoke<MutationResult<SaveDocumentResult>>('diffly:documents:save', request),
    saveAll: (request: SaveDocumentsRequest) =>
      invoke<MutationResult<EditableDocument[]>>('diffly:documents:saveAll', request),
    saveAs: (request: SaveDocumentAsRequest) =>
      invoke<SaveDocumentAsResult>('diffly:documents:saveAs', request),
    watch: (target: DocumentTarget) => invoke<boolean>('diffly:documents:watch', { target }),
    unwatch: (target: DocumentTarget) => invoke<void>('diffly:documents:unwatch', { target }),
    onExternalChange: (callback: (change: ExternalDocumentChange) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, change: ExternalDocumentChange) => callback(change)
      ipcRenderer.on('diffly:documents:externalChange', listener)
      return () => ipcRenderer.removeListener('diffly:documents:externalChange', listener)
    },
    listDrafts: () =>
      invoke<DraftSummary[]>('diffly:documents:listDrafts'),
    loadDraft: (id: string) =>
      invoke<DocumentDraft | null>('diffly:documents:loadDraft', { id }),
    saveDraft: (draft: SaveDraftRequest) =>
      invoke<DraftSummary>('diffly:documents:saveDraft', draft),
    deleteDraft: (id: string) =>
      invoke<void>('diffly:documents:deleteDraft', { id }),
  },
  search: {
    start: (request: StartComparisonSearchRequest) =>
      invoke<SearchJobStarted>('diffly:search:start', request),
    poll: (jobId: string) =>
      invoke<SearchBatch>('diffly:search:poll', { jobId }),
    cancel: (jobId: string) =>
      invoke<void>('diffly:search:cancel', { jobId }),
    previewReplace: (request: PreviewComparisonReplaceRequest) =>
      invoke<ReplaceAllPreview>('diffly:search:previewReplace', request),
    replaceAll: (request: ApplyComparisonReplaceRequest) =>
      invoke<ApplyComparisonReplaceResult>('diffly:search:replaceAll', request),
  },
  review: {
    listHunks: (sessionId: string, entryId: string) =>
      invoke<ReviewHunkSummary[]>('diffly:review:listHunks', { sessionId, entryId }),
    applyPartialChange: (request: ApplyPartialChangeRequest) =>
      invoke<CreateDiffSessionResponse>('diffly:review:applyPartialChange', request),
    undoOperation: (sessionId: string) =>
      invoke<CreateDiffSessionResponse>('diffly:review:undoOperation', { sessionId }),
    listThreads: (sessionId: string, entryId?: string) =>
      invoke<ReviewThread[]>('diffly:review:listThreads', { sessionId, entryId }),
    listThreadCounts: (sessionId: string) =>
      invoke<Record<string, ReviewThreadCount>>('diffly:review:listThreadCounts', { sessionId }),
    createThread: (request: CreateReviewThreadRequest) =>
      invoke<ReviewThread>('diffly:review:createThread', request),
    reply: (request: ReplyReviewThreadRequest) =>
      invoke<ReviewThread>('diffly:review:reply', request),
    editComment: (sessionId: string, threadId: string, commentId: string, body: string) =>
      invoke<ReviewThread>('diffly:review:editComment', { sessionId, threadId, commentId, body }),
    deleteComment: (sessionId: string, threadId: string, commentId: string) =>
      invoke<ReviewThread | null>('diffly:review:deleteComment', { sessionId, threadId, commentId }),
    resolveThread: (sessionId: string, threadId: string) =>
      invoke<ReviewThread>('diffly:review:resolveThread', { sessionId, threadId }),
    reopenThread: (sessionId: string, threadId: string) =>
      invoke<ReviewThread>('diffly:review:reopenThread', { sessionId, threadId }),
    reattachThread: (request: ReattachReviewThreadRequest) =>
      invoke<ReviewThread>('diffly:review:reattachThread', request),
    export: (sessionId: string) =>
      invoke<{ json: string; markdown: string; bundle: ReviewBundle }>('diffly:review:export', { sessionId }),
    import: (sessionId: string, bundle: ReviewBundle) =>
      invoke<ReviewThread[]>('diffly:review:import', { sessionId, bundle }),
    getProfile: () => invoke<ReviewAuthor>('diffly:review:getProfile'),
    saveProfile: (author: ReviewAuthor) => invoke<ReviewAuthor>('diffly:review:saveProfile', author),
    listDrafts: (sessionId: string) =>
      invoke<ReviewCommentDraft[]>('diffly:review:listDrafts', { sessionId }),
    saveDraft: (sessionId: string, key: string, body: string) =>
      invoke<ReviewCommentDraft>('diffly:review:saveDraft', { sessionId, key, body }),
    deleteDraft: (sessionId: string, key: string) =>
      invoke<void>('diffly:review:deleteDraft', { sessionId, key }),
    listDecisions: (sessionId: string, entryId: string) =>
      invoke<ReviewDecision[]>('diffly:review:listDecisions', { sessionId, entryId }),
    setDecision: (sessionId: string, entryId: string, fingerprint: HunkFingerprint, changeIndex: number | null, status: ReviewDecisionStatus | null) =>
      invoke<ReviewDecision[]>('diffly:review:setDecision', { sessionId, entryId, fingerprint, changeIndex, status }),
    resetDecisions: (sessionId: string, entryId: string) =>
      invoke<void>('diffly:review:resetDecisions', { sessionId, entryId }),
  },
  conflicts: {
    open: (sessionId: string, entryId: string) =>
      invoke<ConflictDocument>('diffly:conflicts:open', { sessionId, entryId }),
    resolve: (request: ResolveConflictRequest) =>
      invoke<CreateDiffSessionResponse>('diffly:conflicts:resolve', request),
    undoResolution: (sessionId: string) =>
      invoke<CreateDiffSessionResponse>('diffly:conflicts:undoResolution', { sessionId }),
  },
  workspaceLifecycle: {
    onCloseRequested: (callback: () => void) => {
      const listener = () => callback()
      ipcRenderer.on('diffly:workspace:closeRequested', listener)
      return () => ipcRenderer.removeListener('diffly:workspace:closeRequested', listener)
    },
    respondToClose: (allow: boolean) =>
      invoke<void>('diffly:workspace:closeDecision', { allow }),
  },
  // Only exposed where the window is frameless (Windows). Its presence is the
  // renderer's feature detection for rendering the custom title bar.
  windowControls:
    process.platform === 'win32'
      ? {
          minimize: () => invoke<void>('diffly:windowMinimize'),
          toggleMaximize: () => invoke<void>('diffly:windowToggleMaximize'),
          close: () => invoke<void>('diffly:windowClose'),
          isMaximized: () => invoke<boolean>('diffly:windowIsMaximized'),
          onMaximizedChange: (callback: (maximized: boolean) => void) => {
            const listener = (_event: Electron.IpcRendererEvent, maximized: unknown) => {
              callback(maximized === true)
            }
            ipcRenderer.on('diffly:windowMaximizedChange', listener)
            return () => {
              ipcRenderer.removeListener('diffly:windowMaximizedChange', listener)
            }
          },
        }
      : undefined,
})
