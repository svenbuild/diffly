<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import Dropdown from '../components/Dropdown.svelte'
  import EntryIcon from '../EntryIcon.svelte'
  import { detectGitRepositories, listDirectory, listRoots, pathInfo } from '../api'
  import { entryTypeLabel, formatModified, formatSize } from '../format'
  import { filterRows, reduceTypeAheadKey } from './explorer-typeahead'
  import type { DirectoryListing, ExplorerEntry } from '../types'

  // The repo that is currently validated/selected by GitSetupPanel. Used purely
  // for row highlighting — selection state itself lives in the panel.
  export let selectedRepoPath = ''
  // Reveal trigger: when revealRequestId changes, navigate to the parent folder
  // of revealPath so an externally chosen repo (e.g. from the recents list)
  // becomes visible in the browser. Kept separate from selectedRepoPath so the
  // browser never yanks the user back after they navigate away on their own.
  export let revealPath = ''
  export let revealRequestId = 0
  export let onSelectRepo: (path: string) => void

  const ROW_HEIGHT = 30
  const ROW_OVERSCAN = 8

  interface ExplorerRow {
    entry: ExplorerEntry
    key: string
    kind: 'directory' | 'file'
  }

  let roots: ExplorerEntry[] = []
  let currentPath = ''
  let pathInput = ''
  let currentListing: DirectoryListing | null = null
  let history: string[] = []
  let historyIndex = -1
  let loading = false
  let error = ''

  // Repo roots in the current listing (drives the "Git repo" badge) and whether
  // the open folder itself is a repo (drives "Use current folder").
  let repoPaths: Set<string> = new Set()
  let currentFolderIsRepo = false
  // Visual focus for a non-repo folder single-click (no navigation, no target).
  let focusedPath = ''

  // Session-only, per-instance cache of the repo subset for a directory's
  // children. Discarded on unmount; never persisted (a folder's repo status is
  // not assumed permanent across sessions).
  const detectionCache = new Map<string, string[]>()

  // Monotonic guards so stale async results from a folder the user has navigated
  // away from can never write back over the current view.
  let navToken = 0
  let detectionToken = 0
  let lastRevealRequestId = revealRequestId

  let rowsHost: HTMLDivElement | null = null
  let rowsScrollTop = 0
  let rowsViewportHeight = 0
  let resizeObserver: ResizeObserver | null = null

  // Type-ahead filter over the current folder; reset whenever it changes.
  let filterQuery = ''
  let highlightedIndex = -1
  let lastListedPath = ''
  let lastFilterQuery = ''

  $: canGoBack = historyIndex > 0
  $: canGoForward = historyIndex >= 0 && historyIndex < history.length - 1
  $: directoryCount = currentListing?.directories.length ?? 0
  $: fileCount = currentListing?.files.length ?? 0
  $: explorerRows = buildExplorerRows(
    currentListing?.directories ?? [],
    currentListing?.files ?? [],
  )
  $: filteredRows = filterRows(explorerRows, filterQuery)
  $: totalRowsHeight = filteredRows.length * ROW_HEIGHT
  $: virtualStartIndex = Math.max(0, Math.floor(rowsScrollTop / ROW_HEIGHT) - ROW_OVERSCAN)
  $: virtualVisibleCount = Math.max(
    ROW_OVERSCAN * 2,
    Math.ceil((rowsViewportHeight || 480) / ROW_HEIGHT) + ROW_OVERSCAN * 2,
  )
  $: virtualEndIndex = Math.min(filteredRows.length, virtualStartIndex + virtualVisibleCount)
  $: virtualRows = filteredRows.slice(virtualStartIndex, virtualEndIndex)
  $: virtualTopPadding = virtualStartIndex * ROW_HEIGHT
  $: virtualBottomPadding = Math.max(
    0,
    totalRowsHeight - virtualTopPadding - virtualRows.length * ROW_HEIGHT,
  )
  $: if (rowsScrollTop > Math.max(0, totalRowsHeight - rowsViewportHeight)) {
    rowsScrollTop = Math.max(0, totalRowsHeight - rowsViewportHeight)
  }

  // Reset the filter when the open folder changes.
  $: if (currentPath !== lastListedPath) {
    lastListedPath = currentPath
    filterQuery = ''
    highlightedIndex = -1
  }

  // Jump back to the top whenever the filter text changes so the matches are
  // always visible instead of stranded below a leftover scroll position.
  $: if (filterQuery !== lastFilterQuery) {
    lastFilterQuery = filterQuery
    rowsScrollTop = 0
    if (rowsHost) {
      rowsHost.scrollTop = 0
    }
  }

  function handleListKeydown(event: KeyboardEvent) {
    const result = reduceTypeAheadKey(event, {
      query: filterQuery,
      highlightedIndex,
      rowCount: filteredRows.length,
    })

    if (!result.handled && result.action === 'none') {
      return
    }

    event.preventDefault()
    filterQuery = result.query
    highlightedIndex = result.highlightedIndex

    const row = highlightedIndex >= 0 ? filteredRows[highlightedIndex] : null

    if (result.action === 'open' && row?.kind === 'directory') {
      // Enter goes into the highlighted folder.
      void navigateTo(row.entry.path)
    } else if (result.action === 'select' && row?.kind === 'directory') {
      // Space selects a repository folder; otherwise just focuses it.
      if (repoPaths.has(row.entry.path)) {
        onSelectRepo(row.entry.path)
      } else {
        focusedPath = row.entry.path
      }
    } else if (result.action === 'goUp') {
      goUp()
    }

    // Navigating unmounts the focused row button; keep focus on the list so the
    // user can keep typing/navigating in the new folder.
    if (result.action === 'open' || result.action === 'goUp') {
      rowsHost?.focus({ preventScroll: true })
    }

    scrollHighlightedIntoView()
  }

  function scrollHighlightedIntoView() {
    if (highlightedIndex < 0 || !rowsHost) {
      return
    }

    const top = highlightedIndex * ROW_HEIGHT
    const bottom = top + ROW_HEIGHT
    const viewTop = rowsHost.scrollTop
    const viewBottom = viewTop + rowsHost.clientHeight

    if (top < viewTop) {
      rowsHost.scrollTop = top
    } else if (bottom > viewBottom) {
      rowsHost.scrollTop = bottom - rowsHost.clientHeight
    }

    rowsScrollTop = rowsHost.scrollTop
  }

  // Reveal an externally chosen repo by opening its parent directory.
  $: if (revealRequestId !== lastRevealRequestId) {
    lastRevealRequestId = revealRequestId
    if (revealPath) {
      void revealRepo(revealPath)
    }
  }

  function buildExplorerRows(
    directories: ExplorerEntry[],
    files: ExplorerEntry[],
  ): ExplorerRow[] {
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

  // Reactive so the Dropdown's selected label updates once roots/currentPath
  // load — a bare currentDrive() call in the template has no tracked deps and
  // would stay stuck on its initial empty value.
  $: currentDriveValue = (() => {
    const normalized = currentPath.toLowerCase()
    const match = roots.find((root) => normalized.startsWith(root.path.toLowerCase()))
    return match?.path ?? roots[0]?.path ?? ''
  })()

  async function loadDirectory(path: string, options: { push: boolean }) {
    const token = (navToken += 1)
    loading = true
    error = ''
    // Drop the previous folder's badge/selection state immediately so an
    // in-flight detection can't write back over the new view and "Use current
    // folder" can't stay active for the old folder while the new one loads.
    detectionToken += 1
    repoPaths = new Set()
    currentFolderIsRepo = false
    focusedPath = ''

    try {
      const listing = await listDirectory(path)
      if (token !== navToken) {
        return
      }
      currentListing = listing
      currentPath = listing.path
      pathInput = listing.path
      if (options.push) {
        history = [...history.slice(0, historyIndex + 1), listing.path]
        historyIndex = history.length - 1
      }
      loading = false
      void runDetection(listing)
    } catch {
      if (token !== navToken) {
        return
      }
      error = 'Could not open this folder.'
      loading = false
    }
  }

  async function runDetection(listing: DirectoryListing) {
    const token = (detectionToken += 1)
    const cached = detectionCache.get(listing.path)
    if (cached) {
      applyDetection(listing.path, cached)
      return
    }

    const probe = [listing.path, ...listing.directories.map((entry) => entry.path)]

    try {
      const repos = await detectGitRepositories(probe)
      if (token !== detectionToken) {
        return
      }
      detectionCache.set(listing.path, repos)
      applyDetection(listing.path, repos)
    } catch {
      if (token !== detectionToken) {
        return
      }
      // Detection failures degrade to "no badge" — never break the listing.
      applyDetection(listing.path, [])
    }
  }

  function applyDetection(directoryPath: string, repos: string[]) {
    if (currentListing?.path !== directoryPath) {
      return
    }
    repoPaths = new Set(repos)
    currentFolderIsRepo = repos.includes(directoryPath)
  }

  function navigateTo(path: string) {
    return loadDirectory(path, { push: true })
  }

  async function navigateHistory(direction: -1 | 1) {
    const target = historyIndex + direction
    if (target < 0 || target >= history.length) {
      return
    }
    historyIndex = target
    await loadDirectory(history[target], { push: false })
  }

  function goUp() {
    const parent = currentListing?.parentPath
    if (parent) {
      void navigateTo(parent)
    }
  }

  function changeDrive(path: string) {
    void navigateTo(path)
  }

  async function submitPathInput() {
    const target = pathInput.trim()
    if (!target) {
      return
    }

    try {
      const info = await pathInfo(target)
      if (info.exists && info.isDirectory) {
        await navigateTo(target)
      } else if (info.exists && info.isFile && info.parentPath) {
        await navigateTo(info.parentPath)
      } else {
        error = 'That path could not be found.'
      }
    } catch {
      error = 'That path could not be found.'
    }
  }

  async function revealRepo(path: string) {
    try {
      const info = await pathInfo(path)
      const parent = info.parentPath
      if (parent) {
        await navigateTo(parent)
      }
      // If there is no parent (drive root) we leave the view; highlighting is
      // driven by selectedRepoPath either way.
    } catch {
      // Parent could not be listed: fall back to highlight-only.
    }
  }

  function handleRowClick(row: ExplorerRow) {
    if (row.kind !== 'directory') {
      return
    }
    if (repoPaths.has(row.entry.path)) {
      onSelectRepo(row.entry.path)
    } else {
      // Normal folder: focus only. Navigation is double-click.
      focusedPath = row.entry.path
    }
  }

  function handleRowDblClick(row: ExplorerRow) {
    if (row.kind === 'directory') {
      void navigateTo(row.entry.path)
    }
  }

  function useCurrentFolder() {
    if (currentFolderIsRepo && currentPath) {
      onSelectRepo(currentPath)
    }
  }

  function syncRowsViewportHeight() {
    rowsViewportHeight = rowsHost?.clientHeight ?? 0
  }

  function handleRowsScroll(event: Event) {
    const element = event.currentTarget as HTMLDivElement
    rowsScrollTop = element.scrollTop
    rowsViewportHeight = element.clientHeight
  }

  $: if (rowsHost) {
    syncRowsViewportHeight()
  }

  onMount(async () => {
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(syncRowsViewportHeight)
      if (rowsHost) {
        resizeObserver.observe(rowsHost)
      }
    }
    syncRowsViewportHeight()

    try {
      roots = await listRoots()
    } catch {
      roots = []
    }

    const startPath = await resolveStartPath()
    if (startPath) {
      await navigateTo(startPath)
    }

    // Focus the list so the keyboard works immediately without a click.
    rowsHost?.focus({ preventScroll: true })
  })

  async function resolveStartPath(): Promise<string> {
    if (selectedRepoPath) {
      try {
        const info = await pathInfo(selectedRepoPath)
        if (info.parentPath) {
          return info.parentPath
        }
      } catch {
        // fall through to the first root
      }
    }
    return roots[0]?.path ?? ''
  }

  onDestroy(() => {
    resizeObserver?.disconnect()
    resizeObserver = null
  })
