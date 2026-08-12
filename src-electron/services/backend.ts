import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { isAbsolute, join, normalize } from 'node:path'
import type {
  ApplyGitWorkingTreeActionPayload,
  CompareOptions,
  CompareResponse,
  CreateDiffSessionResponse,
  DiffEntry,
  DiffEntryFilter,
  DiffSource,
  FileDiffResult,
  GitWorkingTreeReviewAction,
  PersistedSession,
  UpdateChannel,
  DocumentTarget,
  DocumentRevision,
  SaveDocumentRequest,
  SaveDocumentsRequest,
  DocumentDraft,
  SaveDraftRequest,
  StartComparisonSearchRequest,
  ComparisonSearchQuery,
  ApplyPartialChangeRequest,
  PartialChangeSelection,
  ResolveConflictRequest,
  ConflictRevision,
  CreateReviewThreadRequest,
  ReplyReviewThreadRequest,
  ReattachReviewThreadRequest,
  ReviewAuthor,
  ReviewBundle,
  ReviewThread,
  PreviewComparisonReplaceRequest,
  ApplyComparisonReplaceRequest,
  SaveDocumentAsRequest,
  ExternalDocumentChange,
} from '../../src/lib/types'

interface CompareServices {
  diffSessionService: import('./diff/diff-session-service').DiffSessionService
  localProvider: import('./providers/local-provider').LocalProvider
  documentService: import('./documents/document-service').DocumentService
  draftStore: import('./documents/document-draft-store').DocumentDraftStore
  searchService: import('./search/search-service').SearchService
  partialApplyService: import('./review/partial-apply-service').PartialApplyService
  conflictService: import('./conflicts/conflict-service').ConflictService
  reviewService: import('./review/review-service').ReviewService
}

let compareServicesPromise: Promise<CompareServices> | null = null
let explorerServicePromise: Promise<typeof import('./explorer-service')> | null = null

function loadExplorerService() {
  if (!explorerServicePromise) {
    explorerServicePromise = import('./explorer-service')
  }

  return explorerServicePromise
}

