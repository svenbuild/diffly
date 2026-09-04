<script lang="ts">
  import type { CompareTreeSettings } from '../types'
  import Dropdown from '../components/Dropdown.svelte'
  import { PIERRE_SETTING_LABELS } from './pierre-setting-labels'

  const labels = PIERRE_SETTING_LABELS

  export let activeSection: string = 'structure'
  export let treeSettings: CompareTreeSettings
  export let onSetTreeSettings: (settings: CompareTreeSettings) => void

  function updateTreeSettings(patch: Partial<CompareTreeSettings>) {
    onSetTreeSettings({ ...treeSettings, ...patch })
  }

  function readNumber(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).valueAsNumber
    return Number.isFinite(value) ? value : 0
  }

  const sortModeOptions = [
    { value: 'path', label: 'Path order' },
    { value: 'default', label: 'Pierre default' },
  ]

  const iconSetOptions = [
    { value: 'complete', label: 'Complete (colored)' },
    { value: 'standard', label: 'Standard' },
    { value: 'minimal', label: 'Minimal' },
  ]

  const initialExpansionOptions = [
    { value: 'closed', label: 'Closed' },
    { value: 'open', label: 'Open' },
    { value: 'depth', label: 'Depth' },
  ]

  const densityOptions = [
    { value: 'compact', label: 'Compact' },
    { value: 'default', label: 'Default' },
    { value: 'relaxed', label: 'Relaxed' },
    { value: 'custom', label: 'Custom' },
  ]

  const searchModeOptions = [
    { value: 'expand-matches', label: 'Expand matches' },
    { value: 'collapse-non-matches', label: 'Collapse non-matches' },
    { value: 'hide-non-matches', label: 'Hide non-matches' },
  ]

  const searchBlurBehaviorOptions = [
    { value: 'close', label: 'Close' },
    { value: 'retain', label: 'Retain' },
  ]
</script>

