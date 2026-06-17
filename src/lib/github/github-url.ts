import type {
  GithubCompareSource,
  GithubCommitSource,
  GithubDiffSource,
  GithubPullRequestSource,
} from '../types'

// Parses GitHub diff URLs. Shared between the renderer (live input parsing in
// the GitHub setup panel) and the main process (request building), so both
// sides accept exactly the same inputs.

// owner: GitHub usernames/orgs: alphanumeric and hyphens, no leading/trailing
// hyphen enforcement is left to GitHub; repo: alphanumeric plus ._-
const PULL_REQUEST_PATH_PATTERN =
  /^\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)\/pull\/([0-9]+)(?:\.(?:diff|patch))?(?:\/[A-Za-z0-9._-]*)*\/?$/
const PULL_REQUEST_COMMIT_PATH_PATTERN =
  /^\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)\/pull\/[0-9]+\/commits\/([0-9a-fA-F]{7,40})(?:\.(?:diff|patch))?\/?$/
const COMPARE_PATH_PATTERN =
  /^\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)\/compare\/(.+?)\/?$/
const COMMIT_PATH_PATTERN =
  /^\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)\/commit\/([0-9a-fA-F]{7,40})(?:\.(?:diff|patch))?\/?$/
const COMPARE_NOTATION_PATTERN = /^(.+?)(\.\.\.?)(.+)$/
const RAW_DIFF_EXTENSION_PATTERN = /\.(?:diff|patch)$/i

const ACCEPTED_HOSTS = new Set(['github.com', 'www.github.com'])

export function parseGithubPullRequestUrl(input: string): GithubPullRequestSource | null {
  const source = parseGithubDiffUrl(input)
  return source?.kind === 'githubPullRequest' ? source : null
}

export function parseGithubDiffUrl(input: string): GithubDiffSource | null {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }

  // Accept bare "github.com/..." inputs by assuming https.
  const withScheme = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null
  }

  if (!ACCEPTED_HOSTS.has(url.hostname.toLowerCase()) || url.port) {
    return null
  }

  const pullRequestCommitSource = parsePullRequestCommitPath(url.pathname)
  if (pullRequestCommitSource) {
    return pullRequestCommitSource
  }

  const compareSource = parseComparePath(url.pathname)
  if (compareSource) {
    return compareSource
  }

  const commitSource = parseCommitPath(url.pathname)
  if (commitSource) {
    return commitSource
  }

  return parsePullRequestPath(url.pathname)
}

function parsePullRequestPath(pathname: string): GithubPullRequestSource | null {
  const match = PULL_REQUEST_PATH_PATTERN.exec(pathname)
  if (!match) {
    return null
  }

  const owner = match[1]
  const repo = normalizeRepoName(match[2])
  const pullNumber = Number.parseInt(match[3], 10)
  if (!repo || !Number.isInteger(pullNumber) || pullNumber <= 0) {
    return null
  }

  return {
    kind: 'githubPullRequest',
    owner,
    repo,
    pullNumber,
    url: `https://github.com/${owner}/${repo}/pull/${pullNumber}`,
  }
}

function parseComparePath(pathname: string): GithubCompareSource | null {
  const match = COMPARE_PATH_PATTERN.exec(pathname)
  if (!match) {
    return null
  }

  const owner = match[1]
  const repo = normalizeRepoName(match[2])
  const comparison = stripRawDiffExtension(match[3])
  const comparisonMatch = COMPARE_NOTATION_PATTERN.exec(comparison)
  if (!repo || !comparisonMatch) {
    return null
  }

  const baseRef = decodeRef(comparisonMatch[1])
  const headRef = decodeRef(comparisonMatch[3])
  if (!baseRef || !headRef) {
    return null
  }

  const notation = comparisonMatch[2] === '...'
    ? 'threeDot'
    : 'twoDot'
  const dots = notation === 'threeDot' ? '...' : '..'

  return {
    kind: 'githubCompare',
    owner,
    repo,
    baseRef,
    headRef,
    notation,
    url: `https://github.com/${owner}/${repo}/compare/${baseRef}${dots}${headRef}`,
  }
}

function parsePullRequestCommitPath(pathname: string): GithubCommitSource | null {
  const match = PULL_REQUEST_COMMIT_PATH_PATTERN.exec(pathname)
  if (!match) {
    return null
  }

  const owner = match[1]
  const repo = normalizeRepoName(match[2])
  const commitRef = match[3]
  if (!repo) {
    return null
  }

  return {
    kind: 'githubCommit',
    owner,
    repo,
    commitRef,
    url: `https://github.com/${owner}/${repo}/commit/${commitRef}`,
  }
}

function parseCommitPath(pathname: string): GithubCommitSource | null {
  const match = COMMIT_PATH_PATTERN.exec(pathname)
  if (!match) {
    return null
  }

  const owner = match[1]
  const repo = normalizeRepoName(match[2])
  const commitRef = match[3]
  if (!repo) {
    return null
  }

  return {
    kind: 'githubCommit',
    owner,
    repo,
    commitRef,
    url: `https://github.com/${owner}/${repo}/commit/${commitRef}`,
  }
}

function normalizeRepoName(repo: string) {
  // GitHub serves "repo.git" as "repo"; never produce a trailing ".git" repo.
  const normalized = repo.endsWith('.git') ? repo.slice(0, -4) : repo
  if (!normalized || normalized === '.' || normalized === '..') {
    return null
  }

  return normalized
}

function stripRawDiffExtension(value: string) {
  return value.replace(RAW_DIFF_EXTENSION_PATTERN, '')
}

function decodeRef(value: string) {
  try {
    return decodeURIComponent(value).trim()
  } catch {
    return ''
  }
}