export function registerIpcHandlers() {
  ipcMain.handle('diffly:clipboard:readText', () => clipboard.readText())
  ipcMain.handle('diffly:clipboard:writeText', (_event, payload: unknown) => {
    if (!isRecord(payload) || typeof payload.text !== 'string' || Buffer.byteLength(payload.text) > 64 * 1024 * 1024) {
      throw new Error('Invalid clipboard payload.')
    }
    clipboard.writeText(payload.text)
  })
  ipcMain.handle('diffly:choosePath', (_event, payload: { kind: string }) =>
    loadExplorerService().then(({ choosePath }) => choosePath(payload.kind)),
  )
  ipcMain.handle('diffly:openExternal', (_event, payload: { url: string }) =>
    openExternalUrl(payload?.url ?? ''),
  )
  ipcMain.handle('diffly:openPath', (_event, payload: { path?: unknown }) =>
    openLocalPath(payload?.path),
  )
  ipcMain.handle('diffly:revealPath', (_event, payload: { path?: unknown }) =>
    revealLocalPath(payload?.path),
  )
  ipcMain.handle('diffly:applyFileChange', (_event, payload: unknown) =>
    applyFileChange(payload),
  )
  ipcMain.handle('diffly:applyGitWorkingTreeAction', (_event, payload: unknown) =>
    applyGitWorkingTreeAction(payload),
  )
  ipcMain.handle('diffly:listRoots', () =>
    loadExplorerService().then(({ listRoots }) => listRoots()),
  )
  ipcMain.handle('diffly:listDirectory', (_event, payload: { path: string }) =>
    loadExplorerService().then(({ listDirectory }) => listDirectory(payload.path)),
  )
  ipcMain.handle('diffly:pathInfo', (_event, payload: { path: string }) =>
    loadExplorerService().then(({ pathInfo }) => pathInfo(payload.path)),
  )
  ipcMain.handle('diffly:loadSessionState', () =>
    import('./session-store').then(({ loadSessionState }) => loadSessionState()),
  )
  ipcMain.handle('diffly:loadLaunchContext', (event) =>
    import('./launch-context').then(({ loadLaunchContext }) =>
      loadLaunchContext(event.sender.id),
    ),
  )
  ipcMain.handle('diffly:saveSessionState', (_event, payload: { session: PersistedSession }) =>
    import('./session-store').then(({ saveSessionState }) => saveSessionState(payload.session)),
  )
  ipcMain.handle('diffly:loadRecentSources', () =>
    import('./recents-store').then(({ loadRecentSources }) => loadRecentSources()),
  )
  ipcMain.handle('diffly:addRecentSource', async (_event, payload: unknown) => {
    const [
      recentPayload,
      { addRecentSource },
    ] = await Promise.all([
      readAddRecentSourcePayload(payload),
      import('./recents-store'),
    ])
    return addRecentSource(recentPayload.source, recentPayload.metadata)
  })
  ipcMain.handle('diffly:removeRecentSource', (_event, payload: unknown) =>
    import('./recents-store').then(({ removeRecentSource }) =>
      removeRecentSource(readRemoveRecentSourceId(payload)),
    ),
  )
  ipcMain.handle('diffly:validateGitRepository', (_event, payload) =>
    import('./git/git-repository').then(({ validateGitRepository }) =>
      validateGitRepository(payload?.path),
    ),
  )
  ipcMain.handle('diffly:listGitRefs', (_event, payload) =>
    import('./git/git-refs').then(({ listGitRefs }) => listGitRefs(payload?.repoPath)),
  )
  ipcMain.handle('diffly:validateGitRef', (_event, payload) =>
    import('./git/git-refs').then(({ validateGitRef }) =>
      validateGitRef(payload?.repoPath, payload?.ref),
    ),
  )
  ipcMain.handle('diffly:detectGitRepositories', (_event, payload) =>
    import('./git/git-detection').then(({ detectGitRepositories }) =>
      detectGitRepositories(payload?.paths),
    ),
  )
  ipcMain.handle('diffly:fetchGithubPullRequestMetadata', (_event, payload) =>
    fetchGithubPullRequestMetadata(payload?.url),
  )
  ipcMain.handle('diffly:getAppVersion', () => app.getVersion())
  ipcMain.handle('diffly:checkForUpdates', (_event, payload: { channel: UpdateChannel }) =>
    import('./update-service').then(({ checkForUpdates }) => checkForUpdates(payload.channel)),
  )
  ipcMain.handle('diffly:downloadUpdate', (_event, payload: { channel: UpdateChannel }) =>
    import('./update-service').then(({ downloadUpdate }) => downloadUpdate(payload.channel)),
  )
  ipcMain.handle('diffly:installUpdate', (_event, payload: { channel: UpdateChannel }) =>
    import('./update-service').then(({ installUpdate }) => installUpdate(payload.channel)),
  )
  ipcMain.handle('diffly:comparePaths', (_event, payload) =>
    comparePaths(payload.leftPath, payload.rightPath, payload.mode, payload.options),
  )
  ipcMain.handle('diffly:startDirectoryCompare', (_event, payload) =>
    startDirectoryCompare(payload.leftPath, payload.rightPath, payload.options),
  )
  ipcMain.handle('diffly:pollDirectoryCompare', (_event, payload: { jobId: string }) =>
    pollDirectoryCompare(payload.jobId),
  )
  ipcMain.handle('diffly:cancelDirectoryCompare', (_event, payload: { jobId: string }) =>
    cancelDirectoryCompare(payload.jobId),
  )
  ipcMain.handle('diffly:openCompareItem', (_event, payload) =>
    openCompareItem(payload.leftBase, payload.rightBase, payload.relativePath, payload.options),
  )
  ipcMain.handle('diffly:createDiffSession', (_event, payload) =>
    createDiffSession(payload?.source, payload?.options),
  )
  ipcMain.handle('diffly:listDiffEntries', (_event, payload) =>
    listDiffEntries(payload?.sessionId, payload?.filter),
  )
  ipcMain.handle('diffly:openDiffEntry', (_event, payload) =>
    openDiffEntry(payload?.sessionId, payload?.entryId, payload?.options),
  )
  ipcMain.handle('diffly:refreshDiffSession', (_event, payload) =>
    refreshDiffSession(payload?.sessionId),
  )
  ipcMain.handle('diffly:disposeDiffSession', (_event, payload) =>
    disposeDiffSession(payload?.sessionId),
  )
  ipcMain.handle('diffly:documents:open', (_event, payload: unknown) =>
    openEditableDocument(payload),
  )
  ipcMain.handle('diffly:documents:save', (_event, payload: unknown) =>
    saveEditableDocument(payload),
  )
  ipcMain.handle('diffly:documents:saveAll', (_event, payload: unknown) =>
    saveEditableDocuments(payload),
  )
  ipcMain.handle('diffly:documents:saveAs', async (event, payload: unknown) => {
    const request = readSaveDocumentAsRequest(payload)
    const window = BrowserWindow.fromWebContents(event.sender)
    const options = { title: 'Save document as', defaultPath: request.suggestedName }
    const selection = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options)
    if (selection.canceled || !selection.filePath) return { canceled: true, path: null, revision: null }
    const { writeDocumentAs } = await import('./documents/document-writer')
    const saved = await writeDocumentAs(selection.filePath, request.contents, request.format)
    return { canceled: false, path: selection.filePath, revision: saved.revision }
  })
  ipcMain.handle('diffly:documents:watch', async (event, payload: unknown) => {
    if (!isRecord(payload)) throw new Error('Invalid document watch payload.')
    const target = readDocumentTargetPayload(payload.target)
    const id = `${event.sender.id}:${documentWatchId(target)}`
    const { documentService } = await loadCompareServices()
    return documentService.watch(id, target, (change: ExternalDocumentChange) => {
      if (!event.sender.isDestroyed()) event.sender.send('diffly:documents:externalChange', change)
    })
  })
  ipcMain.handle('diffly:documents:unwatch', async (event, payload: unknown) => {
    if (!isRecord(payload)) throw new Error('Invalid document watch payload.')
    const target = readDocumentTargetPayload(payload.target)
    const { documentService } = await loadCompareServices()
    documentService.unwatch(`${event.sender.id}:${documentWatchId(target)}`)
  })
  ipcMain.handle('diffly:documents:listDrafts', async () => {
    const { draftStore } = await loadCompareServices()
    return draftStore.list()
  })
  ipcMain.handle('diffly:documents:loadDraft', async (_event, payload: unknown) => {
    const { draftStore } = await loadCompareServices()
    return draftStore.load(readSha256Id(payload))
  })
  ipcMain.handle('diffly:documents:saveDraft', async (_event, payload: unknown) => {
    const { draftStore } = await loadCompareServices()
    return draftStore.save(readSaveDraftRequest(payload))
  })
  ipcMain.handle('diffly:documents:deleteDraft', async (_event, payload: unknown) => {
    const { draftStore } = await loadCompareServices()
    return draftStore.remove(readSha256Id(payload))
  })
  ipcMain.handle('diffly:search:start', async (_event, payload: unknown) => {
    const { searchService } = await loadCompareServices()
    return searchService.start(readStartSearchRequest(payload))
  })
  ipcMain.handle('diffly:search:poll', async (_event, payload: unknown) => {
    const { searchService } = await loadCompareServices()
    return searchService.poll(readJobId(payload))
  })
  ipcMain.handle('diffly:search:cancel', async (_event, payload: unknown) => {
    const { searchService } = await loadCompareServices()
    return searchService.cancel(readJobId(payload))
  })
  ipcMain.handle('diffly:search:previewReplace', async (_event, payload: unknown) => {
    const { searchService } = await loadCompareServices()
    return searchService.previewReplace(readPreviewReplaceRequest(payload))
  })
  ipcMain.handle('diffly:search:replaceAll', async (_event, payload: unknown) => {
    const { searchService } = await loadCompareServices()
    return searchService.replaceAll(readApplyReplaceRequest(payload))
  })
  ipcMain.handle('diffly:review:applyPartialChange', async (_event, payload: unknown) => {
    const { partialApplyService } = await loadCompareServices()
    return partialApplyService.apply(readApplyPartialChangeRequest(payload))
  })
  ipcMain.handle('diffly:review:listHunks', async (_event, payload: unknown) => {
    if (!isRecord(payload)) throw new Error('Invalid hunk-list payload.')
    const { partialApplyService } = await loadCompareServices()
    return partialApplyService.listHunks(requiredId(payload.sessionId), requiredId(payload.entryId))
  })
  ipcMain.handle('diffly:review:undoOperation', async (_event, payload: unknown) => {
    const { partialApplyService } = await loadCompareServices()
    return partialApplyService.undoLast(readSessionId(payload))
  })
  ipcMain.handle('diffly:conflicts:open', async (_event, payload: unknown) => {
    if (!isRecord(payload)) throw new Error('Invalid conflict payload.')
    const { conflictService } = await loadCompareServices()
    return conflictService.open(requiredId(payload.sessionId), requiredId(payload.entryId))
  })
  ipcMain.handle('diffly:conflicts:resolve', async (_event, payload: unknown) => {
    const { conflictService } = await loadCompareServices()
    return conflictService.resolve(readResolveConflictRequest(payload))
  })
  ipcMain.handle('diffly:conflicts:undoResolution', async (_event, payload: unknown) => {
    const { conflictService } = await loadCompareServices()
    return conflictService.undoResolution(readSessionId(payload))
  })
  ipcMain.handle('diffly:review:listThreads', async (_event, payload: unknown) => {
    if (!isRecord(payload)) throw new Error('Invalid review list payload.')
    const { reviewService } = await loadCompareServices()
    return reviewService.listThreads(
      requiredId(payload.sessionId),
      payload.entryId === undefined ? undefined : requiredId(payload.entryId),
    )
  })
  ipcMain.handle('diffly:review:listThreadCounts', async (_event, payload: unknown) => {
    const { reviewService } = await loadCompareServices()
    return reviewService.listThreadCounts(readSessionId(payload))
  })
  ipcMain.handle('diffly:review:createThread', async (_event, payload: unknown) => {
    const { reviewService } = await loadCompareServices()
    return reviewService.createThread(readCreateReviewThreadRequest(payload))
  })
  ipcMain.handle('diffly:review:reply', async (_event, payload: unknown) => {
    const { reviewService } = await loadCompareServices()
    return reviewService.reply(readReplyReviewThreadRequest(payload))
  })
  ipcMain.handle('diffly:review:editComment', async (_event, payload: unknown) => {
    const value = readCommentMutation(payload, true)
    const { reviewService } = await loadCompareServices()
    return reviewService.editComment(value.sessionId, value.threadId, value.commentId, value.body!)
  })
  ipcMain.handle('diffly:review:deleteComment', async (_event, payload: unknown) => {
    const value = readCommentMutation(payload, false)
    const { reviewService } = await loadCompareServices()
    return reviewService.deleteComment(value.sessionId, value.threadId, value.commentId)
  })
  ipcMain.handle('diffly:review:resolveThread', async (_event, payload: unknown) => {
    const value = readThreadMutation(payload)
    const { reviewService } = await loadCompareServices()
    return reviewService.setThreadState(value.sessionId, value.threadId, 'resolved')
  })
  ipcMain.handle('diffly:review:reopenThread', async (_event, payload: unknown) => {
    const value = readThreadMutation(payload)
    const { reviewService } = await loadCompareServices()
    return reviewService.setThreadState(value.sessionId, value.threadId, 'open')
  })
  ipcMain.handle('diffly:review:reattachThread', async (_event, payload: unknown) => {
    const { reviewService } = await loadCompareServices()
    return reviewService.reattachThread(readReattachReviewThreadRequest(payload))
  })
  ipcMain.handle('diffly:review:export', async (_event, payload: unknown) => {
    const { reviewService } = await loadCompareServices()
    return reviewService.export(readSessionId(payload))
  })
  ipcMain.handle('diffly:review:import', async (_event, payload: unknown) => {
    if (!isRecord(payload)) throw new Error('Invalid review import payload.')
    const { reviewService } = await loadCompareServices()
    return reviewService.import(requiredId(payload.sessionId), readReviewBundle(payload.bundle))
  })
  ipcMain.handle('diffly:review:getProfile', async () => {
    const { reviewService } = await loadCompareServices()
    return reviewService.getProfile()
  })
  ipcMain.handle('diffly:review:saveProfile', async (_event, payload: unknown) => {
    const { reviewService } = await loadCompareServices()
    return reviewService.saveProfile(readReviewAuthor(payload))
  })
  ipcMain.handle('diffly:review:listDrafts', async (_event, payload: unknown) => {
    const { reviewService } = await loadCompareServices()
    return reviewService.listDrafts(readSessionId(payload))
  })
  ipcMain.handle('diffly:review:saveDraft', async (_event, payload: unknown) => {
    if (!isRecord(payload) || typeof payload.body !== 'string' || Buffer.byteLength(payload.body) > 256 * 1024) {
      throw new Error('Invalid review draft payload.')
    }
    const { reviewService } = await loadCompareServices()
    return reviewService.saveDraft(requiredId(payload.sessionId), requiredId(payload.key), payload.body)
  })
  ipcMain.handle('diffly:review:deleteDraft', async (_event, payload: unknown) => {
    if (!isRecord(payload)) throw new Error('Invalid review draft payload.')
    const { reviewService } = await loadCompareServices()
    return reviewService.removeDraft(requiredId(payload.sessionId), requiredId(payload.key))
  })
  ipcMain.handle('diffly:review:listDecisions', async (_event, payload: unknown) => {
    if (!isRecord(payload)) throw new Error('Invalid review decision payload.')
    const { reviewService } = await loadCompareServices()
    return reviewService.listDecisions(requiredId(payload.sessionId), requiredId(payload.entryId))
  })
  ipcMain.handle('diffly:review:setDecision', async (_event, payload: unknown) => {
    if (!isRecord(payload) || (payload.status !== null && payload.status !== 'accepted' && payload.status !== 'rejected' && payload.status !== 'needsChanges')) {
      throw new Error('Invalid review decision payload.')
    }
    const selection = readPartialChangeSelection({
      fingerprint: payload.fingerprint,
      ...(payload.changeIndex === null ? {} : { changeIndex: payload.changeIndex }),
    })
    const { reviewService } = await loadCompareServices()
    return reviewService.setDecision(
      requiredId(payload.sessionId),
      requiredId(payload.entryId),
      selection.fingerprint,
      selection.changeIndex ?? null,
      payload.status,
    )
  })
  ipcMain.handle('diffly:review:resetDecisions', async (_event, payload: unknown) => {
    if (!isRecord(payload)) throw new Error('Invalid review decision payload.')
    const { reviewService } = await loadCompareServices()
    return reviewService.resetDecisions(requiredId(payload.sessionId), requiredId(payload.entryId))
  })
}