{#if activeSection === 'structure'}
  <section class="settings-group compare-section-card">
    <div class="settings-group-grid">
      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>Sort mode</strong>
          <p>Use Diffly path order or Pierre's default tree sorter.</p>
        </div>
        <div class="settings-control">
          <Dropdown
            ariaLabel="Sort mode"
            options={sortModeOptions}
            value={treeSettings.sortMode}
            onChange={(value) => updateTreeSettings({ sortMode: value as CompareTreeSettings['sortMode'] })}
          />
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>{labels.iconSet.label}</strong>
          <p>{labels.iconSet.description}</p>
        </div>
        <div class="settings-control">
          <Dropdown
            ariaLabel={labels.iconSet.label}
            options={iconSetOptions}
            value={treeSettings.iconSet}
            onChange={(value) => updateTreeSettings({ iconSet: value as CompareTreeSettings['iconSet'] })}
          />
        </div>
      </div>

      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>{labels.coloredIcons.label}</strong>
          <p>{labels.coloredIcons.description}</p>
        </div>
        <span class="settings-control">
          <span class="settings-switch">
            <input
              checked={treeSettings.coloredIcons}
              role="switch"
              type="checkbox"
              on:change={() => updateTreeSettings({ coloredIcons: !treeSettings.coloredIcons })}
            />
            <span aria-hidden="true" class="settings-switch-ui"></span>
          </span>
        </span>
      </label>

      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>{labels.initialExpansion.label}</strong>
          <p>{labels.initialExpansion.description}</p>
        </div>
        <div class="settings-control">
          <Dropdown
            ariaLabel={labels.initialExpansion.label}
            options={initialExpansionOptions}
            value={treeSettings.initialExpansion}
            onChange={(value) => updateTreeSettings({ initialExpansion: value as CompareTreeSettings['initialExpansion'] })}
          />
        </div>
      </div>

      {#if treeSettings.initialExpansion === 'depth'}
        <div class="settings-row">
          <div class="settings-row-copy">
            <strong>Expansion depth</strong>
            <p>How many directory levels Pierre opens initially.</p>
          </div>
          <div class="settings-control">
            <input
              min="0"
              max="12"
              type="number"
              value={treeSettings.initialExpansionDepth}
              on:input={(event) => updateTreeSettings({ initialExpansionDepth: readNumber(event) })}
            />
          </div>
        </div>
      {/if}

      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>{labels.flattenEmptyDirectories.label}</strong>
          <p>{labels.flattenEmptyDirectories.description}</p>
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
          <strong>{labels.stickyFolders.label}</strong>
          <p>{labels.stickyFolders.description}</p>
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

      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>{labels.showUnmodified.label}</strong>
          <p>{labels.showUnmodified.description}</p>
        </div>
        <span class="settings-control">
          <span class="settings-switch">
            <input
              checked={treeSettings.showUnmodified}
              role="switch"
              type="checkbox"
              on:change={() => updateTreeSettings({ showUnmodified: !treeSettings.showUnmodified })}
            />
            <span aria-hidden="true" class="settings-switch-ui"></span>
          </span>
        </span>
      </label>

    </div>
  </section>
{/if}

{#if activeSection === 'density'}
  <section class="settings-group compare-section-card">
    <div class="settings-group-grid">
      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>{labels.density.label}</strong>
          <p>{labels.density.description}</p>
        </div>
        <div class="settings-control">
          <Dropdown
            ariaLabel={labels.density.label}
            options={densityOptions}
            value={treeSettings.density}
            onChange={(value) => updateTreeSettings({ density: value as CompareTreeSettings['density'] })}
          />
        </div>
      </div>

      {#if treeSettings.density === 'custom'}
        <div class="settings-row">
          <div class="settings-row-copy">
            <strong>Custom density</strong>
            <p>Unitless Pierre density scale.</p>
          </div>
          <div class="settings-control">
            <input
              min="0.5"
              max="2"
              step="0.1"
              type="number"
              value={treeSettings.customDensity}
              on:input={(event) => updateTreeSettings({ customDensity: readNumber(event) })}
            />
          </div>
        </div>
      {/if}

      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>{labels.itemHeight.label}</strong>
          <p>{labels.itemHeight.description}</p>
        </div>
        <div class="settings-control">
          <input
            min="18"
            max="60"
            type="number"
            value={treeSettings.itemHeight}
            on:input={(event) => updateTreeSettings({ itemHeight: readNumber(event) })}
          />
        </div>
      </div>


    </div>
  </section>
{/if}

{#if activeSection === 'search'}
  <section class="settings-group compare-section-card">
    <div class="settings-group-grid">
      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>{labels.search.label}</strong>
          <p>{labels.search.description}</p>
        </div>
        <span class="settings-control">
          <span class="settings-switch">
            <input
              checked={treeSettings.search}
              role="switch"
              type="checkbox"
              on:change={() => updateTreeSettings({ search: !treeSettings.search })}
            />
            <span aria-hidden="true" class="settings-switch-ui"></span>
          </span>
        </span>
      </label>

      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>{labels.fileTreeSearchMode.label}</strong>
          <p>{labels.fileTreeSearchMode.description}</p>
        </div>
        <div class="settings-control">
          <Dropdown
            ariaLabel={labels.fileTreeSearchMode.label}
            options={searchModeOptions}
            value={treeSettings.searchMode}
            onChange={(value) => updateTreeSettings({ searchMode: value as CompareTreeSettings['searchMode'] })}
          />
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>{labels.searchBlurBehavior.label}</strong>
          <p>{labels.searchBlurBehavior.description}</p>
        </div>
        <div class="settings-control">
          <Dropdown
            ariaLabel={labels.searchBlurBehavior.label}
            options={searchBlurBehaviorOptions}
            value={treeSettings.searchBlurBehavior}
            onChange={(value) => updateTreeSettings({ searchBlurBehavior: value as CompareTreeSettings['searchBlurBehavior'] })}
          />
        </div>
      </div>


    </div>
  </section>
{/if}
