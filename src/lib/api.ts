import { invoke } from '@tauri-apps/api/core'

import type {
  CompareOptions,
  CompareMode,
  CompareResponse,
  DirectoryListing,
  ExplorerEntry,
  FileDiffResult,
  LaunchContext,
  PathInfo,
  PathKind,
  PersistedSession,
  UpdateChannel,
  UpdateActionResult,
  UpdateCheckResult,
} from './types'

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
  invoke<CompareResponse>('compare_paths', {
    leftPath,
    rightPath,
    mode,
    options,
  })

export const openCompareItem = (
  leftBase: string,
  rightBase: string,
  relativePath: string,
  options: CompareOptions,
) =>
  invoke<FileDiffResult>('open_compare_item', {
    leftBase,
    rightBase,
    relativePath,
    options,
  })

export const saveCompareTextSide = (
  mode: CompareMode,
  leftPath: string,
  rightPath: string,
  relativePath: string | null,
  targetSide: 'left' | 'right',
  contents: string,
  expectedSha256: string | null,
) =>
  invoke<void>('save_compare_text_side', {
    mode,
    leftPath,
    rightPath,
    relativePath,
    targetSide,
    contents,
    expectedSha256,
  })
