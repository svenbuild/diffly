import { get, writable } from 'svelte/store'

// Preview-only planned file operations recorded from tree drag & drop and
// rename interactions. Nothing here touches the filesystem; applying the
// operations is a later feature. The list logic is pure so collapse/dedupe and
// validation can be unit tested without DOM or stores.

export type PlannedFileOperationKind = 'rename' | 'move'

export interface PlannedFileOperation {
  id: string
  kind: PlannedFileOperationKind
  fromRelativePath: string
  toRelativePath: string
}

export interface PlannedFileOperationCandidate {
  fromRelativePath: string
  toRelativePath: string
}

export type PlannedOperationRejectionReason =
  | 'empty-path'
  | 'absolute-path'
  | 'escapes-root'
  | 'invalid-characters'
  | 'collision'

export type PlannedOperationValidation =
  | { ok: true }
  | { ok: false; reason: PlannedOperationRejectionReason }

// Windows-invalid name characters plus all C0 control characters (including
// NUL). Built via fromCharCode so no literal control byte lands in source.
const INVALID_PATH_CHARACTERS = new RegExp('[<>:"|?*' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + ']')

export function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, '/')
}

/**
 * Syntactic validation of a planned target path. The path must stay inside the
 * compare root: relative, no `..` segments, no empty or `.` segments, and no
 * characters that are invalid in Windows file names.
 */
export function validatePlannedTargetPath(
  toRelativePath: string,
): PlannedOperationValidation {
  const normalized = normalizeRelativePath(toRelativePath)
  if (normalized.trim().length === 0) {
    return { ok: false, reason: 'empty-path' }
  }

  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    return { ok: false, reason: 'absolute-path' }
  }

  if (INVALID_PATH_CHARACTERS.test(normalized)) {
    return { ok: false, reason: 'invalid-characters' }
  }

  for (const segment of normalized.split('/')) {
    if (segment === '..') {
      return { ok: false, reason: 'escapes-root' }
    }
    if (segment.trim().length === 0 || segment === '.') {
      return { ok: false, reason: 'invalid-characters' }
    }
  }

  return { ok: true }
}

/**
 * Full validation of a candidate operation. `isOccupied` must answer against
 * the current preview state of the tree (existing entries with already planned
 * operations applied), so chained plans do not produce false collisions.
 */
export function validatePlannedOperation(
  candidate: PlannedFileOperationCandidate,
  isOccupied: (path: string) => boolean,
): PlannedOperationValidation {
  const target = validatePlannedTargetPath(candidate.toRelativePath)
  if (!target.ok) {
    return target
  }

  const from = normalizeRelativePath(candidate.fromRelativePath)
  const to = normalizeRelativePath(candidate.toRelativePath)
  if (to !== from && isOccupied(to)) {
    return { ok: false, reason: 'collision' }
  }

  return { ok: true }
}

export function describePlannedOperationRejection(
  reason: PlannedOperationRejectionReason,
): string {
  switch (reason) {
    case 'empty-path':
      return 'Target name cannot be empty.'
    case 'absolute-path':
      return 'Target must be a relative path inside the compared folder.'
    case 'escapes-root':
      return 'Target cannot leave the compared folder.'
    case 'invalid-characters':
      return 'Target contains characters that are not allowed in file names.'
    case 'collision':
      return 'An entry with that path already exists.'
  }
}

function parentDirectoryOf(path: string): string {
  const separatorIndex = path.lastIndexOf('/')
  return separatorIndex === -1 ? '' : path.slice(0, separatorIndex)
}

function plannedOperationKindFor(
  fromRelativePath: string,
  toRelativePath: string,
): PlannedFileOperationKind {
  return parentDirectoryOf(fromRelativePath) === parentDirectoryOf(toRelativePath)
    ? 'rename'
    : 'move'
}

/**
 * Adds a planned operation, collapsing chains: planning A->B and then B->C
 * stores a single A->C plan, and chaining back to the original path (A->A)
 * removes the plan entirely. The operation id is the original from-path, which
 * stays stable across chained edits.
 */
export function addPlannedOperation(
  operations: readonly PlannedFileOperation[],
  candidate: PlannedFileOperationCandidate,
): PlannedFileOperation[] {
  const from = normalizeRelativePath(candidate.fromRelativePath)
  const to = normalizeRelativePath(candidate.toRelativePath)
  const predecessorIndex = operations.findIndex(
    (operation) => operation.toRelativePath === from,
  )
  const originalFrom =
    predecessorIndex === -1
      ? from
      : operations[predecessorIndex].fromRelativePath
  const next = [...operations]

  if (originalFrom === to) {
    if (predecessorIndex !== -1) {
      next.splice(predecessorIndex, 1)
    }
    return next
  }

  const collapsed: PlannedFileOperation = {
    id: originalFrom,
    kind: plannedOperationKindFor(originalFrom, to),
    fromRelativePath: originalFrom,
    toRelativePath: to,
  }

  if (predecessorIndex === -1) {
    next.push(collapsed)
  } else {
    next[predecessorIndex] = collapsed
  }

  return next
}

export function removePlannedOperation(
  operations: readonly PlannedFileOperation[],
  id: string,
): PlannedFileOperation[] {
  return operations.filter((operation) => operation.id !== id)
}

// Shared preview state: the tree records plans, the compare sidebar lists
// them. The notice carries the latest rejection message for invalid targets.
export const plannedFileOperations = writable<readonly PlannedFileOperation[]>([])
export const plannedOperationNotice = writable<string | null>(null)

export function listPlannedOperations(): readonly PlannedFileOperation[] {
  return get(plannedFileOperations)
}

export function setPlannedOperationNotice(message: string | null): void {
  if (get(plannedOperationNotice) !== message) {
    plannedOperationNotice.set(message)
  }
}

/**
 * Validates and records a planned operation. On rejection the plan list stays
 * untouched and the rejection message is surfaced through the notice store.
 */
export function recordPlannedOperation(
  candidate: PlannedFileOperationCandidate,
  isOccupied: (path: string) => boolean,
): PlannedOperationValidation {
  const validation = validatePlannedOperation(candidate, isOccupied)
  if (!validation.ok) {
    setPlannedOperationNotice(describePlannedOperationRejection(validation.reason))
    return validation
  }

  commitPlannedOperation(candidate)
  return validation
}

/**
 * Records an operation that was already validated (drag & drop validates in
 * `canDrop` before the tree applies the move, so the completion callback must
 * not re-check occupancy against the post-move tree state).
 */
export function commitPlannedOperation(
  candidate: PlannedFileOperationCandidate,
): void {
  plannedFileOperations.update((operations) =>
    addPlannedOperation(operations, candidate),
  )
  setPlannedOperationNotice(null)
}

export function discardPlannedOperation(id: string): void {
  plannedFileOperations.update((operations) =>
    removePlannedOperation(operations, id),
  )
  setPlannedOperationNotice(null)
}

export function clearPlannedOperations(): void {
  if (listPlannedOperations().length > 0) {
    plannedFileOperations.set([])
  }
  setPlannedOperationNotice(null)
}
