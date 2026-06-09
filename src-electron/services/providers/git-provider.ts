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
  buildFileDiffFromGit,
  detectFileKind,
  sampleFile,
  type GitSnapshotSource,
} from '../file-diff'
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

  async openEntry(
    session: DiffSessionRecordLike,
    entryId: string,
    options: CompareOptions,
  ): Promise<FileDiffResult> {
    const entry = session.entryData.get(entryId)
    if (!entry) {
      throw new Error('Diff entry was not found.')
    }
    if (entry.kind !== 'gitWorkingTree') {
      throw new Error('Unsupported git diff entry data.')
    }
    if (entry.status === 'conflicted') {
      throw new Error('Git conflicted file details are not implemented yet.')
    }

    const [left, right] = gitWorkingTreeSnapshots(entry)
    return buildFileDiffFromGit(left, right, options)
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
    const [
      allTracked,
      staged,
      unstaged,
      untracked,
      allBinaryPaths,
      stagedBinaryPaths,
      unstagedBinaryPaths,
    ] = await Promise.all([
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
      readOptionalBinaryPaths(repositoryRoot, [
        'diff',
        'HEAD',
        '--numstat',
        '-z',
        '--find-renames',
      ]),
      readOptionalBinaryPaths(repositoryRoot, [
        'diff',
        '--cached',
        '--numstat',
        '-z',
        '--find-renames',
      ]),
      readBinaryPaths(repositoryRoot, [
        'diff',
        '--numstat',
        '-z',
        '--find-renames',
      ]),
    ])

    const entries: DiffEntry[] = []
    const entryData = new Map<string, ProviderEntryData>()
    const allTrackedPaths = new Set<string>()

    for (const item of allTracked) {
      allTrackedPaths.add(item.path)
      await addNameStatusEntry(entries, entryData, source, 'all', item, allBinaryPaths)
    }

    for (const path of untracked) {
      if (!allTrackedPaths.has(path)) {
        await addUntrackedEntry(entries, entryData, source, 'all', path)
      }
    }

    for (const item of staged) {
      await addNameStatusEntry(entries, entryData, source, 'staged', item, stagedBinaryPaths)
    }

    for (const item of unstaged) {
      await addNameStatusEntry(entries, entryData, source, 'unstaged', item, unstagedBinaryPaths)
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

function gitWorkingTreeSnapshots(
  entry: Extract<ProviderEntryData, { kind: 'gitWorkingTree' }>,
): [GitSnapshotSource, GitSnapshotSource] {
  switch (entry.scope) {
    case 'staged':
      return stagedSnapshots(entry)
    case 'unstaged':
      return unstagedSnapshots(entry)
    case 'untracked':
      return [
        emptySource(entry),
        workingTreeSource(entry),
      ]
    case 'all':
      return allSnapshots(entry)
  }
}

function stagedSnapshots(
  entry: Extract<ProviderEntryData, { kind: 'gitWorkingTree' }>,
): [GitSnapshotSource, GitSnapshotSource] {
  switch (entry.status) {
    case 'added':
    case 'untracked':
      return [
        emptySource(entry),
        indexSource(entry, entry.path),
      ]
    case 'deleted':
      return [
        headSource(entry, leftPath(entry)),
        emptySource(entry),
      ]
    case 'modified':
    case 'renamed':
    case 'copied':
    case 'typeChanged':
    case 'unsupported':
      return [
        headSource(entry, leftPath(entry)),
        indexSource(entry, entry.path),
      ]
    case 'conflicted':
      throw new Error('Git conflicted file details are not implemented yet.')
  }
}

function unstagedSnapshots(
  entry: Extract<ProviderEntryData, { kind: 'gitWorkingTree' }>,
): [GitSnapshotSource, GitSnapshotSource] {
  switch (entry.status) {
    case 'added':
    case 'untracked':
      return [
        emptySource(entry),
        workingTreeSource(entry),
      ]
    case 'deleted':
      return [
        indexSource(entry, leftPath(entry)),
        emptySource(entry),
      ]
    case 'modified':
    case 'renamed':
    case 'copied':
    case 'typeChanged':
    case 'unsupported':
      return [
        indexSource(entry, leftPath(entry)),
        workingTreeSource(entry),
      ]
    case 'conflicted':
      throw new Error('Git conflicted file details are not implemented yet.')
  }
}

function allSnapshots(
  entry: Extract<ProviderEntryData, { kind: 'gitWorkingTree' }>,
): [GitSnapshotSource, GitSnapshotSource] {
  switch (entry.status) {
    case 'added':
    case 'untracked':
      return [
        emptySource(entry),
        workingTreeSource(entry),
      ]
    case 'deleted':
      return [
        headSource(entry, leftPath(entry)),
        emptySource(entry),
      ]
    case 'modified':
    case 'renamed':
    case 'copied':
    case 'typeChanged':
    case 'unsupported':
      return [
        headSource(entry, leftPath(entry)),
        workingTreeSource(entry),
      ]
    case 'conflicted':
      throw new Error('Git conflicted file details are not implemented yet.')
  }
}

function leftPath(entry: Extract<ProviderEntryData, { kind: 'gitWorkingTree' }>) {
  return entry.oldPath ?? entry.path
}

function emptySource(
  entry: Extract<ProviderEntryData, { kind: 'gitWorkingTree' }>,
): GitSnapshotSource {
  return {
    kind: 'empty',
    label: entry.path,
    logicalPath: entry.path,
  }
}

function headSource(
  entry: Extract<ProviderEntryData, { kind: 'gitWorkingTree' }>,
  path: string,
): GitSnapshotSource {
  return {
    kind: 'head',
    repoPath: entry.repoPath,
    repositoryRoot: entry.repositoryRoot,
    path,
    label: `HEAD:${path}`,
  }
}

function indexSource(
  entry: Extract<ProviderEntryData, { kind: 'gitWorkingTree' }>,
  path: string,
): GitSnapshotSource {
  return {
    kind: 'index',
    repoPath: entry.repoPath,
    repositoryRoot: entry.repositoryRoot,
    path,
    label: `:${path}`,
  }
}

function workingTreeSource(
  entry: Extract<ProviderEntryData, { kind: 'gitWorkingTree' }>,
): GitSnapshotSource {
  return {
    kind: 'workingTree',
    repositoryRoot: entry.repositoryRoot,
    path: entry.path,
    label: entry.path,
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

async function readOptionalBinaryPaths(repoPath: string, args: string[]) {
  const result = await runGit(repoPath, args, GIT_OPTIONAL_HEAD_OPTIONS)
  if (result.exitCode !== 0) {
    return new Set<string>()
  }

  return parseBinaryPathsFromNumstatOutput(result.stdout)
}

async function readBinaryPaths(repoPath: string, args: string[]) {
  const result = await runGit(repoPath, args, GIT_ENTRY_OPTIONS)
  return parseBinaryPathsFromNumstatOutput(result.stdout)
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

function parseBinaryPathsFromNumstatOutput(output: string) {
  const paths = new Set<string>()
  for (const record of output.split('\0')) {
    const trimmed = record.trim()
    if (!trimmed) {
      continue
    }

    const parts = trimmed.split('\t')
    if (parts[0] === '-' && parts[1] === '-' && parts[2]) {
      paths.add(parts[parts.length - 1])
    }
  }
  return paths
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
  binaryPaths: Set<string>,
) {
  const entry = await mapNameStatusEntry(source.repositoryRoot, scope, item, binaryPaths)
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
  binaryPaths: Set<string>,
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
    binary: binaryPaths.has(item.path) || Boolean(item.oldPath && binaryPaths.has(item.oldPath)),
  }
}

async function mapUntrackedEntry(
  repositoryRoot: string,
  scope: GitWorkingTreeScope,
  path: string,
): Promise<DiffEntry> {
  const size = await getFileSize(repositoryRoot, path)
  return {
    id: gitEntryId(scope, path, null),
    path,
    oldPath: null,
    displayPath: path,
    status: 'untracked',
    scope,
    leftSize: null,
    rightSize: size,
    binary: await isNonTextWorkingTreeFile(repositoryRoot, path, size),
  }
}

async function isNonTextWorkingTreeFile(
  repositoryRoot: string,
  path: string,
  size: number | null,
) {
  if (size === null) {
    return false
  }

  try {
    const filePath = join(repositoryRoot, path)
    const kind = detectFileKind(filePath, size, await sampleFile(filePath))
    return kind !== 'text'
  } catch {
    return false
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
