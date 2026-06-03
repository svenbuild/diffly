<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import EntryIcon from './EntryIcon.svelte'

  import type { ExplorerEntry } from './types'
  import type { ExplorerPaneState, Side } from './ui-types'

  export let side: Side
  export let pane: ExplorerPaneState
  export let pickerLoading: boolean
  export let canGoBack: (pane: ExplorerPaneState) => boolean
  export let canGoForward: (pane: ExplorerPaneState) => boolean
  export let currentDrive: (pane: ExplorerPaneState) => string
  export let formatModified: (value: number | null) => string
  export let formatSize: (value: number | null) => string
  export let entryTypeLabel: (entry: ExplorerEntry) => string
  export let changeDrive: (side: Side, path: string) => Promise<void>
  export let navigateHistory: (side: Side, direction: -1 | 1) => Promise<void>
  export let navigateTo: (side: Side, path: string) => Promise<void>
  export let updatePathInput: (side: Side, value: string) => void
  export let submitPathInput: (side: Side) => Promise<void>
  export let browseSystem: (side: Side, kind: 'file' | 'directory') => Promise<void>
  export let setCurrentFolderAsTarget: (side: Side) => void
  export let isCurrentFolderSelected: (pane: ExplorerPaneState) => boolean
  export let selectListEntry: (side: Side, entry: ExplorerEntry, event?: MouseEvent) => void
  export let activateListEntry: (side: Side, entry: ExplorerEntry) => Promise<void>
  export let isTargetSelected: (pane: ExplorerPaneState, entry: ExplorerEntry) => boolean

  const ROW_HEIGHT = 30
  const ROW_OVERSCAN = 8

  interface ExplorerRow {
    entry: ExplorerEntry
    key: string
    kind: 'directory' | 'file'
  }

  let rowsHost: HTMLDivElement | null = null
  let rowsScrollTop = 0
  let rowsViewportHeight = 0
  let resizeObserver: ResizeObserver | null = null

  $: selectionCount = pane.selectedTargetPaths?.length ?? (pane.selectedTargetPath ? 1 : 0)
  $: targetKindLabel = pane.selectedTargetKind === 'file'
    ? 'File'
    : pane.selectedTargetKind === 'directory'
      ? 'Folder'
      : ''
  $: targetKindName = pane.selectedTargetKind === 'file' ? 'file' : 'folder or file'
  $: selectedTargetDisplayText = pane.selectedTargetPath
    ? compactPath(pane.selectedTargetPath)
    : `No ${targetKindName} selected`
  $: targetReady = Boolean(pane.selectedTargetPath)
  $: currentDirectoryCount = pane.currentListing?.directories.length ?? 0
  $: currentFileCount = pane.currentListing?.files.length ?? 0
  $: selectedTargetPathSet = new Set(
    pane.selectedTargetPaths?.length
      ? pane.selectedTargetPaths
      : pane.selectedTargetPath
        ? [pane.selectedTargetPath]
        : [],
  )
  $: explorerRows = buildExplorerRows(pane.currentListing?.directories ?? [], pane.currentListing?.files ?? [])
  $: totalRowsHeight = explorerRows.length * ROW_HEIGHT
  $: virtualStartIndex = Math.max(0, Math.floor(rowsScrollTop / ROW_HEIGHT) - ROW_OVERSCAN)
  $: virtualVisibleCount = Math.max(
    ROW_OVERSCAN * 2,
    Math.ceil((rowsViewportHeight || 480) / ROW_HEIGHT) + ROW_OVERSCAN * 2,
  )
  $: virtualEndIndex = Math.min(explorerRows.length, virtualStartIndex + virtualVisibleCount)
  $: virtualRows = explorerRows.slice(virtualStartIndex, virtualEndIndex)
  $: virtualTopPadding = virtualStartIndex * ROW_HEIGHT
  $: virtualBottomPadding = Math.max(0, totalRowsHeight - virtualTopPadding - virtualRows.length * ROW_HEIGHT)
  $: if (rowsScrollTop > Math.max(0, totalRowsHeight - rowsViewportHeight)) {
    rowsScrollTop = Math.max(0, totalRowsHeight - rowsViewportHeight)
  }

  function compactPath(path: string) {
    const parts = path.split(/[\\/]+/).filter(Boolean)

    if (parts.length <= 4) {
      return path
    }

    const root = /^[A-Za-z]:$/.test(parts[0]) ? `${parts[0]}\\` : ''
    return `${root}...\\${parts.slice(-3).join('\\')}`
  }

  function buildExplorerRows(directories: ExplorerEntry[], files: ExplorerEntry[]): ExplorerRow[] {
    return [
      ...directories.map((entry) => ({
        entry,
        key: `directory:${entry.path}`,
        kind: 'directory' as const,
      })),
      ...files.map((entry) => ({
        entry,
        key: `file:${entry.path}`,
        kind: 'file' as const,
      })),
    ]
  }

  function syncRowsViewportHeight() {
    rowsViewportHeight = rowsHost?.clientHeight ?? 0
  }

  function handleRowsScroll(event: Event) {
    const element = event.currentTarget as HTMLDivElement
    rowsScrollTop = element.scrollTop
    rowsViewportHeight = element.clientHeight
  }

  function rowIsSelected(entry: ExplorerEntry) {
    return selectedTargetPathSet.has(entry.path) ||
      (selectedTargetPathSet.size === 0 && isTargetSelected(pane, entry))
  }

  $: if (rowsHost) {
    syncRowsViewportHeight()
  }

  onMount(() => {
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(syncRowsViewportHeight)
      if (rowsHost) {
        resizeObserver.observe(rowsHost)
      }
    }

    syncRowsViewportHeight()
  })

  onDestroy(() => {
    resizeObserver?.disconnect()
    resizeObserver = null
  })
