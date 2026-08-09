import { app } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import {
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import {
  basename,
  dirname,
  join,
  resolve,
  win32,
} from 'node:path'
import type {
  CompareMode,
  DiffSource,
  RecentGithubCompare,
  RecentGitRepository,
  RecentGithubPullRequest,
  RecentLocalTarget,
  RecentSources,
  SetupMode,
} from '../../src/lib/types'
import { replaceFile } from './atomic-file'

const MAX_RECENT_SOURCES_BYTES = 256 * 1024
const MAX_RECENT_ITEMS = 20

export async function loadRecentSources(): Promise<RecentSources> {
  const filePath = recentsPath()
  if (!existsSync(filePath)) {
    return createDefaultRecentSources()
  }

  const info = await stat(filePath)
  validateRecentSourcesSize(info.size)

  try {
    return normalizeRecentSources(JSON.parse(await readFile(filePath, 'utf8')))
  } catch {
    return createDefaultRecentSources()
  }
}

export async function addRecentSource(
  source: DiffSource,
  metadata?: unknown,
): Promise<RecentSources> {
  const current = await loadRecentSources()
  const next = addRecentSourceToStore(current, source, metadata)

  await saveRecentSources(next)
  return next
}

export async function removeRecentSource(id: string): Promise<RecentSources> {
  const current = await loadRecentSources()
  const next: RecentSources = {
    defaultSetupMode: current.defaultSetupMode,
    gitRepositories: current.gitRepositories.filter((entry) => entry.id !== id),
    githubPullRequests: current.githubPullRequests.filter((entry) => entry.id !== id),
    githubCompares: current.githubCompares.filter((entry) => entry.id !== id),
    localTargets: current.localTargets.filter((entry) => entry.id !== id),
  }

  await saveRecentSources(next)
  return next
}

async function saveRecentSources(sources: RecentSources) {
  const normalized = normalizeRecentSources(sources)
  const json = JSON.stringify(normalized)
  validateRecentSourcesSize(Buffer.byteLength(json))
  const filePath = recentsPath()
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`

  await mkdir(dirname(filePath), { recursive: true })
  try {
    await writeFile(tempPath, json, 'utf8')
    await replaceFile(tempPath, filePath)
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined)
    throw error
  }
}

function addRecentSourceToStore(
  current: RecentSources,
  source: DiffSource,
  metadata: unknown,
): RecentSources {
  switch (source.kind) {
    case 'git':
      return {
        ...current,
        gitRepositories: upsertGitRepository(current.gitRepositories, source, metadata),
      }
    case 'githubPullRequest':
      return {
        ...current,
        githubPullRequests: upsertGithubPullRequest(
          current.githubPullRequests,
          source,
          metadata,
        ),
      }
    case 'githubCompare':
      return {
        ...current,
        githubCompares: upsertGithubCompare(current.githubCompares, source),
      }
    case 'githubCommit':
      return current
    case 'local':
      return {
        ...current,
        localTargets: upsertLocalTarget(current.localTargets, source, metadata),
      }
  }
}

function upsertGitRepository(
  entries: RecentGitRepository[],
  source: Extract<DiffSource, { kind: 'git' }>,
  metadata: unknown,
) {
  const repositoryRoot = normalizeStoredPath(source.repositoryRoot)
  const repoPath = normalizeStoredPath(source.repoPath)
  const key = normalizePathKey(repositoryRoot)

  if (!key) {
    throw new Error('Git repository root is required.')
  }

  const existing = entries.find((entry) => normalizePathKey(entry.repositoryRoot) === key)
  const metadataLastBranch = readMetadataNullableString(metadata, 'lastBranch')
  const entry: RecentGitRepository = {
    id: gitRepositoryId(key),
    repoPath,
    repositoryRoot,
    name: readMetadataString(metadata, 'name') ?? (basenameStoredPath(repositoryRoot) || repositoryRoot),
    lastBranch: metadataLastBranch !== undefined
      ? metadataLastBranch
      : existing?.lastBranch ?? inferLastBranch(source),
    lastUsedAt: new Date().toISOString(),
  }

  return [
    entry,
    ...entries.filter((item) => normalizePathKey(item.repositoryRoot) !== key),
  ].slice(0, MAX_RECENT_ITEMS)
}

function upsertGithubPullRequest(
  entries: RecentGithubPullRequest[],
  source: Extract<DiffSource, { kind: 'githubPullRequest' }>,
  metadata: unknown,
) {
  const owner = source.owner.trim()
  const repo = source.repo.trim()
  const url = source.url.trim()

  if (!owner || !repo || !url) {
    throw new Error('GitHub pull request owner, repo, and URL are required.')
  }

  if (!Number.isInteger(source.pullNumber) || source.pullNumber <= 0) {
    throw new Error('GitHub pull request number must be a positive integer.')
  }

  const key = githubPullRequestKey(owner, repo, source.pullNumber)
  const existing = entries.find((entry) =>
    githubPullRequestKey(entry.owner, entry.repo, entry.pullNumber) === key
  )
  const metadataTitle = readMetadataNullableString(metadata, 'title')
  const entry: RecentGithubPullRequest = {
    id: githubPullRequestId(owner, repo, source.pullNumber),
    url,
    owner,
    repo,
    pullNumber: source.pullNumber,
    title: metadataTitle !== undefined ? metadataTitle : existing?.title ?? null,
    lastUsedAt: new Date().toISOString(),
  }

  return [
    entry,
    ...entries.filter((item) =>
      githubPullRequestKey(item.owner, item.repo, item.pullNumber) !== key
    ),
  ].slice(0, MAX_RECENT_ITEMS)
}

function upsertGithubCompare(
  entries: RecentGithubCompare[],
  source: Extract<DiffSource, { kind: 'githubCompare' }>,
) {
  const owner = source.owner.trim()
  const repo = source.repo.trim()
  const url = source.url.trim()
  const baseRef = source.baseRef.trim()
  const headRef = source.headRef.trim()

  if (!owner || !repo || !url || !baseRef || !headRef) {
    throw new Error('GitHub compare owner, repo, refs, and URL are required.')
  }

  const key = githubCompareKey(owner, repo, baseRef, headRef, source.notation)
  const entry: RecentGithubCompare = {
    id: githubCompareId(key),
    url,
    owner,
    repo,
    baseRef,
    headRef,
    notation: source.notation,
    lastUsedAt: new Date().toISOString(),
  }

  return [
    entry,
    ...entries.filter((item) =>
      githubCompareKey(item.owner, item.repo, item.baseRef, item.headRef, item.notation) !== key
    ),
  ].slice(0, MAX_RECENT_ITEMS)
}

function upsertLocalTarget(
  entries: RecentLocalTarget[],
  source: Extract<DiffSource, { kind: 'local' }>,
  metadata: unknown,
) {
  const leftPath = normalizeStoredPath(source.leftPath)
  const rightPath = normalizeStoredPath(source.rightPath)
  const key = localTargetKey(source.compareMode, leftPath, rightPath)
  const entry: RecentLocalTarget = {
    id: localTargetId(key),
    leftPath,
    rightPath,
    compareMode: source.compareMode,
    name: readMetadataString(metadata, 'name') ?? `${basenameStoredPath(leftPath)} <> ${basenameStoredPath(rightPath)}`,
    lastUsedAt: new Date().toISOString(),
  }

  return [
    entry,
    ...entries.filter((item) =>
      localTargetKey(item.compareMode, item.leftPath, item.rightPath) !== key
    ),
  ].slice(0, MAX_RECENT_ITEMS)
}

function normalizeRecentSources(value: unknown): RecentSources {
  if (!isRecord(value)) {
    return createDefaultRecentSources()
  }

  return {
    defaultSetupMode: normalizeSetupMode(value.defaultSetupMode),
    gitRepositories: normalizeGitRepositories(value.gitRepositories),
    githubPullRequests: normalizeGithubPullRequests(value.githubPullRequests),
    githubCompares: normalizeGithubCompares(value.githubCompares),
    localTargets: normalizeLocalTargets(value.localTargets),
  }
}

function normalizeGitRepositories(value: unknown): RecentGitRepository[] {
  if (!Array.isArray(value)) {
    return []
  }

  const entries: RecentGitRepository[] = []
  const seen = new Set<string>()

  for (const item of value) {
    if (!isRecord(item)) {
      continue
    }

    const repoPath = normalizeRequiredPath(item.repoPath)
    const repositoryRoot = normalizeRequiredPath(item.repositoryRoot)
    const name = normalizeRequiredString(item.name)
    const lastUsedAt = normalizeRequiredString(item.lastUsedAt)
    const key = repositoryRoot ? normalizePathKey(repositoryRoot) : ''

    if (!repoPath || !repositoryRoot || !name || !lastUsedAt || seen.has(key)) {
      continue
    }

    seen.add(key)
    entries.push({
      id: gitRepositoryId(key),
      repoPath,
      repositoryRoot,
      name,
      lastBranch: normalizeNullableString(item.lastBranch),
      lastUsedAt,
    })

    if (entries.length === MAX_RECENT_ITEMS) {
      break
    }
  }

  return entries
}

function normalizeGithubPullRequests(value: unknown): RecentGithubPullRequest[] {
  if (!Array.isArray(value)) {
    return []
  }

  const entries: RecentGithubPullRequest[] = []
  const seen = new Set<string>()

  for (const item of value) {
    if (!isRecord(item)) {
      continue
    }

    const url = normalizeRequiredString(item.url)
    const owner = normalizeRequiredString(item.owner)
    const repo = normalizeRequiredString(item.repo)
    const pullNumber = normalizePositiveInteger(item.pullNumber)
    const lastUsedAt = normalizeRequiredString(item.lastUsedAt)

    if (
      !url ||
      !owner ||
      !repo ||
      pullNumber === null ||
      !lastUsedAt
    ) {
      continue
    }

    const key = githubPullRequestKey(owner, repo, pullNumber)
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    entries.push({
      id: githubPullRequestId(owner, repo, pullNumber),
      url,
      owner,
      repo,
      pullNumber,
      title: normalizeNullableString(item.title),
      lastUsedAt,
    })

    if (entries.length === MAX_RECENT_ITEMS) {
      break
    }
  }

  return entries
}

function normalizeGithubCompares(value: unknown): RecentGithubCompare[] {
  if (!Array.isArray(value)) {
    return []
  }

  const entries: RecentGithubCompare[] = []
  const seen = new Set<string>()

  for (const item of value) {
    if (!isRecord(item)) {
      continue
    }

    const url = normalizeRequiredString(item.url)
    const owner = normalizeRequiredString(item.owner)
    const repo = normalizeRequiredString(item.repo)
    const baseRef = normalizeRequiredString(item.baseRef)
    const headRef = normalizeRequiredString(item.headRef)
    const notation = normalizeCompareNotation(item.notation)
    const lastUsedAt = normalizeRequiredString(item.lastUsedAt)

    if (
      !url ||
      !owner ||
      !repo ||
      !baseRef ||
      !headRef ||
      notation === null ||
      !lastUsedAt
    ) {
      continue
    }

    const key = githubCompareKey(owner, repo, baseRef, headRef, notation)
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    entries.push({
      id: githubCompareId(key),
      url,
      owner,
      repo,
      baseRef,
      headRef,
      notation,
      lastUsedAt,
    })

    if (entries.length === MAX_RECENT_ITEMS) {
      break
    }
  }

  return entries
}

function normalizeLocalTargets(value: unknown): RecentLocalTarget[] {
  if (!Array.isArray(value)) {
    return []
  }

  const entries: RecentLocalTarget[] = []
  const seen = new Set<string>()

  for (const item of value) {
    if (!isRecord(item)) {
      continue
    }

    const leftPath = normalizeRequiredPath(item.leftPath)
    const rightPath = normalizeRequiredPath(item.rightPath)
    const compareMode = normalizeCompareMode(item.compareMode)
    const name = normalizeRequiredString(item.name)
    const lastUsedAt = normalizeRequiredString(item.lastUsedAt)

    if (!leftPath || !rightPath || !compareMode || !name || !lastUsedAt) {
      continue
    }

    const key = localTargetKey(compareMode, leftPath, rightPath)
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    entries.push({
      id: localTargetId(key),
      leftPath,
      rightPath,
      compareMode,
      name,
      lastUsedAt,
    })

    if (entries.length === MAX_RECENT_ITEMS) {
      break
    }
  }

  return entries
}

function normalizePathKey(path: string) {
  const normalized = normalizeStoredPath(path)
  const windowsPath = isWindowsStylePath(path)
  const key = windowsPath ? normalized.replaceAll('\\', '/') : normalized
  return process.platform === 'win32' || windowsPath ? key.toLowerCase() : key
}

function normalizeStoredPath(path: string) {
  const trimmed = path.trim()
  if (!trimmed) {
    return ''
  }

  return isWindowsStylePath(trimmed) ? win32.normalize(trimmed) : resolve(trimmed)
}

function basenameStoredPath(path: string) {
  return isWindowsStylePath(path) ? win32.basename(path) : basename(path)
}

function isWindowsStylePath(path: string) {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\')
}

function normalizeRequiredPath(value: unknown) {
  return typeof value === 'string' ? normalizeStoredPath(value) : ''
}

function localTargetKey(compareMode: CompareMode, leftPath: string, rightPath: string) {
  return `${compareMode}:${normalizePathKey(leftPath)}:${normalizePathKey(rightPath)}`
}

function githubPullRequestKey(owner: string, repo: string, pullNumber: number) {
  return `${owner.trim().toLowerCase()}/${repo.trim().toLowerCase()}#${pullNumber}`
}

function gitRepositoryId(key: string) {
  return `git:${hashKey(key)}`
}

function githubPullRequestId(owner: string, repo: string, pullNumber: number) {
  return `github:${githubPullRequestKey(owner, repo, pullNumber)}`
}

function githubCompareKey(
  owner: string,
  repo: string,
  baseRef: string,
  headRef: string,
  notation: 'twoDot' | 'threeDot',
) {
  // Refs stay case-sensitive: GitHub branch and tag names are.
  return `${owner.trim().toLowerCase()}/${repo.trim().toLowerCase()}:${notation}:${baseRef}:${headRef}`
}

function githubCompareId(key: string) {
  return `githubCompare:${hashKey(key)}`
}

function localTargetId(key: string) {
  return `local:${hashKey(key)}`
}

function hashKey(key: string) {
  return createHash('sha256').update(key).digest('hex').slice(0, 16)
}

function inferLastBranch(source: Extract<DiffSource, { kind: 'git' }>) {
  return source.selection.kind === 'refRange' ? source.selection.headRef : null
}

function readMetadataString(metadata: unknown, key: string) {
  if (!isRecord(metadata)) {
    return null
  }

  return normalizeRequiredString(metadata[key])
}

function readMetadataNullableString(metadata: unknown, key: string) {
  if (!isRecord(metadata)) {
    return undefined
  }

  if (!(key in metadata)) {
    return undefined
  }

  const value = metadata[key]
  if (value === null) {
    return null
  }

  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeRequiredString(value: unknown) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

function normalizeNullableString(value: unknown) {
  if (value === null) {
    return null
  }

  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeSetupMode(value: unknown): SetupMode {
  return value === 'git' || value === 'github' || value === 'local'
    ? value
    : 'local'
}

function normalizeCompareMode(value: unknown): CompareMode | null {
  return value === 'file' || value === 'directory' ? value : null
}

function normalizeCompareNotation(value: unknown): 'twoDot' | 'threeDot' | null {
  return value === 'twoDot' || value === 'threeDot' ? value : null
}

function normalizePositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function createDefaultRecentSources(): RecentSources {
  return {
    defaultSetupMode: 'local',
    gitRepositories: [],
    githubPullRequests: [],
    githubCompares: [],
    localTargets: [],
  }
}

function recentsPath() {
  return join(app.getPath('userData'), 'recent-sources.json')
}

function validateRecentSourcesSize(byteLength: number) {
  if (byteLength > MAX_RECENT_SOURCES_BYTES) {
    throw new Error('Recent sources are too large to load safely.')
  }
}
