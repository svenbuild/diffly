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
  type GitSnapshotSource,
} from '../file-diff'
import {
  parseGitRawNumstatOutput,
  type GitRawNumstatResult,
} from '../git/git-parser'
import {
  mapGitStatusCode,
  parseGitStatusPorcelainV2Output,
  type GitStatusEntry,
  type GitStatusSnapshot,
} from '../git/git-status'
import { disposeGitObjectStore } from '../git/git-object-store'
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
  // Full blob oids in the raw headers enable content lookups through the
  // persistent cat-file --batch process instead of per-file git show spawns.
  '--full-index',
  '-z',
  '--find-renames',
  '--no-ext-diff',
  '--no-textconv',
]

const GIT_DIFF_PATCH_ARGS = [
  '--no-ext-diff',
  '--no-textconv',
  '--full-index',
  '--find-renames',
]

const GIT_SCOPE_PATCH_OPTIONS = {
  ...GIT_ENTRY_OPTIONS,
  allowNonZeroExit: true,
  maxStdoutBytes: 1024 * 1024 * 64,
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
    if (entry.kind !== 'gitWorkingTree' && entry.kind !== 'gitRef') {
      throw new Error('Unsupported git diff entry data.')
    }
    if (entry.status === 'conflicted') {
      throw new Error('Git conflicted file details are not implemented yet.')
    }

    const [left, right] = entry.kind === 'gitWorkingTree'
      ? gitWorkingTreeSnapshots(entry)
      : gitRefSnapshots(entry)
    const result = await buildFileDiffFromGit(left, right, options)
    return attachGitPatch(result, entry)
  }

  refresh(session: DiffSessionRecordLike): Promise<ProviderSessionData> {
    return this.create(session.source, session.options)
  }

  dispose(session: DiffSessionRecordLike): void {
    if (session.source.kind === 'git') {
      // Kills the repository's cat-file --batch process. Other sessions on
      // the same repository lazily respawn it on their next request.
      disposeGitObjectStore(session.source.repositoryRoot)
    }
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
    const snapshot = await readStatusSnapshot(source.repositoryRoot)
    const sessionData = buildWorkingTreeSessionDataFromStatus(source, snapshot)
    return await attachWorkingTreePatches(source.repositoryRoot, sessionData, snapshot)
  }
}

function buildWorkingTreeSessionDataFromStatus(
  source: Extract<DiffSource, { kind: 'git' }>,
  snapshot: GitStatusSnapshot,
): ProviderSessionData {
  const entries: DiffEntry[] = []
  const entryData = new Map<string, ProviderEntryData>()

  for (const item of snapshot.entries) {
    addStatusEntries(entries, entryData, source, item)
  }

  return {
    entries,
    entryData,
  }
}

async function attachWorkingTreePatches(
  repositoryRoot: string,
  sessionData: ProviderSessionData,
  snapshot: GitStatusSnapshot,
) {
  const patchesByScope = await readWorkingTreePatchMaps(repositoryRoot, snapshot)

  for (const entry of sessionData.entries) {
    if (
      !entry.scope ||
      entry.binary ||
      entry.status === 'untracked' ||
      entry.status === 'conflicted' ||
      entry.status === 'unsupported'
    ) {
      continue
    }

    const scopePatches = patchesByScope.get(entry.scope)
    if (!scopePatches) {
      continue
    }

    const patch =
      scopePatches.get(patchEntryKey(entry.path, entry.oldPath ?? null)) ??
      scopePatches.get(patchEntryKey(entry.path, null))
    if (!patch) {
      continue
    }
    if (isBinaryGitPatch(patch)) {
      entry.binary = true
      continue
    }

    entry.diffPatchText = patch
    entry.diffPatchCacheKey = [
      'git-working-tree-patch',
      entry.scope,
      entry.path,
      entry.oldPath ?? '',
      patch.length,
    ].join('\u0000')
  }

  return sessionData
}

async function readWorkingTreePatchMaps(repositoryRoot: string, snapshot: GitStatusSnapshot) {
  const scopes: GitWorkingTreeScope[] = ['all', 'staged', 'unstaged']
  const patchMaps = await Promise.all(
    scopes.map(async (scope) => [
      scope,
      await readWorkingTreePatchMap(repositoryRoot, scope, snapshot),
    ] as const),
  )

  return new Map<GitWorkingTreeScope, Map<string, string>>(patchMaps)
}

async function readWorkingTreePatchMap(
  repositoryRoot: string,
  scope: GitWorkingTreeScope,
  snapshot: GitStatusSnapshot,
) {
  const args = workingTreePatchArgs(scope, snapshot)
  if (!args) {
    return new Map<string, string>()
  }

  const result = await runGit(repositoryRoot, args, GIT_SCOPE_PATCH_OPTIONS)
  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return new Map<string, string>()
  }

  return splitGitPatchByEntry(result.stdout)
}

