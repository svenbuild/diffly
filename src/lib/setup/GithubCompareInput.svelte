<script lang="ts">
  import { notationDots } from '../compare/source-header-labels'
  import type { GithubCompareSource } from '../types'

  export let url = ''
  export let parsed: GithubCompareSource | null = null
  export let onInput: (value: string) => void

  $: showInvalid = url.trim() !== '' && parsed === null
</script>

<div class="github-compare-input">
  <label class="github-compare-label" for="github-compare-url">Compare URL</label>
  <input
    id="github-compare-url"
    type="text"
    autocomplete="off"
    spellcheck="false"
    placeholder="https://github.com/owner/repo/compare/base...head"
    value={url}
    on:input={(event) => onInput(event.currentTarget.value)}
  />

  <div class="github-compare-status" aria-live="polite">
    {#if url.trim() === ''}
      <p class="github-compare-hint">Enter a GitHub compare URL.</p>
    {:else if showInvalid}
      <p class="github-compare-error">This is not a GitHub compare URL.</p>
    {:else if parsed}
      <p class="github-compare-parsed">
        Parsed: <code>{parsed.owner}/{parsed.repo}</code>
        {parsed.baseRef}{notationDots(parsed.notation)}{parsed.headRef}
      </p>
      <p class="github-compare-hint">
        {parsed.notation === 'threeDot'
          ? 'PR-style merge-base diff'
          : 'Direct two-dot diff'}
      </p>
      <p class="github-compare-ready">Status: Ready</p>
    {/if}
  </div>
</div>

<style>
  .github-compare-input {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .github-compare-label {
    color: var(--muted);
    font-size: 11px;
  }

  .github-compare-input input {
    font-family: var(--code, var(--font-code));
    font-size: 12px;
  }

  .github-compare-status {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--card-bg);
  }

  .github-compare-hint {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
  }

  .github-compare-error {
    margin: 0;
    color: var(--danger);
    font-size: 12px;
  }

  .github-compare-parsed {
    margin: 0;
    color: var(--text);
    font-size: 13px;
  }

  .github-compare-parsed code {
    font-family: var(--code, var(--font-code));
    font-size: 12px;
  }

  .github-compare-ready {
    margin: 0;
    color: var(--success);
    font-size: 12px;
  }
</style>
