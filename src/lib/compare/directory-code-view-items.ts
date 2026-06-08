import {
  getFiletypeFromFileName,
  type FileContents,
  type SelectedLineRange,
} from '@pierre/diffs'
import type {
  DirectoryEntryResult,
  TextDiffPayload,
} from '../types'

const DIRECTORY_PLACEHOLDER_BYTES_PER_LINE = 31
const DIRECTORY_PLACEHOLDER_MIN_LINES = 8
const DIRECTORY_PLACEHOLDER_MODIFIED_MAX_LINES = 240
const DIRECTORY_PLACEHOLDER_FULL_FILE_MAX_LINES = 1200

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

export function estimatePlaceholderLineCount(entry: DirectoryEntryResult) {
  const maxSize = Math.max(entry.leftSize ?? 0, entry.rightSize ?? 0)
  if (maxSize <= 0) {
    return 1
  }

  const estimatedLines = maxSize / DIRECTORY_PLACEHOLDER_BYTES_PER_LINE
  const maxLines =
    entry.status === 'modified'
      ? DIRECTORY_PLACEHOLDER_MODIFIED_MAX_LINES
      : DIRECTORY_PLACEHOLDER_FULL_FILE_MAX_LINES

  return clampPlaceholderLineCount(estimatedLines, maxLines)
}

export function buildPlaceholderFile(
  source: PlaceholderFileSource,
  key: string,
  blankLineSuffixes: Map<number, string>,
): FileContents {
  const { entry } = source
  const label = source.error || (source.hasTextDiff ? 'Preparing diff...' : 'Loading diff...')
  const lineCount = source.error ? 1 : estimatePlaceholderLineCount(entry)
  const contents = buildPlaceholderContents(label, lineCount, blankLineSuffixes)

  return {
    name: entry.relativePath,
    contents,
    cacheKey: ['placeholder', key, contents.length].join('\u0000'),
    lang: 'text',
  }
}

function clampPlaceholderLineCount(value: number, max: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 1
  }

  return Math.max(
    DIRECTORY_PLACEHOLDER_MIN_LINES,
    Math.min(max, Math.ceil(value)),
  )
}

function buildPlaceholderContents(
  label: string,
  lineCount: number,
  blankLineSuffixes: Map<number, string>,
) {
  if (lineCount <= 1) {
    return label
  }

  let suffix = blankLineSuffixes.get(lineCount)
  if (suffix === undefined) {
    suffix = '\n'.repeat(lineCount - 1)
    blankLineSuffixes.set(lineCount, suffix)
  }

  return `${label}${suffix}`
}
