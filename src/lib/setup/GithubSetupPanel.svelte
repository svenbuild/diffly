<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import RecentSourceList from './RecentSourceList.svelte'
  import {
    fetchGithubPullRequestMetadata,
    loadRecentSources,
    openExternalUrl,
  } from '../api'
  import {
    finishStartupProfileAfterPaint,
    markStartupProfile,
  } from '../app/startup-profile'
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

  export let onOpenSource: (
    source: GithubDiffSource,
    metadata?: GithubPullRequestMetadata | null,
  ) => void | Promise<void>
  export let loading = false
  // Bumped by the parent after a recent source is added (e.g. on Compare) so
  // this panel reloads the list without waiting for a remount.
  export let reloadRecentsRequestId = 0
  // Prefill for the URL input (e.g. the restored session's GitHub source).
  export let initialUrl = ''

  let githubUrl = initialUrl
  let metadataStatus: 'idle' | 'loading' | 'loaded' | 'error' = 'idle'
  let metadata: GithubPullRequestMetadata | null = null
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
    markStartupProfile('github-recents-load-start')
    try {
      const recents = await loadRecentSources()
      recentPullRequests = recents.githubPullRequests ?? []
      recentCompares = recents.githubCompares ?? []
      recentLoadError = false
    } catch {
      recentLoadError = true
    } finally {
      markStartupProfile('github-recents-load-finished', {
        compares: recentCompares.length,
        pullRequests: recentPullRequests.length,
      })
      finishStartupProfileAfterPaint('github-setup-ready')
    }
  }

  onMount(() => {
    markStartupProfile('github-setup-mounted')
    void loadRecents()
  })

  onDestroy(() => {
    metadataRequestToken += 1
    if (metadataDebounceTimer !== null) {
      window.clearTimeout(metadataDebounceTimer)
    }
  })

  $: if (reloadRecentsRequestId !== lastReloadRecentsRequestId) {
    lastReloadRecentsRequestId = reloadRecentsRequestId
    void loadRecents()
  }

  function handleInput(value: string) {
    githubUrl = value
  }

  function handleSelectRecent(id: string) {
    const recentPr = recentPullRequests.find((entry) => entry.id === id)
    if (recentPr) {
      const source = parseGithubDiffUrl(recentPr.url)
      if (source) {
        void onOpenSource(source, null)
      }
      return
    }

    const recentCompare = recentCompares.find((entry) => entry.id === id)
    if (recentCompare) {
      const source = parseGithubDiffUrl(recentCompare.url)
      if (source) {
        void onOpenSource(source, null)
      }
    }
  }

  function handleOpen() {
    if (!parsed || loading) {
      return
    }

    const matchingMetadata =
      parsed.kind === 'githubPullRequest' &&
      metadataStatus === 'loaded' &&
      metadata?.owner.toLowerCase() === parsed.owner.toLowerCase() &&
      metadata.repo.toLowerCase() === parsed.repo.toLowerCase() &&
      metadata.pullNumber === parsed.pullNumber
        ? metadata
        : null
    void onOpenSource(parsed, matchingMetadata)
  }

  function openOnGithub(href: string) {
    void openExternalUrl(href)
  }

  // Live parsing drives the inline Open action and the optional metadata preview.
  $: parsed = parseGithubDiffUrl(githubUrl)
  $: parsedPullRequest = parsed?.kind === 'githubPullRequest' ? parsed : null
  $: parsedCompare = parsed?.kind === 'githubCompare' ? parsed : null
  $: parsedCommit = parsed?.kind === 'githubCommit' ? parsed : null
  $: showInvalid = githubUrl.trim() !== '' && parsed === null
  $: rateLimited =
    metadata !== null && metadata.state === 'unknown' && metadata.baseSha === ''
  $: scheduleMetadataLoad(parsed)

  function scheduleMetadataLoad(source: GithubDiffSource | null) {
    if (metadataDebounceTimer !== null) {
      window.clearTimeout(metadataDebounceTimer)
      metadataDebounceTimer = null
    }

    if (!source || source.kind !== 'githubPullRequest') {
      metadataRequestToken += 1
      metadataStatus = 'idle'
      metadata = null
      metadataUrl = ''
      return
    }

    if (source.url === metadataUrl && metadataStatus !== 'idle') {
      return
    }

    metadataRequestToken += 1
    metadataStatus = 'loading'
    metadata = null
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
    } catch {
      if (token !== metadataRequestToken) {
        return
      }

      metadata = null
      metadataStatus = 'error'
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
      : parsed.kind === 'githubCompare'
        ? recentCompares.find((recent) =>
          recent.owner.toLowerCase() === parsed.owner.toLowerCase() &&
          recent.repo.toLowerCase() === parsed.repo.toLowerCase() &&
          recent.baseRef === parsed.baseRef &&
          recent.headRef === parsed.headRef &&
          recent.notation === parsed.notation,
        )?.id ?? ''
        : ''
</script>

<section class="github-setup-workspace" aria-label="GitHub compare setup">
  <div class="github-setup-content">
    <header>
      <h1>GitHub</h1>
      <p>Paste a pull request, compare, or commit URL.</p>
    </header>

    <form class="github-url-form" on:submit|preventDefault={handleOpen}>
      <label class="github-url-label" for="github-url">GitHub URL</label>
      <div class="github-url-row">
        <input
          id="github-url"
          type="text"
          autocomplete="off"
          spellcheck="false"
          placeholder="https://github.com/owner/repo/pull/123"
          value={githubUrl}
          on:input={(event) => handleInput(event.currentTarget.value)}
        />
        <button class="primary" type="submit" disabled={!parsed || loading}>
          {loading ? 'Opening…' : 'Open'}
        </button>
      </div>
    </form>

    <div class="github-url-status" aria-live="polite">
      {#if githubUrl.trim() === ''}
        <p class="github-url-hint">Enter a GitHub URL above, then press Enter.</p>
      {:else if showInvalid}
        <p class="github-url-error">This is not a GitHub pull request, compare, or commit URL.</p>
      {:else if parsedPullRequest}
        <p class="github-url-parsed">
          {parsedPullRequest.owner}/{parsedPullRequest.repo} #{parsedPullRequest.pullNumber}
        </p>
        {#if metadataStatus === 'loaded' && metadata && !rateLimited}
          <strong class="github-pr-title">{metadata.title}</strong>
          <p class="github-url-hint">
            {metadata.baseRef} ← {metadata.headRef}{metadata.changedFiles === null ? '' : ` · ${metadata.changedFiles} files`}
          </p>
        {:else if metadataStatus === 'error' || rateLimited}
          <p class="github-url-warning">Details unavailable · Diff can still be opened</p>
        {:else if metadataStatus === 'loading'}
          <p class="github-url-hint">Loading pull request details…</p>
        {/if}
        <a
          class="github-url-link"
          href={parsedPullRequest.url}
          on:click|preventDefault={() => openOnGithub(parsedPullRequest.url)}
        >Open on GitHub</a>
      {:else if parsedCompare}
        <p class="github-url-parsed">{parsedCompare.owner}/{parsedCompare.repo}</p>
        <p class="github-url-hint">
          {parsedCompare.baseRef}{notationDots(parsedCompare.notation)}{parsedCompare.headRef}
          · {parsedCompare.notation === 'threeDot' ? 'PR style' : 'Direct'}
        </p>
      {:else if parsedCommit}
        <p class="github-url-parsed">{parsedCommit.owner}/{parsedCommit.repo}</p>
        <p class="github-url-hint">Commit {parsedCommit.commitRef.slice(0, 7)}</p>
      {/if}
    </div>

    <RecentSourceList
      title="Recent GitHub diffs"
      items={recentItems}
      loadError={recentLoadError}
      loadErrorMessage="Recent GitHub diffs could not be loaded."
      emptyMessage="No recent GitHub diffs"
      activeId={activeRecentId}
      onSelect={handleSelectRecent}
    />
  </div>
</section>

<style>
  .github-setup-workspace {
    min-height: 0;
    height: 100%;
    overflow-y: auto;
  }

  .github-setup-content {
    display: flex;
    flex-direction: column;
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

  .github-url-form {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .github-url-label {
    color: var(--muted);
    font-size: 11px;
  }

  .github-url-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }

  .github-url-row input {
    min-width: 0;
    font-family: var(--code, var(--font-code));
    font-size: 12px;
  }

  .github-url-row button {
    min-width: 78px;
  }

  .github-url-status {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 62px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--card-bg);
  }

  .github-url-hint {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
  }

  .github-url-error {
    margin: 0;
    color: var(--danger);
    font-size: 12px;
  }

  .github-url-warning {
    margin: 0;
    color: var(--warning, var(--danger));
    font-size: 12px;
  }

  .github-url-parsed {
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
  }

  .github-pr-title {
    color: var(--text);
    font-size: 12px;
  }

  .github-url-link {
    align-self: flex-start;
    color: var(--accent, var(--text));
    font-size: 12px;
  }

  .github-setup-content > :global(.git-setup-recent) {
    width: 100%;
    max-height: 320px;
  }

  @media (max-width: 620px) {
    .github-setup-content {
      padding-top: 18px;
    }

    .github-url-row {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
