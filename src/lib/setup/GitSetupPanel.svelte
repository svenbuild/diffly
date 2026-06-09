<script lang="ts">
  import { onMount } from 'svelte'
  import RecentSourceList from './RecentSourceList.svelte'
  import GitRepositoryPicker from './GitRepositoryPicker.svelte'
  import { listGitRefs, loadRecentSources, validateGitRepository } from '../api'
  import type {
    GitDiffSource,
    GitRefsResponse,
    GitSelection,
    GitWorkingTreeScope,
    PersistedGitSetup,
    PersistedGitSetupBrowser,
    RecentGitRepository,
  } from '../types'

  type SelectionKind = 'workingTree' | 'refRange' | 'commit'
  type Notation = 'twoDot' | 'threeDot'

  // Emits the constructed Git source (or null when the current setup cannot
  // produce a valid one) so the parent can drive the Compare button.
  export let onChange: (source: GitDiffSource | null) => void = () => {}
  export let gitSetup: PersistedGitSetup = {}
  export let onSetupChange: (setup: PersistedGitSetup) => void = () => {}
  // Bumped by the parent after a recent repository is added (e.g. on Compare)
  // so this panel reloads the list without waiting for a remount.
  export let reloadRecentsRequestId = 0

  // GitSetupState — this panel is the single source of truth for Git setup.
  let inputPath = ''
  let repositoryRoot = ''
  let validationStatus: 'idle' | 'validating' | 'valid' | 'invalid' = 'idle'
  let validationError = ''
  let currentBranch = ''
  let headSha = ''
  let refsStatus: 'idle' | 'loading' | 'loaded' | 'error' = 'idle'
  let refsError = ''
  let gitRefs: GitRefsResponse | null = null
  let refsRequestToken = 0
  let refsDefaultsPath = ''
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

  let lastReloadRecentsRequestId = reloadRecentsRequestId

  async function loadRecents() {
    try {
      const recents = await loadRecentSources()
      recentRepositories = recents.gitRepositories ?? []
      recentLoadError = false
    } catch {
      recentLoadError = true
    }
  }

  onMount(loadRecents)

  // Reload when the parent signals a new recent was added (bumped on Compare).
  $: if (reloadRecentsRequestId !== lastReloadRecentsRequestId) {
    lastReloadRecentsRequestId = reloadRecentsRequestId
    void loadRecents()
  }

  function clearValidation() {
    validationStatus = 'idle'
    validationError = ''
    repositoryRoot = ''
    currentBranch = ''
    headSha = ''
    validatedPath = ''
    clearRefs()
  }

  function clearRefs() {
    refsRequestToken += 1
    refsStatus = 'idle'
    refsError = ''
    gitRefs = null
    refsDefaultsPath = ''
    baseRef = ''
    headRef = ''
    commitRef = ''
  }

  function invalidateRefsForValidation(nextPath: string) {
    refsRequestToken += 1
    refsStatus = 'idle'
    refsError = ''
    gitRefs = null

    if (nextPath !== validatedPath && nextPath !== repositoryRoot) {
      refsDefaultsPath = ''
      baseRef = ''
      headRef = ''
      commitRef = ''
    }
  }

  async function validate(path: string) {
    const trimmed = path.trim()

    if (trimmed === '') {
      requestToken += 1
      clearValidation()
      return
    }

    const token = (requestToken += 1)
    invalidateRefsForValidation(trimmed)
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
        void loadRefs(repositoryRoot)
      } else {
        repositoryRoot = ''
        currentBranch = ''
        headSha = ''
        clearRefs()
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
      clearRefs()
      validationError = 'This folder is not a Git repository.'
      validationStatus = 'invalid'
    }
  }

  async function loadRefs(root: string) {
    if (!root) {
      clearRefs()
      return
    }

    const token = (refsRequestToken += 1)
    refsStatus = 'loading'
    refsError = ''
    gitRefs = null

    try {
      const refs = await listGitRefs(root)
      if (token !== refsRequestToken || repositoryRoot !== root) {
        return
      }

      gitRefs = refs
      currentBranch = refs.currentBranch ?? ''
      headSha = refs.headSha ?? ''
      refsStatus = 'loaded'
      applyRefDefaults(root, refs)
    } catch {
      if (token !== refsRequestToken || repositoryRoot !== root) {
        return
      }

      gitRefs = null
      refsError = 'Refs could not be loaded.'
      refsStatus = 'error'
    }
  }

  function applyRefDefaults(root: string, refs: GitRefsResponse) {
    if (refsDefaultsPath === root) {
      return
    }

    const defaultHeadRef = refs.currentBranch
      ?? refs.headSha
      ?? refs.localBranches[0]?.name
      ?? refs.remoteBranches[0]?.name
      ?? ''
    const defaultBaseRef = refs.localBranches.find((ref) => ref.name === 'main')?.name
      ?? refs.localBranches.find((ref) => ref.name === 'master')?.name
      ?? refs.localBranches.find((ref) => ref.name !== defaultHeadRef)?.name
      ?? refs.remoteBranches.find((ref) => ref.name !== defaultHeadRef)?.name
      ?? ''
    const defaultCommitRef = refs.recentCommits[0]?.sha ?? refs.headSha ?? ''

    headRef = defaultHeadRef
    baseRef = defaultBaseRef
    commitRef = defaultCommitRef
    refsDefaultsPath = root
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

  function handleBrowserStateChange(browser: PersistedGitSetupBrowser) {
    onSetupChange({
      ...gitSetup,
      browser,
    })
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

  // Build the Git source from the current setup state. Returns null whenever the
  // setup cannot yield a valid source (no validated repo, or an incomplete
  // ref/commit selection). The inlined IIFE references every dependency directly
  // so Svelte tracks them all and re-emits on any change.
  $: gitSource = ((): GitDiffSource | null => {
    if (validationStatus !== 'valid' || !repositoryRoot || !validatedPath) {
      return null
    }

    let selection: GitSelection | null = null
    if (selectionKind === 'workingTree') {
      selection = {
        kind: 'workingTree',
        initialScope: workingTreeScope,
        currentBranch: currentBranch.trim() || null,
      }
    } else if (selectionKind === 'refRange') {
      if (baseRef.trim() && headRef.trim()) {
        selection = {
          kind: 'refRange',
          baseRef: baseRef.trim(),
          headRef: headRef.trim(),
          notation,
        }
      }
    } else if (commitRef.trim()) {
      selection = { kind: 'commit', commitRef: commitRef.trim() }
    }

    return selection
      ? { kind: 'git', repoPath: validatedPath, repositoryRoot, selection }
      : null
  })()
  $: onChange(gitSource)
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
    {refsStatus}
    {refsError}
    {gitRefs}
    {selectionKind}
    {workingTreeScope}
    {baseRef}
    {headRef}
    {notation}
    {commitRef}
    onSelectRepo={handleSelectRepo}
    initialBrowserState={gitSetup.browser}
    onBrowserStateChange={handleBrowserStateChange}
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
