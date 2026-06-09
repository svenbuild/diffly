import { defaultDirectoryEntry } from './directory-state'
import {
  formatCompactPath,
  formatRelativePathLabel,
  getFileName,
} from '../path-utils'
import type {
  DirectoryEntryResult,
  FileDiffResult,
} from '../types'
import type { Side } from '../ui-types'

export interface CompareRootDisplay {
  prefix: string
  suffix: string
  fullPath: string
}

export function buildCompareRootDisplay(fullPath: string, distinctSegments: string[]): CompareRootDisplay {
  if (!fullPath) {
    return {
      prefix: '',
      suffix: '',
      fullPath: '',
    }
  }

  const distinctPath = distinctSegments.join('/')
  const suffix = distinctPath ? formatCompactPath(distinctPath, 3) : formatCompactPath(fullPath, 3)
  const prefix = distinctPath && suffix && !suffix.startsWith('...') ? '...\\' : ''

  return {
    prefix,
    suffix: suffix || formatCompactPath(fullPath, 3),
    fullPath,
  }
}

export function directoryCompareEntryLabel(
  selectedRelativePath: string,
  entries: DirectoryEntryResult[],
  emptyLabel: string,
) {
  if (selectedRelativePath) {
    const entry = entries.find((candidate) => candidate.relativePath === selectedRelativePath)
    return formatRelativePathLabel(entry?.displayPath ?? entry?.relativePath ?? selectedRelativePath)
  }

  const entry = defaultDirectoryEntry(entries)
  return entry ? formatRelativePathLabel(entry.displayPath ?? entry.relativePath) : emptyLabel
}

export function fileCompareLabel(activeDiff: FileDiffResult | null, emptyLabel: string) {
  if (!activeDiff) {
    return emptyLabel
  }

  const leftName = getFileName(activeDiff.leftLabel)
  const rightName = getFileName(activeDiff.rightLabel)

  return leftName === rightName ? leftName : `${leftName} <-> ${rightName}`
}

export function filePaneLabel(activeDiff: FileDiffResult | null, side: Side) {
  if (!activeDiff) {
    return ''
  }

  return getFileName(side === 'left' ? activeDiff.leftLabel : activeDiff.rightLabel)
}
