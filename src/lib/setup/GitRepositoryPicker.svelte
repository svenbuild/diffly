<script lang="ts">
  import Dropdown from '../components/Dropdown.svelte'
  import GitRepositoryBrowser from './GitRepositoryBrowser.svelte'
  import type { GitRefsResponse, GitWorkingTreeScope, PersistedGitSetupBrowser } from '../types'

  type SelectionKind = 'workingTree' | 'refRange' | 'commit'
  type Notation = 'twoDot' | 'threeDot'
  type RefsStatus = 'idle' | 'loading' | 'loaded' | 'error'

  interface SelectOption {
    value: string
    label: string
  }

  export let selectedRepoPath = ''
  export let revealPath = ''
  export let revealRequestId = 0
  export let validationStatus: 'idle' | 'validating' | 'valid' | 'invalid' = 'idle'
  export let validationError = ''
  export let repositoryRoot = ''
  export let currentBranch = ''
  export let headSha = ''
  export let refsStatus: RefsStatus = 'idle'
  export let refsError = ''
  export let gitRefs: GitRefsResponse | null = null
  export let selectionKind: SelectionKind = 'workingTree'
  export let workingTreeScope: GitWorkingTreeScope = 'all'
  export let baseRef = ''
  export let headRef = ''
  export let notation: Notation = 'twoDot'
  export let commitRef = ''
  export let initialBrowserState: PersistedGitSetupBrowser | undefined = undefined

  export let onSelectRepo: (path: string) => void
  export let onBrowserStateChange: (state: PersistedGitSetupBrowser) => void = () => {}
  export let onSelectionKindChange: (kind: SelectionKind) => void
  export let onScopeChange: (scope: GitWorkingTreeScope) => void
  export let onBaseRefChange: (value: string) => void
  export let onHeadRefChange: (value: string) => void
  export let onNotationChange: (value: Notation) => void
  export let onCommitRefChange: (value: string) => void

  // Compare cards: each card maps onto the existing selection model
  // (selectionKind + workingTreeScope + notation) and shows the left/right
  // semantics plus the equivalent git command, so users never have to guess.
  type CompareCard =
    | { id: string; title: string; semantics: string; command: string; kind: 'workingTree'; scope: GitWorkingTreeScope }
    | { id: string; title: string; semantics: string; command: string; kind: 'refRange'; notation: Notation }
    | { id: string; title: string; semantics: string; command: string; kind: 'commit' }

  const compareCards: CompareCard[] = [
    {
      id: 'working-tree',
      title: 'Working Tree',
      semantics: 'HEAD ↔ Working Tree',
      command: 'git diff HEAD',
      kind: 'workingTree',
      scope: 'all',
    },
    {
      id: 'staged',
      title: 'Staged',
      semantics: 'HEAD ↔ Index',
      command: 'git diff --cached',
      kind: 'workingTree',
      scope: 'staged',
    },
    {
      id: 'unstaged',
      title: 'Unstaged',
      semantics: 'Index ↔ Working Tree',
      command: 'git diff',
      kind: 'workingTree',
      scope: 'unstaged',
    },
    {
      id: 'untracked',
      title: 'Untracked',
      semantics: 'Empty ↔ Untracked files',
      command: 'git ls-files --others',
      kind: 'workingTree',
      scope: 'untracked',
    },
    {
      id: 'ref-range',
      title: 'Branch / Ref',
      semantics: 'Base ↔ Head',
      command: 'git diff base..head',
      kind: 'refRange',
      notation: 'twoDot',
    },
    {
      id: 'pr-style',
      title: 'Pull Request style',
      semantics: 'Merge-base ↔ Head',
      command: 'git diff base...head',
      kind: 'refRange',
      notation: 'threeDot',
    },
    {
      id: 'commit',
      title: 'Single Commit',
      semantics: 'Parent ↔ Commit',
      command: 'git show <commit>',
      kind: 'commit',
    },
  ]

  const scopeCardIds: Record<GitWorkingTreeScope, string> = {
    all: 'working-tree',
    staged: 'staged',
    unstaged: 'unstaged',
    untracked: 'untracked',
  }

  let cardButtons: Array<HTMLButtonElement | undefined> = []

  function selectCard(card: CompareCard) {
    if (card.kind === 'workingTree') {
      onSelectionKindChange('workingTree')
      onScopeChange(card.scope)
    } else if (card.kind === 'refRange') {
      onSelectionKindChange('refRange')
      onNotationChange(card.notation)
    } else {
      onSelectionKindChange('commit')
    }
  }

  // Radio-group keyboard pattern: arrows move selection, the active card is
  // the only tab stop.
  function handleCardKeydown(event: KeyboardEvent, index: number) {
    let next = -1
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = (index + 1) % compareCards.length
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = (index - 1 + compareCards.length) % compareCards.length
    } else if (event.key === 'Home') {
      next = 0
    } else if (event.key === 'End') {
      next = compareCards.length - 1
    }

    if (next === -1) {
      return
    }

    event.preventDefault()
    selectCard(compareCards[next])
    cardButtons[next]?.focus()
  }

  $: repoReady = validationStatus === 'valid'
  $: activeCardId =
    selectionKind === 'workingTree'
      ? scopeCardIds[workingTreeScope]
      : selectionKind === 'refRange'
        ? (notation === 'threeDot' ? 'pr-style' : 'ref-range')
        : 'commit'
  $: activeCard = compareCards.find((card) => card.id === activeCardId) ?? compareCards[0]
  // Concrete command for the chosen refs/commit, shown under the inputs.
  $: activeCommandPreview =
    selectionKind === 'refRange'
      ? baseRef.trim() && headRef.trim()
        ? `git diff ${baseRef.trim()}${notation === 'threeDot' ? '...' : '..'}${headRef.trim()}`
        : ''
      : selectionKind === 'commit' && commitRef.trim()
        ? `git show ${commitRef.trim().slice(0, 12)}`
        : ''
  $: shortHead = headSha ? headSha.slice(0, 7) : ''
  $: branchDisplay = currentBranch || (headSha ? `Detached HEAD at ${shortHead}` : 'No HEAD')
  $: refOptions = buildRefOptions(gitRefs, baseRef, headRef)
  $: commitOptions = buildCommitOptions(gitRefs, commitRef)
  $: refsUnavailable = refsStatus === 'loading' || refsStatus === 'error' || refOptions.length === 0
  $: commitsUnavailable =
    refsStatus === 'loading' ||
    refsStatus === 'error' ||
    commitOptions.length === 0 ||
    (gitRefs?.recentCommits.length ?? 0) === 0
  $: refStatusMessage = refsStatus === 'loading'
    ? 'Loading refs...'
    : refsStatus === 'error'
      ? refsError || 'Refs could not be loaded.'
      : refsStatus === 'loaded' && refOptions.length === 0
        ? 'No refs found.'
        : ''
  $: commitStatusMessage = refsStatus === 'loading'
    ? 'Loading refs...'
    : refsStatus === 'error'
      ? refsError || 'Refs could not be loaded.'
      : refsStatus === 'loaded' && (gitRefs?.recentCommits.length ?? 0) === 0
        ? 'No commits found.'
        : ''

  function buildRefOptions(
    refs: GitRefsResponse | null,
    currentBaseRef: string,
    currentHeadRef: string,
  ): SelectOption[] {
    const options = refs
      ? [
          ...refs.localBranches.map((ref) => ({ value: ref.name, label: `Local: ${ref.name}` })),
          ...refs.remoteBranches.map((ref) => ({ value: ref.name, label: `Remote: ${ref.name}` })),
          ...refs.tags.map((ref) => ({ value: ref.name, label: `Tag: ${ref.name}` })),
        ]
      : []
    const values = new Set(options.map((option) => option.value))

    for (const value of [currentBaseRef, currentHeadRef]) {
      if (value && !values.has(value)) {
        options.push({ value, label: `Custom: ${value}` })
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
          label: commit.decorations.length > 0
            ? `${commit.shortSha} ${commit.subject} · ${commit.decorations.join(', ')}`
            : `${commit.shortSha} ${commit.subject}`,
        }))
      : []
    const hasCurrent = options.some((option) => option.value === currentCommitRef)

    if (currentCommitRef && !hasCurrent) {
      options.push({
        value: currentCommitRef,
        label: `Custom: ${currentCommitRef.slice(0, 12)}`,
      })
    }

    return options
  }
