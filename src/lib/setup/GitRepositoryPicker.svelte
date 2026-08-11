<script lang="ts">
  import Dropdown from '../components/Dropdown.svelte'
  import EditableCombobox from '../components/EditableCombobox.svelte'
  import type { GitRefsResponse } from '../types'

  type SelectionKind = 'refRange' | 'commit'
  type Notation = 'twoDot' | 'threeDot'
  type RefsStatus = 'idle' | 'loading' | 'loaded' | 'error'

  interface SelectOption {
    value: string
    label: string
  }

  export let inputPath = ''
  export let validationStatus: 'idle' | 'validating' | 'valid' | 'invalid' = 'idle'
  export let validationError = ''
  export let repositoryRoot = ''
  export let currentBranch = ''
  export let headSha = ''
  export let refsStatus: RefsStatus = 'idle'
  export let refsError = ''
  export let gitRefs: GitRefsResponse | null = null
  export let selectionKind: SelectionKind = 'refRange'
  export let baseRef = ''
  export let headRef = ''
  export let notation: Notation = 'threeDot'
  export let commitRef = ''
  export let loading = false
  export let validatingSelection = false
  export let selectionError = ''

  export let onInputPathChange: (value: string) => void
  export let onBrowse: () => void | Promise<void>
  export let onValidate: () => void | Promise<void>
  export let onSelectionKindChange: (kind: SelectionKind) => void
  export let onBaseRefChange: (value: string) => void
  export let onHeadRefChange: (value: string) => void
  export let onNotationChange: (value: Notation) => void
  export let onCommitRefChange: (value: string) => void
  export let onOpen: () => void | Promise<void>

  const comparisonOptions: SelectOption[] = [
    { value: 'threeDot', label: 'PR style' },
    { value: 'twoDot', label: 'Direct' },
  ]

  $: shortHead = headSha ? headSha.slice(0, 7) : ''
  $: repositoryName = repositoryRoot.split(/[\\/]/).filter(Boolean).at(-1) ?? 'Repository'
  $: repositorySummary = [repositoryName, currentBranch || 'Detached HEAD', shortHead]
    .filter(Boolean)
    .join(' · ')
  $: refOptions = buildRefOptions(gitRefs, baseRef, headRef)
  $: commitOptions = buildCommitOptions(gitRefs, commitRef)
  $: canOpen =
    validationStatus === 'valid' &&
    !loading &&
    !validatingSelection &&
    (selectionKind === 'refRange'
      ? Boolean(baseRef.trim() && headRef.trim())
      : Boolean(commitRef.trim()))
  $: commandPreview = selectionKind === 'refRange'
    ? baseRef.trim() && headRef.trim()
      ? `git diff ${baseRef.trim()}${notation === 'threeDot' ? '...' : '..'}${headRef.trim()}`
      : ''
    : commitRef.trim()
      ? `git show ${commitRef.trim().slice(0, 12)}`
      : ''

  function handlePathKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter') {
      return
    }
    event.preventDefault()
    void onValidate()
  }

  function buildRefOptions(
    refs: GitRefsResponse | null,
    currentBaseRef: string,
    currentHeadRef: string,
  ): SelectOption[] {
    const options = refs
      ? [
          ...refs.localBranches.map((ref) => ({ value: ref.name, label: ref.name })),
          ...refs.remoteBranches.map((ref) => ({ value: ref.name, label: ref.name })),
          ...refs.tags.map((ref) => ({ value: ref.name, label: ref.name })),
        ]
      : []
    const values = new Set(options.map((option) => option.value))

    for (const value of [currentBaseRef, currentHeadRef]) {
      if (value && !values.has(value)) {
        options.push({ value, label: value })
        values.add(value)
      }
    }
    return options
  }

  function buildCommitOptions(
    refs: GitRefsResponse | null,
    currentCommitRef: string,
  ): SelectOption[] {
    const options = refs
      ? refs.recentCommits.map((commit) => ({
          value: commit.sha,
          label: `${commit.shortSha} ${commit.subject}`,
        }))
      : []

    if (currentCommitRef && !options.some((option) => option.value === currentCommitRef)) {
      options.push({ value: currentCommitRef, label: currentCommitRef.slice(0, 12) })
    }
    return options
  }
</script>

