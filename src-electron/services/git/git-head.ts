import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export async function readCurrentBranchFromGitDir(gitDir: string) {
  try {
    const head = await readFile(resolve(gitDir, 'HEAD'), 'utf8')
    const prefix = 'ref: refs/heads/'
    const value = head.trim()
    return value.startsWith(prefix) ? value.slice(prefix.length) || null : null
  } catch {
    return null
  }
}