export async function openExternalUrl(url: string): Promise<void> {
  // Fail closed: only http(s) is opened externally; empty/invalid schemes
  // (file:, javascript:, …) are ignored without throwing.
  if (/^https?:\/\//i.test(url)) {
    await shell.openExternal(url)
  }
}

// Validates an untrusted renderer-supplied filesystem path before handing it
// to the OS shell. Fail closed: anything that is not an existing absolute
// local path (no protocol prefixes other than a drive letter, no NUL bytes,
// no \\?\ / \\.\ device paths) is rejected silently.
export function validateShellTargetPath(rawPath: unknown): string | null {
  if (typeof rawPath !== 'string') {
    return null
  }

  const trimmed = rawPath.trim()
  if (!trimmed || trimmed.includes('\u0000')) {
    return null
  }

  // Reject protocol-looking strings (file:, javascript:, …) while still
  // allowing Windows drive letters such as "C:\" or "C:/".
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^[a-z]:[\\/]/i.test(trimmed)) {
    return null
  }

  const normalized = normalize(trimmed)
  if (!isAbsolute(normalized) || /^\\\\[.?]\\/.test(normalized)) {
    return null
  }

  return existsSync(normalized) ? normalized : null
}

export async function openLocalPath(rawPath: unknown): Promise<void> {
  const target = validateShellTargetPath(rawPath)
  if (!target) {
    return
  }

  try {
    // Only regular files are opened; directories go through revealLocalPath.
    if (!statSync(target).isFile()) {
      return
    }
  } catch {
    return
  }

  await shell.openPath(target)
}

