import type {
  ApplyFileChangePayload,
  ApplyGitWorkingTreeActionPayload,
  CompareOptions,
  CompareResponse,
  CreateDiffSessionResponse,
  DiffEntry,
  DiffEntryFilter,
  DiffSource,
  FileDiffResult,
  GithubPullRequestMetadata,
  GitRefValidation,
  GitRefsResponse,
  GitRepositoryValidation,
  PathKind,
  PersistedSession,
  RecentSources,
  UpdateChannel,
  DocumentTarget,
  SaveDocumentRequest,
  SaveDocumentsRequest,
  SaveDraftRequest,
  StartComparisonSearchRequest,
} from './types'

export const choosePath = (kind: PathKind) =>
  window.diffly.choosePath(kind)

export const getDroppedFilePath = (file: File) =>
  window.diffly.getPathForFile(file)

export const openExternalUrl = (url: string) =>
  window.diffly.openExternal(url)

export const listRoots = () =>
  window.diffly.listRoots()

export const listDirectory = (path: string) =>
  window.diffly.listDirectory(path)

export const pathInfo = (path: string) =>
  window.diffly.pathInfo(path)

export const loadSessionState = () =>
  window.diffly.loadSessionState()

export const loadLaunchContext = () =>
  window.diffly.loadLaunchContext()

export const onLaunchContext = (callback: (context: unknown) => void) =>
  window.diffly.onLaunchContext(callback)

export const saveSessionState = (session: PersistedSession) =>
  window.diffly.saveSessionState(session)

export const loadRecentSources = (): Promise<RecentSources> =>
  window.diffly.loadRecentSources()

export const addRecentSource = (
  source: DiffSource,
  metadata?: unknown,
): Promise<RecentSources> =>
  window.diffly.addRecentSource(source, metadata)

export const removeRecentSource = (id: string): Promise<RecentSources> =>
  window.diffly.removeRecentSource(id)

export const validateGitRepository = (path: string): Promise<GitRepositoryValidation> =>
  window.diffly.validateGitRepository(path)

export const listGitRefs = (repoPath: string): Promise<GitRefsResponse> =>
  window.diffly.listGitRefs(repoPath)

export const validateGitRef = (
  repoPath: string,
  ref: string,
): Promise<GitRefValidation> =>
  window.diffly.validateGitRef(repoPath, ref)

export const detectGitRepositories = (paths: string[]): Promise<string[]> =>
  window.diffly.detectGitRepositories(paths)

export const fetchGithubPullRequestMetadata = (
  url: string,
): Promise<GithubPullRequestMetadata> =>
  window.diffly.fetchGithubPullRequestMetadata(url)

export const getAppVersion = () =>
  window.diffly.getAppVersion()

export const checkForUpdates = (channel: UpdateChannel) =>
  window.diffly.checkForUpdates(channel)

export const downloadUpdate = (channel: UpdateChannel) =>
  window.diffly.downloadUpdate(channel)

export const installUpdate = (channel: UpdateChannel) =>
  window.diffly.installUpdate(channel)

export const comparePaths = (
  leftPath: string,
  rightPath: string,
  mode: 'file' | 'directory',
  options: CompareOptions,
) =>
  window.diffly
    .comparePaths(leftPath, rightPath, mode, options)
    .then(normalizeCompareResponse)

export const startDirectoryCompare = (
  leftPath: string,
  rightPath: string,
  options: CompareOptions,
) =>
  window.diffly.startDirectoryCompare(leftPath, rightPath, options)

export const pollDirectoryCompare = (jobId: string) =>
  window.diffly.pollDirectoryCompare(jobId)

export const cancelDirectoryCompare = (jobId: string) =>
  window.diffly.cancelDirectoryCompare(jobId)

export const openCompareItem = (
  leftBase: string,
  rightBase: string,
  relativePath: string,
  options: CompareOptions,
) =>
  window.diffly
    .openCompareItem(leftBase, rightBase, relativePath, options)
    .then(normalizeFileDiffResult)

export const createDiffSession = (
  source: DiffSource,
  options: CompareOptions,
): Promise<CreateDiffSessionResponse> =>
  window.diffly.createDiffSession(source, options)

export const listDiffEntries = (
  sessionId: string,
  filter?: DiffEntryFilter,
): Promise<DiffEntry[]> =>
  window.diffly.listDiffEntries(sessionId, filter)

