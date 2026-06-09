import type {
  DiffEntryStatus,
  GithubCompareSource,
  GithubPullRequestMetadata,
  GithubPullRequestSource,
} from '../../../src/lib/types'
import { MAX_TEXT_BYTES } from '../file-diff'

// Unauthenticated GitHub REST client for public pull requests. No tokens are
// read or stored; private repositories surface as not-found/forbidden errors.

const GITHUB_API_BASE = 'https://api.github.com'
const GITHUB_API_VERSION = '2022-11-28'
const REQUEST_TIMEOUT_MS = 20_000
const FILES_PER_PAGE = 100
// GitHub caps pull request file listings at 3000 entries.
const MAX_FILE_PAGES = 30
// Snapshot downloads are cut off past this size and rendered as tooLarge.
export const MAX_GITHUB_CONTENT_BYTES = MAX_TEXT_BYTES * 4

export type GithubErrorKind =
  | 'invalid-url'
  | 'not-found'
  | 'private-repo'
  | 'rate-limited'
  | 'network-error'
  | 'api-error'
  | 'too-large'

export class GithubServiceError extends Error {
  readonly kind: GithubErrorKind

  constructor(kind: GithubErrorKind, message: string) {
    super(message)
    this.name = 'GithubServiceError'
    this.kind = kind
  }
}

export interface GithubPullRequestFile {
  filename: string
  previousFilename?: string
  status: DiffEntryStatus
  additions: number
  deletions: number
  changes: number
  patch?: string
  rawUrl?: string
  blobUrl?: string
}

export interface GithubCompareMetadata {
  owner: string
  repo: string
  baseRef: string
  headRef: string
  baseSha: string
  headSha: string
  htmlUrl: string
  changedFiles: number | null
}

export interface GithubFileContent {
  exists: boolean
  bytes: Uint8Array | null
  truncated: boolean
  size: number | null
}

export async function fetchPullRequestMetadata(
  source: GithubPullRequestSource,
): Promise<GithubPullRequestMetadata> {
  const payload = await fetchGithubJson(
    `${GITHUB_API_BASE}/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}/pulls/${source.pullNumber}`,
  )

  if (!isRecord(payload) || !isRecord(payload.base) || !isRecord(payload.head)) {
    throw new GithubServiceError('api-error', 'GitHub returned an unexpected pull request payload.')
  }

  const baseSha = readString(payload.base.sha)
  const headSha = readString(payload.head.sha)
  if (!baseSha || !headSha) {
    throw new GithubServiceError('api-error', 'GitHub returned a pull request without base or head commit.')
  }

  return {
    owner: source.owner,
    repo: source.repo,
    pullNumber: source.pullNumber,
    title: readString(payload.title) ?? '',
    state: payload.merged_at ? 'merged' : readString(payload.state) ?? 'open',
    baseRef: readString(payload.base.ref) ?? '',
    headRef: readString(payload.head.ref) ?? '',
    baseSha,
    headSha,
    htmlUrl: readString(payload.html_url) ?? source.url,
    changedFiles: readNonNegativeInteger(payload.changed_files),
  }
}

export async function fetchPullRequestFiles(
  source: GithubPullRequestSource,
): Promise<GithubPullRequestFile[]> {
  const files: GithubPullRequestFile[] = []

  for (let page = 1; page <= MAX_FILE_PAGES; page += 1) {
    const payload = await fetchGithubJson(
      `${GITHUB_API_BASE}/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}/pulls/${source.pullNumber}/files?per_page=${FILES_PER_PAGE}&page=${page}`,
    )

    if (!Array.isArray(payload)) {
      throw new GithubServiceError('api-error', 'GitHub returned an unexpected pull request file list.')
    }

    for (const item of payload) {
      const file = readPullRequestFile(item)
      if (file) {
        files.push(file)
      }
    }

    if (payload.length < FILES_PER_PAGE) {
      return files
    }
  }

  throw new GithubServiceError(
    'too-large',
    'This pull request changes more files than GitHub exposes through its API.',
  )
}

export async function fetchCompareMetadataAndFiles(
  source: GithubCompareSource,
): Promise<{ metadata: GithubCompareMetadata; files: GithubPullRequestFile[] }> {
  const payload = await fetchGithubJson(
    `${GITHUB_API_BASE}/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}/compare/${encodeURIComponent(compareBasehead(source))}`,
  )

  if (!isRecord(payload) || !isRecord(payload.base_commit) || !isRecord(payload.head_commit)) {
    throw new GithubServiceError('api-error', 'GitHub returned an unexpected compare payload.')
  }

  const baseSha = readString(payload.base_commit.sha)
  const headSha = readString(payload.head_commit.sha)
  if (!baseSha || !headSha) {
    throw new GithubServiceError('api-error', 'GitHub returned a compare without base or head commit.')
  }

  if (!Array.isArray(payload.files)) {
    throw new GithubServiceError('api-error', 'GitHub returned an unexpected compare file list.')
  }

  const files: GithubPullRequestFile[] = []
  for (const item of payload.files) {
    const file = readPullRequestFile(item)
    if (file) {
      files.push(file)
    }
  }

  return {
    metadata: {
      owner: source.owner,
      repo: source.repo,
      baseRef: source.baseRef,
      headRef: source.headRef,
      baseSha,
      headSha,
      htmlUrl: readString(payload.html_url) ?? source.url,
      changedFiles: readNonNegativeInteger(payload.total_files) ?? files.length,
    },
    files,
  }
}