function workingTreePatchArgs(scope: GitWorkingTreeScope, snapshot: GitStatusSnapshot) {
  switch (scope) {
    case 'all':
      return snapshot.branch.headSha
        ? ['diff', ...GIT_DIFF_PATCH_ARGS, 'HEAD']
        : ['diff', ...GIT_DIFF_PATCH_ARGS, '--cached']
    case 'staged':
      return ['diff', ...GIT_DIFF_PATCH_ARGS, '--cached']
    case 'unstaged':
      return ['diff', ...GIT_DIFF_PATCH_ARGS]
    case 'untracked':
      return null
  }
}

function splitGitPatchByEntry(output: string) {
  const patches = new Map<string, string>()
  const parts = splitAtGitDiffFile(output)

  for (const patch of parts) {
    const paths = parseGitPatchPaths(patch)
    if (!paths) {
      continue
    }

    patches.set(patchEntryKey(paths.path, paths.oldPath), patch)
  }

  return patches
}

function splitAtGitDiffFile(output: string) {
  if (!output.trim()) {
    return []
  }

  const parts: string[] = []
  const marker = '\ndiff --git '
  let start = output.startsWith('diff --git ') ? 0 : output.indexOf(marker)
  if (start < 0) {
    return []
  }
  if (output[start] === '\n') {
    start += 1
  }

  while (start < output.length) {
    const next = output.indexOf(marker, start + 1)
    if (next < 0) {
      parts.push(output.slice(start))
      break
    }

    parts.push(output.slice(start, next))
    start = next + 1
  }

  return parts
}

function parseGitPatchPaths(patch: string) {
  const lines = patch.split(/\r?\n/)
  const firstLinePaths = parseDiffGitLine(lines[0] ?? '')
  if (!firstLinePaths) {
    return null
  }

  let oldPath = firstLinePaths.oldPath
  let path = firstLinePaths.path

  for (const line of lines) {
    if (line.startsWith('rename from ')) {
      oldPath = line.slice('rename from '.length)
    } else if (line.startsWith('rename to ')) {
      path = line.slice('rename to '.length)
    } else if (line.startsWith('--- ')) {
      const parsed = parsePatchHeaderPath(line.slice(4), 'a/')
      if (parsed) {
        oldPath = parsed
      }
    } else if (line.startsWith('+++ ')) {
      const parsed = parsePatchHeaderPath(line.slice(4), 'b/')
      if (parsed) {
        path = parsed
      }
    }
  }

  return {
    path,
    oldPath: oldPath === path ? null : oldPath,
  }
}

function parseDiffGitLine(line: string) {
  const prefix = 'diff --git '
  if (!line.startsWith(prefix)) {
    return null
  }

  const value = line.slice(prefix.length)
  if (!value.startsWith('a/')) {
    return null
  }

  const separator = value.indexOf(' b/')
  if (separator < 0) {
    return null
  }

  return {
    oldPath: value.slice(2, separator),
    path: value.slice(separator + 3),
  }
}

function parsePatchHeaderPath(value: string, prefix: 'a/' | 'b/') {
  const path = value.split('\t', 1)[0]
  if (path === '/dev/null' || !path.startsWith(prefix)) {
    return null
  }

  return path.slice(prefix.length)
}

function patchEntryKey(path: string, oldPath: string | null) {
  return `${path}\u0000${oldPath ?? ''}`
}

function isBinaryGitPatch(patch: string) {
  return patch.includes('\nGIT binary patch\n') ||
    /^\s*Binary files .* differ\s*$/m.test(patch)
}

