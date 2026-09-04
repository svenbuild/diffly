<script lang="ts">
  import type { CompareViewerSettings, ViewMode } from '../types'
  import Dropdown from '../components/Dropdown.svelte'
  import { PIERRE_SETTING_LABELS } from './pierre-setting-labels'

  const labels = PIERRE_SETTING_LABELS

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
          <strong>{labels.diffStyle.label}</strong>
          <p>{labels.diffStyle.description}</p>
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
          <strong>{labels.overflow.label}</strong>
          <p>{labels.overflow.description}</p>
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
          <strong>{labels.expandUnchanged.label}</strong>
          <p>{labels.expandUnchanged.description}</p>
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
          <strong>{labels.collapsedContextThreshold.label}</strong>
          <p>{labels.collapsedContextThreshold.description}</p>
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
          <strong>{labels.expansionLineCount.label}</strong>
          <p>{labels.expansionLineCount.description}</p>
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
          <strong>{labels.stickyHeader.label}</strong>
          <p>{labels.stickyHeader.description}</p>
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
          <strong>{labels.lineDiffType.label}</strong>
          <p>{labels.lineDiffType.description}</p>
        </div>
        <div class="settings-control">
          <Dropdown
            ariaLabel={labels.lineDiffType.label}
            options={lineDiffTypeOptions}
            value={viewerSettings.lineDiffType}
            onChange={(value) => updateViewerSettings({ lineDiffType: value as CompareViewerSettings['lineDiffType'] })}
          />
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>{labels.diffIndicators.label}</strong>
          <p>{labels.diffIndicators.description}</p>
        </div>
        <div class="settings-control">
          <Dropdown
            ariaLabel={labels.diffIndicators.label}
            options={diffIndicatorOptions}
            value={viewerSettings.diffIndicators}
            onChange={(value) => updateViewerSettings({ diffIndicators: value as CompareViewerSettings['diffIndicators'] })}
          />
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>{labels.hunkSeparators.label}</strong>
          <p>{labels.hunkSeparators.description}</p>
        </div>
        <div class="settings-control">
          <Dropdown
            ariaLabel={labels.hunkSeparators.label}
            options={hunkSeparatorOptions}
            value={viewerSettings.hunkSeparators}
            onChange={(value) => updateViewerSettings({ hunkSeparators: value as CompareViewerSettings['hunkSeparators'] })}
          />
        </div>
      </div>

      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>{labels.disableLineNumbers.label}</strong>
          <p>{labels.disableLineNumbers.description}</p>
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
          <strong>{labels.disableFileHeader.label}</strong>
          <p>{labels.disableFileHeader.description}</p>
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
          <strong>{labels.disableBackground.label}</strong>
          <p>{labels.disableBackground.description}</p>
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
          <strong>{labels.useTokenTransformer.label}</strong>
          <p>{labels.useTokenTransformer.description}</p>
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
          <strong>{labels.preferredHighlighter.label}</strong>
          <p>{labels.preferredHighlighter.description}</p>
        </div>
        <div class="settings-control">
          <Dropdown
            ariaLabel={labels.preferredHighlighter.label}
            options={highlighterOptions}
            value={viewerSettings.preferredHighlighter}
            onChange={(value) => updateViewerSettings({ preferredHighlighter: value as CompareViewerSettings['preferredHighlighter'] })}
          />
        </div>
      </div>


      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>{labels.tokenizeMaxLineLength.label}</strong>
          <p>{labels.tokenizeMaxLineLength.description}</p>
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
          <strong>{labels.tokenizeMaxLength.label}</strong>
          <p>{labels.tokenizeMaxLength.description}</p>
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
          <strong>{labels.maxLineDiffLength.label}</strong>
          <p>{labels.maxLineDiffLength.description}</p>
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
          <strong>{labels.lineHoverHighlight.label}</strong>
          <p>{labels.lineHoverHighlight.description}</p>
        </div>
        <div class="settings-control">
          <Dropdown
            ariaLabel={labels.lineHoverHighlight.label}
            options={lineHoverOptions}
            value={viewerSettings.lineHoverHighlight}
            onChange={(value) => updateViewerSettings({ lineHoverHighlight: value as CompareViewerSettings['lineHoverHighlight'] })}
          />
        </div>
      </div>


      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>{labels.tokenHover.label}</strong>
          <p>{labels.tokenHover.description}</p>
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
          <strong>{labels.enableGutterUtility.label}</strong>
          <p>{labels.enableGutterUtility.description}</p>
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
          <strong>{labels.enableLineSelection.label}</strong>
          <p>{labels.enableLineSelection.description}</p>
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


    </div>
  </section>
{/if}

