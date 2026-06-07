<script lang="ts">
  import type { CompareViewerSettings, ViewMode } from '../types'
  import Dropdown from '../components/Dropdown.svelte'

  export let activeSection: string = 'layout'
  export let viewMode: ViewMode
  export let viewerSettings: CompareViewerSettings
  export let onSetViewMode: (viewMode: ViewMode) => void
  export let onSetViewerSettings: (settings: CompareViewerSettings) => void

  function updateViewerSettings(patch: Partial<CompareViewerSettings>) {
    onSetViewerSettings({ ...viewerSettings, ...patch })
  }

  function readNumber(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).valueAsNumber
    return Number.isFinite(value) ? value : 0
  }

  const lineDiffTypeOptions = [
    { value: 'word-alt', label: 'Word alt' },
    { value: 'word', label: 'Word' },
    { value: 'char', label: 'Character' },
    { value: 'none', label: 'None' },
  ]

  const diffIndicatorOptions = [
    { value: 'bars', label: 'Bars' },
    { value: 'classic', label: 'Classic' },
    { value: 'none', label: 'None' },
  ]

  const hunkSeparatorOptions = [
    { value: 'line-info', label: 'Line info' },
    { value: 'line-info-basic', label: 'Line info basic' },
    { value: 'metadata', label: 'Metadata' },
    { value: 'simple', label: 'Simple' },
  ]

  const highlighterOptions = [
    { value: 'shiki-js', label: 'Shiki JS' },
    { value: 'shiki-wasm', label: 'Shiki WASM' },
  ]

  const lineHoverOptions = [
    { value: 'disabled', label: 'Disabled' },
    { value: 'both', label: 'Line and number' },
    { value: 'line', label: 'Line' },
    { value: 'number', label: 'Number' },
  ]
</script>