function addStatusEntries(
  entries: DiffEntry[],
  entryData: Map<string, ProviderEntryData>,
  source: Extract<DiffSource, { kind: 'git' }>,
  item: GitStatusEntry,
) {
  if (item.kind === 'untracked') {
    addStatusEntry(entries, entryData, source, {
      scope: 'all',
      path: item.path,
      oldPath: null,
      status: 'untracked',
      srcOid: null,
      dstOid: null,
    })
    addStatusEntry(entries, entryData, source, {
      scope: 'untracked',
      path: item.path,
      oldPath: null,
      status: 'untracked',
      srcOid: null,
      dstOid: null,
    })
    return
  }

  if (item.kind === 'conflicted') {
    addStatusEntry(entries, entryData, source, {
      scope: 'all',
      path: item.path,
      oldPath: null,
      status: 'conflicted',
      srcOid: null,
      dstOid: null,
    })
    return
  }

  const stagedStatus = statusFromStatusChar(item.xy[0])
  const unstagedStatus = statusFromStatusChar(item.xy[1])
  const allStatus = statusForAll(item)

  if (allStatus) {
    addStatusEntry(entries, entryData, source, {
      scope: 'all',
      path: item.path,
      oldPath: oldPathForStatus(item, allStatus),
      status: allStatus,
      srcOid: item.headOid,
      dstOid: null,
    })
  }

  if (stagedStatus) {
    addStatusEntry(entries, entryData, source, {
      scope: 'staged',
      path: item.path,
      oldPath: oldPathForStatus(item, stagedStatus),
      status: stagedStatus,
      srcOid: item.headOid,
      dstOid: item.indexOid,
    })
  }

  if (unstagedStatus) {
    addStatusEntry(entries, entryData, source, {
      scope: 'unstaged',
      path: item.path,
      oldPath: oldPathForStatus(item, unstagedStatus),
      status: unstagedStatus,
      srcOid: item.indexOid,
      dstOid: null,
    })
  }
}

interface StatusEntryInput {
  scope: GitWorkingTreeScope
  path: string
  oldPath: string | null
  status: DiffEntryStatus
  srcOid: string | null
  dstOid: string | null
}

function addStatusEntry(
  entries: DiffEntry[],
  entryData: Map<string, ProviderEntryData>,
  source: Extract<DiffSource, { kind: 'git' }>,
  input: StatusEntryInput,
) {
  const entry: DiffEntry = {
    id: gitEntryId(input.scope, input.path, input.oldPath),
    path: input.path,
    oldPath: input.oldPath,
    displayPath: displayPath(input.path, input.oldPath, input.status),
    status: input.status,
    scope: input.scope,
    leftSize: null,
    rightSize: null,
  }

  entries.push(entry)
  entryData.set(entry.id, {
    kind: 'gitWorkingTree',
    repoPath: source.repoPath,
    repositoryRoot: source.repositoryRoot,
    scope: input.scope,
    path: input.path,
    oldPath: input.oldPath,
    status: input.status,
    srcOid: input.srcOid,
    dstOid: input.dstOid,
  })
}

function statusFromStatusChar(code: string) {
  if (code === '.' || code === ' ') {
    return null
  }

  return mapGitStatusCode(code)
}

function statusForAll(item: Extract<GitStatusEntry, { kind: 'changed' }>) {
  const staged = statusFromStatusChar(item.xy[0])
  const unstaged = statusFromStatusChar(item.xy[1])

  if (item.xy[0] === 'A') {
    return staged
  }
  if (item.xy[0] === 'D') {
    return staged
  }
  if (item.xy[0] === 'R' || item.xy[0] === 'C') {
    return staged
  }
  if (item.xy[1] === 'D') {
    return unstaged
  }
  if (item.xy[1] === 'A') {
    return unstaged
  }
  if (item.xy[1] === 'R' || item.xy[1] === 'C') {
    return unstaged
  }

  return staged ?? unstaged
}

function oldPathForStatus(
  item: Extract<GitStatusEntry, { kind: 'changed' }>,
  status: DiffEntryStatus,
) {
  return status === 'renamed' || status === 'copied'
    ? item.oldPath
    : null
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
        indexSource(entry, entry.path, entry.dstOid),
      ]
    case 'deleted':
      return [
        headSource(entry, leftPath(entry), entry.srcOid),
        emptySource(entry),
      ]
    case 'modified':
    case 'renamed':
    case 'copied':
    case 'typeChanged':
    case 'unsupported':
      return [
        headSource(entry, leftPath(entry), entry.srcOid),
        indexSource(entry, entry.path, entry.dstOid),
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
        indexSource(entry, leftPath(entry), entry.srcOid),
        emptySource(entry),
      ]
    case 'modified':
    case 'renamed':
    case 'copied':
    case 'typeChanged':
    case 'unsupported':
      return [
        indexSource(entry, leftPath(entry), entry.srcOid),
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
        headSource(entry, leftPath(entry), entry.srcOid),
        emptySource(entry),
      ]
    case 'modified':
    case 'renamed':
    case 'copied':
    case 'typeChanged':
    case 'unsupported':
      return [
        headSource(entry, leftPath(entry), entry.srcOid),
        workingTreeSource(entry),
      ]
    case 'conflicted':
      throw new Error('Git conflicted file details are not implemented yet.')
  }
}

