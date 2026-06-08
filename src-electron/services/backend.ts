import { app, ipcMain } from 'electron'
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
import { DiffSessionService } from './diff/diff-session-service'
import {
  choosePath,
  listDirectory,
  listRoots,
  pathInfo,
} from './explorer-service'
import { loadLaunchContext } from './launch-context'
import { LocalProvider } from './providers/local-provider'
import {
  addRecentSource,
  loadRecentSources,
  removeRecentSource,
} from './recents-store'
import {
  loadSessionState,
  saveSessionState,
} from './session-store'
import {
  checkForUpdates,
  downloadUpdate,
  installUpdate,
} from './update-service'

const localProvider = new LocalProvider()
const diffSessionService = new DiffSessionService({ localProvider })

export {
  clearDirectoryListingCache,
  listDirectory,
  listRoots,
} from './explorer-service'
export {
  getLaunchContextFromArgs,
  registerWindowLaunchContext,
} from './launch-context'
export {
  addRecentSource,
  loadRecentSources,
  removeRecentSource,
} from './recents-store'
export { loadSessionState, saveSessionState } from './session-store'
export { clearFileDiffCache } from './file-diff'

export function registerIpcHandlers() {
  ipcMain.handle('diffly:choosePath', (_event, payload: { kind: string }) =>
    choosePath(payload.kind),
  )
  ipcMain.handle('diffly:listRoots', () => listRoots())
  ipcMain.handle('diffly:listDirectory', (_event, payload: { path: string }) =>
    listDirectory(payload.path),
  )
  ipcMain.handle('diffly:pathInfo', (_event, payload: { path: string }) =>
    pathInfo(payload.path),
  )
  ipcMain.handle('diffly:loadSessionState', () => loadSessionState())
  ipcMain.handle('diffly:loadLaunchContext', (event) => loadLaunchContext(event.sender.id))
  ipcMain.handle('diffly:saveSessionState', (_event, payload: { session: PersistedSession }) =>
    saveSessionState(payload.session),
  )
  ipcMain.handle('diffly:loadRecentSources', () => loadRecentSources())
  ipcMain.handle('diffly:addRecentSource', (_event, payload: unknown) => {
    const recentPayload = readAddRecentSourcePayload(payload)
    return addRecentSource(recentPayload.source, recentPayload.metadata)
  })
  ipcMain.handle('diffly:removeRecentSource', (_event, payload: unknown) =>
    removeRecentSource(readRemoveRecentSourceId(payload)),
  )
  ipcMain.handle('diffly:getAppVersion', () => app.getVersion())
  ipcMain.handle('diffly:checkForUpdates', (_event, payload: { channel: UpdateChannel }) =>
    checkForUpdates(payload.channel),
  )
  ipcMain.handle('diffly:downloadUpdate', (_event, payload: { channel: UpdateChannel }) =>
    downloadUpdate(payload.channel),
  )
  ipcMain.handle('diffly:installUpdate', (_event, payload: { channel: UpdateChannel }) =>
    installUpdate(payload.channel),
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

export function comparePaths(
  leftPath: string,
  rightPath: string,
  mode: 'file' | 'directory',
  options: CompareOptions,
): Promise<CompareResponse> {
  return localProvider.comparePaths(leftPath, rightPath, mode, options)
}

export function startDirectoryCompare(
  leftPath: string,
  rightPath: string,
  options: CompareOptions,
) {
  return localProvider.startDirectoryCompare(leftPath, rightPath, options)
}

export function pollDirectoryCompare(jobId: string) {
  return localProvider.pollDirectoryCompare(jobId)
}

export function cancelDirectoryCompare(jobId: string) {
  return localProvider.cancelDirectoryCompare(jobId)
}

export function openCompareItem(
  leftBase: string,
  rightBase: string,
  relativePath: string,
  options: CompareOptions,
): Promise<FileDiffResult> {
  return localProvider.openCompareItem(leftBase, rightBase, relativePath, options)
}

export function clearDirectoryCompareCache() {
  localProvider.clearDirectoryCompareCache()
}

export function createDiffSession(
  source: DiffSource,
  options: CompareOptions,
): Promise<CreateDiffSessionResponse> {
  return diffSessionService.create(source, options)
}

export function listDiffEntries(
  sessionId: string,
  filter?: DiffEntryFilter,
): DiffEntry[] {
  return diffSessionService.listEntries(sessionId, filter)
}

export function openDiffEntry(
  sessionId: string,
  entryId: string,
  options: CompareOptions,
): Promise<FileDiffResult> {
  return diffSessionService.openEntry(sessionId, entryId, options)
}

export function refreshDiffSession(sessionId: string): Promise<CreateDiffSessionResponse> {
  return diffSessionService.refresh(sessionId)
}

export function disposeDiffSession(sessionId: string): void {
  diffSessionService.dispose(sessionId)
}

function readAddRecentSourcePayload(payload: unknown): {
  source: DiffSource
  metadata?: unknown
} {
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

function isDiffSourcePayload(value: unknown): value is DiffSource {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    return false
  }

  switch (value.kind) {
    case 'local':
      return (
        typeof value.leftPath === 'string' &&
        typeof value.rightPath === 'string' &&
        (value.compareMode === 'file' || value.compareMode === 'directory')
      )
    case 'git':
      return (
        typeof value.repoPath === 'string' &&
        typeof value.repositoryRoot === 'string' &&
        isGitSelectionPayload(value.selection)
      )
    case 'githubPullRequest':
      return (
        typeof value.owner === 'string' &&
        typeof value.repo === 'string' &&
        typeof value.url === 'string' &&
        typeof value.pullNumber === 'number' &&
        Number.isInteger(value.pullNumber) &&
        value.pullNumber > 0
      )
    default:
      return false
  }
}

function isGitSelectionPayload(value: unknown): boolean {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    return false
  }

  switch (value.kind) {
    case 'workingTree':
      return (
        value.initialScope === 'all' ||
        value.initialScope === 'staged' ||
        value.initialScope === 'unstaged' ||
        value.initialScope === 'untracked'
      )
    case 'refRange':
      return (
        typeof value.baseRef === 'string' &&
        typeof value.headRef === 'string' &&
        (value.notation === 'twoDot' || value.notation === 'threeDot')
      )
    case 'commit':
      return typeof value.commitRef === 'string'
    default:
      return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
