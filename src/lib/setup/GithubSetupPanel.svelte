<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte'
  import GithubCompareInput from './GithubCompareInput.svelte'
  import GithubPrInput from './GithubPrInput.svelte'
  import RecentSourceList from './RecentSourceList.svelte'
  import { fetchGithubPullRequestMetadata, loadRecentSources } from '../api'
  import { notationDots } from '../compare/source-header-labels'
  import { parseGithubDiffUrl } from '../github/github-url'
  import type {
    GithubDiffSource,
    GithubPullRequestMetadata,
    GithubPullRequestSource,
    RecentGithubCompare,
    RecentGithubPullRequest,
  } from '../types'

  const METADATA_DEBOUNCE_MS = 400

  type GithubTab = 'pull' | 'compare'

  // Emits the parsed GitHub diff source (or null while the URL is not parseable)
  // so the parent can drive the Compare button.
  export let onChange: (source: GithubDiffSource | null) => void = () => {}
  // Latest successfully loaded metadata for the currently parsed PR, used by
  // the parent to store the PR title with the recent entry.
  export let onMetadataChange: (metadata: GithubPullRequestMetadata | null) => void = () => {}
  // Bumped by the parent after a recent source is added (e.g. on Compare) so
  // this panel reloads the list without waiting for a remount.
  export let reloadRecentsRequestId = 0
  // Prefill for the URL input (e.g. the restored session's GitHub source).
  export let initialUrl = ''

  // Each tab keeps its own URL so switching tabs never loses typed input.
  let activeTab: GithubTab = 'pull'
  let prUrl = ''
  let compareUrl = ''

  {
    const initialParsed = parseGithubDiffUrl(initialUrl)
    if (initialParsed?.kind === 'githubCompare') {
      activeTab = 'compare'
      compareUrl = initialUrl
    } else {
      prUrl = initialUrl
    }
  }

  let pullTabButton: HTMLButtonElement | null = null
  let compareTabButton: HTMLButtonElement | null = null

  let metadataStatus: 'idle' | 'loading' | 'loaded' | 'error' = 'idle'
  let metadata: GithubPullRequestMetadata | null = null
  let metadataError = ''
  // Canonical URL of the PR the current metadata state belongs to. Newer
  // parses invalidate older in-flight fetches.
  let metadataUrl = ''
  let metadataRequestToken = 0
  let metadataDebounceTimer: number | null = null

  let recentPullRequests: RecentGithubPullRequest[] = []
  let recentCompares: RecentGithubCompare[] = []
  let recentLoadError = false
  let lastReloadRecentsRequestId = reloadRecentsRequestId

  async function loadRecents() {
    try {
      const recents = await loadRecentSources()
      recentPullRequests = recents.githubPullRequests ?? []
      recentCompares = recents.githubCompares ?? []
      recentLoadError = false
    } catch {
      recentLoadError = true
    }
  }

  onMount(loadRecents)

  onDestroy(() => {
    if (metadataDebounceTimer !== null) {
      window.clearTimeout(metadataDebounceTimer)
    }
  })

  $: if (reloadRecentsRequestId !== lastReloadRecentsRequestId) {
    lastReloadRecentsRequestId = reloadRecentsRequestId
    void loadRecents()
  }

  function selectTab(tab: GithubTab) {
    activeTab = tab
  }

  async function selectTabAndFocusInput(tab: GithubTab) {
    activeTab = tab
    await tick()
    const inputId = tab === 'pull' ? 'github-pr-url' : 'github-compare-url'
    const input = document.getElementById(inputId)
    if (input instanceof HTMLInputElement) {
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
    }
  }

  // Arrow-key navigation between the two tabs; selection follows focus.
  async function handleTabKeydown(event: KeyboardEvent) {
    let next: GithubTab | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = activeTab === 'pull' ? 'compare' : 'pull'
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = activeTab === 'pull' ? 'compare' : 'pull'
    } else if (event.key === 'Home') {
      next = 'pull'
    } else if (event.key === 'End') {
      next = 'compare'
    }

    if (next === null || next === activeTab) {
      return
    }

    event.preventDefault()
    activeTab = next
    await tick()
    const button = next === 'pull' ? pullTabButton : compareTabButton
    button?.focus()
  }

  // Pasting a URL of the other kind routes to the matching tab instead of
  // showing an "invalid URL" error in the wrong one.
  function handlePrInput(value: string) {
    const source = parseGithubDiffUrl(value)
    if (source?.kind === 'githubCompare') {
      compareUrl = value
      void selectTabAndFocusInput('compare')
      return
    }
    prUrl = value
  }

  function handleCompareInput(value: string) {
    const source = parseGithubDiffUrl(value)
    if (source?.kind === 'githubPullRequest') {
      prUrl = value
      void selectTabAndFocusInput('pull')
      return
    }
    compareUrl = value
  }

  function handleSelectRecent(id: string) {
    const recentPr = recentPullRequests.find((entry) => entry.id === id)
    if (recentPr) {
      prUrl = recentPr.url
      void selectTabAndFocusInput('pull')
      return
    }

    const recentCompare = recentCompares.find((entry) => entry.id === id)
    if (recentCompare) {
      compareUrl = recentCompare.url
      void selectTabAndFocusInput('compare')
    }
  }

  // Live parse drives both the Compare button and the metadata preview. Each
  // tab only accepts its own URL kind; cross-kind pastes are routed above.
  $: prParsedRaw = parseGithubDiffUrl(prUrl)
  $: prParsed = prParsedRaw?.kind === 'githubPullRequest' ? prParsedRaw : null
  $: compareParsedRaw = parseGithubDiffUrl(compareUrl)
  $: compareParsed = compareParsedRaw?.kind === 'githubCompare' ? compareParsedRaw : null
  $: parsed = activeTab === 'pull' ? prParsed : compareParsed
  $: onChange(parsed)
  $: scheduleMetadataLoad(parsed)
  $: onMetadataChange(metadataStatus === 'loaded' ? metadata : null)

  function scheduleMetadataLoad(source: GithubDiffSource | null) {
    if (metadataDebounceTimer !== null) {
      window.clearTimeout(metadataDebounceTimer)
      metadataDebounceTimer = null
    }

    if (!source || source.kind !== 'githubPullRequest') {
      metadataRequestToken += 1
      metadataStatus = 'idle'
      metadata = null
      metadataError = ''
      metadataUrl = ''
      return
    }

    if (source.url === metadataUrl && metadataStatus !== 'idle') {
      return
    }

    metadataRequestToken += 1
    metadataStatus = 'loading'
    metadata = null
    metadataError = ''
    metadataUrl = source.url

    const token = metadataRequestToken
    metadataDebounceTimer = window.setTimeout(() => {
      metadataDebounceTimer = null
      void loadMetadata(source, token)
    }, METADATA_DEBOUNCE_MS)
  }

  async function loadMetadata(source: GithubPullRequestSource, token: number) {
    try {
      const result = await fetchGithubPullRequestMetadata(source.url)
      if (token !== metadataRequestToken) {
        return
      }

      metadata = result
      metadataStatus = 'loaded'
      metadataError = ''
    } catch (error) {
      if (token !== metadataRequestToken) {
        return
      }

      metadata = null
      metadataStatus = 'error'
      metadataError = error instanceof Error
        ? error.message
        : 'GitHub could not load this pull request. It may be private or rate-limited.'
    }
  }

  $: recentItems = [
    ...recentPullRequests.map((recent) => ({
      lastUsedAt: recent.lastUsedAt,
      item: {
        id: recent.id,
        name: `${recent.owner}/${recent.repo} #${recent.pullNumber}`,
        detail: recent.url,
        extra: recent.title,
      },
    })),
    ...recentCompares.map((recent) => ({
      lastUsedAt: recent.lastUsedAt,
      item: {
        id: recent.id,
        name: `${recent.owner}/${recent.repo}`,
        detail: recent.url,
        extra: `${recent.baseRef}${notationDots(recent.notation)}${recent.headRef}`,
      },
    })),
  ]
    .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
    .map((entry) => entry.item)
  $: activeRecentId = parsed === null
    ? ''
    : parsed.kind === 'githubPullRequest'
      ? recentPullRequests.find((recent) =>
        recent.owner.toLowerCase() === parsed.owner.toLowerCase() &&
        recent.repo.toLowerCase() === parsed.repo.toLowerCase() &&
        recent.pullNumber === parsed.pullNumber,
      )?.id ?? ''
      : recentCompares.find((recent) =>
        recent.owner.toLowerCase() === parsed.owner.toLowerCase() &&
        recent.repo.toLowerCase() === parsed.repo.toLowerCase() &&
        recent.baseRef === parsed.baseRef &&
        recent.headRef === parsed.headRef &&
        recent.notation === parsed.notation,
      )?.id ?? ''
