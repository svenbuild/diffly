<script lang="ts">
  import { onMount } from 'svelte'
  import RecentSourceList from './RecentSourceList.svelte'
  import GitRepositoryPicker from './GitRepositoryPicker.svelte'
  import {
    choosePath,
    getDroppedFilePath,
    listGitRefs,
    loadRecentSources,
    validateGitRepository,
  } from '../api'
  import { markStartupProfile } from '../app/startup-profile'
  import { compactMiddlePath } from '../path-utils'
  import { createAdvancedGitSource, createWorkingTreeSource } from './git-setup-source'
  import type {
    GitDiffSource,
    GitRefsResponse,
    GitSelection,
    RecentGitRepository,
  } from '../types'

  type SelectionKind = 'refRange' | 'commit'
  type Notation = 'twoDot' | 'threeDot'

  export let onOpenSource: (source: GitDiffSource) => void | Promise<void>
  export let loading = false
  export let reloadRecentsRequestId = 0

  let advancedOpen = false
  let inputPath = ''
  let repositoryRoot = ''
  let validationStatus: 'idle' | 'validating' | 'valid' | 'invalid' = 'idle'
  let validationError = ''
  let currentBranch = ''
  let headSha = ''
  let refsStatus: 'idle' | 'loading' | 'loaded' | 'error' = 'idle'
  let refsError = ''
  let gitRefs: GitRefsResponse | null = null
  let selectionKind: SelectionKind = 'refRange'
  let baseRef = ''
  let headRef = ''
  let notation: Notation = 'threeDot'
  let commitRef = ''
  let requestToken = 0
  let refsRequestToken = 0
  let openingPath = ''
  let dropActive = false

  let recentRepositories: RecentGitRepository[] = []
  let recentLoadError = false
  let lastReloadRecentsRequestId = reloadRecentsRequestId

  async function loadRecents() {
    markStartupProfile('git-recents-load-start')
    try {
      const recents = await loadRecentSources()
      recentRepositories = recents.gitRepositories ?? []
      recentLoadError = false
    } catch {
      recentLoadError = true
    } finally {
      markStartupProfile('git-recents-load-finished', {
        items: recentRepositories.length,
      })
    }
  }

  onMount(() => {
    markStartupProfile('git-setup-mounted')
    void loadRecents()
  })

  $: if (reloadRecentsRequestId !== lastReloadRecentsRequestId) {
    lastReloadRecentsRequestId = reloadRecentsRequestId
    void loadRecents()
  }

  function resetValidation(path: string) {
    requestToken += 1
    refsRequestToken += 1
    inputPath = path
    repositoryRoot = ''
    validationStatus = 'idle'
    validationError = ''
    currentBranch = ''
    headSha = ''
    refsStatus = 'idle'
    refsError = ''
    gitRefs = null
    baseRef = ''
    headRef = ''
    commitRef = ''
  }

  function handleInputPathChange(value: string) {
    resetValidation(value)
  }

  async function validate(path: string, loadRefsAfterValidation: boolean) {
    const trimmed = path.trim()
    if (!trimmed) {
      resetValidation('')
      return null
    }

    const token = (requestToken += 1)
    inputPath = trimmed
    validationStatus = 'validating'
    validationError = ''
    refsRequestToken += 1
    refsStatus = 'idle'
    gitRefs = null

    try {
      const result = await validateGitRepository(trimmed)
      if (token !== requestToken || inputPath.trim() !== trimmed) {
        return null
      }

      if (!result.valid || !result.repositoryRoot) {
        repositoryRoot = ''
        currentBranch = ''
        headSha = ''
        validationStatus = 'invalid'
        validationError = result.error || 'This folder is not a Git repository.'
        return null
      }

      repositoryRoot = result.repositoryRoot
      currentBranch = result.currentBranch ?? ''
      headSha = result.headSha ?? ''
      validationStatus = 'valid'
      validationError = ''

      if (loadRefsAfterValidation) {
        void loadRefs(result.repositoryRoot)
      }
      return result
    } catch {
      if (token !== requestToken || inputPath.trim() !== trimmed) {
        return null
      }
      repositoryRoot = ''
      currentBranch = ''
      headSha = ''
      validationStatus = 'invalid'
      validationError = 'This folder is not a Git repository.'
      return null
    }
  }

  async function loadRefs(root: string) {
    const token = (refsRequestToken += 1)
    refsStatus = 'loading'
    refsError = ''

    try {
      const refs = await listGitRefs(root)
      if (token !== refsRequestToken || repositoryRoot !== root) {
        return
      }
      gitRefs = refs
      currentBranch = refs.currentBranch ?? currentBranch
      headSha = refs.headSha ?? headSha
      refsStatus = 'loaded'
      applyRefDefaults(refs)
    } catch {
      if (token !== refsRequestToken || repositoryRoot !== root) {
        return
      }
      gitRefs = null
      refsStatus = 'error'
      refsError = 'Refs could not be loaded.'
    }
  }

  function applyRefDefaults(refs: GitRefsResponse) {
    const defaultHead = refs.currentBranch
      ?? refs.headSha
      ?? refs.localBranches[0]?.name
      ?? refs.remoteBranches[0]?.name
      ?? ''
    headRef = defaultHead
    baseRef = refs.localBranches.find((ref) => ref.name === 'main' && ref.name !== defaultHead)?.name
      ?? refs.localBranches.find((ref) => ref.name === 'master' && ref.name !== defaultHead)?.name
      ?? refs.localBranches.find((ref) => ref.name !== defaultHead)?.name
      ?? refs.remoteBranches.find((ref) => ref.name !== defaultHead)?.name
      ?? ''
    commitRef = refs.recentCommits[0]?.sha ?? refs.headSha ?? ''
  }

  async function openWorkingTree(path: string) {
    if (loading || openingPath) {
      return
    }
    openingPath = path
    try {
      const result = await validate(path, false)
      if (result?.valid && result.repositoryRoot) {
        await onOpenSource(createWorkingTreeSource(
          path.trim(),
          result.repositoryRoot,
          result.currentBranch ?? null,
        ))
      }
    } finally {
      openingPath = ''
    }
  }

  async function browseDefaultRepository() {
    const selected = await choosePath('directory')
    if (selected) {
      await openWorkingTree(selected)
    }
  }

  async function browseAdvancedRepository() {
    const selected = await choosePath('directory')
    if (!selected) {
      return
    }
    resetValidation(selected)
    await validate(selected, true)
  }

  async function validateAdvancedRepository() {
    await validate(inputPath, true)
  }

  function handleSelectRecent(id: string) {
    const recent = recentRepositories.find((entry) => entry.id === id)
    if (recent) {
      void openWorkingTree(recent.repoPath)
    }
  }

  async function handleDrop(event: DragEvent) {
    event.preventDefault()
    dropActive = false
    const file = event.dataTransfer?.files[0]
    if (!file) {
      return
    }
    const path = getDroppedFilePath(file)
    if (path) {
      await openWorkingTree(path)
    }
  }

  async function openAdvancedDiff() {
    if (validationStatus !== 'valid' || !repositoryRoot || loading) {
      return
    }

    let selection: GitSelection | null = null
    if (selectionKind === 'refRange' && baseRef.trim() && headRef.trim()) {
      selection = {
        kind: 'refRange',
        baseRef: baseRef.trim(),
        headRef: headRef.trim(),
        notation,
      }
    } else if (selectionKind === 'commit' && commitRef.trim()) {
      selection = { kind: 'commit', commitRef: commitRef.trim() }
    }

    if (selection) {
      await onOpenSource(createAdvancedGitSource(
        inputPath.trim(),
        repositoryRoot,
        selection,
      ))
    }
  }

  $: recentItems = recentRepositories.map((repo) => ({
    id: repo.id,
    name: repo.name,
    detail: compactMiddlePath(repo.repoPath),
    detailTitle: repo.repoPath,
    extra: repo.lastBranch,
  }))