export function revealLocalPath(rawPath: unknown): void {
  const target = validateShellTargetPath(rawPath)
  if (!target) {
    return
  }

  shell.showItemInFolder(target)
}

export function comparePaths(
  leftPath: string,
  rightPath: string,
  mode: 'file' | 'directory',
  options: CompareOptions,
): Promise<CompareResponse> {
  return loadCompareServices().then(({ localProvider }) =>
    localProvider.comparePaths(leftPath, rightPath, mode, options),
  )
}

export function startDirectoryCompare(
  leftPath: string,
  rightPath: string,
  options: CompareOptions,
) {
  return loadCompareServices().then(({ localProvider }) =>
    localProvider.startDirectoryCompare(leftPath, rightPath, options),
  )
}

export function pollDirectoryCompare(jobId: string) {
  return loadCompareServices().then(({ localProvider }) =>
    localProvider.pollDirectoryCompare(jobId),
  )
}

export function cancelDirectoryCompare(jobId: string) {
  return loadCompareServices().then(({ localProvider }) =>
    localProvider.cancelDirectoryCompare(jobId),
  )
}

export function openCompareItem(
  leftBase: string,
  rightBase: string,
  relativePath: string,
  options: CompareOptions,
): Promise<FileDiffResult> {
  return loadCompareServices().then(({ localProvider }) =>
    localProvider.openCompareItem(leftBase, rightBase, relativePath, options),
  )
}

export async function clearDirectoryCompareCache() {
  const { localProvider } = await loadCompareServices()
  localProvider.clearDirectoryCompareCache()
}

export function createDiffSession(
  source: DiffSource,
  options: CompareOptions,
): Promise<CreateDiffSessionResponse> {
  return loadCompareServices().then(({ diffSessionService }) =>
    diffSessionService.create(source, options),
  )
}

export function listDiffEntries(
  sessionId: string,
  filter?: DiffEntryFilter,
): Promise<DiffEntry[]> {
  return loadCompareServices().then(({ diffSessionService }) =>
    diffSessionService.listEntries(sessionId, filter),
  )
}

export function openDiffEntry(
  sessionId: string,
  entryId: string,
  options: CompareOptions,
): Promise<FileDiffResult> {
  return loadCompareServices().then(({ diffSessionService }) =>
    diffSessionService.openEntry(sessionId, entryId, options),
  )
}

export function refreshDiffSession(sessionId: string): Promise<CreateDiffSessionResponse> {
  return loadCompareServices().then(({ diffSessionService }) =>
    diffSessionService.refresh(sessionId),
  )
}

export async function disposeDiffSession(sessionId: string): Promise<void> {
  const { diffSessionService } = await loadCompareServices()
  diffSessionService.dispose(sessionId)
}

export async function openEditableDocument(payload: unknown) {
  const target = readDocumentTargetPayload(payload)
  const { documentService } = await loadCompareServices()
  return documentService.open(target)
}

export async function saveEditableDocument(payload: unknown) {
  const request = readSaveDocumentRequest(payload)
  const { documentService } = await loadCompareServices()
  return documentService.save(request)
}

export async function saveEditableDocuments(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.documents) || payload.documents.length > 256) {
    throw new Error('Invalid save-all payload.')
  }
  const request: SaveDocumentsRequest = {
    documents: payload.documents.map(readSaveDocumentRequest),
  }
  const totalBytes = request.documents.reduce(
    (sum, item) => sum + Buffer.byteLength(item.contents),
    0,
  )
  if (totalBytes > 256 * 1024 * 1024) {
    throw new Error('Save-all payload is too large.')
  }
  const { documentService } = await loadCompareServices()
  return documentService.saveAll(request)
}

export async function applyFileChange(payload: unknown): Promise<void> {
  const module = await import('./file-apply')
  return module.applyFileChange(payload)
}

export async function applyGitWorkingTreeAction(payload: unknown): Promise<void> {
  const actionPayload = readApplyGitWorkingTreeActionPayload(payload)
  const { diffSessionService } = await loadCompareServices()
  await diffSessionService.applyGitWorkingTreeAction(
    actionPayload.sessionId,
    actionPayload.entryId,
    actionPayload.action,
  )
}

// Parses and re-validates the PR URL in the main process before any network
// request; renderer-supplied owner/repo values are never trusted directly.
export async function fetchGithubPullRequestMetadata(url: unknown) {
  const [
    githubServiceModule,
    githubUrlModule,
  ] = await Promise.all([
    import('./github/github-service'),
    import('./github/github-url'),
  ])
  const { fetchPullRequestMetadata, GithubServiceError } = githubServiceModule
  const { parseGithubPullRequestUrl } = githubUrlModule
  const source = typeof url === 'string' ? parseGithubPullRequestUrl(url) : null
  if (!source) {
    throw new Error('Enter a GitHub pull request URL.')
  }

  try {
    return await fetchPullRequestMetadata(source)
  } catch (error) {
    if (error instanceof GithubServiceError && error.kind === 'rate-limited') {
      return {
        owner: source.owner,
        repo: source.repo,
        pullNumber: source.pullNumber,
        title: '',
        state: 'unknown',
        baseRef: '',
        headRef: '',
        baseSha: '',
        headSha: '',
        htmlUrl: source.url,
        changedFiles: null,
      }
    }
    throw error
  }
}

