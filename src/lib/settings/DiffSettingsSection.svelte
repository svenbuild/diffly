<script lang="ts">
  import type { CompareViewerSettings, ViewMode } from '../types'

  export let viewMode: ViewMode
  export let viewerSettings: CompareViewerSettings
  export let ignoreWhitespace: boolean
  export let ignoreCase: boolean
  export let comparisonRulesRequireRefresh: boolean
  export let compareNeedsRefresh: boolean
  export let onSetViewMode: (viewMode: ViewMode) => void
  export let onSetViewerSettings: (settings: CompareViewerSettings) => void
  export let onToggleIgnoreWhitespace: () => void
  export let onToggleIgnoreCase: () => void

  function updateViewerSettings(patch: Partial<CompareViewerSettings>) {
    onSetViewerSettings({ ...viewerSettings, ...patch })
  }

  function readNumber(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).valueAsNumber
    return Number.isFinite(value) ? value : 0
  }
</script>

<section class="library-settings diff-settings">
  <section class="settings-group">
    <div class="settings-group-header">
      <h3>Layout</h3>
      <p>Control the rendered diff structure and unchanged regions.</p>
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
          <strong>Collapsed context threshold</strong>
          <p>Minimum unchanged lines before a region can collapse.</p>
        </div>
        <div class="settings-control">
          <input
            min="0"
            max="500"
            type="number"
            value={viewerSettings.collapsedContextThreshold}
            on:input={(event) => updateViewerSettings({ collapsedContextThreshold: readNumber(event) })}
          />
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>Expansion line count</strong>
          <p>How many lines Pierre expands when opening collapsed regions.</p>
        </div>
        <div class="settings-control">
          <input
            min="1"
            max="5000"
            type="number"
            value={viewerSettings.expansionLineCount}
            on:input={(event) => updateViewerSettings({ expansionLineCount: readNumber(event) })}
          />
        </div>
      </div>

      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>Sticky header</strong>
          <p>Keep the file header pinned while scrolling inside the diff.</p>
        </div>
        <span class="settings-control">
          <span class="settings-switch">
            <input
              checked={viewerSettings.stickyHeader}
              role="switch"
              type="checkbox"
              on:change={() => updateViewerSettings({ stickyHeader: !viewerSettings.stickyHeader })}
            />
            <span aria-hidden="true" class="settings-switch-ui"></span>
          </span>
        </span>
      </label>
    </div>
  </section>

  <section class="settings-group">
    <div class="settings-group-header">
      <h3>Rendering</h3>
      <p>Control hunk styling, indicators, line numbers, and backgrounds.</p>
    </div>

    <div class="settings-group-grid">
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
          <strong>Diff indicators</strong>
          <p>Choose change bars, classic +/- prefixes, or no indicators.</p>
        </div>
        <div class="settings-control">
          <select
            value={viewerSettings.diffIndicators}
            on:change={(event) => updateViewerSettings({ diffIndicators: (event.currentTarget as HTMLSelectElement).value as CompareViewerSettings['diffIndicators'] })}
          >
            <option value="bars">Bars</option>
            <option value="classic">Classic</option>
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
          <strong>Line numbers</strong>
          <p>Show or hide the gutter line number text.</p>
        </div>
        <span class="settings-control">
          <span class="settings-switch">
            <input
              checked={!viewerSettings.disableLineNumbers}
              role="switch"
              type="checkbox"
              on:change={() => updateViewerSettings({ disableLineNumbers: !viewerSettings.disableLineNumbers })}
            />
            <span aria-hidden="true" class="settings-switch-ui"></span>
          </span>
        </span>
      </label>

      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>File header</strong>
          <p>Show or hide Pierre's default file header.</p>
        </div>
        <span class="settings-control">
          <span class="settings-switch">
            <input
              checked={!viewerSettings.disableFileHeader}
              role="switch"
              type="checkbox"
              on:change={() => updateViewerSettings({ disableFileHeader: !viewerSettings.disableFileHeader })}
            />
            <span aria-hidden="true" class="settings-switch-ui"></span>
          </span>
        </span>
      </label>

      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>Diff backgrounds</strong>
          <p>Show or hide added and deleted line backgrounds.</p>
        </div>
        <span class="settings-control">
          <span class="settings-switch">
            <input
              checked={!viewerSettings.disableBackground}
              role="switch"
              type="checkbox"
              on:change={() => updateViewerSettings({ disableBackground: !viewerSettings.disableBackground })}
            />
            <span aria-hidden="true" class="settings-switch-ui"></span>
          </span>
        </span>
      </label>
    </div>
  </section>

  <section class="settings-group">
    <div class="settings-group-header">
      <h3>Highlighting</h3>
      <p>Control Shiki and expensive tokenization limits.</p>
    </div>

    <div class="settings-group-grid">
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

      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>Highlighter engine</strong>
          <p>Select the Shiki JavaScript or WASM engine.</p>
        </div>
        <div class="settings-control">
          <select
            value={viewerSettings.preferredHighlighter}
            on:change={(event) => updateViewerSettings({ preferredHighlighter: (event.currentTarget as HTMLSelectElement).value as CompareViewerSettings['preferredHighlighter'] })}
          >
            <option value="shiki-js">Shiki JS</option>
            <option value="shiki-wasm">Shiki WASM</option>
          </select>
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>Tokenize max line length</strong>
          <p>Skip syntax tokens for lines beyond this length.</p>
        </div>
        <div class="settings-control">
          <input
            min="0"
            max="20000"
            type="number"
            value={viewerSettings.tokenizeMaxLineLength}
            on:input={(event) => updateViewerSettings({ tokenizeMaxLineLength: readNumber(event) })}
          />
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>Tokenize max length</strong>
          <p>Skip syntax tokens after this total content length.</p>
        </div>
        <div class="settings-control">
          <input
            min="0"
            max="1000000"
            type="number"
            value={viewerSettings.tokenizeMaxLength}
            on:input={(event) => updateViewerSettings({ tokenizeMaxLength: readNumber(event) })}
          />
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>Max line diff length</strong>
          <p>Skip inline diffing when paired lines exceed this length.</p>
        </div>
        <div class="settings-control">
          <input
            min="0"
            max="20000"
            type="number"
            value={viewerSettings.maxLineDiffLength}
            on:input={(event) => updateViewerSettings({ maxLineDiffLength: readNumber(event) })}
          />
        </div>
      </div>
    </div>
  </section>

  <section class="settings-group">
    <div class="settings-group-header">
      <h3>Interaction</h3>
      <p>Control hover and selection behavior.</p>
    </div>

    <div class="settings-group-grid">
      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>Line hover highlight</strong>
          <p>Choose which part of a row highlights on pointer hover.</p>
        </div>
        <div class="settings-control">
          <select
            value={viewerSettings.lineHoverHighlight}
            on:change={(event) => updateViewerSettings({ lineHoverHighlight: (event.currentTarget as HTMLSelectElement).value as CompareViewerSettings['lineHoverHighlight'] })}
          >
            <option value="disabled">Disabled</option>
            <option value="both">Line and number</option>
            <option value="line">Line</option>
            <option value="number">Number</option>
          </select>
        </div>
      </div>

      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>Line selection</strong>
          <p>Allow selecting ranges inside the rendered diff.</p>
        </div>
        <span class="settings-control">
          <span class="settings-switch">
            <input
              checked={viewerSettings.enableLineSelection}
              role="switch"
              type="checkbox"
              on:change={() => updateViewerSettings({ enableLineSelection: !viewerSettings.enableLineSelection })}
            />
            <span aria-hidden="true" class="settings-switch-ui"></span>
          </span>
        </span>
      </label>

      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>Disable virtualization buffers</strong>
          <p>Force Pierre to render without buffer rows.</p>
        </div>
        <span class="settings-control">
          <span class="settings-switch">
            <input
              checked={viewerSettings.disableVirtualizationBuffers}
              role="switch"
              type="checkbox"
              on:change={() => updateViewerSettings({ disableVirtualizationBuffers: !viewerSettings.disableVirtualizationBuffers })}
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
