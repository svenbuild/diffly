import type { GithubPullRequestSource } from '../types'

// Parses GitHub pull request URLs. Shared between the renderer (live input
// parsing in the GitHub setup panel) and the main process (request building),
// so both sides accept exactly the same inputs.

// owner: GitHub usernames/orgs — alphanumeric and hyphens, no leading/trailing
// hyphen enforcement is left to GitHub; repo: alphanumeric plus ._-
const PULL_REQUEST_PATH_PATTERN =
  /^\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)\/pull\/([0-9]+)(?:\/[A-Za-z0-9._-]*)*\/?$/

const ACCEPTED_HOSTS = new Set(['github.com', 'www.github.com'])

export function parseGithubPullRequestUrl(input: string): GithubPullRequestSource | null {
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

  const match = PULL_REQUEST_PATH_PATTERN.exec(url.pathname)
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

function normalizeRepoName(repo: string) {
  // GitHub serves "repo.git" as "repo"; never produce a trailing ".git" repo.
  const normalized = repo.endsWith('.git') ? repo.slice(0, -4) : repo
  if (!normalized || normalized === '.' || normalized === '..') {
    return null
  }

  return normalized
}
