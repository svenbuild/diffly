// The parser lives in src/lib so the renderer can parse PR URLs live while
// typing; this re-export keeps the backend import path conventional.
export {
  parseGithubDiffUrl,
  parseGithubPullRequestUrl,
} from '../../../src/lib/github/github-url'
