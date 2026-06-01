<script lang="ts">
  import type { CompareTreeSettings, CompareViewerSettings, ViewMode } from '../types'

  export let viewMode: ViewMode
  export let viewerSettings: CompareViewerSettings
  export let treeSettings: CompareTreeSettings
  export let ignoreWhitespace: boolean
  export let ignoreCase: boolean
  export let comparisonRulesRequireRefresh: boolean
  export let compareNeedsRefresh: boolean
  export let onSetViewMode: (viewMode: ViewMode) => void
  export let onSetViewerSettings: (settings: CompareViewerSettings) => void
  export let onSetTreeSettings: (settings: CompareTreeSettings) => void
  export let onToggleIgnoreWhitespace: () => void
  export let onToggleIgnoreCase: () => void

  function updateViewerSettings(patch: Partial<CompareViewerSettings>) {
    onSetViewerSettings({ ...viewerSettings, ...patch })
  }

  function updateTreeSettings(patch: Partial<CompareTreeSettings>) {
    onSetTreeSettings({ ...treeSettings, ...patch })
  }
</script>

<section class="settings-page viewer-settings">
  <div class="settings-page-heading">
    <h2>Viewer</h2>
    <p>Defaults for Pierre diffs and directory trees.</p>
  </div>

  <section class="settings-group">
    <div class="settings-group-header">
      <h3>Diff</h3>
      <p>Control how text changes are rendered.</p>
    </div>

    <div class="settings-group-grid">
      <div class="settings-row settings-row-span-full">
        <div class="settings-row-copy">
          <strong>View mode</strong>
          <p>Use split or unified layout.</p>
        </div>

        <div class="settings-control">
          <div class="segmented-control toolbar-segmented-control settings-segmented-control" role="group" aria-label="Default diff view">
            <button
              aria-pressed={viewMode === 'sideBySide'}
              class:active={viewMode === 'sideBySide'}
              type="button"
              on:click={() => onSetViewMode('sideBySide')}
            >
              Split
            </button>
            <button
              aria-pressed={viewMode === 'unified'}
              class:active={viewMode === 'unified'}
              type="button"
              on:click={() => onSetViewMode('unified')}
            >
              Unified
            </button>
          </div>
        </div>
      </div>

      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>Wrap long lines</strong>
          <p>Wrap code instead of using horizontal scrolling.</p>
        </div>
        <span class="settings-control">
          <span class="settings-switch">
            <input
              checked={viewerSettings.codeOverflow === 'wrap'}
              role="switch"
              type="checkbox"
              on:change={() => updateViewerSettings({ codeOverflow: viewerSettings.codeOverflow === 'wrap' ? 'scroll' : 'wrap' })}
            />
            <span aria-hidden="true" class="settings-switch-ui"></span>
          </span>
        </span>
      </label>

      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>Expand unchanged</strong>
          <p>Open diffs with unchanged regions expanded.</p>
        </div>
        <span class="settings-control">
          <span class="settings-switch">
            <input
              checked={viewerSettings.expandUnchanged}
              role="switch"
              type="checkbox"
              on:change={() => updateViewerSettings({ expandUnchanged: !viewerSettings.expandUnchanged })}
            />
            <span aria-hidden="true" class="settings-switch-ui"></span>
          </span>
        </span>
      </label>

      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>Inline diff</strong>
          <p>Choose word, character, or no inline highlighting.</p>
        </div>
        <div class="settings-control">
          <select
            value={viewerSettings.lineDiffType}
            on:change={(event) => updateViewerSettings({ lineDiffType: (event.currentTarget as HTMLSelectElement).value as CompareViewerSettings['lineDiffType'] })}
          >
            <option value="word-alt">Word alt</option>
            <option value="word">Word</option>
            <option value="char">Character</option>
            <option value="none">None</option>
          </select>
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>Hunk separators</strong>
          <p>Choose the separator style between changed regions.</p>
        </div>
        <div class="settings-control">
          <select
            value={viewerSettings.hunkSeparators}
            on:change={(event) => updateViewerSettings({ hunkSeparators: (event.currentTarget as HTMLSelectElement).value as CompareViewerSettings['hunkSeparators'] })}
          >
            <option value="line-info">Line info</option>
            <option value="line-info-basic">Line info basic</option>
            <option value="metadata">Metadata</option>
            <option value="simple">Simple</option>
          </select>
        </div>
      </div>

      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>Syntax highlighting</strong>
          <p>Use Shiki highlighting for supported languages.</p>
        </div>
        <span class="settings-control">
          <span class="settings-switch">
            <input
              checked={viewerSettings.syntaxMode === 'shiki'}
              role="switch"
              type="checkbox"
              on:change={() => updateViewerSettings({ syntaxMode: viewerSettings.syntaxMode === 'shiki' ? 'plain' : 'shiki' })}
            />
            <span aria-hidden="true" class="settings-switch-ui"></span>
          </span>
        </span>
      </label>
    </div>
  </section>

  <section class="settings-group">
    <div class="settings-group-header">
      <h3>Tree</h3>
      <p>Control the changed-file list.</p>
    </div>

    <div class="settings-group-grid">
      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>Density</strong>
          <p>Set directory row spacing.</p>
        </div>
        <div class="settings-control">
          <select
            value={treeSettings.density}
            on:change={(event) => updateTreeSettings({ density: (event.currentTarget as HTMLSelectElement).value as CompareTreeSettings['density'] })}
          >
            <option value="compact">Compact</option>
            <option value="default">Default</option>
            <option value="relaxed">Relaxed</option>
          </select>
        </div>
      </div>

      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>Flatten empty folders</strong>
          <p>Compress folder chains with no branching.</p>
        </div>
        <span class="settings-control">
          <span class="settings-switch">
            <input
              checked={treeSettings.flattenEmptyDirectories}
              role="switch"
              type="checkbox"
              on:change={() => updateTreeSettings({ flattenEmptyDirectories: !treeSettings.flattenEmptyDirectories })}
            />
            <span aria-hidden="true" class="settings-switch-ui"></span>
          </span>
        </span>
      </label>

      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>Sticky folders</strong>
          <p>Keep parent folders visible while scrolling.</p>
        </div>
        <span class="settings-control">
          <span class="settings-switch">
            <input
              checked={treeSettings.stickyFolders}
              role="switch"
              type="checkbox"
              on:change={() => updateTreeSettings({ stickyFolders: !treeSettings.stickyFolders })}
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
      <p>
        Choose what counts as a meaningful change.
        {#if comparisonRulesRequireRefresh}
          Press Refresh in the compare toolbar to apply updates to the current folder snapshot.
        {/if}
      </p>
    </div>

    {#if compareNeedsRefresh}
      <p class="settings-inline-note">
        The current compare is using the previous rules until you refresh it.
      </p>
    {/if}

    <div class="settings-group-grid">
      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>Whitespace</strong>
          <p>Compare spacing exactly or ignore whitespace-only edits.</p>
        </div>
        <div class="settings-control">
          <div class="segmented-control toolbar-segmented-control settings-segmented-control" role="group" aria-label="Whitespace handling">
            <button aria-pressed={!ignoreWhitespace} class:active={!ignoreWhitespace} type="button" on:click={onToggleIgnoreWhitespace}>Exact</button>
            <button aria-pressed={ignoreWhitespace} class:active={ignoreWhitespace} type="button" on:click={onToggleIgnoreWhitespace}>Ignore</button>
          </div>
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>Case sensitivity</strong>
          <p>Choose whether letter case should count as a change.</p>
        </div>
        <div class="settings-control">
          <div class="segmented-control toolbar-segmented-control settings-segmented-control" role="group" aria-label="Case sensitivity">
            <button aria-pressed={!ignoreCase} class:active={!ignoreCase} type="button" on:click={onToggleIgnoreCase}>Sensitive</button>
            <button aria-pressed={ignoreCase} class:active={ignoreCase} type="button" on:click={onToggleIgnoreCase}>Insensitive</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</section>