async function loadCompareServices() {
  if (!compareServicesPromise) {
    compareServicesPromise = Promise.all([
      import('./diff/diff-session-service'),
      import('./documents/document-service'),
      import('./documents/document-draft-store'),
      import('./documents/document-watch-service'),
      import('./search/search-service'),
      import('./review/partial-apply-service'),
      import('./review/operation-journal'),
      import('./conflicts/conflict-service'),
      import('./review/review-service'),
      import('./review/review-store'),
      import('./review/review-preferences-store'),
      import('./providers/github-provider'),
      import('./providers/git-provider'),
      import('./providers/local-provider'),
    ]).then(([
      { DiffSessionService },
      { DocumentService },
      { DocumentDraftStore },
      { DocumentWatchService },
      { SearchService },
      { PartialApplyService },
      { OperationJournal },
      { ConflictService },
      { ReviewService },
      { ReviewStore },
      { ReviewPreferencesStore },
      { GithubProvider },
      { GitProvider },
      { LocalProvider },
    ]) => {
      const localProvider = new LocalProvider()
      const gitProvider = new GitProvider()
      const githubProvider = new GithubProvider()
      const diffSessionService = new DiffSessionService({
        localProvider,
        gitProvider,
        githubProvider,
      })
      const documentWatchService = new DocumentWatchService()
      const documentService = new DocumentService(diffSessionService, documentWatchService)
      const draftStore = new DocumentDraftStore(join(app.getPath('userData'), 'drafts'))
      const operationJournal = new OperationJournal(join(app.getPath('userData'), 'operations'))
      const searchService = new SearchService(diffSessionService, documentService, operationJournal)
      const partialApplyService = new PartialApplyService(diffSessionService, operationJournal)
      const conflictService = new ConflictService(diffSessionService, operationJournal)
      const reviewStore = new ReviewStore(join(app.getPath('userData'), 'reviews'))
      const reviewPreferences = new ReviewPreferencesStore(join(app.getPath('userData'), 'reviews'))
      const reviewService = new ReviewService(diffSessionService, reviewStore, reviewPreferences)

      return {
        diffSessionService,
        localProvider,
        documentService,
        draftStore,
        searchService,
        partialApplyService,
        conflictService,
        reviewService,
      }
    })
  }

  return compareServicesPromise
}

export function readDocumentTargetPayload(payload: unknown): DocumentTarget {
  if (!isRecord(payload)) throw new Error('Invalid document target.')
  switch (payload.kind) {
    case 'local':
      return {
        kind: 'local',
        sessionId: requiredId(payload.sessionId),
        entryId: requiredId(payload.entryId),
        side: readDocumentSide(payload.side),
      }
    case 'gitWorktree':
    case 'gitIndex':
      return {
        kind: payload.kind,
        sessionId: requiredId(payload.sessionId),
        entryId: requiredId(payload.entryId),
      }
    case 'scratch':
      return {
        kind: 'scratch',
        sourceSessionId: requiredId(payload.sourceSessionId),
        sourceEntryId: requiredId(payload.sourceEntryId),
        sourceSide: readDocumentSide(payload.sourceSide),
      }
    default:
      throw new Error('Invalid document target.')
  }
}

export function readSaveDocumentRequest(payload: unknown): SaveDocumentRequest {
  if (!isRecord(payload) || typeof payload.contents !== 'string') {
    throw new Error('Invalid save document payload.')
  }
  if (Buffer.byteLength(payload.contents) > 64 * 1024 * 1024) {
    throw new Error('Document is too large to save safely.')
  }
  return {
    target: readDocumentTargetPayload(payload.target),
    contents: payload.contents,
    expectedRevision: readDocumentRevision(payload.expectedRevision),
    format: payload.format === undefined ? undefined : readDocumentFormatPatch(payload.format),
    overwrite: payload.overwrite === true,
  }
}

function readSaveDocumentAsRequest(payload: unknown): SaveDocumentAsRequest {
  if (
    !isRecord(payload) || typeof payload.contents !== 'string' ||
    Buffer.byteLength(payload.contents) > 64 * 1024 * 1024 ||
    typeof payload.suggestedName !== 'string' || !payload.suggestedName.trim() ||
    payload.suggestedName.length > 1024 || payload.suggestedName.includes('\0') ||
    !isRecord(payload.format)
  ) throw new Error('Invalid Save As payload.')
  const format = readDocumentFormatPatch(payload.format)
  if (
    format.encoding === undefined || format.lineEnding === undefined ||
    format.hasTrailingNewline === undefined ||
    (payload.format.mode !== null &&
      (typeof payload.format.mode !== 'number' || !Number.isSafeInteger(payload.format.mode)))
  ) throw new Error('Invalid Save As document format.')
  return {
    target: readDocumentTargetPayload(payload.target),
    contents: payload.contents,
    suggestedName: payload.suggestedName,
    format: {
      encoding: format.encoding,
      lineEnding: format.lineEnding,
      hasTrailingNewline: format.hasTrailingNewline,
      mode: payload.format.mode,
    } as SaveDocumentAsRequest['format'],
  }
}

function readDocumentRevision(value: unknown): DocumentRevision {
  if (
    !isRecord(value) ||
    typeof value.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(value.sha256) ||
    typeof value.size !== 'number' ||
    !Number.isSafeInteger(value.size) ||
    value.size < 0 ||
    !isNullableString(value.modifiedNs) ||
    !isNullableOid(value.gitOid) ||
    !isNullableOid(value.indexOid)
  ) {
    throw new Error('Invalid document revision.')
  }
  return {
    sha256: value.sha256.toLowerCase(),
    size: value.size,
    modifiedNs: value.modifiedNs,
    gitOid: value.gitOid,
    indexOid: value.indexOid,
  }
}

