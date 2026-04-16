import { invoke } from '@tauri-apps/api/core'

import type {
  BinaryDiffPayload,
  CompareOptions,
  CompareResponse,
  DirectoryEntryResult,
  DirectoryListing,
  ExplorerEntry,
  FileDiffResult,
  LaunchContext,
  PollDirectoryCompareResponse,
  PathInfo,
  PathKind,
  PersistedSession,
  StartDirectoryCompareResponse,
  UpdateChannel,
  UpdateActionResult,
  UpdateCheckResult,
} from './types'

type BinaryDiffPayloadWire = Omit<BinaryDiffPayload, 'leftBytes' | 'rightBytes'> & {
  leftBytes: string
  rightBytes: string
}

type FileDiffResultWire = Omit<FileDiffResult, 'binary'> & {
  binary?: BinaryDiffPayloadWire | null
}

type CompareResponseWire =
  | {
      kind: 'directory'
      entries: DirectoryEntryResult[]
    }
  | {
      kind: 'file'
      result: FileDiffResultWire
    }

function decodeBase64Bytes(value: string) {
  if (!value) {
    return new Uint8Array(0)
  }

  const decoded = globalThis.atob(value)
  const bytes = new Uint8Array(decoded.length)
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index)
  }
  return bytes
}

function normalizeBinaryDiffPayload(payload: BinaryDiffPayloadWire): BinaryDiffPayload {
  return {
    ...payload,
    leftBytes: decodeBase64Bytes(payload.leftBytes),
    rightBytes: decodeBase64Bytes(payload.rightBytes),
  }
}

function normalizeFileDiffResult(result: FileDiffResultWire): FileDiffResult {
  return {
    ...result,
    binary: result.binary ? normalizeBinaryDiffPayload(result.binary) : result.binary,
  }
}

function normalizeCompareResponse(response: CompareResponseWire): CompareResponse {
  if (response.kind === 'file') {
    return {
      kind: 'file',
      result: normalizeFileDiffResult(response.result),
    }
  }

  return response
}

export const choosePath = (kind: PathKind) =>
  invoke<string | null>('choose_path', { kind })

export const listRoots = () => invoke<ExplorerEntry[]>('list_roots')

export const listDirectory = (path: string) =>
  invoke<DirectoryListing>('list_directory', { path })

export const pathInfo = (path: string) => invoke<PathInfo>('path_info', { path })

export const loadSessionState = () =>
  invoke<PersistedSession | null>('load_session_state')

export const loadLaunchContext = () =>
  invoke<LaunchContext | null>('load_launch_context')

export const saveSessionState = (session: PersistedSession) =>
  invoke<void>('save_session_state', { session })

export const getAppVersion = () =>
  invoke<string>('get_app_version')

export const checkForUpdates = (channel: UpdateChannel) =>
  invoke<UpdateCheckResult>('check_for_updates', { channel })

export const downloadUpdate = (channel: UpdateChannel) =>
  invoke<UpdateActionResult>('download_update', { channel })

export const installUpdate = (channel: UpdateChannel) =>
  invoke<UpdateActionResult>('install_update', { channel })

export const comparePaths = (
  leftPath: string,
  rightPath: string,
  mode: 'file' | 'directory',
  options: CompareOptions,
) =>
  invoke<CompareResponseWire>('compare_paths', {
    leftPath,
    rightPath,
    mode,
    options,
  }).then(normalizeCompareResponse)

export const startDirectoryCompare = (
  leftPath: string,
  rightPath: string,
  options: CompareOptions,
) =>
  invoke<StartDirectoryCompareResponse>('start_directory_compare', {
    leftPath,
    rightPath,
    options,
  })

export const pollDirectoryCompare = (jobId: string) =>
  invoke<PollDirectoryCompareResponse>('poll_directory_compare', {
    jobId,
  })

export const openCompareItem = (
  leftBase: string,
  rightBase: string,
  relativePath: string,
  options: CompareOptions,
) =>
  invoke<FileDiffResultWire>('open_compare_item', {
    leftBase,
    rightBase,
    relativePath,
    options,
  }).then(normalizeFileDiffResult)

export const loadBinaryPreview = (
  leftPath: string,
  rightPath: string,
  options: CompareOptions,
) =>
  invoke<BinaryDiffPayloadWire>('load_binary_preview', {
    leftPath,
    rightPath,
    options,
  }).then(normalizeBinaryDiffPayload)
