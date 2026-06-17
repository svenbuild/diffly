import { app, ipcMain, shell } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { isAbsolute, normalize } from 'node:path'
import type {
  CompareOptions,
  CompareResponse,
  CreateDiffSessionResponse,
  DiffEntry,
  DiffEntryFilter,
  DiffSource,
  FileDiffResult,
  PersistedSession,
  UpdateChannel,
} from '../../src/lib/types'

interface CompareServices {
  diffSessionService: import('./diff/diff-session-service').DiffSessionService
  localProvider: import('./providers/local-provider').LocalProvider
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

export async function applyFileChange(payload: unknown): Promise<void> {
  const module = await import('./file-apply')
  return module.applyFileChange(payload)
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
      import('./providers/github-provider'),
      import('./providers/git-provider'),
      import('./providers/local-provider'),
    ]).then(([
      { DiffSessionService },
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

      return {
        diffSessionService,
        localProvider,
      }
    })
  }

  return compareServicesPromise
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