// Loads raw file bytes at a specific commit. A missing path (e.g. the base
// side of an added file) resolves to exists: false instead of throwing.
export async function fetchPullRequestFileContent(
  owner: string,
  repo: string,
  ref: string,
  path: string,
): Promise<GithubFileContent> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`
  const response = await githubFetch(url, 'application/vnd.github.raw+json')

  if (response.status === 404) {
    await discardResponseBody(response)
    return { exists: false, bytes: null, truncated: false, size: null }
  }

  if (!response.ok) {
    throw await githubResponseError(response)
  }

  const declaredSize = readContentLength(response)
  if (declaredSize !== null && declaredSize > MAX_GITHUB_CONTENT_BYTES) {
    await discardResponseBody(response)
    return { exists: true, bytes: null, truncated: true, size: declaredSize }
  }

  const body = await readBodyWithCap(response, MAX_GITHUB_CONTENT_BYTES)
  if (body.truncated) {
    return {
      exists: true,
      bytes: null,
      truncated: true,
      size: declaredSize,
    }
  }

  return {
    exists: true,
    bytes: body.bytes,
    truncated: false,
    size: body.bytes.byteLength,
  }
}

async function fetchGithubJson(url: string): Promise<unknown> {
  const response = await githubFetch(url, 'application/vnd.github+json')
  if (!response.ok) {
    throw await githubResponseError(response)
  }

  try {
    return await response.json()
  } catch {
    throw new GithubServiceError('api-error', 'GitHub returned an unreadable response.')
  }
}

async function githubFetch(url: string, accept: string): Promise<Response> {
  try {
    return await fetch(url, {
      headers: {
        Accept: accept,
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        'User-Agent': 'diffly',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'follow',
    })
  } catch {
    throw new GithubServiceError(
      'network-error',
      'GitHub could not be reached. Check your network connection.',
    )
  }
}

async function githubResponseError(response: Response): Promise<GithubServiceError> {
  await discardResponseBody(response)

  if (response.status === 404) {
    return new GithubServiceError(
      'not-found',
      'GitHub could not find this pull request. It may not exist or the repository may be private.',
    )
  }

  if (response.status === 403 || response.status === 429) {
    const rateLimited = response.headers.get('x-ratelimit-remaining') === '0'
    return new GithubServiceError(
      rateLimited ? 'rate-limited' : 'private-repo',
      'GitHub could not load this PR. It may be private or rate-limited.',
    )
  }

  return new GithubServiceError(
    'api-error',
    `GitHub request failed with status ${response.status}.`,
  )
}

async function discardResponseBody(response: Response) {
  try {
    await response.body?.cancel()
  } catch {
    // Already consumed or closed.
  }
}

function readContentLength(response: Response): number | null {
  const header = response.headers.get('content-length')
  if (!header) {
    return null
  }

  const value = Number.parseInt(header, 10)
  return Number.isInteger(value) && value >= 0 ? value : null
}

async function readBodyWithCap(
  response: Response,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer())
    return buffer.byteLength > maxBytes
      ? { bytes: new Uint8Array(0), truncated: true }
      : { bytes: buffer, truncated: false }
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      if (!value) {
        continue
      }

      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return { bytes: new Uint8Array(0), truncated: true }
      }

      chunks.push(value)
    }
  } catch {
    throw new GithubServiceError(
      'network-error',
      'GitHub file download was interrupted. Try again.',
    )
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  return { bytes, truncated: false }
}

function readPullRequestFile(value: unknown): GithubPullRequestFile | null {
  if (!isRecord(value)) {
    return null
  }

  const filename = readString(value.filename)
  if (!filename) {
    return null
  }

  return {
    filename,
    previousFilename: readString(value.previous_filename) ?? undefined,
    status: mapGithubFileStatus(readString(value.status)),
    additions: readNonNegativeInteger(value.additions) ?? 0,
    deletions: readNonNegativeInteger(value.deletions) ?? 0,
    changes: readNonNegativeInteger(value.changes) ?? 0,
    patch: readString(value.patch) ?? undefined,
    rawUrl: readString(value.raw_url) ?? undefined,
    blobUrl: readString(value.blob_url) ?? undefined,
  }
}

function mapGithubFileStatus(status: string | null): DiffEntryStatus {
  switch (status) {
    case 'modified':
    case 'changed':
    case 'unchanged':
      return 'modified'
    case 'added':
      return 'added'
    case 'removed':
      return 'deleted'
    case 'renamed':
      return 'renamed'
    case 'copied':
      return 'copied'
    default:
      return 'unsupported'
  }
}

function compareBasehead(source: GithubCompareSource) {
  const dots = source.notation === 'threeDot' ? '...' : '..'
  return `${source.baseRef}${dots}${source.headRef}`
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function readNonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