</script>

<section class="git-setup" aria-label="Git compare setup">
  <div class="git-setup-content">
    <header>
      <h1>Git</h1>
      <p>Open a repository to review its changes.</p>
    </header>

    {#if !advancedOpen}
      <div
        class="git-open-area"
        class:drop-active={dropActive}
        role="group"
        aria-label="Open or drop a Git repository"
        on:dragenter|preventDefault={() => (dropActive = true)}
        on:dragover|preventDefault={() => (dropActive = true)}
        on:dragleave={() => (dropActive = false)}
        on:drop={handleDrop}
      >
        <button
          class="primary open-repository-button"
          type="button"
          disabled={loading || Boolean(openingPath)}
          on:click={browseDefaultRepository}
        >
          {openingPath ? 'Opening repository…' : 'Open Git repository…'}
        </button>
        <span>or drop a repository folder here</span>
      </div>

      {#if validationStatus === 'invalid'}
        <div class="git-open-error" role="alert">
          <strong>! {validationError || 'This folder is not a Git repository.'}</strong>
          <button class="secondary" type="button" on:click={browseDefaultRepository}>
            Choose another folder
          </button>
        </div>
      {/if}

      <RecentSourceList
        title="Recent repositories"
        items={recentItems}
        loadError={recentLoadError}
        loadErrorMessage="Recent repositories could not be loaded."
        emptyMessage="No recent repositories"
        activeId=""
        onSelect={handleSelectRecent}
      />

      <button class="advanced-toggle" type="button" on:click={() => (advancedOpen = true)}>
        Advanced compare…
      </button>
    {:else}
      <button class="advanced-back" type="button" on:click={() => (advancedOpen = false)}>
        ← Back to repositories
      </button>
      <GitRepositoryPicker
        {inputPath}
        {validationStatus}
        {validationError}
        {repositoryRoot}
        {currentBranch}
        {headSha}
        {refsStatus}
        {refsError}
        {gitRefs}
        {selectionKind}
        {baseRef}
        {headRef}
        {notation}
        {commitRef}
        {loading}
        onInputPathChange={handleInputPathChange}
        onBrowse={browseAdvancedRepository}
        onValidate={validateAdvancedRepository}
        onSelectionKindChange={(value) => (selectionKind = value)}
        onBaseRefChange={(value) => (baseRef = value)}
        onHeadRefChange={(value) => (headRef = value)}
        onNotationChange={(value) => (notation = value)}
        onCommitRefChange={(value) => (commitRef = value)}
        onOpen={openAdvancedDiff}
      />
    {/if}
  </div>
</section>

<style>
  .git-setup {
    min-height: 0;
    height: 100%;
    overflow-y: auto;
  }

  .git-setup-content {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 18px;
    width: min(760px, 100%);
    margin: 0 auto;
    padding: 30px 12px;
  }

  header {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  h1,
  p {
    margin: 0;
  }

  h1 {
    color: var(--title);
    font-size: 20px;
  }

  header p {
    color: var(--muted);
    font-size: 13px;
  }

  .git-open-area {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 9px;
    width: 100%;
    padding: 20px;
    border: 1px dashed var(--border-strong);
    border-radius: 8px;
    transition: border-color 100ms ease, background 100ms ease;
  }

  .git-open-area.drop-active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }

  .git-open-area span {
    color: var(--muted);
    font-size: 12px;
  }

  .open-repository-button {
    min-width: 190px;
  }

  .git-open-error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--danger) 45%, var(--border));
    border-radius: 7px;
    color: var(--danger);
    font-size: 12px;
  }

  .git-setup-content > :global(.git-setup-recent) {
    width: 100%;
    max-height: 310px;
  }

  .advanced-toggle,
  .advanced-back {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--accent);
    font-size: 12px;
    text-align: left;
  }

  .advanced-toggle:hover,
  .advanced-back:hover {
    text-decoration: underline;
  }

  @media (max-width: 620px) {
    .git-setup-content {
      padding-top: 18px;
    }

    .git-open-error {
      align-items: flex-start;
      flex-direction: column;
    }
  }
</style>
