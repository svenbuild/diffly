import { stat } from 'node:fs/promises'
import { join } from 'node:path'

// Mirrors the stat-concurrency cap used by the directory listing worker pool so
// badge detection scales the same way on large directories.
const GIT_DETECTION_STAT_CONCURRENCY = 64

/**
 * Returns the subset of `paths` that are Git repository roots, detected by the
 * presence of a `.git` entry (a directory for normal repos, a file for linked
 * worktrees and submodules). This is intentionally a cheap filesystem probe so
 * it can run on every directory listing without spawning a `git` process.
 * Authoritative validation still happens via `git rev-parse` when a repo is
 * actually selected, so a false positive here is caught at selection time.
 */
export async function detectGitRepositories(paths: unknown): Promise<string[]> {
  if (!Array.isArray(paths)) {
    return []
  }

  const candidates = paths.filter((value): value is string => typeof value === 'string')
  const results: boolean[] = new Array(candidates.length).fill(false)
  let nextIndex = 0

  const runWorker = async () => {
    while (true) {
      const index = nextIndex
      nextIndex += 1

      if (index >= candidates.length) {
        return
      }

      results[index] = await hasGitEntry(candidates[index])
    }
  }

  const workerCount = Math.min(GIT_DETECTION_STAT_CONCURRENCY, candidates.length)
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()))

  return candidates.filter((_, index) => results[index])
}

async function hasGitEntry(directoryPath: string): Promise<boolean> {
  try {
    await stat(join(directoryPath, '.git'))
    return true
  } catch {
    return false
  }
}