export const openDiffEntry = (
  sessionId: string,
  entryId: string,
  options: CompareOptions,
) =>
  window.diffly
    .openDiffEntry(sessionId, entryId, options)
    .then(normalizeFileDiffResult)

export const refreshDiffSession = (sessionId: string): Promise<CreateDiffSessionResponse> =>
  window.diffly.refreshDiffSession(sessionId)

export const disposeDiffSession = (sessionId: string) =>
  window.diffly.disposeDiffSession(sessionId)

export const openEditableDocument = (target: DocumentTarget) =>
  window.diffly.documents.open(target)

export const saveEditableDocument = (request: SaveDocumentRequest) =>
  window.diffly.documents.save(request)

export const saveEditableDocuments = (request: SaveDocumentsRequest) =>
  window.diffly.documents.saveAll(request)

export const listDocumentDrafts = () =>
  window.diffly.documents.listDrafts()

export const loadDocumentDraft = (id: string) =>
  window.diffly.documents.loadDraft(id)

export const saveDocumentDraft = (draft: SaveDraftRequest) =>
  window.diffly.documents.saveDraft(draft)

export const deleteDocumentDraft = (id: string) =>
  window.diffly.documents.deleteDraft(id)

export const startComparisonSearch = (request: StartComparisonSearchRequest) =>
  window.diffly.search.start(request)

export const pollComparisonSearch = (jobId: string) =>
  window.diffly.search.poll(jobId)

export const cancelComparisonSearch = (jobId: string) =>
  window.diffly.search.cancel(jobId)

export interface WindowControls {
  minimize(): Promise<void>
  toggleMaximize(): Promise<void>
  close(): Promise<void>
  isMaximized(): Promise<boolean>
  onMaximizedChange(callback: (maximized: boolean) => void): () => void
}

/**
 * Window controls exist only on frameless (Windows) builds. Returns null when
 * unavailable (native frame, older preload) so callers can feature-detect.
 */
export const getWindowControls = (): WindowControls | null =>
  window.diffly?.windowControls ?? null

export interface ShellPathApi {
  openPath(path: string): Promise<void>
  revealPath(path: string): Promise<void>
}

/**
 * Shell path actions (open file / reveal in Explorer). Returns null when the
 * preload bridge does not expose them (older builds, tests) so callers can
 * feature-detect, mirroring getWindowControls.
 */
export const getShellPathApi = (): ShellPathApi | null => {
  const bridge = typeof window === 'undefined' ? undefined : window.diffly
  if (!bridge || typeof bridge.openPath !== 'function' || typeof bridge.revealPath !== 'function') {
    return null
  }

  return {
    openPath: (path: string) => bridge.openPath!(path),
    revealPath: (path: string) => bridge.revealPath!(path),
  }
}

export interface ReviewApplyApi {
  applyFileChange(payload: ApplyFileChangePayload): Promise<void>
}

/**
 * Review-mode whole-file accept. Returns null when the preload bridge does
 * not expose it (older builds, tests) so callers can feature-detect,
 * mirroring getShellPathApi.
 */
export const getReviewApplyApi = (): ReviewApplyApi | null => {
  const bridge = typeof window === 'undefined' ? undefined : window.diffly
  if (!bridge || typeof bridge.applyFileChange !== 'function') {
    return null
  }

  return {
    applyFileChange: (payload: ApplyFileChangePayload) => bridge.applyFileChange!(payload),
  }
}

export interface GitReviewApi {
  applyGitWorkingTreeAction(payload: ApplyGitWorkingTreeActionPayload): Promise<void>
}

export const getGitReviewApi = (): GitReviewApi | null => {
  const bridge = typeof window === 'undefined' ? undefined : window.diffly
  if (!bridge || typeof bridge.applyGitWorkingTreeAction !== 'function') {
    return null
  }

  return {
    applyGitWorkingTreeAction: (payload: ApplyGitWorkingTreeActionPayload) =>
      bridge.applyGitWorkingTreeAction!(payload),
  }
}

function normalizeCompareResponse(response: CompareResponse): CompareResponse {
  if (response.kind === 'file') {
    return {
      ...response,
      result: normalizeFileDiffResult(response.result),
    }
  }

  return response
}

function normalizeFileDiffResult(result: FileDiffResult): FileDiffResult {
  return result
}
