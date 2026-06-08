<script lang="ts">
  import { onMount } from 'svelte'
  import RecentSourceList from './RecentSourceList.svelte'
  import GitRepositoryPicker from './GitRepositoryPicker.svelte'
  import { loadRecentSources, validateGitRepository } from '../api'
  import type { GitWorkingTreeScope, RecentGitRepository } from '../types'

  type SelectionKind = 'workingTree' | 'refRange' | 'commit'
  type Notation = 'twoDot' | 'threeDot'

  // GitSetupState — this panel is the single source of truth for Git setup.
  let inputPath = ''
  let repositoryRoot = ''
  let validationStatus: 'idle' | 'validating' | 'valid' | 'invalid' = 'idle'
  let validationError = ''
  let currentBranch = ''
  let headSha = ''
  let selectionKind: SelectionKind = 'workingTree'
  let workingTreeScope: GitWorkingTreeScope = 'all'
  let baseRef = ''
  let headRef = ''
  let notation: Notation = 'twoDot'
  let commitRef = ''

  let recentRepositories: RecentGitRepository[] = []
  let recentLoadError = false

  // Reveal trigger for the browser: bumped when a repo is chosen from the recents
  // list so the browser navigates to that repo's parent folder and shows it.
  let revealPath = ''
  let revealRequestId = 0

  // Monotonic token used to discard stale validation responses. Any newer
  // validation (or a cleared path) bumps it so an older in-flight result can no
  // longer write back a status for a path the user has moved on from.
  let requestToken = 0
  // The path whose validation result is currently reflected in the status block.
  let validatedPath = ''

  onMount(async () => {
    try {
      const recents = await loadRecentSources()
      recentRepositories = recents.gitRepositories ?? []
    } catch {
      recentLoadError = true
    }
  })

  function clearValidation() {
    validationStatus = 'idle'
    validationError = ''
    repositoryRoot = ''
    currentBranch = ''
    headSha = ''
    validatedPath = ''
  }

  async function validate(path: string) {
    const trimmed = path.trim()

    if (trimmed === '') {
      requestToken += 1
      clearValidation()
      return
    }

    const token = (requestToken += 1)
    validationStatus = 'validating'

    try {
      const result = await validateGitRepository(trimmed)
      // Discard if a newer request started or the input no longer matches the
      // path we validated (the user edited it while this was in flight).
      if (token !== requestToken || inputPath.trim() !== trimmed) {
        return
      }
      validatedPath = trimmed
      if (result.valid) {
        repositoryRoot = result.repositoryRoot ?? ''
        currentBranch = result.currentBranch ?? ''
        headSha = result.headSha ?? ''
        validationError = ''
        validationStatus = 'valid'
      } else {
        repositoryRoot = ''
        currentBranch = ''
        headSha = ''
        validationError = result.error ?? 'This folder is not a Git repository.'
        validationStatus = 'invalid'
      }
    } catch {
      if (token !== requestToken || inputPath.trim() !== trimmed) {
        return
      }
      validatedPath = trimmed
      repositoryRoot = ''
      currentBranch = ''
      headSha = ''
      validationError = 'This folder is not a Git repository.'
      validationStatus = 'invalid'
    }
  }

  // Selected from the browser (the repo is already visible there).
  function handleSelectRepo(path: string) {
    inputPath = path
    void validate(path)
  }

  // Selected from the recents list: validate and ask the browser to reveal it.
  function handleSelectRecent(repo: RecentGitRepository) {
    inputPath = repo.repoPath
    revealPath = repo.repoPath
    revealRequestId += 1
    void validate(repo.repoPath)
  }

  function handleSelectionKindChange(kind: SelectionKind) {
    selectionKind = kind
  }

  function handleScopeChange(scope: GitWorkingTreeScope) {
    workingTreeScope = scope
  }

  function handleBaseRefChange(value: string) {
    baseRef = value
  }

  function handleHeadRefChange(value: string) {
    headRef = value
  }

  function handleNotationChange(value: Notation) {
    notation = value
  }

  function handleCommitRefChange(value: string) {
    commitRef = value
  }
</script>

<section class="git-setup-workspace" aria-label="Git compare setup">
  <RecentSourceList
    title="Recent Git repositories"
    repositories={recentRepositories}
    loadError={recentLoadError}
    activePath={inputPath}
    onSelect={handleSelectRecent}
  />

  <GitRepositoryPicker
    selectedRepoPath={validationStatus === 'valid' ? validatedPath : ''}
    {revealPath}
    {revealRequestId}
    {validationStatus}
    {validationError}
    {repositoryRoot}
    {currentBranch}
    {headSha}
    {selectionKind}
    {workingTreeScope}
    {baseRef}
    {headRef}
    {notation}
    {commitRef}
    onSelectRepo={handleSelectRepo}
    onSelectionKindChange={handleSelectionKindChange}
    onScopeChange={handleScopeChange}
    onBaseRefChange={handleBaseRefChange}
    onHeadRefChange={handleHeadRefChange}
    onNotationChange={handleNotationChange}
    onCommitRefChange={handleCommitRefChange}
  />
</section>

<style>
  .git-setup-workspace {
    display: grid;
    grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
    gap: 10px;
    min-height: 0;
    height: 100%;
    width: 100%;
    overflow: hidden;
  }
</style>
