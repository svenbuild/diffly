import type {
  GitCommitSummary,
  GitRef,
  GitRefKind,
  GitRefsResponse,
} from '../../../src/lib/types'
import { runGit } from './git-service'

const HEAD_OPTIONS = {
  allowNonZeroExit: true,
  maxStdoutBytes: 64 * 1024,
  maxStderrBytes: 64 * 1024,
}

const REF_OPTIONS = {
  maxStdoutBytes: 1024 * 1024 * 4,
  maxStderrBytes: 64 * 1024,
}

const COMMIT_OPTIONS = {
  allowNonZeroExit: true,
  maxStdoutBytes: 1024 * 1024,
  maxStderrBytes: 64 * 1024,
}

export async function listGitRefs(repoPath: string): Promise<GitRefsResponse> {
  const [currentBranch, headSha, refs, recentCommits] = await Promise.all([
    readCurrentBranch(repoPath),
    readHeadSha(repoPath),
    readRefs(repoPath),
    readRecentCommits(repoPath),
  ])

  return {
    currentBranch,
    headSha,
    ...refs,
    recentCommits,
  }
}

async function readCurrentBranch(repoPath: string) {
  const result = await runGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD'], HEAD_OPTIONS)
  const value = result.stdout.trim()

  if (result.exitCode !== 0 || value === 'HEAD') {
    return null
  }

  return value || null
}

async function readHeadSha(repoPath: string) {
  const result = await runGit(repoPath, ['rev-parse', 'HEAD'], HEAD_OPTIONS)
  const value = result.stdout.trim()

  if (result.exitCode !== 0) {
    return null
  }

  return value || null
}

async function readRefs(repoPath: string): Promise<Pick<
  GitRefsResponse,
  'localBranches' | 'remoteBranches' | 'tags'
>> {
  const result = await runGit(
    repoPath,
    [
      'for-each-ref',
      'refs/heads',
      'refs/remotes',
      'refs/tags',
      '--format=%(refname)%00%(refname:short)%00%(objectname)%00%(objecttype)',
    ],
    REF_OPTIONS,
  )

  const localBranches: GitRef[] = []
  const remoteBranches: GitRef[] = []
  const tags: GitRef[] = []

  for (const line of result.stdout.split(/\r?\n/)) {
    const ref = parseRefLine(line)
    if (!ref) {
      continue
    }

    switch (ref.kind) {
      case 'localBranch':
        localBranches.push(ref)
        break
      case 'remoteBranch':
        remoteBranches.push(ref)
        break
      case 'tag':
        tags.push(ref)
        break
    }
  }

  localBranches.sort(compareRefs)
  remoteBranches.sort(compareRefs)
  tags.sort(compareRefs)

  return {
    localBranches,
    remoteBranches,
    tags,
  }
}

function parseRefLine(line: string): GitRef | null {
  if (!line) {
    return null
  }

  const [fullName, name, sha] = line.split('\0')
  if (!fullName || !name || !sha) {
    return null
  }

  const kind = refKind(fullName)
  if (!kind) {
    return null
  }

  if (kind === 'remoteBranch' && /^refs\/remotes\/[^/]+\/HEAD$/.test(fullName)) {
    return null
  }

  return {
    name,
    fullName,
    sha,
    kind,
  }
}

function refKind(fullName: string): GitRefKind | null {
  if (fullName.startsWith('refs/heads/')) {
    return 'localBranch'
  }

  if (fullName.startsWith('refs/remotes/')) {
    return 'remoteBranch'
  }

  if (fullName.startsWith('refs/tags/')) {
    return 'tag'
  }

  return null
}

async function readRecentCommits(repoPath: string): Promise<GitCommitSummary[]> {
  const result = await runGit(
    repoPath,
    ['log', '-n', '100', '--decorate=short', '--format=%H%x00%h%x00%d%x00%s'],
    COMMIT_OPTIONS,
  )

  if (result.exitCode !== 0) {
    return []
  }

  return result.stdout
    .split(/\r?\n/)
    .map(parseCommitLine)
    .filter((commit): commit is GitCommitSummary => commit !== null)
}

function parseCommitLine(line: string): GitCommitSummary | null {
  if (!line) {
    return null
  }

  const [sha, shortSha, decorationText, subject] = line.split('\0')
  if (!sha || !shortSha || subject === undefined) {
    return null
  }

  return {
    sha,
    shortSha,
    subject,
    decorations: parseDecorations(decorationText || ''),
  }
}

function parseDecorations(value: string) {
  const trimmed = value.trim()
  const inner = trimmed.startsWith('(') && trimmed.endsWith(')')
    ? trimmed.slice(1, -1)
    : trimmed

  return inner
    .split(',')
    .map((decoration) => decoration.trim())
    .map((decoration) => decoration.startsWith('HEAD -> ')
      ? decoration.slice('HEAD -> '.length)
      : decoration)
    .map((decoration) => decoration.startsWith('tag: ')
      ? decoration.slice('tag: '.length)
      : decoration)
    .filter(Boolean)
}

function compareRefs(a: GitRef, b: GitRef) {
  return a.name.localeCompare(b.name)
}