{#if activeSection === 'layout'}
  <section class="settings-group compare-section-card">
    <div class="settings-group-grid">
      <div class="settings-row settings-row-span-full">
        <div class="settings-row-copy">
          <strong>View mode</strong>
          <p>Use split or unified layout.</p>
        </div>
        <div class="settings-control">
          <button
            aria-label={viewMode === 'sideBySide' ? 'Switch to unified view' : 'Switch to split view'}
            aria-pressed={viewMode === 'unified'}
            class="secondary settings-view-mode-toggle"
            type="button"
            on:click={() => onSetViewMode(viewMode === 'sideBySide' ? 'unified' : 'sideBySide')}
          >
            {#if viewMode === 'sideBySide'}
              <svg aria-hidden="true" class="view-mode-icon" viewBox="0 0 16 16">
                <rect x="2.5" y="3" width="4.2" height="10" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3" />
                <rect x="9.3" y="3" width="4.2" height="10" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3" />
              </svg>
              <span>Split</span>
            {:else}
              <svg aria-hidden="true" class="view-mode-icon" viewBox="0 0 16 16">
                <rect x="2.5" y="3" width="11" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3" />
                <path d="M4.8 5.5h6.4M4.8 8h6.4M4.8 10.5h4.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.3" />
              </svg>
              <span>Unified</span>
            {/if}
          </button>
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
{/if}

{#if activeSection === 'rendering'}
  <section class="settings-group compare-section-card">
    <div class="settings-group-grid">
      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>Inline diff</strong>
          <p>Choose word, character, or no inline highlighting.</p>
        </div>
        <div class="settings-control">
          <Dropdown
            ariaLabel="Inline diff"
            options={lineDiffTypeOptions}
            value={viewerSettings.lineDiffType}
            onChange={(value) => updateViewerSettings({ lineDiffType: value as CompareViewerSettings['lineDiffType'] })}
          />
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>Diff indicators</strong>
          <p>Choose change bars, classic +/- prefixes, or no indicators.</p>
        </div>
        <div class="settings-control">
          <Dropdown
            ariaLabel="Diff indicators"
            options={diffIndicatorOptions}
            value={viewerSettings.diffIndicators}
            onChange={(value) => updateViewerSettings({ diffIndicators: value as CompareViewerSettings['diffIndicators'] })}
          />
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>Hunk separators</strong>
          <p>Choose the separator style between changed regions.</p>
        </div>
        <div class="settings-control">
          <Dropdown
            ariaLabel="Hunk separators"
            options={hunkSeparatorOptions}
            value={viewerSettings.hunkSeparators}
            onChange={(value) => updateViewerSettings({ hunkSeparators: value as CompareViewerSettings['hunkSeparators'] })}
          />
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
{/if}

{#if activeSection === 'syntax'}
  <section class="settings-group compare-section-card">
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
          <Dropdown
            ariaLabel="Preferred highlighter"
            options={highlighterOptions}
            value={viewerSettings.preferredHighlighter}
            onChange={(value) => updateViewerSettings({ preferredHighlighter: value as CompareViewerSettings['preferredHighlighter'] })}
          />
        </div>
      </div>

      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>CSS classes</strong>
          <p>Use Pierre's class-based token style output.</p>
        </div>
        <span class="settings-control">
          <span class="settings-switch">
            <input
              checked={viewerSettings.useCSSClasses}
              role="switch"
              type="checkbox"
              on:change={() => updateViewerSettings({ useCSSClasses: !viewerSettings.useCSSClasses })}
            />
            <span aria-hidden="true" class="settings-switch-ui"></span>
          </span>
        </span>
      </label>

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
{/if}

{#if activeSection === 'mouse'}
  <section class="settings-group compare-section-card">
    <div class="settings-group-grid">
      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>Line hover highlight</strong>
          <p>Choose which part of a row highlights on pointer hover.</p>
        </div>
        <div class="settings-control">
          <Dropdown
            ariaLabel="Line hover highlight"
            options={lineHoverOptions}
            value={viewerSettings.lineHoverHighlight}
            onChange={(value) => updateViewerSettings({ lineHoverHighlight: value as CompareViewerSettings['lineHoverHighlight'] })}
          />
        </div>
      </div>

      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>Whitespace token interactions</strong>
          <p>Include whitespace tokens in Pierre token callbacks.</p>
        </div>
        <span class="settings-control">
          <span class="settings-switch">
            <input
              checked={viewerSettings.enableTokenInteractionsOnWhitespace}
              role="switch"
              type="checkbox"
              on:change={() => updateViewerSettings({ enableTokenInteractionsOnWhitespace: !viewerSettings.enableTokenInteractionsOnWhitespace })}
            />
            <span aria-hidden="true" class="settings-switch-ui"></span>
          </span>
        </span>
      </label>

      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>Token hover</strong>
          <p>Show an info tooltip when hovering known syntax tokens.</p>
        </div>
        <span class="settings-control">
          <span class="settings-switch">
            <input
              checked={viewerSettings.tokenHover}
              role="switch"
              type="checkbox"
              on:change={() => updateViewerSettings({ tokenHover: !viewerSettings.tokenHover })}
            />
            <span aria-hidden="true" class="settings-switch-ui"></span>
          </span>
        </span>
      </label>

      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>Gutter utility</strong>
          <p>Show Pierre's gutter utility button and report clicked ranges.</p>
        </div>
        <span class="settings-control">
          <span class="settings-switch">
            <input
              checked={viewerSettings.enableGutterUtility}
              role="switch"
              type="checkbox"
              on:change={() => updateViewerSettings({ enableGutterUtility: !viewerSettings.enableGutterUtility })}
            />
            <span aria-hidden="true" class="settings-switch-ui"></span>
          </span>
        </span>
      </label>

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
          <strong>Controlled selection</strong>
          <p>Keep selected ranges in Diffly state and write them back to Pierre.</p>
        </div>
        <span class="settings-control">
          <span class="settings-switch">
            <input
              checked={viewerSettings.controlledSelection}
              role="switch"
              type="checkbox"
              on:change={() => updateViewerSettings({ controlledSelection: !viewerSettings.controlledSelection })}
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
{/if}

