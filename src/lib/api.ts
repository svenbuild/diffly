import type {
  CompareOptions,
  CompareResponse,
  CreateDiffSessionResponse,
  DiffEntry,
  DiffEntryFilter,
  DiffSource,
  FileDiffResult,
  PathKind,
  PersistedSession,
  UpdateChannel,
} from './types'

export const choosePath = (kind: PathKind) =>
  window.diffly.choosePath(kind)

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
