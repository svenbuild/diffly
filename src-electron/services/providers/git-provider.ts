import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  CompareOptions,
  DiffEntry,
  DiffEntryStatus,
  DiffSource,
  FileDiffResult,
  GitWorkingTreeScope,
} from '../../../src/lib/types'
import type {
  DiffSessionProvider,
  DiffSessionRecordLike,
  ProviderEntryData,
  ProviderSessionData,
} from '../diff/provider'
import {
  parseGitNameStatusOutput,
  type GitNameStatusEntry,
} from '../git/git-parser'
import { runGit } from '../git/git-service'

const GIT_ENTRY_OPTIONS = {
  maxStdoutBytes: 1024 * 1024 * 8,
  maxStderrBytes: 1024 * 1024,
}

const GIT_OPTIONAL_HEAD_OPTIONS = {
  ...GIT_ENTRY_OPTIONS,
  allowNonZeroExit: true,
}

export class GitProvider implements DiffSessionProvider {
  create(source: DiffSource, options: CompareOptions): Promise<ProviderSessionData> {
    void options
    return this.buildGitProviderSessionData(source)
  }

  openEntry(
    session: DiffSessionRecordLike,
    entryId: string,
    options: CompareOptions,
  ): Promise<FileDiffResult> {
    void session
    void entryId
    void options
    throw new Error('Git file details are not implemented yet.')
  }

  refresh(session: DiffSessionRecordLike): Promise<ProviderSessionData> {
    return this.create(session.source, session.options)
  }

  private async buildGitProviderSessionData(source: DiffSource): Promise<ProviderSessionData> {
    if (source.kind !== 'git') {
      throw new Error('Expected a git diff source.')
    }

    switch (source.selection.kind) {
      case 'workingTree':
        return this.buildWorkingTreeSessionData(source)
      case 'refRange':
        throw new Error('Git ref range diff sessions are not implemented yet.')
      case 'commit':
        throw new Error('Git commit diff sessions are not implemented yet.')
    }
  }

  private async buildWorkingTreeSessionData(source: Extract<DiffSource, { kind: 'git' }>) {
    const repositoryRoot = source.repositoryRoot
    const [allTracked, staged, unstaged, untracked] = await Promise.all([
      readOptionalNameStatus(repositoryRoot, [
        'diff',
        'HEAD',
        '--name-status',
        '-z',
        '--find-renames',
      ]),
      readOptionalNameStatus(repositoryRoot, [
        'diff',
        '--cached',
        '--name-status',
        '-z',
        '--find-renames',
      ]),
      readNameStatus(repositoryRoot, [
        'diff',
        '--name-status',
        '-z',
        '--find-renames',
      ]),
      readUntrackedPaths(repositoryRoot),
    ])

    const entries: DiffEntry[] = []
    const entryData = new Map<string, ProviderEntryData>()
    const allTrackedPaths = new Set<string>()

    for (const item of allTracked) {
      allTrackedPaths.add(item.path)
      await addNameStatusEntry(entries, entryData, source, 'all', item)
    }

    for (const path of untracked) {
      if (!allTrackedPaths.has(path)) {
        await addUntrackedEntry(entries, entryData, source, 'all', path)
      }
    }

    for (const item of staged) {
      await addNameStatusEntry(entries, entryData, source, 'staged', item)
    }

    for (const item of unstaged) {
      await addNameStatusEntry(entries, entryData, source, 'unstaged', item)
    }

    for (const path of untracked) {
      await addUntrackedEntry(entries, entryData, source, 'untracked', path)
    }

    return {
      entries,
      entryData,
    }
  }
}

async function readOptionalNameStatus(repoPath: string, args: string[]) {
  const result = await runGit(repoPath, args, GIT_OPTIONAL_HEAD_OPTIONS)
  if (result.exitCode !== 0) {
    return []
  }

  return parseGitNameStatusOutput(result.stdout)
}

async function readNameStatus(repoPath: string, args: string[]) {
  const result = await runGit(repoPath, args, GIT_ENTRY_OPTIONS)
  return parseGitNameStatusOutput(result.stdout)
}

async function readUntrackedPaths(repoPath: string) {
  const result = await runGit(repoPath, [
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
  ], GIT_ENTRY_OPTIONS)

  return parseNulPathList(result.stdout)
}

function parseNulPathList(output: string) {
  if (output === '') {
    return []
  }

  const paths = output.split('\0')
  if (paths[paths.length - 1] === '') {
    paths.pop()
  }

  return paths.filter((path) => path !== '')
}

async function addNameStatusEntry(
  entries: DiffEntry[],
  entryData: Map<string, ProviderEntryData>,
  source: Extract<DiffSource, { kind: 'git' }>,
  scope: GitWorkingTreeScope,
  item: GitNameStatusEntry,
) {
  const entry = await mapNameStatusEntry(source.repositoryRoot, scope, item)
  entries.push(entry)
  entryData.set(entry.id, {
    kind: 'gitWorkingTree',
    repoPath: source.repoPath,
    repositoryRoot: source.repositoryRoot,
    scope,
    path: item.path,
    oldPath: item.oldPath,
    status: item.status,
  })
}

async function addUntrackedEntry(
  entries: DiffEntry[],
  entryData: Map<string, ProviderEntryData>,
  source: Extract<DiffSource, { kind: 'git' }>,
  scope: GitWorkingTreeScope,
  path: string,
) {
  const entry = await mapUntrackedEntry(source.repositoryRoot, scope, path)
  entries.push(entry)
  entryData.set(entry.id, {
    kind: 'gitWorkingTree',
    repoPath: source.repoPath,
    repositoryRoot: source.repositoryRoot,
    scope,
    path,
    oldPath: null,
    status: 'untracked',
  })
}

async function mapNameStatusEntry(
  repositoryRoot: string,
  scope: GitWorkingTreeScope,
  item: GitNameStatusEntry,
): Promise<DiffEntry> {
  return {
    id: gitEntryId(scope, item.path, item.oldPath),
    path: item.path,
    oldPath: item.oldPath,
    displayPath: displayPath(item.path, item.oldPath, item.status),
    status: item.status,
    scope,
    leftSize: null,
    rightSize: await getRightSize(repositoryRoot, item.path, item.status),
  }
}

async function mapUntrackedEntry(
  repositoryRoot: string,
  scope: GitWorkingTreeScope,
  path: string,
): Promise<DiffEntry> {
  return {
    id: gitEntryId(scope, path, null),
    path,
    oldPath: null,
    displayPath: path,
    status: 'untracked',
    scope,
    leftSize: null,
    rightSize: await getFileSize(repositoryRoot, path),
  }
}

function gitEntryId(scope: GitWorkingTreeScope, path: string, oldPath: string | null) {
  return `git:${scope}:${encodeURIComponent(oldPath ?? '')}:${encodeURIComponent(path)}`
}

function displayPath(path: string, oldPath: string | null, status: DiffEntryStatus) {
  if ((status === 'renamed' || status === 'copied') && oldPath) {
    return `${oldPath} -> ${path}`
  }

  return path
}

function getRightSize(repositoryRoot: string, path: string, status: DiffEntryStatus) {
  if (status === 'deleted') {
    return Promise.resolve(null)
  }

  return getFileSize(repositoryRoot, path)
}

async function getFileSize(repositoryRoot: string, path: string) {
  try {
    return (await stat(join(repositoryRoot, path))).size
  } catch {
    return null
  }
}