</script>

<section class="git-browser" aria-label="Repository folder">
  <header class="git-browser-header">
    <div class="git-browser-heading">
      <strong>Repository folder</strong>
      <span class="git-browser-counts">{directoryCount} folders · {fileCount} files</span>
    </div>
    <button
      class={currentFolderIsRepo ? 'primary' : 'secondary'}
      type="button"
      disabled={loading || !currentFolderIsRepo}
      title={currentFolderIsRepo
        ? 'Use the open folder as the repository'
        : 'The open folder is not a Git repository'}
      on:click={useCurrentFolder}
    >
      Use current folder
    </button>
  </header>

  <div class="picker-nav-row">
    <div class="nav-buttons">
      <button
        class="secondary icon-button"
        aria-label="Back"
        disabled={!canGoBack}
        title="Back"
        type="button"
        on:click={() => navigateHistory(-1)}
      >
        <svg aria-hidden="true" class="nav-icon" viewBox="0 0 16 16">
          <path d="M9.5 3.5 5 8l4.5 4.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" />
        </svg>
      </button>
      <button
        class="secondary icon-button"
        aria-label="Forward"
        disabled={!canGoForward}
        title="Forward"
        type="button"
        on:click={() => navigateHistory(1)}
      >
        <svg aria-hidden="true" class="nav-icon" viewBox="0 0 16 16">
          <path d="M6.5 3.5 11 8l-4.5 4.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" />
        </svg>
      </button>
      <button
        class="secondary icon-button"
        aria-label="Up"
        disabled={!currentListing?.parentPath}
        title="Up"
        type="button"
        on:click={goUp}
      >
        <svg aria-hidden="true" class="nav-icon" viewBox="0 0 16 16">
          <path d="M8 12.5v-9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6" />
          <path d="M4.5 7 8 3.5 11.5 7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" />
        </svg>
      </button>
    </div>

    <div class="drive-select">
      <Dropdown
        ariaLabel="Drive"
        options={roots.map((root) => ({ value: root.path, label: root.name }))}
        value={currentDriveValue}
        onChange={changeDrive}
      />
    </div>

    <label class="picker-open-path">
      <span>Open folder</span>
      <input
        class="path-input"
        placeholder="Enter a folder path"
        title={currentPath || pathInput}
        type="text"
        bind:value={pathInput}
        on:keydown={(event) => event.key === 'Enter' && submitPathInput()}
      />
    </label>
  </div>

  {#if error}
    <p class="git-browser-error">{error}</p>
  {/if}

  <section class="list-pane explorer-list-pane">
    <div class="list-pane-header">
      {#if filterQuery}
        <div class="list-filter-row">
          <svg aria-hidden="true" class="list-filter-icon" viewBox="0 0 16 16">
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" />
            <path d="m10.5 10.5 3 3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5" />
          </svg>
          <span class="list-filter-query">{filterQuery}</span>
          <span class="list-filter-count">{filteredRows.length} match{filteredRows.length === 1 ? '' : 'es'}</span>
          <kbd class="list-filter-hint">Esc</kbd>
        </div>
      {:else}
        <div class="list-columns">
          <span>Name</span>
          <span>Type</span>
          <span>Modified</span>
          <span>Size</span>
        </div>
      {/if}
    </div>

    <div
      class="list-rows"
      bind:this={rowsHost}
      tabindex="0"
      role="listbox"
      aria-label="Repository folder entries — type to filter"
      on:scroll={handleRowsScroll}
      on:keydown={handleListKeydown}
    >
      {#if loading}
        <div class="empty-state">Loading folder...</div>
      {:else if currentListing}
        <div class="virtual-list-spacer" style:height={`${virtualTopPadding}px`}></div>
        {#each virtualRows as row, index (row.key)}
          {#if row.kind === 'directory'}
            <button
              class:selected={row.entry.path === selectedRepoPath}
              class:focused={row.entry.path === focusedPath}
              class:highlighted={virtualStartIndex + index === highlightedIndex}
              class="entry-row"
              type="button"
              on:click={() => {
                highlightedIndex = virtualStartIndex + index
                handleRowClick(row)
              }}
              on:dblclick={() => handleRowDblClick(row)}
            >
              <span class="entry-name">
                <EntryIcon kind={row.entry.kind} open={false} />
                <span class="entry-text">{row.entry.name}</span>
                {#if repoPaths.has(row.entry.path)}
                  <span class="entry-badge git-repo-badge">Git repo</span>
                {/if}
              </span>
              <span class="entry-type">{entryTypeLabel(row.entry)}</span>
              <span class="entry-date">{formatModified(row.entry.modifiedMs)}</span>
              <span class="entry-meta">-</span>
            </button>
          {:else}
            <div
              class:highlighted={virtualStartIndex + index === highlightedIndex}
              class="entry-row file-inert"
              aria-disabled="true"
            >
              <span class="entry-name">
                <EntryIcon kind={row.entry.kind} open={false} />
                <span class="entry-text">{row.entry.name}</span>
              </span>
              <span class="entry-type">{entryTypeLabel(row.entry)}</span>
              <span class="entry-date">{formatModified(row.entry.modifiedMs)}</span>
              <span class="entry-meta">{formatSize(row.entry.size)}</span>
            </div>
          {/if}
        {/each}
        <div class="virtual-list-spacer" style:height={`${virtualBottomPadding}px`}></div>

        {#if directoryCount === 0 && fileCount === 0}
          <div class="empty-state">Folder is empty.</div>
        {:else if filteredRows.length === 0}
          <div class="empty-state">No entries match “{filterQuery}”.</div>
        {/if}
      {:else}
        <div class="empty-state">No folder open.</div>
      {/if}
    </div>
  </section>
</section>

<style>
  .git-browser {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: var(--panel-bg);
    overflow: hidden;
  }

  .git-browser-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border-subtle);
  }

  .git-browser-heading {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }

  .git-browser-heading strong {
    color: var(--panel-title);
    font-size: 13px;
    line-height: 1.2;
  }

  .git-browser-counts {
    color: var(--text-faint);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .git-browser-header button {
    min-height: 26px;
    flex: 0 0 auto;
  }

  .git-browser-error {
    margin: 0;
    padding: 6px 10px;
    color: var(--danger);
    font-size: 12px;
    border-bottom: 1px solid var(--border-subtle);
  }

  /* Green variant of the shared .entry-badge. The two-class selector outranks
     the global single-class .entry-badge so the accent border is overridden. */
  .entry-name .git-repo-badge {
    border-color: var(--success);
    background: color-mix(in srgb, var(--success) 15%, transparent);
    color: var(--success);
  }

  .entry-row.focused:not(.selected) {
    background: color-mix(in srgb, var(--accent-soft) 22%, var(--surface-alt));
    box-shadow: inset 0 0 0 1px var(--border-strong);
  }

  /* Files are visible but not a valid target: dimmed, inert, no hover affordance. */
  .file-inert {
    opacity: 0.55;
    cursor: default;
  }

  .file-inert:hover {
    background: transparent;
    box-shadow: none;
  }
</style>