function readDocumentFormatPatch(value: unknown): NonNullable<SaveDocumentRequest['format']> {
  if (!isRecord(value)) throw new Error('Invalid document format.')
  const format: NonNullable<SaveDocumentRequest['format']> = {}
  if (value.encoding !== undefined) {
    if (!['utf8', 'utf8-bom', 'utf16le', 'utf16be', 'windows1252', 'latin1'].includes(String(value.encoding))) {
      throw new Error('Invalid document encoding.')
    }
    format.encoding = value.encoding as NonNullable<typeof format.encoding>
  }
  if (value.lineEnding !== undefined) {
    if (value.lineEnding !== 'lf' && value.lineEnding !== 'crlf' && value.lineEnding !== 'cr') {
      throw new Error('Invalid document line ending.')
    }
    format.lineEnding = value.lineEnding
  }
  if (value.hasTrailingNewline !== undefined) {
    if (typeof value.hasTrailingNewline !== 'boolean') {
      throw new Error('Invalid trailing newline setting.')
    }
    format.hasTrailingNewline = value.hasTrailingNewline
  }
  return format
}

function requiredId(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096 || value.includes('\0')) {
    throw new Error('Invalid document identity.')
  }
  return value
}

function documentWatchId(target: DocumentTarget) {
  return Buffer.from(JSON.stringify(target)).toString('base64url')
}

function readDocumentSide(value: unknown) {
  if (value !== 'left' && value !== 'right') throw new Error('Invalid document side.')
  return value
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isNullableOid(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value))
}

export function readSaveDraftRequest(payload: unknown): SaveDraftRequest {
  if (
    !isRecord(payload) ||
    typeof payload.contents !== 'string' ||
    Buffer.byteLength(payload.contents) > 64 * 1024 * 1024 ||
    !Array.isArray(payload.selections) ||
    payload.selections.length > 1024 ||
    typeof payload.scrollTop !== 'number' ||
    !Number.isFinite(payload.scrollTop) ||
    payload.scrollTop < 0
  ) {
    throw new Error('Invalid draft payload.')
  }
  const formatPatch = readDocumentFormatPatch(payload.format)
  if (
    !isRecord(payload.format) ||
    formatPatch.encoding === undefined ||
    formatPatch.lineEnding === undefined ||
    formatPatch.hasTrailingNewline === undefined ||
    (payload.format.mode !== null &&
      (typeof payload.format.mode !== 'number' || !Number.isSafeInteger(payload.format.mode)))
  ) {
    throw new Error('Invalid draft document format.')
  }
  const result: SaveDraftRequest = {
    target: readDocumentTargetPayload(payload.target),
    contents: payload.contents,
    originalRevision: readDocumentRevision(payload.originalRevision),
    format: {
      encoding: formatPatch.encoding,
      lineEnding: formatPatch.lineEnding,
      hasTrailingNewline: formatPatch.hasTrailingNewline,
      mode: payload.format.mode,
    },
    selections: payload.selections.map(readDraftSelection),
    scrollTop: payload.scrollTop,
  }
  if (payload.id !== undefined) {
    result.id = readSha256Id({ id: payload.id })
  }
  return result
}

function readDraftSelection(value: unknown): DocumentDraft['selections'][number] {
  if (!isRecord(value) || !isRecord(value.start) || !isRecord(value.end)) {
    throw new Error('Invalid draft selection.')
  }
  if (value.direction !== -1 && value.direction !== 0 && value.direction !== 1) {
    throw new Error('Invalid draft selection direction.')
  }
  return {
    start: readDraftPosition(value.start),
    end: readDraftPosition(value.end),
    direction: value.direction,
  }
}

function readDraftPosition(value: Record<string, unknown>) {
  if (
    typeof value.line !== 'number' ||
    !Number.isSafeInteger(value.line) ||
    value.line < 0 ||
    typeof value.character !== 'number' ||
    !Number.isSafeInteger(value.character) ||
    value.character < 0
  ) {
    throw new Error('Invalid draft selection position.')
  }
  return { line: value.line, character: value.character }
}

function readSha256Id(payload: unknown) {
  if (!isRecord(payload) || typeof payload.id !== 'string' || !/^[a-f0-9]{64}$/.test(payload.id)) {
    throw new Error('Invalid persisted object id.')
  }
  return payload.id
}

export function readStartSearchRequest(payload: unknown): StartComparisonSearchRequest {
  if (!isRecord(payload) || !isRecord(payload.query)) {
    throw new Error('Invalid comparison search payload.')
  }
  const query = payload.query
  if (
    typeof query.text !== 'string' ||
    !query.text ||
    query.text.length > 4096 ||
    typeof query.caseSensitive !== 'boolean' ||
    typeof query.wholeWord !== 'boolean' ||
    typeof query.regex !== 'boolean' ||
    typeof query.pathFilter !== 'string' ||
    query.pathFilter.length > 4096 ||
    !isSearchScope(query.scope)
  ) {
    throw new Error('Invalid comparison search query.')
  }
  const normalized: ComparisonSearchQuery = {
    text: query.text,
    caseSensitive: query.caseSensitive,
    wholeWord: query.wholeWord,
    regex: query.regex,
    scope: query.scope,
    pathFilter: query.pathFilter,
  }
  return { sessionId: requiredId(payload.sessionId), query: normalized }
}

function readPreviewReplaceRequest(payload: unknown): PreviewComparisonReplaceRequest {
  if (!isRecord(payload) || typeof payload.replacement !== 'string' || Buffer.byteLength(payload.replacement) > 1024 * 1024) {
    throw new Error('Invalid comparison replace payload.')
  }
  return { ...readStartSearchRequest(payload), replacement: payload.replacement }
}

function readApplyReplaceRequest(payload: unknown): ApplyComparisonReplaceRequest {
  const preview = readPreviewReplaceRequest(payload)
  if (!isRecord(payload) || !Array.isArray(payload.documents) || payload.documents.length > 100_000) {
    throw new Error('Invalid comparison replace targets.')
  }
  return {
    ...preview,
    documents: payload.documents.map((value) => {
      if (!isRecord(value)) throw new Error('Invalid comparison replace target.')
      return {
        target: readDocumentTargetPayload(value.target),
        expectedRevision: readDocumentRevision(value.expectedRevision),
      }
    }),
  }
}

function readJobId(payload: unknown) {
  if (!isRecord(payload)) throw new Error('Invalid job payload.')
  return requiredId(payload.jobId)
}

function isSearchScope(value: unknown): value is ComparisonSearchQuery['scope'] {
  return value === 'all' || value === 'changed' || value === 'added' || value === 'deleted' || value === 'context'
}

