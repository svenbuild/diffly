import { invoke } from '@tauri-apps/api/core'

import type {
  CompareOptions,
  CompareResponse,
  DirectoryListing,
  ExplorerEntry,
  FileDiffResult,
  PathInfo,
  PathKind,
  PersistedSession,
} from './types'

export const choosePath = (kind: PathKind) =>
  invoke<string | null>('choose_path', { kind })

export const listRoots = () => invoke<ExplorerEntry[]>('list_roots')

export const listDirectory = (path: string) =>
  invoke<DirectoryListing>('list_directory', { path })

export const pathInfo = (path: string) => invoke<PathInfo>('path_info', { path })

export const loadSessionState = () =>
  invoke<PersistedSession | null>('load_session_state')

export const saveSessionState = (session: PersistedSession) =>
  invoke<void>('save_session_state', { session })

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
