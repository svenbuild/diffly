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
  parseGitRawNumstatOutput,
  type GitNameStatusEntry,
  type GitRawNumstatResult,
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

const GIT_DIFF_ENTRY_ARGS = [
  '--raw',
  '--numstat',
  '-z',
  '--find-renames',
  '--no-ext-diff',
  '--no-textconv',
]

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
    if (entry.kind !== 'gitWorkingTree' && entry.kind !== 'gitRef') {
      throw new Error('Unsupported git diff entry data.')
    }
    if (entry.status === 'conflicted') {
      throw new Error('Git conflicted file details are not implemented yet.')
    }

    const [left, right] = entry.kind === 'gitWorkingTree'
      ? gitWorkingTreeSnapshots(entry)
      : gitRefSnapshots(entry)
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
        return this.buildRefRangeSessionData(source)
      case 'commit':
        return this.buildCommitSessionData(source)
    }
  }

  // Compares baseRef and headRef. Two-dot diffs base directly against head;
  // three-dot diffs the merge base of both refs against head (PR-style view).
  private async buildRefRangeSessionData(source: Extract<DiffSource, { kind: 'git' }>) {
    if (source.selection.kind !== 'refRange') {
      throw new Error('Expected a git ref range selection.')
    }

    const repositoryRoot = source.repositoryRoot
    const { baseRef, headRef, notation } = source.selection
    const baseSha = await resolveCommitSha(
      repositoryRoot,
      baseRef,
      `Base ref '${baseRef}' could not be resolved.`,
    )
    const headSha = await resolveCommitSha(
      repositoryRoot,
      headRef,
      `Head ref '${headRef}' could not be resolved.`,
    )

    let leftSha = baseSha
    let leftLabelRef = baseRef
    if (notation === 'threeDot') {
      leftSha = await resolveMergeBase(repositoryRoot, baseSha, headSha)
      // The merge base usually differs from the base ref tip, so the label
      // shows the resolved sha instead of pretending to be the base ref.
      leftLabelRef = leftSha === baseSha ? baseRef : shortSha(leftSha)
    }

    const diff = await readRawNumstat(repositoryRoot, [
      'diff',
      ...GIT_DIFF_ENTRY_ARGS,
      leftSha,
      headSha,
    ])

    return buildGitRefSessionData(source, {
      idPrefix: 'range',
      leftRef: leftSha,
      rightRef: headSha,
      leftLabelRef,
      rightLabelRef: headRef,
      diff,
    })
  }

  // Shows a single commit as `commit^1` against `commit`. Merge commits diff
  // against their first parent; root commits diff against an empty left side.
  private async buildCommitSessionData(source: Extract<DiffSource, { kind: 'git' }>) {
    if (source.selection.kind !== 'commit') {
      throw new Error('Expected a git commit selection.')
    }

    const repositoryRoot = source.repositoryRoot
    const commitRef = source.selection.commitRef
    const commitSha = await resolveCommitSha(
      repositoryRoot,
      commitRef,
      `Commit '${commitRef}' could not be resolved.`,
    )
    const parentSha = await tryResolveCommitSha(repositoryRoot, `${commitSha}^1`)

    const diff = parentSha
      ? await readRawNumstat(repositoryRoot, [
          'diff',
          ...GIT_DIFF_ENTRY_ARGS,
          parentSha,
          commitSha,
        ])
      : await readRawNumstat(repositoryRoot, [
          'diff-tree',
          '--no-commit-id',
          '--root',
          '-r',
          ...GIT_DIFF_ENTRY_ARGS,
          commitSha,
        ])

    return buildGitRefSessionData(source, {
      idPrefix: 'commit',
      leftRef: parentSha,
      rightRef: commitSha,
      leftLabelRef: parentSha ? shortSha(parentSha) : 'empty',
      rightLabelRef: shortSha(commitSha),
      diff,
    })
  }

  private async buildWorkingTreeSessionData(source: Extract<DiffSource, { kind: 'git' }>) {
    const repositoryRoot = source.repositoryRoot
    const [
      allTracked,
      staged,
      unstaged,
      untracked,
    ] = await Promise.all([
      readOptionalRawNumstat(repositoryRoot, [
        'diff',
        'HEAD',
        ...GIT_DIFF_ENTRY_ARGS,
      ]),
      readOptionalRawNumstat(repositoryRoot, [
        'diff',
        '--cached',
        ...GIT_DIFF_ENTRY_ARGS,
      ]),
      readRawNumstat(repositoryRoot, [
        'diff',
        ...GIT_DIFF_ENTRY_ARGS,
      ]),
      readUntrackedPaths(repositoryRoot),
    ])

    const entries: DiffEntry[] = []
    const entryData = new Map<string, ProviderEntryData>()
    const allTrackedPaths = new Set<string>()

    for (const item of allTracked.entries) {
      allTrackedPaths.add(item.path)
      await addNameStatusEntry(entries, entryData, source, 'all', item, allTracked.binaryPaths)
    }

    for (const path of untracked) {
      if (!allTrackedPaths.has(path)) {
        await addUntrackedEntry(entries, entryData, source, 'all', path)
      }
    }

    for (const item of staged.entries) {
      await addNameStatusEntry(entries, entryData, source, 'staged', item, staged.binaryPaths)
    }

    for (const item of unstaged.entries) {
      await addNameStatusEntry(entries, entryData, source, 'unstaged', item, unstaged.binaryPaths)
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

function gitRefSnapshots(
  entry: Extract<ProviderEntryData, { kind: 'gitRef' }>,
): [GitSnapshotSource, GitSnapshotSource] {
  const rightSource = refSource(entry, entry.rightRef, entry.rightLabelRef, entry.path)

  switch (entry.status) {
    case 'added':
    case 'untracked':
      return [
        emptyRefSource(entry),
        rightSource,
      ]
    case 'deleted':
      return [
        leftRefSource(entry),
        emptyRefSource(entry),
      ]
    case 'modified':
    case 'renamed':
    case 'copied':
    case 'typeChanged':
    case 'unsupported':
      return [
        leftRefSource(entry),
        rightSource,
      ]
    case 'conflicted':
      throw new Error('Git conflicted file details are not implemented yet.')
  }
}

function leftRefSource(
  entry: Extract<ProviderEntryData, { kind: 'gitRef' }>,
): GitSnapshotSource {
  if (entry.leftRef === null) {
    return emptyRefSource(entry)
  }

  return refSource(entry, entry.leftRef, entry.leftLabelRef, entry.oldPath ?? entry.path)
}

function emptyRefSource(
  entry: Extract<ProviderEntryData, { kind: 'gitRef' }>,
): GitSnapshotSource {
  return {
    kind: 'empty',
    label: entry.path,
    logicalPath: entry.path,
  }
}

function refSource(
  entry: Extract<ProviderEntryData, { kind: 'gitRef' }>,
  ref: string,
  labelRef: string,
  path: string,
): GitSnapshotSource {
  return {
    kind: 'ref',
    repoPath: entry.repoPath,
    repositoryRoot: entry.repositoryRoot,
    ref,
    path,
    label: `${labelRef}:${path}`,
  }
}

interface GitRefSessionInput {
  idPrefix: string
  leftRef: string | null
  rightRef: string
  leftLabelRef: string
  rightLabelRef: string
  diff: GitRawNumstatResult
}

function buildGitRefSessionData(
  source: Extract<DiffSource, { kind: 'git' }>,
  input: GitRefSessionInput,
): ProviderSessionData {
  const entries: DiffEntry[] = []
  const entryData = new Map<string, ProviderEntryData>()

  for (const item of input.diff.entries) {
    const entry: DiffEntry = {
      id: gitRefEntryId(input.idPrefix, item.path, item.oldPath),
      path: item.path,
      oldPath: item.oldPath,
      displayPath: displayPath(item.path, item.oldPath, item.status),
      status: item.status,
      leftSize: null,
      rightSize: null,
      binary: input.diff.binaryPaths.has(item.path) ||
        Boolean(item.oldPath && input.diff.binaryPaths.has(item.oldPath)),
    }
    entries.push(entry)
    entryData.set(entry.id, {
      kind: 'gitRef',
      repoPath: source.repoPath,
      repositoryRoot: source.repositoryRoot,
      leftRef: input.leftRef,
      rightRef: input.rightRef,
      leftLabelRef: input.leftLabelRef,
      rightLabelRef: input.rightLabelRef,
      path: item.path,
      oldPath: item.oldPath,
      status: item.status,
    })
  }

  return {
    entries,
    entryData,
  }
}

function gitRefEntryId(prefix: string, path: string, oldPath: string | null) {
  return `git:${prefix}:${encodeURIComponent(oldPath ?? '')}:${encodeURIComponent(path)}`
}

const SHORT_SHA_LENGTH = 7
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i

function shortSha(ref: string) {
  return FULL_SHA_PATTERN.test(ref) ? ref.slice(0, SHORT_SHA_LENGTH) : ref
}

async function resolveCommitSha(repoPath: string, ref: string, errorMessage: string) {
  const sha = await tryResolveCommitSha(repoPath, ref)
  if (!sha) {
    throw new Error(errorMessage)
  }

  return sha
}

async function tryResolveCommitSha(repoPath: string, ref: string) {
  const trimmed = ref.trim()
  // Refs are passed as positional git args; a leading '-' could otherwise be
  // parsed as an option.
  if (!trimmed || trimmed.startsWith('-')) {
    return null
  }

  const result = await runGit(repoPath, [
    'rev-parse',
    '--verify',
    '--quiet',
    `${trimmed}^{commit}`,
  ], GIT_OPTIONAL_HEAD_OPTIONS)

  if (result.exitCode !== 0) {
    return null
  }

  return result.stdout.trim() || null
}

async function resolveMergeBase(repoPath: string, baseSha: string, headSha: string) {
  const result = await runGit(repoPath, [
    'merge-base',
    baseSha,
    headSha,
  ], GIT_OPTIONAL_HEAD_OPTIONS)

  const mergeBase = result.stdout.trim()
  if (result.exitCode !== 0 || !mergeBase) {
    throw new Error('The selected refs do not share a merge base.')
  }

  return mergeBase
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

function emptyRawNumstatResult(): GitRawNumstatResult {
  return {
    entries: [],
    binaryPaths: new Set(),
  }
}

async function readOptionalRawNumstat(repoPath: string, args: string[]) {
  const result = await runGit(repoPath, args, GIT_OPTIONAL_HEAD_OPTIONS)
  if (result.exitCode !== 0) {
    return emptyRawNumstatResult()
  }

  return parseGitRawNumstatOutput(result.stdout)
}

async function readRawNumstat(repoPath: string, args: string[]) {
  const result = await runGit(repoPath, args, GIT_ENTRY_OPTIONS)
  return parseGitRawNumstatOutput(result.stdout)
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
