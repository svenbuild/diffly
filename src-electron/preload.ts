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
} from '../src/lib/types'

const invoke = <T>(channel: string, payload?: unknown) =>
  ipcRenderer.invoke(channel, payload) as Promise<T>

contextBridge.exposeInMainWorld('diffly', {
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
    listDrafts: () =>
      invoke<DraftSummary[]>('diffly:documents:listDrafts'),
    loadDraft: (id: string) =>
      invoke<DocumentDraft | null>('diffly:documents:loadDraft', { id }),
    saveDraft: (draft: SaveDraftRequest) =>
      invoke<DraftSummary>('diffly:documents:saveDraft', draft),
    deleteDraft: (id: string) =>
      invoke<void>('diffly:documents:deleteDraft', { id }),
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
