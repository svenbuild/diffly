import type { ExplorerEntry } from './types'

export function formatSize(size: number | null) {
  if (size === null) {
    return '-'
  }

  if (size < 1024) {
    return `${size} B`
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function formatModified(value: number | null) {
  if (value === null) {
    return '-'
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

export function entryTypeLabel(entry: ExplorerEntry) {
  if (entry.kind === 'directory' || entry.kind === 'drive') {
    return 'Folder'
  }

  const extensionIndex = entry.name.lastIndexOf('.')

  if (extensionIndex === -1) {
    return 'File'
  }

  return `${entry.name.slice(extensionIndex + 1).toUpperCase()} file`
}
