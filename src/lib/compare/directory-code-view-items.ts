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
const DIRECTORY_PLACEHOLDER_UNKNOWN_SIZE_LINES = 48
const DIRECTORY_PLACEHOLDER_MODIFIED_MAX_LINES = 240
const DIRECTORY_PLACEHOLDER_FULL_FILE_MAX_LINES = 1200
const DIRECTORY_PLACEHOLDER_PATCH_CACHE_LIMIT = 400
const patchPlaceholderLineCountCache = new Map<string, number>()

export interface PlaceholderFileSource {
  entry: DirectoryEntryResult
  error: string
  hasTextDiff: boolean
  text?: TextDiffPayload | null
  viewStyle?: 'split' | 'unified'
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
    name: entry.displayPath ?? entry.relativePath,
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

export function estimatePlaceholderLineCount(
  entry: DirectoryEntryResult,
  text?: TextDiffPayload | null,
  viewStyle: 'split' | 'unified' = 'split',
) {
  const patchLineCount = estimateCachedPatchPlaceholderLineCount(text, viewStyle)
  if (patchLineCount !== null) {
    return clampPlaceholderLineCount(patchLineCount, DIRECTORY_PLACEHOLDER_FULL_FILE_MAX_LINES)
  }

  const maxSize = Math.max(entry.leftSize ?? 0, entry.rightSize ?? 0)
  if (maxSize <= 0) {
    return DIRECTORY_PLACEHOLDER_UNKNOWN_SIZE_LINES
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
  const lineCount = source.error
    ? 1
    : estimatePlaceholderLineCount(entry, source.text, source.viewStyle)
  const contents = buildPlaceholderContents(label, lineCount, blankLineSuffixes)

  return {
    name: entry.displayPath ?? entry.relativePath,
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

function estimateCachedPatchPlaceholderLineCount(
  text: TextDiffPayload | null | undefined,
  viewStyle: 'split' | 'unified',
) {
  if (!text?.patchText) {
    return null
  }

  const cacheKey = text.patchCacheKey
    ? `${viewStyle}\u0000${text.patchCacheKey}`
    : null
  if (cacheKey) {
    const cached = patchPlaceholderLineCountCache.get(cacheKey)
    if (cached !== undefined) {
      return cached
    }
  }

  const lineCount = estimatePatchPlaceholderLineCount(text.patchText, viewStyle)
  if (cacheKey && lineCount !== null) {
    patchPlaceholderLineCountCache.set(cacheKey, lineCount)
    if (patchPlaceholderLineCountCache.size > DIRECTORY_PLACEHOLDER_PATCH_CACHE_LIMIT) {
      const firstKey = patchPlaceholderLineCountCache.keys().next().value
      if (firstKey) {
        patchPlaceholderLineCountCache.delete(firstKey)
      }
    }
  }

  return lineCount
}

function estimatePatchPlaceholderLineCount(
  patchText: string | null | undefined,
  viewStyle: 'split' | 'unified',
) {
  if (!patchText) {
    return null
  }

  let hunkCount = 0
  let splitRows = 0
  let unifiedRows = 0
  let pendingDeletions = 0
  let pendingAdditions = 0
  let inHunk = false

  const flushChangeRows = () => {
    if (pendingDeletions === 0 && pendingAdditions === 0) {
      return
    }

    splitRows += Math.max(pendingDeletions, pendingAdditions)
    pendingDeletions = 0
    pendingAdditions = 0
  }

  for (const line of patchText.split(/\r\n|\n|\r/)) {
    if (line.startsWith('@@ ')) {
      flushChangeRows()
      hunkCount += 1
      inHunk = true
      continue
    }

    if (!inHunk) {
      continue
    }

    if (line.startsWith('diff --git ')) {
      flushChangeRows()
      inHunk = false
      continue
    }

    if (line.startsWith('\\')) {
      splitRows += 1
      unifiedRows += 1
      continue
    }

    if (line.startsWith('-')) {
      pendingDeletions += 1
      unifiedRows += 1
      continue
    }

    if (line.startsWith('+')) {
      pendingAdditions += 1
      unifiedRows += 1
      continue
    }

    flushChangeRows()
    if (line.startsWith(' ')) {
      splitRows += 1
      unifiedRows += 1
    }
  }

  flushChangeRows()

  if (hunkCount === 0) {
    return null
  }

  const diffRows = viewStyle === 'unified' ? unifiedRows : splitRows

  return diffRows + hunkCount * 3 + 1
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