<section class="advanced-git-panel" aria-label="Advanced Git compare">
  <h2>Advanced compare</h2>

  <div class="advanced-field">
    <label for="advanced-repository">Repository</label>
    <div class="repository-input-row">
      <input
        id="advanced-repository"
        type="text"
        autocomplete="off"
        spellcheck="false"
        placeholder="Path to a Git repository"
        value={inputPath}
        on:input={(event) => onInputPathChange(event.currentTarget.value)}
        on:keydown={handlePathKeydown}
      />
      <button class="secondary" type="button" disabled={loading} on:click={onBrowse}>Browse…</button>
    </div>
  </div>

  <div class="repository-status" aria-live="polite">
    {#if validationStatus === 'validating'}
      <span>Validating repository…</span>
    {:else if validationStatus === 'valid'}
      <strong>✓ {repositorySummary}</strong>
      <span title={repositoryRoot}>{repositoryRoot}</span>
    {:else if validationStatus === 'invalid'}
      <strong class="error">! {validationError || 'This folder is not a Git repository.'}</strong>
    {:else}
      <span>Choose a repository to load its refs.</span>
    {/if}
  </div>

  <fieldset disabled={validationStatus !== 'valid' || loading}>
    <legend>Compare</legend>
    <div class="compare-kind" role="radiogroup" aria-label="Advanced comparison type">
      <label>
        <input
          type="radio"
          name="advanced-compare-kind"
          checked={selectionKind === 'refRange'}
          on:change={() => onSelectionKindChange('refRange')}
        />
        Branch / ref
      </label>
      <label>
        <input
          type="radio"
          name="advanced-compare-kind"
          checked={selectionKind === 'commit'}
          on:change={() => onSelectionKindChange('commit')}
        />
        Single commit
      </label>
    </div>

    {#if selectionKind === 'refRange'}
      <div class="advanced-grid">
        <div class="advanced-field">
          <span>Base</span>
          <EditableCombobox
            ariaLabel="Base ref"
            disabled={refsStatus === 'loading'}
            invalid={Boolean(selectionError)}
            options={refOptions}
            placeholder="Search or enter ref…"
            value={baseRef}
            onChange={onBaseRefChange}
          />
        </div>
        <div class="advanced-field">
          <span>Head</span>
          <EditableCombobox
            ariaLabel="Head ref"
            disabled={refsStatus === 'loading'}
            invalid={Boolean(selectionError)}
            options={refOptions}
            placeholder="Search or enter ref…"
            value={headRef}
            onChange={onHeadRefChange}
          />
        </div>
        <div class="advanced-field advanced-comparison">
          <span>Comparison</span>
          <Dropdown
            ariaLabel="Comparison style"
            disabled={refsStatus === 'loading'}
            options={comparisonOptions}
            value={notation}
            onChange={(value) => onNotationChange(value as Notation)}
          />
        </div>
      </div>
    {:else}
      <div class="advanced-field">
        <span>Commit</span>
        <EditableCombobox
          ariaLabel="Commit"
          disabled={refsStatus === 'loading'}
          invalid={Boolean(selectionError)}
          options={commitOptions}
          placeholder="SHA, branch, tag, or search…"
          value={commitRef}
          onChange={onCommitRefChange}
        />
      </div>
    {/if}

    {#if refsStatus === 'loading'}
      <p class="status-note">Loading refs…</p>
    {:else if refsStatus === 'error'}
      <p class="status-note error">{refsError || 'Refs could not be loaded.'}</p>
    {:else if validatingSelection}
      <p class="status-note">Validating ref…</p>
    {:else if selectionError}
      <p class="status-note error" role="alert">{selectionError}</p>
    {:else if commandPreview}
      <code class="command-preview">{commandPreview}</code>
    {/if}

    <div class="advanced-actions">
      <button class="primary" type="button" disabled={!canOpen} on:click={onOpen}>
        {loading ? 'Opening…' : validatingSelection ? 'Validating…' : 'Open diff'}
      </button>
    </div>
  </fieldset>
</section>

<style>
  .advanced-git-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: min(720px, 100%);
    padding: 18px;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: var(--panel-bg);
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    color: var(--panel-title);
    font-size: 15px;
  }

  .advanced-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .advanced-field label,
  .advanced-field > span,
  legend {
    color: var(--muted);
    font-size: 11px;
  }

  .repository-input-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }

  .repository-input-row input {
    min-width: 0;
    font-family: var(--code, var(--font-code));
    font-size: 12px;
  }

  .repository-status {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-height: 34px;
    color: var(--muted);
    font-size: 12px;
  }

  .repository-status strong {
    color: var(--success);
    font-weight: 600;
  }

  .repository-status span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  fieldset {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin: 0;
    padding: 0;
    border: 0;
  }

  fieldset:disabled {
    opacity: 0.58;
  }

  .compare-kind {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
  }

  .compare-kind label {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--text);
    font-size: 12px;
  }

  .advanced-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 12px;
  }

  .advanced-comparison {
    grid-column: 1 / -1;
    width: min(260px, 100%);
  }

  .status-note,
  .command-preview {
    color: var(--muted);
    font-size: 11px;
  }

  .command-preview {
    display: block;
    font-family: var(--code, var(--font-code));
  }

  .error {
    color: var(--danger) !important;
  }

  .advanced-actions {
    display: flex;
    justify-content: flex-end;
  }

  @media (max-width: 680px) {
    .advanced-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .advanced-comparison {
      grid-column: auto;
    }
  }
</style>
