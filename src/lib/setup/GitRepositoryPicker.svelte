<script lang="ts">
  import GitRepositoryBrowser from './GitRepositoryBrowser.svelte'
  import type { GitWorkingTreeScope } from '../types'

  type SelectionKind = 'workingTree' | 'refRange' | 'commit'
  type Notation = 'twoDot' | 'threeDot'

  export let selectedRepoPath = ''
  export let revealPath = ''
  export let revealRequestId = 0
  export let validationStatus: 'idle' | 'validating' | 'valid' | 'invalid' = 'idle'
  export let validationError = ''
  export let repositoryRoot = ''
  export let currentBranch = ''
  export let headSha = ''
  export let selectionKind: SelectionKind = 'workingTree'
  export let workingTreeScope: GitWorkingTreeScope = 'all'
  export let baseRef = ''
  export let headRef = ''
  export let notation: Notation = 'twoDot'
  export let commitRef = ''

  export let onSelectRepo: (path: string) => void
  export let onSelectionKindChange: (kind: SelectionKind) => void
  export let onScopeChange: (scope: GitWorkingTreeScope) => void
  export let onBaseRefChange: (value: string) => void
  export let onHeadRefChange: (value: string) => void
  export let onNotationChange: (value: Notation) => void
  export let onCommitRefChange: (value: string) => void

  const compareTypeOptions: Array<{ value: SelectionKind; label: string }> = [
    { value: 'workingTree', label: 'Working tree' },
    { value: 'refRange', label: 'Branch / ref' },
    { value: 'commit', label: 'Single commit' },
  ]

  const scopeOptions: Array<{ value: GitWorkingTreeScope; label: string }> = [
    { value: 'all', label: 'All changes' },
    { value: 'staged', label: 'Staged' },
    { value: 'unstaged', label: 'Unstaged' },
    { value: 'untracked', label: 'Untracked' },
  ]

  $: repoReady = validationStatus === 'valid'
  $: shortHead = headSha ? headSha.slice(0, 7) : ''
</script>

<section class="git-setup-picker" aria-label="Git repository">
  <h2 class="git-setup-picker-title">Git repository</h2>

  <div class="git-setup-browser">
    <GitRepositoryBrowser {selectedRepoPath} {revealPath} {revealRequestId} {onSelectRepo} />
  </div>

  <div class="git-setup-status" aria-live="polite">
    {#if validationStatus === 'idle'}
      <p class="git-setup-status-hint">Select a Git repository.</p>
    {:else if validationStatus === 'validating'}
      <p class="git-setup-status-hint">Validating…</p>
    {:else if validationStatus === 'valid'}
      <p class="git-setup-status-line git-setup-status-ok">Status: Valid Git repository</p>
      <dl class="git-setup-status-details">
        <div>
          <dt>Root</dt>
          <dd><code>{repositoryRoot}</code></dd>
        </div>
        <div>
          <dt>Branch</dt>
          <dd>{currentBranch || 'Detached HEAD'}</dd>
        </div>
        <div>
          <dt>HEAD</dt>
          <dd><code>{shortHead || '—'}</code></dd>
        </div>
      </dl>
    {:else}
      <p class="git-setup-status-line git-setup-status-error">
        {validationError || 'This folder is not a Git repository.'}
      </p>
    {/if}
  </div>

  <fieldset class="git-setup-compare-type" disabled={!repoReady}>
    <legend>Compare type</legend>

    {#each compareTypeOptions as option}
      <label class="git-setup-radio">
        <input
          type="radio"
          name="git-compare-type"
          value={option.value}
          checked={selectionKind === option.value}
          on:change={() => onSelectionKindChange(option.value)}
        />
        <span>{option.label}</span>
      </label>
    {/each}

    {#if selectionKind === 'workingTree'}
      <div class="git-setup-suboption">
        <label class="git-setup-label" for="git-setup-scope">Scope</label>
        <select
          id="git-setup-scope"
          value={workingTreeScope}
          on:change={(event) =>
            onScopeChange(event.currentTarget.value as GitWorkingTreeScope)}
        >
          {#each scopeOptions as scope}
            <option value={scope.value}>{scope.label}</option>
          {/each}
        </select>
      </div>
    {:else if selectionKind === 'refRange'}
      <div class="git-setup-suboption git-setup-suboption-grid">
        <div>
          <label class="git-setup-label" for="git-setup-base-ref">Base ref</label>
          <input
            id="git-setup-base-ref"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="e.g. main"
            value={baseRef}
            on:input={(event) => onBaseRefChange(event.currentTarget.value)}
          />
        </div>
        <div>
          <label class="git-setup-label" for="git-setup-head-ref">Head ref</label>
          <input
            id="git-setup-head-ref"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="e.g. feature/x"
            value={headRef}
            on:input={(event) => onHeadRefChange(event.currentTarget.value)}
          />
        </div>
        <div>
          <label class="git-setup-label" for="git-setup-notation">Notation</label>
          <select
            id="git-setup-notation"
            value={notation}
            on:change={(event) =>
              onNotationChange(event.currentTarget.value as Notation)}
          >
            <option value="twoDot">Two-dot (base..head)</option>
            <option value="threeDot">Three-dot (base...head)</option>
          </select>
        </div>
      </div>
    {:else}
      <div class="git-setup-suboption">
        <label class="git-setup-label" for="git-setup-commit-ref">Commit</label>
        <input
          id="git-setup-commit-ref"
          type="text"
          autocomplete="off"
          spellcheck="false"
          placeholder="Commit SHA or ref"
          value={commitRef}
          on:input={(event) => onCommitRefChange(event.currentTarget.value)}
        />
      </div>
    {/if}
  </fieldset>
</section>

<style>
  .git-setup-picker {
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

  .git-setup-picker-title {
    margin: 0;
    font-size: 13px;
    line-height: 1.2;
    color: var(--panel-title);
  }

  .git-setup-browser {
    display: flex;
    flex: 1 1 auto;
    min-height: 240px;
  }

  .git-setup-browser > :global(.git-browser) {
    flex: 1 1 auto;
    min-width: 0;
  }

  .git-setup-label {
    color: var(--muted);
    font-size: 11px;
  }

  .git-setup-status {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--card-bg);
  }

  .git-setup-status-hint {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
  }

  .git-setup-status-line {
    margin: 0;
    font-size: 13px;
  }

  .git-setup-status-ok {
    color: var(--success);
  }

  .git-setup-status-error {
    color: var(--danger);
  }

  .git-setup-status-details {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
  }

  .git-setup-status-details > div {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr);
    gap: 8px;
    align-items: baseline;
  }

  .git-setup-status-details dt {
    color: var(--muted);
    font-size: 11px;
  }

  .git-setup-status-details dd {
    margin: 0;
    min-width: 0;
    color: var(--text);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .git-setup-status-details code {
    font-family: var(--code, var(--font-code));
    font-size: 12px;
  }

  .git-setup-compare-type {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .git-setup-compare-type[disabled] {
    opacity: 0.5;
  }

  .git-setup-compare-type legend {
    padding: 0;
    margin-bottom: 2px;
    color: var(--panel-title);
    font-size: 12px;
  }

  .git-setup-radio {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text);
  }

  .git-setup-radio input {
    width: auto;
    min-height: 0;
  }

  .git-setup-suboption {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
    padding-left: 24px;
  }

  .git-setup-suboption-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 8px;
  }

  .git-setup-suboption-grid > div {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
</style>