export function readApplyPartialChangeRequest(payload: unknown): ApplyPartialChangeRequest {
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.selections) ||
    payload.selections.length < 1 ||
    payload.selections.length > 10_000 ||
    !isPartialChangeOperation(payload.operation)
  ) {
    throw new Error('Invalid partial change payload.')
  }
  return {
    sessionId: requiredId(payload.sessionId),
    entryId: requiredId(payload.entryId),
    operation: payload.operation,
    selections: payload.selections.map(readPartialChangeSelection),
    leftRevision: payload.leftRevision === null ? null : readDocumentRevision(payload.leftRevision),
    rightRevision: payload.rightRevision === null ? null : readDocumentRevision(payload.rightRevision),
  }
}

function readPartialChangeSelection(value: unknown): PartialChangeSelection {
  if (!isRecord(value) || !isRecord(value.fingerprint)) {
    throw new Error('Invalid partial change selection.')
  }
  const fingerprint = value.fingerprint
  const numbers = [fingerprint.oldStart, fingerprint.oldCount, fingerprint.newStart, fingerprint.newCount]
  if (
    numbers.some((item) => typeof item !== 'number' || !Number.isSafeInteger(item) || item < 0) ||
    typeof fingerprint.contextHash !== 'string' || !/^[a-f0-9]{64}$/i.test(fingerprint.contextHash) ||
    typeof fingerprint.changeHash !== 'string' || !/^[a-f0-9]{64}$/i.test(fingerprint.changeHash) ||
    (value.changeIndex !== undefined &&
      (typeof value.changeIndex !== 'number' || !Number.isSafeInteger(value.changeIndex) || value.changeIndex < 0))
  ) {
    throw new Error('Invalid hunk fingerprint.')
  }
  return {
    fingerprint: {
      oldStart: fingerprint.oldStart as number,
      oldCount: fingerprint.oldCount as number,
      newStart: fingerprint.newStart as number,
      newCount: fingerprint.newCount as number,
      contextHash: fingerprint.contextHash,
      changeHash: fingerprint.changeHash,
    },
    changeIndex: value.changeIndex as number | undefined,
  }
}

function isPartialChangeOperation(value: unknown): value is ApplyPartialChangeRequest['operation'] {
  return value === 'applyRightToLeft' || value === 'applyLeftToRight' ||
    value === 'applyBothToLeft' || value === 'applyBothToRight' ||
    value === 'stage' || value === 'unstage' || value === 'discard'
}

function readSessionId(payload: unknown) {
  if (!isRecord(payload)) throw new Error('Invalid session payload.')
  return requiredId(payload.sessionId)
}

export function readResolveConflictRequest(payload: unknown): ResolveConflictRequest {
  if (!isRecord(payload) || !isRecord(payload.resolution)) {
    throw new Error('Invalid conflict resolution payload.')
  }
  const resolution = payload.resolution
  let normalized: ResolveConflictRequest['resolution']
  if (resolution.kind === 'delete') {
    normalized = { kind: 'delete' }
  } else if (resolution.kind === 'side' && (resolution.side === 'current' || resolution.side === 'incoming')) {
    normalized = { kind: 'side', side: resolution.side }
  } else if (resolution.kind === 'contents' && typeof resolution.contents === 'string') {
    if (Buffer.byteLength(resolution.contents) > 64 * 1024 * 1024) {
      throw new Error('Resolved conflict contents are too large.')
    }
    normalized = {
      kind: 'contents',
      contents: resolution.contents,
      format: resolution.format === undefined ? undefined : readDocumentFormatPatch(resolution.format),
    }
  } else {
    throw new Error('Invalid conflict resolution.')
  }
  return {
    sessionId: requiredId(payload.sessionId),
    entryId: requiredId(payload.entryId),
    expectedRevision: readConflictRevision(payload.expectedRevision),
    resolution: normalized,
  }
}

function readConflictRevision(value: unknown): ConflictRevision {
  if (
    !isRecord(value) ||
    !isNullableOid(value.baseOid) ||
    !isNullableOid(value.currentOid) ||
    !isNullableOid(value.incomingOid)
  ) {
    throw new Error('Invalid conflict revision.')
  }
  return {
    baseOid: value.baseOid,
    currentOid: value.currentOid,
    incomingOid: value.incomingOid,
    workingRevision: value.workingRevision === null ? null : readDocumentRevision(value.workingRevision),
  }
}

export function readCreateReviewThreadRequest(payload: unknown): CreateReviewThreadRequest {
  if (!isRecord(payload) || (payload.side !== 'deletions' && payload.side !== 'additions')) {
    throw new Error('Invalid create review thread payload.')
  }
  return {
    sessionId: requiredId(payload.sessionId),
    entryId: requiredId(payload.entryId),
    side: payload.side,
    lineNumber: readPositiveInteger(payload.lineNumber, 'Invalid review line number.'),
    body: readReviewBody(payload.body),
    author: readReviewAuthor(payload.author),
  }
}

export function readReplyReviewThreadRequest(payload: unknown): ReplyReviewThreadRequest {
  if (!isRecord(payload)) throw new Error('Invalid review reply payload.')
  return {
    sessionId: requiredId(payload.sessionId),
    threadId: requiredId(payload.threadId),
    body: readReviewBody(payload.body),
    author: readReviewAuthor(payload.author),
  }
}

export function readReattachReviewThreadRequest(payload: unknown): ReattachReviewThreadRequest {
  if (!isRecord(payload) || (payload.side !== 'deletions' && payload.side !== 'additions')) {
    throw new Error('Invalid review reattach payload.')
  }
  return {
    sessionId: requiredId(payload.sessionId),
    entryId: requiredId(payload.entryId),
    threadId: requiredId(payload.threadId),
    side: payload.side,
    lineNumber: readPositiveInteger(payload.lineNumber, 'Invalid review line number.'),
  }
}

function readReviewAuthor(value: unknown): ReviewAuthor {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' || !value.id || value.id.length > 256 ||
    typeof value.name !== 'string' || !value.name.trim() || value.name.length > 256 ||
    (value.avatar !== null && (typeof value.avatar !== 'string' || value.avatar.length > 1024 * 1024))
  ) {
    throw new Error('Invalid review author.')
  }
  return { id: value.id, name: value.name.trim(), avatar: value.avatar }
}

function readReviewBody(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value) > 256 * 1024) {
    throw new Error('Invalid review comment body.')
  }
  return value
}

