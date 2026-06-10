<script lang="ts">
  import { openExternalUrl } from '../api'
  import type { GithubPullRequestMetadata, GithubPullRequestSource } from '../types'

  export let url = ''
  export let parsed: GithubPullRequestSource | null = null
  export let metadataStatus: 'idle' | 'loading' | 'loaded' | 'error' = 'idle'
  export let metadata: GithubPullRequestMetadata | null = null
  export let metadataError = ''
  export let onInput: (value: string) => void

  $: showInvalid = url.trim() !== '' && parsed === null
  // The backend swallows GitHub rate limits into a placeholder payload (state
  // 'unknown', empty shas) so the diff itself can still load via the raw
  // .diff endpoint. Surface that explicitly instead of an empty preview.
  $: rateLimited =
    metadata !== null && metadata.state === 'unknown' && metadata.baseSha === ''

  function openOnGithub(href: string) {
    void openExternalUrl(href)
  }
</script>

<div class="github-pr-input">
  <label class="github-pr-label" for="github-pr-url">Pull request URL</label>
  <input
    id="github-pr-url"
    type="text"
    autocomplete="off"
    spellcheck="false"
    placeholder="https://github.com/owner/repo/pull/123"
    value={url}
    on:input={(event) => onInput(event.currentTarget.value)}
  />

  <div class="github-pr-status" aria-live="polite">
    {#if url.trim() === ''}
      <p class="github-pr-hint">Enter a GitHub pull request URL.</p>
    {:else if showInvalid}
      <p class="github-pr-error">This is not a GitHub pull request URL.</p>
    {:else if parsed}
      <p class="github-pr-parsed">
        Parsed: <code>{parsed.owner}/{parsed.repo}</code>
        #{parsed.pullNumber}
      </p>
      {#if metadataStatus === 'loading'}
        <p class="github-pr-hint">Loading pull request details…</p>
      {:else if metadataStatus === 'loaded' && metadata && rateLimited}
        <p class="github-pr-warning">
          GitHub rate limit reached. Pull request details are unavailable right
          now, but the diff can still be loaded.
        </p>
        <p class="github-pr-ready">Status: Ready</p>
      {:else if metadataStatus === 'loaded' && metadata}
        <dl class="github-pr-details">
          <div>
            <dt>Title</dt>
            <dd title={metadata.title}>{metadata.title || '—'}</dd>
          </div>
          <div>
            <dt>State</dt>
            <dd>{metadata.state}</dd>
          </div>
          <div>
            <dt>Branches</dt>
            <dd title={`${metadata.baseRef} ← ${metadata.headRef}`}>
              {metadata.baseRef} ← {metadata.headRef}
            </dd>
          </div>
          {#if metadata.changedFiles !== null}
            <div>
              <dt>Files</dt>
              <dd>{metadata.changedFiles} changed</dd>
            </div>
          {/if}
        </dl>
        <p class="github-pr-ready">Status: Ready</p>
      {:else if metadataStatus === 'error'}
        <p class="github-pr-warning">
          {metadataError || 'GitHub could not load this pull request. It may be private or rate-limited.'}
        </p>
      {:else}
        <p class="github-pr-ready">Status: Ready</p>
      {/if}
      <a
        class="github-pr-link"
        href={parsed.url}
        on:click|preventDefault={() => parsed && openOnGithub(parsed.url)}
      >
        Open on GitHub
      </a>
    {/if}
  </div>
</div>

<style>
  .github-pr-input {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .github-pr-label {
    color: var(--muted);
    font-size: 11px;
  }

  .github-pr-input input {
    font-family: var(--code, var(--font-code));
    font-size: 12px;
  }

  .github-pr-status {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--card-bg);
  }

  .github-pr-hint {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
  }

  .github-pr-error {
    margin: 0;
    color: var(--danger);
    font-size: 12px;
  }

  .github-pr-warning {
    margin: 0;
    color: var(--warning, var(--danger));
    font-size: 12px;
  }

  .github-pr-parsed {
    margin: 0;
    color: var(--text);
    font-size: 13px;
  }

  .github-pr-parsed code {
    font-family: var(--code, var(--font-code));
    font-size: 12px;
  }

  .github-pr-ready {
    margin: 0;
    color: var(--success);
    font-size: 12px;
  }

  .github-pr-link {
    align-self: flex-start;
    color: var(--accent, var(--text));
    font-size: 12px;
  }

  .github-pr-details {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
  }

  .github-pr-details > div {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr);
    gap: 8px;
    align-items: baseline;
  }

  .github-pr-details dt {
    color: var(--muted);
    font-size: 11px;
  }

  .github-pr-details dd {
    margin: 0;
    min-width: 0;
    color: var(--text);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
