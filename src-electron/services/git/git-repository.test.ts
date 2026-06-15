import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { validateGitRepository } from './git-repository'

const execFileAsync = promisify(execFile)
const tempPaths: string[] = []

afterEach(async () => {
  for (const path of tempPaths.splice(0)) {
    await removeTempPath(path)
  }
}, 30000)

describe('validateGitRepository', () => {
  it('validates a normal repository', async () => {
    const repoPath = await createRepo()
    await commitFile(repoPath, 'tracked.txt', 'base\n')

    const result = await validateGitRepository(repoPath)

    expect(result.valid).toBe(true)
    expect(resolve(result.repositoryRoot!)).toBe(resolve(repoPath))
    expect(result.currentBranch).toBe('main')
    expect(result.headSha).toMatch(/^[0-9a-f]{40}$/)
    expect(result.isBare).toBe(false)
  })

  it('validates an initial repository without HEAD', async () => {
    const repoPath = await createRepo()

    const result = await validateGitRepository(repoPath)

    expect(result.valid).toBe(true)
    expect(resolve(result.repositoryRoot!)).toBe(resolve(repoPath))
    expect(result.currentBranch).toBeNull()
    expect(result.headSha).toBeNull()
    expect(result.isBare).toBe(false)
  })

  it('rejects bare repositories', async () => {
    const repoPath = await makeTempDir('diffly-git-repository-bare-')
    await git(process.cwd(), ['init', '--bare', repoPath])

    const result = await validateGitRepository(repoPath)

    expect(result.valid).toBe(false)
    expect(result.isBare).toBe(true)
    expect(result.error).toBe('Bare Git repositories are not supported.')
  })
})

async function createRepo() {
  const repoPath = await makeTempDir('diffly-git-repository-')
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

async function removeTempPath(path: string) {
  await rm(path, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  })
}
