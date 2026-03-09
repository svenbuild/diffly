import { invoke } from '@tauri-apps/api/core'

import type {
  CompareOptions,
  CompareResponse,
  FileDiffResult,
  PathKind,
} from './types'

export const choosePath = (kind: PathKind) =>
  invoke<string | null>('choose_path', { kind })

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
