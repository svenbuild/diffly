import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { listGitRefs } from './git-refs'

const execFileAsync = promisify(execFile)
const tempPaths: string[] = []

afterEach(async () => {
  for (const path of tempPaths.splice(0)) {
    await removeTempPath(path)
  }
}, 30000)

describe('listGitRefs', () => {
  it('loads current branch and HEAD from the combined rev-parse call', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'tracked.txt', 'base\n')
    const headSha = await gitStdout(repoPath, ['rev-parse', 'HEAD'])

    const refs = await listGitRefs(repoPath)

    expect(refs.currentBranch).toBe('main')
    expect(refs.headSha).toBe(headSha)
    expect(refs.localBranches.find((ref) => ref.name === 'main')?.sha).toBe(headSha)
    expect(refs.recentCommits[0]?.sha).toBe(headSha)
  })
})

async function createRepo() {
  const repoPath = await makeTempDir('diffly-git-refs-')
  await git(repoPath, ['init'])
  await git(repoPath, ['checkout', '-b', 'main'])
  await git(repoPath, ['config', 'user.email', 'test@example.com'])
  await git(repoPath, ['config', 'user.name', 'Test User'])
  return repoPath
}

async function commitFile(repoPath: string, relativePath: string, content: string) {
  await writeFile(join(repoPath, relativePath), content)
  await git(repoPath, ['add', relativePath])
  await git(repoPath, ['commit', '-m', `Commit ${relativePath}`])
}

async function makeTempDir(prefix: string) {
  const path = await mkdtemp(join(tmpdir(), prefix))
  tempPaths.push(path)
  return path
}

async function git(repoPath: string, args: string[]) {
  await execFileAsync('git', args, {
    cwd: repoPath,
    windowsHide: true,
  })
}

async function gitStdout(repoPath: string, args: string[]) {
  const result = await execFileAsync('git', args, {
    cwd: repoPath,
    windowsHide: true,
  })
  return result.stdout.trim()
}

async function removeTempPath(path: string) {
  await rm(path, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  })
}