</script>

<section
  class:left-picker-pane={side === 'left'}
  class:right-picker-pane={side === 'right'}
  class="picker-pane"
>
  <header class="picker-pane-header">
    <div class="picker-target-heading">
      <div class="picker-target-title">
        <span
          aria-hidden="true"
          class:ready={targetReady}
          class="picker-target-dot"
          title={targetReady ? 'Ready' : 'Nothing selected yet'}
        ></span>
        <strong>{pane.title} target</strong>
        {#if targetKindLabel}
          <span class="picker-target-kind">{targetKindLabel}</span>
        {/if}
        {#if selectionCount > 1}
          <span class="picker-target-count">+{selectionCount - 1}</span>
        {/if}
      </div>
    </div>

    <div class="picker-selected-target">
      <code title={pane.selectedTargetPath || selectedTargetDisplayText}>{selectedTargetDisplayText}</code>
    </div>

    <div class="picker-pane-meta-row">
      <span>{currentDirectoryCount} folders</span>
      <span>{currentFileCount} files</span>
    </div>

    <div class="picker-action-row">
      <button
        class:active={isCurrentFolderSelected(pane)}
        class:is-complete={isCurrentFolderSelected(pane)}
        class={isCurrentFolderSelected(pane) ? 'secondary' : 'primary'}
        disabled={!pane.currentPath || isCurrentFolderSelected(pane)}
        type="button"
        on:click={() => setCurrentFolderAsTarget(side)}
      >
        {isCurrentFolderSelected(pane) ? 'Folder selected' : 'Use open folder'}
      </button>

      <button class="secondary" type="button" on:click={() => browseSystem(side, 'file')}>
        Browse file…
      </button>

      <button class="secondary" type="button" on:click={() => browseSystem(side, 'directory')}>
        Browse folder…
      </button>
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

    <label class="picker-open-path">
      <span>Open folder</span>
      <input
        class="path-input"
        placeholder="Enter a file or folder path"
        title={pane.currentPath || pane.pathInput}
        type="text"
        value={pane.pathInput}
        on:input={(event) => updatePathInput(side, event.currentTarget.value)}
        on:keydown={(event) => event.key === 'Enter' && submitPathInput(side)}
      />
    </label>
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

    <div class="list-rows" bind:this={rowsHost} on:scroll={handleRowsScroll}>
      {#if pickerLoading}
        <div class="empty-state">Loading drives...</div>
      {:else if pane.loading}
        <div class="empty-state">Loading folder...</div>
      {:else if pane.currentListing}
        <div class="virtual-list-spacer" style:height={`${virtualTopPadding}px`}></div>
        {#each virtualRows as row (row.key)}
          <button
            class:selected={rowIsSelected(row.entry)}
            class="entry-row"
            type="button"
            on:click={(event) => selectListEntry(side, row.entry, event)}
            on:dblclick={() => activateListEntry(side, row.entry)}
          >
            <span class="entry-name">
              <EntryIcon kind={row.entry.kind} open={false} />
              <span class="entry-text">{row.entry.name}</span>
              {#if rowIsSelected(row.entry)}
                <span class="entry-badge">Target</span>
              {/if}
            </span>
            <span class="entry-type">{entryTypeLabel(row.entry)}</span>
            <span class="entry-date">{formatModified(row.entry.modifiedMs)}</span>
            <span class="entry-meta">{row.kind === 'directory' ? '-' : formatSize(row.entry.size)}</span>
          </button>
        {/each}
        <div class="virtual-list-spacer" style:height={`${virtualBottomPadding}px`}></div>

        {#if pane.currentListing.directories.length === 0 && pane.currentListing.files.length === 0}
          <div class="empty-state">Folder is empty.</div>
        {/if}
      {:else}
        <div class="empty-state">No folder open.</div>
      {/if}
    </div>
  </section>
</section>