</script>

<section class="github-setup-workspace" aria-label="GitHub compare setup">
  <RecentSourceList
    title="Recent GitHub diffs"
    items={recentItems}
    loadError={recentLoadError}
    loadErrorMessage="Recent GitHub diffs could not be loaded."
    emptyMessage="No recent GitHub diffs"
    activeId={activeRecentId}
    onSelect={handleSelectRecent}
  />

  <section class="github-setup-panel" aria-label="GitHub diff">
    <h2 class="github-setup-title">GitHub diff</h2>

    <div class="github-setup-tabs" role="tablist" aria-label="GitHub diff source type">
      <button
        type="button"
        role="tab"
        id="github-tab-pull"
        class="github-setup-tab"
        class:active={activeTab === 'pull'}
        aria-selected={activeTab === 'pull'}
        aria-controls="github-tabpanel-pull"
        tabindex={activeTab === 'pull' ? 0 : -1}
        bind:this={pullTabButton}
        on:click={() => selectTab('pull')}
        on:keydown={handleTabKeydown}
      >
        Pull Request
      </button>
      <button
        type="button"
        role="tab"
        id="github-tab-compare"
        class="github-setup-tab"
        class:active={activeTab === 'compare'}
        aria-selected={activeTab === 'compare'}
        aria-controls="github-tabpanel-compare"
        tabindex={activeTab === 'compare' ? 0 : -1}
        bind:this={compareTabButton}
        on:click={() => selectTab('compare')}
        on:keydown={handleTabKeydown}
      >
        Compare URL
      </button>
    </div>

    {#if activeTab === 'pull'}
      <div
        class="github-setup-tabpanel"
        role="tabpanel"
        id="github-tabpanel-pull"
        aria-labelledby="github-tab-pull"
      >
        <GithubPrInput
          url={prUrl}
          parsed={prParsed}
          {metadataStatus}
          {metadata}
          {metadataError}
          onInput={handlePrInput}
        />
      </div>
    {:else}
      <div
        class="github-setup-tabpanel"
        role="tabpanel"
        id="github-tabpanel-compare"
        aria-labelledby="github-tab-compare"
      >
        <GithubCompareInput
          url={compareUrl}
          parsed={compareParsed}
          onInput={handleCompareInput}
        />
      </div>
    {/if}
  </section>
</section>

<style>
  .github-setup-workspace {
    display: grid;
    grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
    gap: 10px;
    min-height: 0;
    height: 100%;
    width: 100%;
    overflow: hidden;
  }

  .github-setup-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 0;
    padding: 12px;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: var(--panel-bg);
    overflow-y: auto;
  }

  .github-setup-title {
    margin: 0;
    font-size: 13px;
    line-height: 1.2;
    color: var(--panel-title);
  }

  .github-setup-tabs {
    display: flex;
    gap: 4px;
    align-self: flex-start;
    padding: 3px;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: var(--card-bg);
  }

  .github-setup-tab {
    padding: 4px 12px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.4;
  }

  .github-setup-tab.active {
    border-color: var(--active-border);
    background: var(--active-surface);
    color: var(--text);
  }

  .github-setup-tabpanel {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 0;
  }
</style>
