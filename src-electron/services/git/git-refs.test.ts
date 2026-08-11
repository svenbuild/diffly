import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { listGitRefs, validateGitRef } from './git-refs'

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

  it('validates branch, tag, and SHA commit references without walking history', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'tracked.txt', 'base\n')
    const headSha = await gitStdout(repoPath, ['rev-parse', 'HEAD'])
    await git(repoPath, ['tag', 'v1'])
    await git(repoPath, ['checkout', '-b', 'feature/setup'])
    await commitFile(repoPath, 'feature.txt', 'feature\n')
    const featureSha = await gitStdout(repoPath, ['rev-parse', 'HEAD'])
    await git(repoPath, ['checkout', 'main'])

    await expect(validateGitRef(repoPath, 'main')).resolves.toEqual({
      valid: true,
      resolvedSha: headSha,
    })
    await expect(validateGitRef(repoPath, 'v1')).resolves.toEqual({
      valid: true,
      resolvedSha: headSha,
    })
    await expect(validateGitRef(repoPath, headSha.slice(0, 12))).resolves.toEqual({
      valid: true,
      resolvedSha: headSha,
    })
    await expect(validateGitRef(repoPath, 'feature/setup')).resolves.toEqual({
      valid: true,
      resolvedSha: featureSha,
    })
    await expect(validateGitRef(repoPath, featureSha)).resolves.toEqual({
      valid: true,
      resolvedSha: featureSha,
    })
    await expect(validateGitRef(repoPath, 'missing-ref')).resolves.toEqual({
      valid: false,
      resolvedSha: null,
    })
    await expect(validateGitRef(repoPath, '--help')).resolves.toEqual({
      valid: false,
      resolvedSha: null,
    })
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
