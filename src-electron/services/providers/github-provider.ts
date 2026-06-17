import type {
  CompareOptions,
  DiffEntry,
  DiffEntryStatus,
  DiffSource,
  FileDiffResult,
} from '../../../src/lib/types'
import type {
  DiffSessionProvider,
  DiffSessionRecordLike,
  ProviderEntryData,
  ProviderSessionData,
} from '../diff/provider'
import {
  buildFileDiffFromGithub,
  type GithubSnapshotSource,
} from '../file-diff'
import {
  fetchGithubRawDiff,
  type GithubPullRequestFile,
} from '../github/github-service'

// Serves GitHub diffs through the normal diff session flow. Public PR and
// compare URLs load from GitHub's raw .diff endpoint, avoiding the low
// unauthenticated REST API core limit.
export class GithubProvider implements DiffSessionProvider {
  async create(source: DiffSource, options: CompareOptions): Promise<ProviderSessionData> {
    void options
    if (!isGithubSource(source)) {
      throw new Error('Expected a GitHub diff source.')
    }

    const { baseLabel, headLabel, files } = await loadGithubRawDiff(source)

    const entries: DiffEntry[] = []
    const entryData = new Map<string, ProviderEntryData>()

    for (const file of files) {
      const entry = mapGithubFile(source, file)
      entries.push(entry)
      entryData.set(entry.id, {
        kind: 'githubPullRequest',
        owner: source.owner,
        repo: source.repo,
        sourceId: githubSourceId(source),
        baseSha: baseLabel,
        headSha: headLabel,
        leftLabel: baseLabel,
        rightLabel: headLabel,
        path: file.filename,
        oldPath: file.previousFilename ?? null,
        status: entry.status,
        patch: file.patch ?? null,
      })
    }

    return {
      entries,
      entryData,
    }
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
    if (entry.kind !== 'githubPullRequest') {
      throw new Error('Unsupported GitHub diff entry data.')
    }

    const { left, right } = buildGithubPatchSides(entry)

    return buildFileDiffFromGithub(left, right, options)
  }

  refresh(session: DiffSessionRecordLike): Promise<ProviderSessionData> {
    return this.create(session.source, session.options)
  }
}

async function loadGithubRawDiff(source: DiffSource): Promise<{
  baseLabel: string
  headLabel: string
  files: GithubPullRequestFile[]
}> {
  if (isGithubSource(source)) {
    return fetchGithubRawDiff(source)
  }

  throw new Error('Expected a GitHub diff source.')
}

function buildGithubPatchSides(
  entry: Extract<ProviderEntryData, { kind: 'githubPullRequest' }>,
): { left: GithubSnapshotSource; right: GithubSnapshotSource } {
  const reconstructed = entry.patch
    ? reconstructPatchText(entry.patch)
    : null

  return {
    left: buildGithubPatchSnapshot(entry, 'left', reconstructed?.left ?? null),
    right: buildGithubPatchSnapshot(entry, 'right', reconstructed?.right ?? null),
  }
}

function buildGithubPatchSnapshot(
  entry: Extract<ProviderEntryData, { kind: 'githubPullRequest' }>,
  side: 'left' | 'right',
  text: string | null,
): GithubSnapshotSource {
  const ref = side === 'left' ? entry.leftLabel : entry.rightLabel
  const path = side === 'left' ? entry.oldPath ?? entry.path : entry.path
  const sideExists = side === 'left'
    ? entry.status !== 'added' && entry.status !== 'untracked'
    : entry.status !== 'deleted'

  if (!sideExists) {
    return missingSnapshot(entry, ref, path)
  }

  if (text === null) {
    if (entry.status === 'unsupported') {
      return {
        owner: entry.owner,
        repo: entry.repo,
        ref,
        path,
        sha: patchTextIdentity(ref, path, 'binary'),
        label: `${ref}:${path}`,
        exists: true,
        bytes: Uint8Array.from([0]),
        truncated: false,
        size: 1,
      }
    }

    return {
      owner: entry.owner,
      repo: entry.repo,
      ref,
      path,
      sha: null,
      label: `${ref}:${path}`,
      exists: true,
      bytes: null,
      truncated: false,
      size: null,
    }
  }

  return {
    owner: entry.owner,
    repo: entry.repo,
    ref,
    path,
    sha: patchTextIdentity(ref, path, text),
    label: `${ref}:${path}`,
    exists: true,
    bytes: null,
    text,
    truncated: false,
    size: text.length,
  }
}

function missingSnapshot(
  entry: Extract<ProviderEntryData, { kind: 'githubPullRequest' }>,
  ref: string,
  path: string,
): GithubSnapshotSource {
  return {
    owner: entry.owner,
    repo: entry.repo,
    ref,
    path,
    sha: ref,
    label: path,
    exists: false,
    bytes: null,
  }
}

function mapGithubFile(
  source: GithubProviderSource,
  file: GithubPullRequestFile,
): DiffEntry {
  return {
    id: githubEntryId(githubSourceId(source), file.filename, file.previousFilename ?? null),
    path: file.filename,
    oldPath: file.previousFilename ?? null,
    displayPath: displayPath(file.filename, file.previousFilename ?? null, file.status),
    status: file.status,
    leftSize: null,
    rightSize: null,
  }
}

function githubEntryId(sourceId: string, path: string, oldPath: string | null) {
  return `github:${encodeURIComponent(sourceId)}:${encodeURIComponent(oldPath ?? '')}:${encodeURIComponent(path)}`
}

type GithubProviderSource = Extract<
  DiffSource,
  { kind: 'githubPullRequest' | 'githubCompare' | 'githubCommit' }
>

function isGithubSource(source: DiffSource): source is GithubProviderSource {
  return (
    source.kind === 'githubPullRequest' ||
    source.kind === 'githubCompare' ||
    source.kind === 'githubCommit'
  )
}

function githubSourceId(source: GithubProviderSource) {
  if (source.kind === 'githubPullRequest') {
    return `pr:${source.pullNumber}`
  }
  if (source.kind === 'githubCommit') {
    return `commit:${source.commitRef}`
  }

  const dots = source.notation === 'threeDot' ? '...' : '..'
  return `compare:${source.baseRef}${dots}${source.headRef}`
}

function displayPath(path: string, oldPath: string | null, status: DiffEntryStatus) {
  if ((status === 'renamed' || status === 'copied') && oldPath) {
    return `${oldPath} -> ${path}`
  }

  return path
}

function reconstructPatchText(patch: string): { left: string; right: string } | null {
  const left: string[] = []
  const right: string[] = []
  const lines = patch.split(/\r?\n/)
  let inHunk = false
  let wroteAnyHunk = false

  for (const line of lines) {
    if (line.startsWith('@@ ')) {
      if (wroteAnyHunk) {
        left.push('')
        right.push('')
      }
      left.push(line)
      right.push(line)
      inHunk = true
      wroteAnyHunk = true
      continue
    }

    if (!inHunk) {
      continue
    }

    if (line.startsWith('\\ No newline')) {
      continue
    }

    const content = line.slice(1)
    if (line.startsWith(' ')) {
      left.push(content)
      right.push(content)
    } else if (line.startsWith('-')) {
      left.push(content)
    } else if (line.startsWith('+')) {
      right.push(content)
    }
  }

  if (!wroteAnyHunk) {
    return null
  }

  return {
    left: left.join('\n'),
    right: right.join('\n'),
  }
}

function patchTextIdentity(ref: string, path: string, text: string) {
  return `${ref}:${path}:${text.length}`
}
