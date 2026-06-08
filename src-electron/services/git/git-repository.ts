import { isAbsolute, resolve } from 'node:path'
import type { GitRepositoryValidation } from '../../../src/lib/types'
import { runGit } from './git-service'

export type { GitRepositoryValidation } from '../../../src/lib/types'

const GIT_REPOSITORY_VALIDATION_OPTIONS = {
  allowNonZeroExit: true,
  maxStdoutBytes: 64 * 1024,
  maxStderrBytes: 64 * 1024,
}

export async function validateGitRepository(path: string): Promise<GitRepositoryValidation> {
  const inputPath = typeof path === 'string' ? path : ''
  const insideWorkTree = await runRepositoryCommand(inputPath, '--is-inside-work-tree')

  if (!insideWorkTree.started) {
    return invalidRepository(inputPath, insideWorkTree.error)
  }

  if (insideWorkTree.value !== 'true') {
    const bareRepository = await runRepositoryCommand(inputPath, '--is-bare-repository')
    if (bareRepository.started && bareRepository.value === 'true') {
      return invalidRepository(inputPath, 'Bare Git repositories are not supported.', {
        isBare: true,
      })
    }

    return invalidRepository(inputPath, 'Path is not inside a Git repository.')
  }

  const repositoryRoot = await runRepositoryCommand(inputPath, '--show-toplevel')
  if (!repositoryRoot.ok) {
    return invalidRepository(inputPath, commandError(repositoryRoot, 'Could not resolve Git repository root.'))
  }

  const bareRepository = await runRepositoryCommand(inputPath, '--is-bare-repository')
  if (bareRepository.value === 'true') {
    return invalidRepository(inputPath, 'Bare Git repositories are not supported.', {
      isBare: true,
    })
  }

  const gitDir = await runRepositoryCommand(inputPath, '--git-dir')
  if (!gitDir.ok) {
    return invalidRepository(inputPath, commandError(gitDir, 'Could not resolve Git directory.'))
  }

  const currentBranch = await runRepositoryCommand(inputPath, '--abbrev-ref', 'HEAD')
  const headSha = await runRepositoryCommand(inputPath, 'HEAD')
  const gitCommonDir = await runRepositoryCommand(inputPath, '--git-common-dir')
  const resolvedGitDir = resolveGitPath(gitDir.value, repositoryRoot.value, inputPath)
  const resolvedGitCommonDir = gitCommonDir.ok
    ? resolveGitPath(gitCommonDir.value, repositoryRoot.value, inputPath)
    : null

  return {
    valid: true,
    inputPath,
    repositoryRoot: repositoryRoot.value,
    gitDir: resolvedGitDir,
    currentBranch: normalizeBranch(currentBranch),
    headSha: headSha.ok ? headSha.value : null,
    isBare: false,
    isWorktree: resolvedGitCommonDir !== null && resolvedGitCommonDir !== resolvedGitDir,
    error: null,
  }
}

async function runRepositoryCommand(inputPath: string, ...args: string[]) {
  try {
    const result = await runGit(
      inputPath,
      ['rev-parse', ...args],
      GIT_REPOSITORY_VALIDATION_OPTIONS,
    )
    const value = result.stdout.trim()

    return {
      started: true,
      ok: result.exitCode === 0,
      value,
      error: result.stderr.trim() || result.stdout.trim() || null,
    }
  } catch (error) {
    return {
      started: false,
      ok: false,
      value: '',
      error: error instanceof Error ? error.message : 'Git repository validation failed.',
    }
  }
}

function invalidRepository(
  inputPath: string,
  error: string | null,
  overrides?: Partial<GitRepositoryValidation>,
): GitRepositoryValidation {
  return {
    valid: false,
    inputPath,
    repositoryRoot: null,
    gitDir: null,
    currentBranch: null,
    headSha: null,
    isBare: false,
    isWorktree: false,
    error: error || 'Git repository validation failed.',
    ...overrides,
  }
}

function commandError(
  result: Awaited<ReturnType<typeof runRepositoryCommand>>,
  fallback: string,
) {
  return result.error || fallback
}

function normalizeBranch(result: Awaited<ReturnType<typeof runRepositoryCommand>>) {
  if (!result.ok || result.value === 'HEAD') {
    return null
  }

  return result.value || null
}

function resolveGitPath(gitPath: string, repositoryRoot: string | null, inputPath: string) {
  if (isAbsolute(gitPath)) {
    return gitPath
  }

  return resolve(repositoryRoot || resolve(inputPath), gitPath)
}
