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
  fetchPullRequestFileContent,
  fetchPullRequestFiles,
  fetchPullRequestMetadata,
  type GithubPullRequestFile,
} from '../github/github-service'

const SHORT_SHA_LENGTH = 7

// Serves GitHub pull requests through the normal diff session flow: the file
// list comes from the PR files API, file details load base/head blob contents
// and render through the shared snapshot diff.
export class GithubProvider implements DiffSessionProvider {
  async create(source: DiffSource, options: CompareOptions): Promise<ProviderSessionData> {
    void options
    if (source.kind !== 'githubPullRequest') {
      throw new Error('Expected a GitHub pull request diff source.')
    }

    const metadata = await fetchPullRequestMetadata(source)
    const files = await fetchPullRequestFiles(source)

    const entries: DiffEntry[] = []
    const entryData = new Map<string, ProviderEntryData>()

    for (const file of files) {
      const entry = mapPullRequestFile(source.pullNumber, file)
      entries.push(entry)
      entryData.set(entry.id, {
        kind: 'githubPullRequest',
        owner: source.owner,
        repo: source.repo,
        pullNumber: source.pullNumber,
        baseSha: metadata.baseSha,
        headSha: metadata.headSha,
        path: file.filename,
        oldPath: file.previousFilename ?? null,
        status: entry.status,
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

    const [left, right] = await Promise.all([
      loadGithubSide(entry, 'left'),
      loadGithubSide(entry, 'right'),
    ])

    return buildFileDiffFromGithub(left, right, options)
  }

  refresh(session: DiffSessionRecordLike): Promise<ProviderSessionData> {
    return this.create(session.source, session.options)
  }
}

async function loadGithubSide(
  entry: Extract<ProviderEntryData, { kind: 'githubPullRequest' }>,
  side: 'left' | 'right',
): Promise<GithubSnapshotSource> {
  const ref = side === 'left' ? entry.baseSha : entry.headSha
  const path = side === 'left' ? entry.oldPath ?? entry.path : entry.path
  const sideExists = side === 'left'
    ? entry.status !== 'added' && entry.status !== 'untracked'
    : entry.status !== 'deleted'

  if (!sideExists) {
    return missingSnapshot(entry, ref, path)
  }

  const content = await fetchPullRequestFileContent(entry.owner, entry.repo, ref, path)
  if (!content.exists) {
    return missingSnapshot(entry, ref, path)
  }

  return {
    owner: entry.owner,
    repo: entry.repo,
    ref,
    path,
    // Blob content at a commit sha is immutable, so the commit sha is a stable
    // cache identity for the snapshot.
    sha: ref,
    label: `${ref.slice(0, SHORT_SHA_LENGTH)}:${path}`,
    exists: true,
    bytes: content.bytes,
    truncated: content.truncated,
    size: content.size,
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

function mapPullRequestFile(pullNumber: number, file: GithubPullRequestFile): DiffEntry {
  return {
    id: githubEntryId(pullNumber, file.filename, file.previousFilename ?? null),
    path: file.filename,
    oldPath: file.previousFilename ?? null,
    displayPath: displayPath(file.filename, file.previousFilename ?? null, file.status),
    status: file.status,
    leftSize: null,
    rightSize: null,
  }
}

function githubEntryId(pullNumber: number, path: string, oldPath: string | null) {
  return `github:${pullNumber}:${encodeURIComponent(oldPath ?? '')}:${encodeURIComponent(path)}`
}

function displayPath(path: string, oldPath: string | null, status: DiffEntryStatus) {
  if ((status === 'renamed' || status === 'copied') && oldPath) {
    return `${oldPath} -> ${path}`
  }

  return path
}
