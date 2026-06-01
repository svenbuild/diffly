<script lang="ts">
  import type { CompareTreeSettings } from '../types'

  export let treeSettings: CompareTreeSettings
  export let onSetTreeSettings: (settings: CompareTreeSettings) => void

  function updateTreeSettings(patch: Partial<CompareTreeSettings>) {
    onSetTreeSettings({ ...treeSettings, ...patch })
  }

  function readNumber(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).valueAsNumber
    return Number.isFinite(value) ? value : 0
  }

  function parsePathList(value: string) {
    return value
      .split(/\r?\n/)
      .map((path) => path.trim())
      .filter(Boolean)
  }
</script>

<section class="library-settings tree-settings">
  <section class="settings-group">
    <div class="settings-group-header">
      <h3>Structure</h3>
      <p>Control how paths are sorted, expanded, and flattened.</p>
    </div>

    <div class="settings-group-grid">
      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>Sort mode</strong>
          <p>Use Diffly path order or Pierre's default tree sorter.</p>
        </div>
        <div class="settings-control">
          <select
            value={treeSettings.sortMode}
            on:change={(event) => updateTreeSettings({ sortMode: (event.currentTarget as HTMLSelectElement).value as CompareTreeSettings['sortMode'] })}
          >
            <option value="path">Path order</option>
            <option value="default">Pierre default</option>
          </select>
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>Initial expansion</strong>
          <p>Choose whether the tree starts closed, open, or expanded by depth.</p>
        </div>
        <div class="settings-control">
          <select
            value={treeSettings.initialExpansion}
            on:change={(event) => updateTreeSettings({ initialExpansion: (event.currentTarget as HTMLSelectElement).value as CompareTreeSettings['initialExpansion'] })}
          >
            <option value="closed">Closed</option>
            <option value="open">Open</option>
            <option value="depth">Depth</option>
          </select>
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

      <div class="settings-row settings-row-span-full settings-row-block">
        <div class="settings-row-copy">
          <strong>Initial expanded paths</strong>
          <p>Optional newline-separated paths that Pierre should expand on mount.</p>
        </div>
        <div class="settings-control settings-control-wide">
          <textarea
            rows="4"
            value={treeSettings.initialExpandedPaths.join('\n')}
            on:input={(event) => updateTreeSettings({ initialExpandedPaths: parsePathList((event.currentTarget as HTMLTextAreaElement).value) })}
          ></textarea>
        </div>
      </div>
    </div>
  </section>

  <section class="settings-group">
    <div class="settings-group-header">
      <h3>Density</h3>
      <p>Control row height, spacing, and virtualized row windows.</p>
    </div>

    <div class="settings-group-grid">
      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>Density preset</strong>
          <p>Use Pierre's preset density or a custom scale factor.</p>
        </div>
        <div class="settings-control">
          <select
            value={treeSettings.density}
            on:change={(event) => updateTreeSettings({ density: (event.currentTarget as HTMLSelectElement).value as CompareTreeSettings['density'] })}
          >
            <option value="compact">Compact</option>
            <option value="default">Default</option>
            <option value="relaxed">Relaxed</option>
            <option value="custom">Custom</option>
          </select>
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
          <strong>Item height</strong>
          <p>Explicit row height in pixels.</p>
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

      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>Initial visible rows</strong>
          <p>Rows used for initial tree viewport estimation.</p>
        </div>
        <div class="settings-control">
          <input
            min="1"
            max="200"
            type="number"
            value={treeSettings.initialVisibleRowCount}
            on:input={(event) => updateTreeSettings({ initialVisibleRowCount: readNumber(event) })}
          />
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>Overscan</strong>
          <p>Extra rows rendered outside the visible tree window.</p>
        </div>
        <div class="settings-control">
          <input
            min="0"
            max="200"
            type="number"
            value={treeSettings.overscan}
            on:input={(event) => updateTreeSettings({ overscan: readNumber(event) })}
          />
        </div>
      </div>
    </div>
  </section>

  <section class="settings-group">
    <div class="settings-group-header">
      <h3>Search</h3>
      <p>Control Pierre's built-in tree search behavior.</p>
    </div>

    <div class="settings-group-grid">
      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>Search</strong>
          <p>Enable Pierre's built-in search input in the tree.</p>
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
          <strong>Search mode</strong>
          <p>Choose how non-matching tree rows behave.</p>
        </div>
        <div class="settings-control">
          <select
            value={treeSettings.searchMode}
            on:change={(event) => updateTreeSettings({ searchMode: (event.currentTarget as HTMLSelectElement).value as CompareTreeSettings['searchMode'] })}
          >
            <option value="expand-matches">Expand matches</option>
            <option value="collapse-non-matches">Collapse non-matches</option>
            <option value="hide-non-matches">Hide non-matches</option>
          </select>
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>Search blur behavior</strong>
          <p>Close or retain the search session when it loses focus.</p>
        </div>
        <div class="settings-control">
          <select
            value={treeSettings.searchBlurBehavior}
            on:change={(event) => updateTreeSettings({ searchBlurBehavior: (event.currentTarget as HTMLSelectElement).value as CompareTreeSettings['searchBlurBehavior'] })}
          >
            <option value="close">Close</option>
            <option value="retain">Retain</option>
          </select>
        </div>
      </div>

      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>Fake search focus</strong>
          <p>Use Pierre's visual fake-focus state for search.</p>
        </div>
        <span class="settings-control">
          <span class="settings-switch">
            <input
              checked={treeSettings.searchFakeFocus}
              role="switch"
              type="checkbox"
              on:change={() => updateTreeSettings({ searchFakeFocus: !treeSettings.searchFakeFocus })}
            />
            <span aria-hidden="true" class="settings-switch-ui"></span>
          </span>
        </span>
      </label>

      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>Initial search query</strong>
          <p>Optional query applied when the tree mounts.</p>
        </div>
        <div class="settings-control">
          <input
            type="text"
            value={treeSettings.initialSearchQuery}
            on:input={(event) => updateTreeSettings({ initialSearchQuery: (event.currentTarget as HTMLInputElement).value })}
          />
        </div>
      </div>
    </div>
  </section>

  <section class="settings-group">
    <div class="settings-group-header">
      <h3>Mutation</h3>
      <p>Enable Pierre's in-memory tree mutation interactions.</p>
    </div>

    <div class="settings-group-grid">
      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>Drag and drop</strong>
          <p>Allow Pierre's local drag and drop behavior in the tree.</p>
        </div>
        <span class="settings-control">
          <span class="settings-switch">
            <input
              checked={treeSettings.dragAndDrop}
              role="switch"
              type="checkbox"
              on:change={() => updateTreeSettings({ dragAndDrop: !treeSettings.dragAndDrop })}
            />
            <span aria-hidden="true" class="settings-switch-ui"></span>
          </span>
        </span>
      </label>

      <label class="settings-row settings-row-interactive">
        <div class="settings-row-copy">
          <strong>Renaming</strong>
          <p>Allow Pierre's local inline rename behavior in the tree.</p>
        </div>
        <span class="settings-control">
          <span class="settings-switch">
            <input
              checked={treeSettings.renaming}
              role="switch"
              type="checkbox"
              on:change={() => updateTreeSettings({ renaming: !treeSettings.renaming })}
            />
            <span aria-hidden="true" class="settings-switch-ui"></span>
          </span>
        </span>
      </label>
    </div>
  </section>
</section>