</script>

<section class="git-setup-picker" aria-label="Git repository">
  <h2 class="git-setup-picker-title">Git repository</h2>

  <div class="git-setup-browser">
    <GitRepositoryBrowser
      {selectedRepoPath}
      {revealPath}
      {revealRequestId}
      {onSelectRepo}
      {initialBrowserState}
      {onBrowserStateChange}
    />
  </div>

  <div class="git-setup-status" aria-live="polite">
    {#if validationStatus === 'idle'}
      <p class="git-setup-status-hint">Select a local Git repository.</p>
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
          <dd>{branchDisplay}</dd>
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
    <legend>Compare</legend>

    <div class="git-compare-cards" role="radiogroup" aria-label="Compare mode">
      {#each compareCards as card, index (card.id)}
        <button
          type="button"
          class="git-compare-card"
          class:active={card.id === activeCardId}
          role="radio"
          aria-checked={card.id === activeCardId}
          tabindex={card.id === activeCardId ? 0 : -1}
          bind:this={cardButtons[index]}
          on:click={() => selectCard(card)}
          on:keydown={(event) => handleCardKeydown(event, index)}
        >
          <span class="git-compare-card-title">{card.title}</span>
          <span class="git-compare-card-semantics">{card.semantics}</span>
          <code class="git-compare-card-command">{card.command}</code>
        </button>
      {/each}
    </div>

    {#if selectionKind === 'refRange'}
      <div class="git-compare-detail" aria-label="{activeCard.title} refs">
        <p class="git-compare-detail-hint">
          {#if notation === 'threeDot'}
            Compares head against its merge-base with base — like a pull request diff.
          {:else}
            Compares base directly against head. Branches, tags, and commit hashes all work.
          {/if}
        </p>
        <div class="git-setup-suboption-grid">
          <div>
            <span class="git-setup-label" id="git-setup-base-ref-label">Base (left)</span>
            <Dropdown
              ariaLabel="Base ref"
              disabled={refsUnavailable}
              options={refOptions}
              value={baseRef}
              onChange={onBaseRefChange}
            />
          </div>
          <div>
            <span class="git-setup-label" id="git-setup-head-ref-label">Head (right)</span>
            <Dropdown
              ariaLabel="Head ref"
              disabled={refsUnavailable}
              options={refOptions}
              value={headRef}
              onChange={onHeadRefChange}
            />
          </div>
          {#if refStatusMessage}
            <p class="git-setup-suboption-status">{refStatusMessage}</p>
          {/if}
        </div>
        {#if activeCommandPreview}
          <p class="git-compare-detail-command">
            Runs <code>{activeCommandPreview}</code>
          </p>
        {/if}
      </div>
    {:else if selectionKind === 'commit'}
      <div class="git-compare-detail" aria-label="{activeCard.title} commit">
        <p class="git-compare-detail-hint">
          Shows what a single commit changed, compared against its parent.
        </p>
        <span class="git-setup-label" id="git-setup-commit-ref-label">Commit</span>
        <Dropdown
          ariaLabel="Commit"
          disabled={commitsUnavailable}
          options={commitOptions}
          value={commitRef}
          onChange={onCommitRefChange}
        />
        {#if commitStatusMessage}
          <p class="git-setup-suboption-status">{commitStatusMessage}</p>
        {/if}
        {#if activeCommandPreview}
          <p class="git-compare-detail-command">
            Runs <code>{activeCommandPreview}</code>
          </p>
        {/if}
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

  .git-compare-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 8px;
  }

  .git-compare-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    min-width: 0;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--card-bg);
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }

  .git-compare-card:hover {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  }

  .git-compare-card:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .git-compare-card.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, var(--card-bg));
  }

  .git-compare-card-title {
    font-size: 12px;
    font-weight: 600;
    line-height: 1.2;
  }

  .git-compare-card-semantics {
    color: var(--text);
    font-size: 11px;
    line-height: 1.3;
  }

  .git-compare-card-command {
    color: var(--muted);
    font-family: var(--code, var(--font-code));
    font-size: 11px;
    line-height: 1.3;
  }

  .git-compare-detail {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--card-bg);
  }

  .git-compare-detail-hint {
    margin: 0;
    color: var(--muted);
    font-size: 11px;
  }

  .git-compare-detail-command {
    margin: 0;
    color: var(--muted);
    font-size: 11px;
  }

  .git-compare-detail-command code {
    color: var(--text);
    font-family: var(--code, var(--font-code));
    font-size: 11px;
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

  .git-setup-suboption-status {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--muted);
    font-size: 11px;
  }
</style>
