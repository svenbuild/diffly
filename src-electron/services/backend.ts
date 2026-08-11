import { app, ipcMain, shell } from 'electron'
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
} from '../../src/lib/types'

interface CompareServices {
  diffSessionService: import('./diff/diff-session-service').DiffSessionService
  localProvider: import('./providers/local-provider').LocalProvider
  documentService: import('./documents/document-service').DocumentService
  draftStore: import('./documents/document-draft-store').DocumentDraftStore
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
      import('./providers/github-provider'),
      import('./providers/git-provider'),
      import('./providers/local-provider'),
    ]).then(([
      { DiffSessionService },
      { DocumentService },
      { DocumentDraftStore },
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
      const documentService = new DocumentService(diffSessionService)
      const draftStore = new DocumentDraftStore(join(app.getPath('userData'), 'drafts'))

      return {
        diffSessionService,
        localProvider,
        documentService,
        draftStore,
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
    if (!['utf8', 'utf8-bom', 'utf16le', 'utf16be'].includes(String(value.encoding))) {
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
  if (value.direction !== 'none' && value.direction !== 'backward' && value.direction !== 'forward') {
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
    typeof value.lineNumber !== 'number' ||
    !Number.isSafeInteger(value.lineNumber) ||
    value.lineNumber < 1 ||
    typeof value.character !== 'number' ||
    !Number.isSafeInteger(value.character) ||
    value.character < 0
  ) {
    throw new Error('Invalid draft selection position.')
  }
  return { lineNumber: value.lineNumber, character: value.character }
}

function readSha256Id(payload: unknown) {
  if (!isRecord(payload) || typeof payload.id !== 'string' || !/^[a-f0-9]{64}$/.test(payload.id)) {
    throw new Error('Invalid persisted object id.')
  }
  return payload.id
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
