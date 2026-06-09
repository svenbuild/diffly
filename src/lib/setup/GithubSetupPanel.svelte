<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import GithubPrInput from './GithubPrInput.svelte'
  import RecentSourceList from './RecentSourceList.svelte'
  import { fetchGithubPullRequestMetadata, loadRecentSources } from '../api'
  import { parseGithubPullRequestUrl } from '../github/github-url'
  import type {
    GithubPullRequestMetadata,
    GithubPullRequestSource,
    RecentGithubPullRequest,
  } from '../types'

  const METADATA_DEBOUNCE_MS = 400

  // Emits the parsed PR source (or null while the URL is not parseable) so the
  // parent can drive the Compare button.
  export let onChange: (source: GithubPullRequestSource | null) => void = () => {}
  // Latest successfully loaded metadata for the currently parsed PR, used by
  // the parent to store the PR title with the recent entry.
  export let onMetadataChange: (metadata: GithubPullRequestMetadata | null) => void = () => {}
  // Bumped by the parent after a recent PR is added (e.g. on Compare) so this
  // panel reloads the list without waiting for a remount.
  export let reloadRecentsRequestId = 0
  // Prefill for the URL input (e.g. the restored session's PR source).
  export let initialUrl = ''

  let url = initialUrl
  let parsed: GithubPullRequestSource | null = null
  let metadataStatus: 'idle' | 'loading' | 'loaded' | 'error' = 'idle'
  let metadata: GithubPullRequestMetadata | null = null
  let metadataError = ''
  // Canonical URL of the PR the current metadata state belongs to. Newer
  // parses invalidate older in-flight fetches.
  let metadataUrl = ''
  let metadataRequestToken = 0
  let metadataDebounceTimer: number | null = null

  let recentPullRequests: RecentGithubPullRequest[] = []
  let recentLoadError = false
  let lastReloadRecentsRequestId = reloadRecentsRequestId

  async function loadRecents() {
    try {
      const recents = await loadRecentSources()
      recentPullRequests = recents.githubPullRequests ?? []
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

  function handleInput(value: string) {
    url = value
  }

  function handleSelectRecent(id: string) {
    const recent = recentPullRequests.find((entry) => entry.id === id)
    if (recent) {
      url = recent.url
    }
  }

  // Live parse drives both the Compare button and the metadata preview.
  $: parsed = parseGithubPullRequestUrl(url)
  $: onChange(parsed)
  $: scheduleMetadataLoad(parsed)
  $: onMetadataChange(metadataStatus === 'loaded' ? metadata : null)

  function scheduleMetadataLoad(source: GithubPullRequestSource | null) {
    if (metadataDebounceTimer !== null) {
      window.clearTimeout(metadataDebounceTimer)
      metadataDebounceTimer = null
    }

    if (!source) {
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
        : 'GitHub could not load this PR. It may be private or rate-limited.'
    }
  }

  $: recentItems = recentPullRequests.map((recent) => ({
    id: recent.id,
    name: `${recent.owner}/${recent.repo} #${recent.pullNumber}`,
    detail: recent.url,
    extra: recent.title,
  }))
  $: activeRecentId = parsed
    ? recentPullRequests.find((recent) =>
        recent.owner.toLowerCase() === parsed.owner.toLowerCase() &&
        recent.repo.toLowerCase() === parsed.repo.toLowerCase() &&
        recent.pullNumber === parsed.pullNumber,
      )?.id ?? ''
    : ''
</script>

<section class="github-setup-workspace" aria-label="GitHub compare setup">
  <RecentSourceList
    title="Recent GitHub PRs"
    items={recentItems}
    loadError={recentLoadError}
    loadErrorMessage="Recent pull requests could not be loaded."
    emptyMessage="No recent pull requests"
    activeId={activeRecentId}
    onSelect={handleSelectRecent}
  />

  <section class="github-setup-panel" aria-label="GitHub pull request">
    <h2 class="github-setup-title">GitHub pull request</h2>

    <GithubPrInput
      {url}
      {parsed}
      {metadataStatus}
      {metadata}
      {metadataError}
      onInput={handleInput}
    />
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
</style>
