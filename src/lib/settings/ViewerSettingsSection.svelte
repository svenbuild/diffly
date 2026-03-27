<script lang="ts">
  import type { ContextLinesSetting, ViewMode } from '../types'

  export let viewMode: ViewMode
  export let wrapSideBySideLines: boolean
  export let syncSideBySideScroll: boolean
  export let showFullFile: boolean
  export let contextLines: ContextLinesSetting
  export let contextLinePresets: ContextLinesSetting[]
  export let showSyntaxHighlighting: boolean
  export let showInlineHighlights: boolean
  export let ignoreWhitespace: boolean
  export let ignoreCase: boolean
  export let onSetViewMode: (viewMode: ViewMode) => void
  export let onToggleWrapSideBySideLines: () => void
  export let onToggleSyncSideBySideScroll: () => void
  export let onToggleShowFullFile: () => void
  export let onSetContextLines: (value: string) => void
  export let onToggleShowSyntaxHighlighting: () => void
  export let onToggleShowInlineHighlights: () => void
  export let onToggleIgnoreWhitespace: () => void
  export let onToggleIgnoreCase: () => void
</script>

<section class="settings-page">
  <div class="settings-page-heading">
    <h2>Viewer</h2>
    <p>Defaults for reading and navigating diffs.</p>
  </div>

  <section class="settings-group">
    <div class="settings-group-header">
      <h3>Layout</h3>
      <p>Choose how each diff opens and moves as you read it.</p>
    </div>

    <div class="settings-group-grid">
      <div class="settings-row settings-row-span-full">
        <div class="settings-row-copy">
          <strong>View mode</strong>
          <p>Use split or unified view when a compare opens.</p>
        </div>

        <div class="settings-control">
          <div
            class="segmented-control toolbar-segmented-control settings-segmented-control"
            role="group"
            aria-label="Default diff view"
          >
            <button
              aria-pressed={viewMode === 'sideBySide'}
              class:active={viewMode === 'sideBySide'}
              type="button"
              on:click={() => onSetViewMode(viewMode === 'sideBySide' ? 'unified' : 'sideBySide')}
            >
              <svg aria-hidden="true" viewBox="0 0 16 16">
                <rect x="2.6" y="3.2" width="11" height="9.6" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.3" />
                <path d="M8 3.4v9.2" fill="none" stroke="currentColor" stroke-width="1.3" />
              </svg>
              <span>Split</span>
            </button>

            <button
              aria-pressed={viewMode === 'unified'}
              class:active={viewMode === 'unified'}
              type="button"
              on:click={() => onSetViewMode(viewMode === 'sideBySide' ? 'unified' : 'sideBySide')}
            >
              <svg aria-hidden="true" viewBox="0 0 16 16">
                <rect x="2.6" y="3.2" width="10.8" height="9.6" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.3" />
                <path d="M5 6h6M5 8h5.1M5 10h6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.3" />
              </svg>
              <span>Unified</span>
            </button>
          </div>
        </div>
      </div>

      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>Wrap long lines</strong>
          <p>Wrap side-by-side lines instead of horizontal scrolling.</p>
        </div>

        <span class="settings-control">
          <span class="settings-switch">
            <input
              checked={wrapSideBySideLines}
              role="switch"
              type="checkbox"
              on:change={onToggleWrapSideBySideLines}
            />
            <span aria-hidden="true" class="settings-switch-ui"></span>
          </span>
        </span>
      </label>

      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>Sync scrolling</strong>
          <p>Keep both panes aligned while you scroll.</p>
        </div>

        <span class="settings-control">
          <span class="settings-switch">
            <input
              checked={syncSideBySideScroll}
              role="switch"
              type="checkbox"
              on:change={onToggleSyncSideBySideScroll}
            />
            <span aria-hidden="true" class="settings-switch-ui"></span>
          </span>
        </span>
      </label>
    </div>
  </section>

  <section class="settings-group">
    <div class="settings-group-header">
      <h3>Content detail</h3>
      <p>Choose how much context and rendering detail the viewer shows.</p>
    </div>

    <div class="settings-group-grid">
      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>Full file</strong>
          <p>Show the entire file instead of context-only hunks.</p>
        </div>

        <span class="settings-control">
          <span class="settings-switch">
            <input
              checked={showFullFile}
              role="switch"
              type="checkbox"
              on:change={onToggleShowFullFile}
            />
            <span aria-hidden="true" class="settings-switch-ui"></span>
          </span>
        </span>
      </label>

      <div class:settings-row-disabled={showFullFile} class="settings-row">
        <div class="settings-row-copy">
          <strong>Context lines</strong>
          <p>Visible lines around each change. Only used when Full file is off.</p>
        </div>

        <div class="settings-control">
          <select
            disabled={showFullFile}
            value={contextLines}
            on:change={(event) => onSetContextLines((event.currentTarget as HTMLSelectElement).value)}
          >
            {#each contextLinePresets as preset}
              <option value={preset}>{preset}</option>
            {/each}
          </select>
        </div>
      </div>

      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>Syntax highlighting</strong>
          <p>Apply language colors inside the diff viewer.</p>
        </div>

        <span class="settings-control">
          <span class="settings-switch">
            <input
              checked={showSyntaxHighlighting}
              role="switch"
              type="checkbox"
              on:change={onToggleShowSyntaxHighlighting}
            />
            <span aria-hidden="true" class="settings-switch-ui"></span>
          </span>
        </span>
      </label>

      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>Inline highlights</strong>
          <p>Mark changed fragments inside each edited line.</p>
        </div>

        <span class="settings-control">
          <span class="settings-switch">
            <input
              checked={showInlineHighlights}
              role="switch"
              type="checkbox"
              on:change={onToggleShowInlineHighlights}
            />
            <span aria-hidden="true" class="settings-switch-ui"></span>
          </span>
        </span>
      </label>
    </div>
  </section>

  <section class="settings-group">
    <div class="settings-group-header">
      <h3>Comparison rules</h3>
      <p>Choose what counts as a meaningful change.</p>
    </div>

    <div class="settings-group-grid">
      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>Whitespace</strong>
          <p>Compare spacing exactly or ignore whitespace-only edits.</p>
        </div>

        <div class="settings-control">
          <div
            class="segmented-control toolbar-segmented-control settings-segmented-control"
            role="group"
            aria-label="Whitespace handling"
          >
            <button
              aria-pressed={!ignoreWhitespace}
              class:active={!ignoreWhitespace}
              type="button"
              on:click={onToggleIgnoreWhitespace}
            >
              Exact
            </button>

            <button
              aria-pressed={ignoreWhitespace}
              class:active={ignoreWhitespace}
              type="button"
              on:click={onToggleIgnoreWhitespace}
            >
              Ignore
            </button>
          </div>
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>Case sensitivity</strong>
          <p>Choose whether letter case should count as a change.</p>
        </div>

        <div class="settings-control">
          <div
            class="segmented-control toolbar-segmented-control settings-segmented-control"
            role="group"
            aria-label="Case sensitivity"
          >
            <button
              aria-pressed={!ignoreCase}
              class:active={!ignoreCase}
              type="button"
              on:click={onToggleIgnoreCase}
            >
              Sensitive
            </button>

            <button
              aria-pressed={ignoreCase}
              class:active={ignoreCase}
              type="button"
              on:click={onToggleIgnoreCase}
            >
              Insensitive
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</section>
