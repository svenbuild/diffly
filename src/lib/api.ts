import type {
  BinaryDiffPayload,
  CompareOptions,
  CompareResponse,
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

export const openCompareItem = (
  leftBase: string,
  rightBase: string,
  relativePath: string,
  options: CompareOptions,
) =>
  window.diffly
    .openCompareItem(leftBase, rightBase, relativePath, options)
    .then(normalizeFileDiffResult)

export const loadBinaryPreview = (
  leftPath: string,
  rightPath: string,
  options: CompareOptions,
) =>
  window.diffly
    .loadBinaryPreview(leftPath, rightPath, options)
    .then(normalizeBinaryDiffPayload)

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
  if (!result.binary) {
    return result
  }

  return {
    ...result,
    binary: normalizeBinaryDiffPayload(result.binary),
  }
}

function normalizeBinaryDiffPayload(diff: BinaryDiffPayload): BinaryDiffPayload {
  return {
    ...diff,
    leftBytes: toUint8Array(diff.leftBytes),
    rightBytes: toUint8Array(diff.rightBytes),
  }
}

function toUint8Array(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return value
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value)
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }

  if (Array.isArray(value)) {
    return Uint8Array.from(value)
  }

  return new Uint8Array(0)
}