function gitRefSnapshots(
  entry: Extract<ProviderEntryData, { kind: 'gitRef' }>,
): [GitSnapshotSource, GitSnapshotSource] {
  const rightSource = refSource(entry, entry.rightRef, entry.rightLabelRef, entry.path, entry.dstOid)

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

async function attachGitPatch(
  result: FileDiffResult,
  entry: Extract<ProviderEntryData, { kind: 'gitWorkingTree' | 'gitRef' }>,
) {
  if (result.contentKind !== 'text' || !result.text) {
    return result
  }

  const patch = await readGitPatch(entry)
  if (!patch) {
    return result
  }

  result.text.patchText = patch
  result.text.patchCacheKey = [
    'git-patch',
    entry.kind,
    entry.path,
    entry.oldPath ?? '',
    'scope' in entry ? entry.scope : '',
    'leftRef' in entry ? entry.leftRef ?? 'empty' : '',
    'rightRef' in entry ? entry.rightRef : '',
    entry.srcOid ?? '',
    entry.dstOid ?? '',
    patch.length,
  ].join('\u0000')
  return result
}

async function readGitPatch(
  entry: Extract<ProviderEntryData, { kind: 'gitWorkingTree' | 'gitRef' }>,
) {
  const args = gitPatchArgs(entry)
  if (!args) {
    return null
  }

  try {
    const result = await runGit(entry.repositoryRoot, args, {
      ...GIT_ENTRY_OPTIONS,
      allowNonZeroExit: true,
      maxStdoutBytes: 1024 * 1024 * 16,
    })
    return result.exitCode === 0 && result.stdout.trim()
      ? result.stdout
      : null
  } catch {
    return null
  }
}

function gitPatchArgs(
  entry: Extract<ProviderEntryData, { kind: 'gitWorkingTree' | 'gitRef' }>,
) {
  const paths = gitPatchPaths(entry)
  if (paths.length === 0) {
    return null
  }

  if (entry.kind === 'gitWorkingTree') {
    switch (entry.scope) {
      case 'all':
        return ['diff', ...GIT_DIFF_PATCH_ARGS, 'HEAD', '--', ...paths]
      case 'staged':
        return ['diff', ...GIT_DIFF_PATCH_ARGS, '--cached', '--', ...paths]
      case 'unstaged':
        return ['diff', ...GIT_DIFF_PATCH_ARGS, '--', ...paths]
      case 'untracked':
        return null
    }
  }

  if (entry.leftRef === null) {
    return [
      'diff-tree',
      '--no-commit-id',
      '--root',
      '-r',
      '-p',
      ...GIT_DIFF_PATCH_ARGS,
      entry.rightRef,
      '--',
      ...paths,
    ]
  }

  return [
    'diff',
    ...GIT_DIFF_PATCH_ARGS,
    entry.leftRef,
    entry.rightRef,
    '--',
    ...paths,
  ]
}

function gitPatchPaths(entry: { path: string; oldPath: string | null }) {
  return entry.oldPath && entry.oldPath !== entry.path
    ? [entry.oldPath, entry.path]
    : [entry.path]
}

function leftRefSource(
  entry: Extract<ProviderEntryData, { kind: 'gitRef' }>,
): GitSnapshotSource {
  if (entry.leftRef === null) {
    return emptyRefSource(entry)
  }

  return refSource(entry, entry.leftRef, entry.leftLabelRef, entry.oldPath ?? entry.path, entry.srcOid)
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
  oid: string | null,
): GitSnapshotSource {
  return {
    kind: 'ref',
    repoPath: entry.repoPath,
    repositoryRoot: entry.repositoryRoot,
    ref,
    path,
    label: `${labelRef}:${path}`,
    oid,
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
      srcOid: item.srcOid ?? null,
      dstOid: item.dstOid ?? null,
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
  oid: string | null,
): GitSnapshotSource {
  return {
    kind: 'head',
    repoPath: entry.repoPath,
    repositoryRoot: entry.repositoryRoot,
    path,
    label: `HEAD:${path}`,
    oid,
  }
}

function indexSource(
  entry: Extract<ProviderEntryData, { kind: 'gitWorkingTree' }>,
  path: string,
  oid: string | null,
): GitSnapshotSource {
  return {
    kind: 'index',
    repoPath: entry.repoPath,
    repositoryRoot: entry.repositoryRoot,
    path,
    label: `:${path}`,
    oid,
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

async function readStatusSnapshot(repoPath: string) {
  const result = await runGit(repoPath, [
    '--no-optional-locks',
    'status',
    '--porcelain=v2',
    '-z',
    '--branch',
    '--untracked-files=all',
  ], GIT_ENTRY_OPTIONS)

  return parseGitStatusPorcelainV2Output(result.stdout)
}

async function readRawNumstat(repoPath: string, args: string[]) {
  const result = await runGit(repoPath, args, GIT_ENTRY_OPTIONS)
  return parseGitRawNumstatOutput(result.stdout)
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
