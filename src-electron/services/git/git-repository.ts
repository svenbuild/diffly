import { isAbsolute, resolve } from 'node:path'
import type { GitRepositoryValidation } from '../../../src/lib/types'
import { readCurrentBranchFromGitDir } from './git-head'
import { createGitRunner } from './git-service'

export type { GitRepositoryValidation } from '../../../src/lib/types'

const GIT_REPOSITORY_VALIDATION_OPTIONS = {
  allowNonZeroExit: true,
  maxStdoutBytes: 64 * 1024,
  maxStderrBytes: 64 * 1024,
}

const REV_PARSE_VALIDATION_ARGS = [
  'rev-parse',
  '--is-inside-work-tree',
  '--is-bare-repository',
  '--show-toplevel',
  '--git-dir',
  '--git-common-dir',
  'HEAD',
]

const FULL_OID_PATTERN = /^[0-9a-f]{40}$/i

export async function validateGitRepository(path: string): Promise<GitRepositoryValidation> {
  const inputPath = typeof path === 'string' ? path : ''

  let result
  try {
    const runner = await createGitRunner(inputPath)
    result = await runner.run(REV_PARSE_VALIDATION_ARGS, GIT_REPOSITORY_VALIDATION_OPTIONS)
  } catch (error) {
    return invalidRepository(
      inputPath,
      error instanceof Error ? error.message : 'Git repository validation failed.',
    )
  }

  const lines = result.stdout.trimEnd().split(/\r?\n/)
  const insideWorkTree = lines[0] ?? ''
  const bareRepository = lines[1] ?? ''

  if (insideWorkTree !== 'true') {
    if (bareRepository === 'true') {
      return invalidRepository(inputPath, 'Bare Git repositories are not supported.', {
        isBare: true,
      })
    }

    return invalidRepository(inputPath, 'Path is not inside a Git repository.')
  }

  if (bareRepository === 'true') {
    return invalidRepository(inputPath, 'Bare Git repositories are not supported.', {
      isBare: true,
    })
  }

  const repositoryRoot = lines[2] ?? ''
  if (!repositoryRoot) {
    return invalidRepository(inputPath, gitErrorOutput(result) || 'Could not resolve Git repository root.')
  }

  const gitDir = lines[3] ?? ''
  if (!gitDir) {
    return invalidRepository(inputPath, gitErrorOutput(result) || 'Could not resolve Git directory.')
  }

  const gitCommonDir = lines[4] ?? ''
  const headSha = normalizeHeadSha(lines[5] ?? '')
  const resolvedGitDir = resolveGitPath(gitDir, repositoryRoot, inputPath)
  const resolvedGitCommonDir = gitCommonDir
    ? resolveGitPath(gitCommonDir, repositoryRoot, inputPath)
    : null
  const currentBranch = headSha ? await readCurrentBranchFromGitDir(resolvedGitDir) : null

  return {
    valid: true,
    inputPath,
    repositoryRoot,
    gitDir: resolvedGitDir,
    currentBranch,
    headSha,
    isBare: false,
    isWorktree: resolvedGitCommonDir !== null && resolvedGitCommonDir !== resolvedGitDir,
    error: null,
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

function normalizeHeadSha(value: string) {
  if (!FULL_OID_PATTERN.test(value)) {
    return null
  }

  return value
}

function resolveGitPath(gitPath: string, repositoryRoot: string | null, inputPath: string) {
  if (isAbsolute(gitPath)) {
    return gitPath
  }

  return resolve(repositoryRoot || resolve(inputPath), gitPath)
}

function gitErrorOutput(result: { stdout: string; stderr: string }) {
  return result.stderr.trim() || result.stdout.trim() || null
}
