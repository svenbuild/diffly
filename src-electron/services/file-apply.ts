import { randomBytes } from 'node:crypto'
import { copyFile, lstat, rename, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize, relative, sep } from 'node:path'
import type { ApplyFileChangePayload } from '../../src/lib/types'

export type { ApplyFileChangePayload } from '../../src/lib/types'

// Applies a review-mode "accept" by copying one side of a local compare over
// the other. All input arrives from the renderer over IPC and is untrusted:
// validation mirrors validateShellTargetPath in backend.ts (absolute local
// paths only, no NUL bytes, no protocol prefixes, no \\?\ / \\.\ device
// paths) and additionally requires both endpoints to live inside the compare
// roots. Only modify-modify (file over existing file) is supported; add and
// delete cases are rejected because deletion is destructive.

const isWindows = process.platform === 'win32'

// Same shape checks as validateShellTargetPath, but without the existsSync
// probe (existence is verified via lstat so symlinks are detectable).
function validateApplyPath(rawPath: unknown): string | null {
  if (typeof rawPath !== 'string') {
    return null
  }

  const trimmed = rawPath.trim()
  if (!trimmed || trimmed.includes('\u0000')) {
    return null
  }

  // Reject protocol-looking strings (file:, javascript:, …) while still
  // allowing Windows drive letters such as "C:\" or "C:/".
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^[a-z]:[\\/]/i.test(trimmed)) {
    return null
  }

  const normalized = normalize(trimmed)
  if (!isAbsolute(normalized) || /^\\\\[.?]\\/.test(normalized)) {
    return null
  }

  return normalized
}

function comparablePath(path: string) {
  return isWindows ? path.toLowerCase() : path
}

function isWithinBase(base: string, target: string): boolean {
  const rel = relative(comparablePath(base), comparablePath(target))
  if (rel === '') {
    return true
  }

  return !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel)
}

export function readApplyFileChangePayload(payload: unknown): ApplyFileChangePayload {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('Invalid apply file change payload.')
  }

  const record = payload as Record<string, unknown>
  const sourcePath = validateApplyPath(record.sourcePath)
  const targetPath = validateApplyPath(record.targetPath)
  const leftBase = validateApplyPath(record.leftBase)
  const rightBase = validateApplyPath(record.rightBase)

  if (!sourcePath || !targetPath || !leftBase || !rightBase) {
    throw new Error('Invalid file path.')
  }

  const bases = [leftBase, rightBase]
  if (
    !bases.some((base) => isWithinBase(base, sourcePath)) ||
    !bases.some((base) => isWithinBase(base, targetPath))
  ) {
    throw new Error('File is outside the compared folders.')
  }

  if (comparablePath(sourcePath) === comparablePath(targetPath)) {
    throw new Error('Source and target are the same file.')
  }

  return { sourcePath, targetPath, leftBase, rightBase }
}

export async function applyFileChange(payload: unknown): Promise<void> {
  const { sourcePath, targetPath } = readApplyFileChangePayload(payload)

  // lstat (not stat) so symlinks at either endpoint are rejected instead of
  // silently followed.
  let sourceStats
  try {
    sourceStats = await lstat(sourcePath)
  } catch {
    throw new Error('Source file no longer exists.')
  }

  if (sourceStats.isSymbolicLink() || !sourceStats.isFile()) {
    throw new Error('Only regular files can be accepted.')
  }

  let targetStats
  try {
    targetStats = await lstat(targetPath)
  } catch {
    // Missing target means add/delete semantics, which this PR rejects.
    throw new Error('Only modify-modify files can be accepted for now.')
  }

  if (targetStats.isDirectory()) {
    throw new Error('Cannot overwrite a directory.')
  }

  if (targetStats.isSymbolicLink() || !targetStats.isFile()) {
    throw new Error('Only regular files can be accepted.')
  }

  // Copy to a sibling temp file first, then rename over the target so a
  // failed copy never leaves a truncated target behind.
  const tempPath = join(
    dirname(targetPath),
    `.diffly-apply-${randomBytes(8).toString('hex')}.tmp`,
  )

  try {
    await copyFile(sourcePath, tempPath)
    await rename(tempPath, targetPath)
  } catch (error) {
    try {
      await unlink(tempPath)
    } catch {
      // Best-effort cleanup only; the original target is untouched.
    }
    const message = error instanceof Error ? error.message : 'Unknown error.'
    throw new Error(`Unable to apply file change: ${message}`)
  }
}