function readThreadMutation(payload: unknown) {
  if (!isRecord(payload)) throw new Error('Invalid review thread mutation.')
  return { sessionId: requiredId(payload.sessionId), threadId: requiredId(payload.threadId) }
}

function readCommentMutation(payload: unknown, requiresBody: boolean) {
  if (!isRecord(payload)) throw new Error('Invalid review comment mutation.')
  return {
    ...readThreadMutation(payload),
    commentId: requiredId(payload.commentId),
    body: requiresBody ? readReviewBody(payload.body) : undefined,
  }
}

function readReviewBundle(value: unknown): ReviewBundle {
  if (
    !isRecord(value) || value.schemaVersion !== 1 ||
    typeof value.compareIdentity !== 'string' || !/^[a-f0-9]{64}$/.test(value.compareIdentity) ||
    typeof value.exportedAt !== 'string' || !Array.isArray(value.threads) || value.threads.length > 100_000
  ) {
    throw new Error('Invalid review bundle.')
  }
  const threads: ReviewThread[] = value.threads.map((thread): ReviewThread => {
    if (!isRecord(thread) || !isRecord(thread.anchor) || !Array.isArray(thread.comments)) {
      throw new Error('Invalid review thread in bundle.')
    }
    if (
      thread.compareIdentity !== value.compareIdentity ||
      typeof thread.entryIdentity !== 'string' || !/^[a-f0-9]{64}$/.test(thread.entryIdentity) ||
      (thread.state !== 'open' && thread.state !== 'resolved' && thread.state !== 'outdated') ||
      (thread.anchor.side !== 'deletions' && thread.anchor.side !== 'additions') ||
      typeof thread.anchor.revision !== 'string' ||
      typeof thread.anchor.lineHash !== 'string' || !/^[a-f0-9]{64}$/.test(thread.anchor.lineHash) ||
      !Array.isArray(thread.anchor.contextBefore) || !thread.anchor.contextBefore.every((item) => typeof item === 'string') ||
      !Array.isArray(thread.anchor.contextAfter) || !thread.anchor.contextAfter.every((item) => typeof item === 'string')
    ) {
      throw new Error('Invalid review thread metadata in bundle.')
    }
    return {
      id: requiredId(thread.id),
      compareIdentity: value.compareIdentity as string,
      entryIdentity: thread.entryIdentity,
      anchor: {
        side: thread.anchor.side as ReviewThread['anchor']['side'],
        lineNumber: readPositiveInteger(thread.anchor.lineNumber, 'Invalid review anchor line.'),
        revision: thread.anchor.revision,
        lineHash: thread.anchor.lineHash,
        contextBefore: thread.anchor.contextBefore,
        contextAfter: thread.anchor.contextAfter,
      },
      state: thread.state as ReviewThread['state'],
      comments: thread.comments.map((comment) => {
        if (!isRecord(comment) || typeof comment.createdAt !== 'string' ||
          (comment.editedAt !== null && typeof comment.editedAt !== 'string')) {
          throw new Error('Invalid review comment in bundle.')
        }
        return {
          id: requiredId(comment.id),
          author: readReviewAuthor(comment.author),
          body: readReviewBody(comment.body),
          createdAt: comment.createdAt,
          editedAt: comment.editedAt,
        }
      }),
      createdAt: typeof thread.createdAt === 'string' ? thread.createdAt : '',
      updatedAt: typeof thread.updatedAt === 'string' ? thread.updatedAt : '',
    }
  })
  const decisions = value.decisions === undefined ? [] : readReviewDecisions(value.decisions)
  return { schemaVersion: 1, compareIdentity: value.compareIdentity, threads, decisions, exportedAt: value.exportedAt }
}

function readReviewDecisions(value: unknown): ReviewBundle['decisions'] {
  if (!Array.isArray(value) || value.length > 100_000) throw new Error('Invalid review decisions.')
  return value.map((decision) => {
    if (
      !isRecord(decision) || !isRecord(decision.fingerprint) ||
      typeof decision.entryIdentity !== 'string' || !/^[a-f0-9]{64}$/.test(decision.entryIdentity) ||
      (decision.status !== 'accepted' && decision.status !== 'rejected' && decision.status !== 'needsChanges') ||
      typeof decision.updatedAt !== 'string' ||
      (decision.changeIndex !== null && (typeof decision.changeIndex !== 'number' || !Number.isSafeInteger(decision.changeIndex) || decision.changeIndex < 0))
    ) throw new Error('Invalid review decision.')
    const selection = readPartialChangeSelection({
      fingerprint: decision.fingerprint,
      ...(decision.changeIndex === null ? {} : { changeIndex: decision.changeIndex }),
    })
    return {
      entryIdentity: decision.entryIdentity,
      fingerprint: selection.fingerprint,
      changeIndex: decision.changeIndex,
      status: decision.status,
      updatedAt: decision.updatedAt,
    }
  })
}

function readPositiveInteger(value: unknown, message: string) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error(message)
  return value
}

async function readAddRecentSourcePayload(payload: unknown): Promise<{
  source: DiffSource
  metadata?: unknown
}> {
  const { isDiffSourcePayload } = await import('./diff/diff-source')

  if (!isRecord(payload) || !isDiffSourcePayload(payload.source)) {
    throw new Error('Invalid add recent source payload.')
  }

  return {
    source: payload.source,
    metadata: payload.metadata,
  }
}

function readRemoveRecentSourceId(payload: unknown) {
  if (!isRecord(payload) || typeof payload.id !== 'string' || !payload.id.trim()) {
    throw new Error('Invalid remove recent source payload.')
  }

  return payload.id
}

function readApplyGitWorkingTreeActionPayload(
  payload: unknown,
): ApplyGitWorkingTreeActionPayload {
  if (
    !isRecord(payload) ||
    typeof payload.sessionId !== 'string' ||
    !payload.sessionId.trim() ||
    typeof payload.entryId !== 'string' ||
    !payload.entryId.trim() ||
    !isGitWorkingTreeReviewAction(payload.action)
  ) {
    throw new Error('Invalid git working tree action payload.')
  }

  return {
    sessionId: payload.sessionId,
    entryId: payload.entryId,
    action: payload.action,
  }
}

function isGitWorkingTreeReviewAction(value: unknown): value is GitWorkingTreeReviewAction {
  return value === 'stage' || value === 'unstage' || value === 'discard'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
