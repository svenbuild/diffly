<script lang="ts">
  import EntryIcon from './EntryIcon.svelte'

  import type { ExplorerEntry } from './types'
  import type { ExplorerPaneState, Side } from './ui-types'
  import type { CompareMode } from './types'

  export let side: Side
  export let pane: ExplorerPaneState
  export let mode: CompareMode
  export let pickerLoading: boolean
  export let canGoBack: (pane: ExplorerPaneState) => boolean
  export let canGoForward: (pane: ExplorerPaneState) => boolean
  export let currentDrive: (pane: ExplorerPaneState) => string
  export let formatModified: (value: number | null) => string
  export let formatSize: (value: number | null) => string
  export let formatBreadcrumbPath: (path: string) => string
  export let formatTargetLabel: (path: string, emptyLabel: string) => string
  export let entryTypeLabel: (entry: ExplorerEntry) => string
  export let changeDrive: (side: Side, path: string) => Promise<void>
  export let navigateHistory: (side: Side, direction: -1 | 1) => Promise<void>
  export let navigateTo: (side: Side, path: string) => Promise<void>
  export let updatePathInput: (side: Side, value: string) => void
  export let submitPathInput: (side: Side) => Promise<void>
  export let browseSystem: (side: Side) => Promise<void>
  export let setCurrentFolderAsTarget: (side: Side) => void
  export let isCurrentFolderSelected: (pane: ExplorerPaneState) => boolean
  export let selectListEntry: (side: Side, entry: ExplorerEntry) => void
  export let activateListEntry: (side: Side, entry: ExplorerEntry) => Promise<void>
  export let isTargetSelected: (pane: ExplorerPaneState, entry: ExplorerEntry) => boolean
</script>

<section class="picker-pane">
  <header class="picker-pane-header">
    <div class="picker-pane-title-row">
      <strong>{pane.title}</strong>
      <span
        class:empty={!pane.selectedTargetPath}
        class="target-chip"
        title={pane.selectedTargetPath || (mode === 'directory' ? 'No folder target selected' : 'No file target selected')}
      >
        {mode === 'directory' ? 'Target' : 'Selected'}: {formatTargetLabel(
          pane.selectedTargetPath,
          mode === 'directory' ? 'None' : 'None',
        )}
      </span>
    </div>
    <div class="pane-path-stack">
      <span class="pane-path-label">Browsing</span>
      <span class="pane-path" title={pane.currentPath || 'No folder open'}>
        {pane.currentPath ? formatBreadcrumbPath(pane.currentPath) : 'No folder open'}
      </span>
    </div>
  </header>

  {#if pane.error}
    <p class="pane-error">{pane.error}</p>
  {/if}

  <div class="picker-nav-row">
    <div class="nav-buttons">
      <button
        class="secondary icon-button"
        aria-label="Back"
        disabled={!canGoBack(pane)}
        title="Back"
        type="button"
        on:click={() => navigateHistory(side, -1)}
      >
        <svg aria-hidden="true" class="nav-icon" viewBox="0 0 16 16">
          <path d="M9.5 3.5 5 8l4.5 4.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" />
        </svg>
      </button>
      <button
        class="secondary icon-button"
        aria-label="Forward"
        disabled={!canGoForward(pane)}
        title="Forward"
        type="button"
        on:click={() => navigateHistory(side, 1)}
      >
        <svg aria-hidden="true" class="nav-icon" viewBox="0 0 16 16">
          <path d="M6.5 3.5 11 8l-4.5 4.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" />
        </svg>
      </button>
      <button
        class="secondary icon-button"
        aria-label="Up"
        disabled={!pane.currentListing?.parentPath}
        title="Up"
        type="button"
        on:click={() =>
          pane.currentListing?.parentPath &&
          navigateTo(side, pane.currentListing.parentPath)}
      >
        <svg aria-hidden="true" class="nav-icon" viewBox="0 0 16 16">
          <path d="M8 12.5v-9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6" />
          <path d="M4.5 7 8 3.5 11.5 7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" />
        </svg>
      </button>
    </div>

    <select
      class="drive-select"
      value={currentDrive(pane)}
      on:change={(event) => changeDrive(side, event.currentTarget.value)}
    >
      {#each pane.roots as root}
        <option value={root.path}>{root.name}</option>
      {/each}
    </select>

    <input
      class="path-input"
      placeholder="Enter a file or folder path"
      type="text"
      value={pane.pathInput}
      on:input={(event) => updatePathInput(side, event.currentTarget.value)}
      on:keydown={(event) => event.key === 'Enter' && submitPathInput(side)}
    />
  </div>

  <div class="picker-action-row">
    <button class="secondary" type="button" on:click={() => browseSystem(side)}>
      Browse
    </button>

    {#if mode === 'directory'}
      <button
        class:active={isCurrentFolderSelected(pane)}
        class="secondary"
        disabled={!pane.currentPath}
        type="button"
        on:click={() => setCurrentFolderAsTarget(side)}
      >
        {isCurrentFolderSelected(pane) ? 'Target selected' : 'Set as target'}
      </button>
    {/if}
  </div>

  <section class="list-pane explorer-list-pane">
    <div class="list-pane-header">
      <div class="list-columns">
        <span>Name</span>
        <span>Type</span>
        <span>Modified</span>
        <span>Size</span>
      </div>
    </div>

    <div class="list-rows">
      {#if pickerLoading}
        <div class="empty-state">Loading drives...</div>
      {:else if pane.loading}
        <div class="empty-state">Loading folder...</div>
      {:else if pane.currentListing}
        {#each pane.currentListing.directories as entry}
          <button
            class:selected={isTargetSelected(pane, entry)}
            class="entry-row"
            type="button"
            on:click={() => selectListEntry(side, entry)}
            on:dblclick={() => activateListEntry(side, entry)}
          >
            <span class="entry-name">
              <EntryIcon kind={entry.kind} open={false} />
              <span class="entry-text">{entry.name}</span>
              {#if isTargetSelected(pane, entry)}
                <span class="entry-badge">Target</span>
              {/if}
            </span>
            <span class="entry-type">{entryTypeLabel(entry)}</span>
            <span class="entry-date">{formatModified(entry.modifiedMs)}</span>
            <span class="entry-meta">-</span>
          </button>
        {/each}

        {#each pane.currentListing.files as entry}
          <button
            class:selected={isTargetSelected(pane, entry)}
            class="entry-row"
            type="button"
            on:click={() => selectListEntry(side, entry)}
            on:dblclick={() => activateListEntry(side, entry)}
          >
            <span class="entry-name">
              <EntryIcon kind={entry.kind} />
              <span class="entry-text">{entry.name}</span>
              {#if isTargetSelected(pane, entry)}
                <span class="entry-badge">Target</span>
              {/if}
            </span>
            <span class="entry-type">{entryTypeLabel(entry)}</span>
            <span class="entry-date">{formatModified(entry.modifiedMs)}</span>
            <span class="entry-meta">{formatSize(entry.size)}</span>
          </button>
        {/each}

        {#if pane.currentListing.directories.length === 0 && pane.currentListing.files.length === 0}
          <div class="empty-state">Folder is empty.</div>
        {/if}
      {:else}
        <div class="empty-state">No folder open.</div>
      {/if}
    </div>
  </section>
</section>
