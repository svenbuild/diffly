import {
  getFiletypeFromFileName,
  type FileContents,
  type SelectedLineRange,
} from '@pierre/diffs'
import type {
  DirectoryEntryResult,
  TextDiffPayload,
} from '../types'

export interface PlaceholderFileSource {
  entry: DirectoryEntryResult
  error: string
  hasTextDiff: boolean
}

export function buildDirectoryCodeViewFile(
  entry: DirectoryEntryResult,
  side: 'left' | 'right',
  text: TextDiffPayload,
): FileContents {
  const contents = side === 'left' ? text.leftText : text.rightText
  const cacheKey =
    side === 'left'
      ? text.leftCacheKey ?? text.leftSha256
      : text.rightCacheKey ?? text.rightSha256

  return {
    name: entry.relativePath,
    contents,
    cacheKey: cacheKey ?? `${entry.relativePath}:${side}:${contents.length}`,
    lang: getFiletypeFromFileName(entry.relativePath),
  }
}

export function statusLabel(status: DirectoryEntryResult['status'] | undefined) {
  switch (status) {
    case 'leftOnly':
      return 'Left only'
    case 'rightOnly':
      return 'Right only'
    case 'unsupported':
      return 'Unsupported'
    case 'modified':
    default:
      return 'Modified'
  }
}

export function describeSide(side: string | undefined) {
  return side === 'additions' ? 'right' : 'left'
}

export function describeRange(range: SelectedLineRange) {
  const startSide = describeSide(range.side)
  const endSide = describeSide(range.endSide ?? range.side)

  if (range.start === range.end && startSide === endSide) {
    return `${startSide} line ${range.start}`
  }

  return `${startSide} line ${range.start} to ${endSide} line ${range.end}`
}

export function buildPlaceholderFile(
  source: PlaceholderFileSource,
  key: string,
): FileContents {
  const { entry } = source
  const contents = source.error || (source.hasTextDiff ? 'Preparing diff...' : 'Loading diff...')

  return {
    name: entry.relativePath,
    contents,
    cacheKey: ['placeholder', key, contents.length].join('\u0000'),
    lang: 'text',
  }
}
