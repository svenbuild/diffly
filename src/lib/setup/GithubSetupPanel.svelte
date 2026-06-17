<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte'
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

  let githubUrl = initialUrl
  let urlInput: HTMLInputElement | null = null

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
    if (metadataDebounceTimer !== null) {
      window.clearTimeout(metadataDebounceTimer)
    }
  })

  $: if (reloadRecentsRequestId !== lastReloadRecentsRequestId) {
    lastReloadRecentsRequestId = reloadRecentsRequestId
    void loadRecents()
  }

  async function focusUrlInput() {
    await tick()
    if (urlInput) {
      urlInput.focus()
      urlInput.setSelectionRange(urlInput.value.length, urlInput.value.length)
    }
  }

  function handleInput(value: string) {
    githubUrl = value
  }

  function handleSelectRecent(id: string) {
    const recentPr = recentPullRequests.find((entry) => entry.id === id)
    if (recentPr) {
      githubUrl = recentPr.url
      void focusUrlInput()
      return
    }

    const recentCompare = recentCompares.find((entry) => entry.id === id)
    if (recentCompare) {
      githubUrl = recentCompare.url
      void focusUrlInput()
    }
  }

  function openOnGithub(href: string) {
    void openExternalUrl(href)
  }

  // Live parse drives both the Compare button and the metadata preview.
  $: parsed = parseGithubDiffUrl(githubUrl)
  $: parsedPullRequest = parsed?.kind === 'githubPullRequest' ? parsed : null
  $: parsedCompare = parsed?.kind === 'githubCompare' ? parsed : null
  $: showInvalid = githubUrl.trim() !== '' && parsed === null
  $: rateLimited =
    metadata !== null && metadata.state === 'unknown' && metadata.baseSha === ''
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

    <div class="github-url-input">
      <label class="github-url-label" for="github-url">GitHub URL</label>
      <input
        id="github-url"
        type="text"
        autocomplete="off"
        spellcheck="false"
        placeholder="https://github.com/owner/repo/pull/123 or /compare/base...head"
        value={githubUrl}
        bind:this={urlInput}
        on:input={(event) => handleInput(event.currentTarget.value)}
      />

      <div class="github-url-status" aria-live="polite">
        {#if githubUrl.trim() === ''}
          <p class="github-url-hint">Enter a GitHub pull request or compare URL.</p>
        {:else if showInvalid}
          <p class="github-url-error">This is not a GitHub pull request or compare URL.</p>
        {:else if parsedPullRequest}
          <p class="github-url-parsed">
            Pull request:
            <code>{parsedPullRequest.owner}/{parsedPullRequest.repo}</code>
            #{parsedPullRequest.pullNumber}
          </p>
          {#if metadataStatus === 'loading'}
            <p class="github-url-hint">Loading pull request details...</p>
          {:else if metadataStatus === 'loaded' && metadata && rateLimited}
            <p class="github-url-warning">
              GitHub rate limit reached. Pull request details are unavailable right
              now, but the diff can still be loaded.
            </p>
            <p class="github-url-ready">Status: Ready</p>
          {:else if metadataStatus === 'loaded' && metadata}
            <dl class="github-url-details">
              <div>
                <dt>Title</dt>
                <dd title={metadata.title}>{metadata.title || '-'}</dd>
              </div>
              <div>
                <dt>State</dt>
                <dd>{metadata.state}</dd>
              </div>
              <div>
                <dt>Branches</dt>
                <dd title={`${metadata.baseRef} <- ${metadata.headRef}`}>
                  {metadata.baseRef} &lt;- {metadata.headRef}
                </dd>
              </div>
              {#if metadata.changedFiles !== null}
                <div>
                  <dt>Files</dt>
                  <dd>{metadata.changedFiles} changed</dd>
                </div>
              {/if}
            </dl>
            <p class="github-url-ready">Status: Ready</p>
          {:else if metadataStatus === 'error'}
            <p class="github-url-warning">
              {metadataError || 'GitHub could not load this pull request. It may be private or rate-limited.'}
            </p>
          {:else}
            <p class="github-url-ready">Status: Ready</p>
          {/if}
          <a
            class="github-url-link"
            href={parsedPullRequest.url}
            on:click|preventDefault={() => openOnGithub(parsedPullRequest.url)}
          >
            Open on GitHub
          </a>
        {:else if parsedCompare}
          <p class="github-url-parsed">
            Compare:
            <code>{parsedCompare.owner}/{parsedCompare.repo}</code>
            {parsedCompare.baseRef}{notationDots(parsedCompare.notation)}{parsedCompare.headRef}
          </p>
          <p class="github-url-hint">
            {parsedCompare.notation === 'threeDot'
              ? 'PR-style merge-base diff'
              : 'Direct two-dot diff'}
          </p>
          <p class="github-url-ready">Status: Ready</p>
        {/if}
      </div>
    </div>
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

  .github-url-input {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .github-url-label {
    color: var(--muted);
    font-size: 11px;
  }

  .github-url-input input {
    font-family: var(--code, var(--font-code));
    font-size: 12px;
  }

  .github-url-status {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
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
    margin: 0;
    color: var(--text);
    font-size: 13px;
  }

  .github-url-parsed code {
    font-family: var(--code, var(--font-code));
    font-size: 12px;
  }

  .github-url-ready {
    margin: 0;
    color: var(--success);
    font-size: 12px;
  }

  .github-url-link {
    align-self: flex-start;
    color: var(--accent, var(--text));
    font-size: 12px;
  }

  .github-url-details {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
  }

  .github-url-details > div {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr);
    gap: 8px;
    align-items: baseline;
  }

  .github-url-details dt {
    color: var(--muted);
    font-size: 11px;
  }

  .github-url-details dd {
    margin: 0;
    min-width: 0;
    color: var(--text);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
