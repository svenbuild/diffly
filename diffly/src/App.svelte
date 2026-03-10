<script lang="ts">
  import { onMount } from 'svelte'
  import EntryIcon from './lib/EntryIcon.svelte'

  import {
    choosePath,
    comparePaths,
    listDirectory,
    listRoots,
    openCompareItem,
    pathInfo,
  } from './lib/api'
  import type {
    CompareMode,
    DirectoryEntryResult,
    DirectoryListing,
    ExplorerEntry,
    FileDiffResult,
    SideBySideRow,
    UnifiedLine,
    ViewMode,
  } from './lib/types'

  const ROOT_GROUP = '__root__'
  const DIFF_CONTEXT_LINES = 3

  interface EntryGroup {
    key: string
    label: string
    entries: DirectoryEntryResult[]
  }

  interface SideBySideRenderItem {
    type: 'hunk' | 'row'
    header?: string
    row?: SideBySideRow
  }

  interface UnifiedRenderItem {
    type: 'hunk' | 'row'
    header?: string
    row?: UnifiedLine
  }

  interface ExplorerPaneState {
    title: string
    roots: ExplorerEntry[]
    currentPath: string
    currentListing: DirectoryListing | null
    listings: Record<string, DirectoryListing>
    history: string[]
    historyIndex: number
    selectedTargetPath: string
    selectedTargetKind: 'file' | 'directory' | null
    loading: boolean
    error: string
  }

  type Screen = 'setup' | 'compare'
  type Side = 'left' | 'right'

  let screen: Screen = 'setup'
  let mode: CompareMode = 'directory'
  let viewMode: ViewMode = 'sideBySide'
  let showFullFile = false
  let leftPath = ''
  let rightPath = ''
  let ignoreWhitespace = false
  let ignoreCase = false
  let loading = false
  let detailLoading = false
  let pickerLoading = false
  let errorMessage = ''
  let directoryEntries: DirectoryEntryResult[] = []
  let entryGroups: EntryGroup[] = []
  let collapsedGroups: Record<string, boolean> = {}
  let leftPaneScroll: HTMLDivElement | null = null
  let rightPaneScroll: HTMLDivElement | null = null
  let selectedRelativePath = ''
  let activeDiff: FileDiffResult | null = null
  let compareRevision = 0
  let syncingScroll = false
  let leftExplorer = createExplorerPane('Left')
  let rightExplorer = createExplorerPane('Right')

  const statusLabel = {
    modified: 'Modified',
    leftOnly: 'Left only',
    rightOnly: 'Right only',
    binary: 'Binary',
    tooLarge: 'Too large',
  }

  const getOptions = () => ({
    ignoreWhitespace,
    ignoreCase,
  })

  onMount(() => {
    void initializePickers()
  })

  function createExplorerPane(title: string): ExplorerPaneState {
    return {
      title,
      roots: [],
      currentPath: '',
      currentListing: null,
      listings: {},
      history: [],
      historyIndex: -1,
      selectedTargetPath: '',
      selectedTargetKind: null,
      loading: false,
      error: '',
    }
  }

  function paneFor(side: Side) {
    return side === 'left' ? leftExplorer : rightExplorer
  }

  function setPane(side: Side, pane: ExplorerPaneState) {
    if (side === 'left') {
      leftExplorer = pane
    } else {
      rightExplorer = pane
    }
  }

  function updatePane(side: Side, updater: (pane: ExplorerPaneState) => ExplorerPaneState) {
    setPane(side, updater(paneFor(side)))
  }

  async function initializePickers() {
    pickerLoading = true

    try {
      const roots = await listRoots()

      leftExplorer = {
        ...createExplorerPane('Left'),
        roots,
      }

      rightExplorer = {
        ...createExplorerPane('Right'),
        roots,
      }

      if (roots.length > 0) {
        const leftRoot = roots[0].path
        const rightRoot = roots[1]?.path ?? roots[0].path

        await Promise.all([
          openDirectory('left', leftRoot),
          openDirectory('right', rightRoot),
        ])
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Unable to initialize the picker.'
    } finally {
      pickerLoading = false
    }
  }

  function setMode(nextMode: CompareMode) {
    if (mode === nextMode) {
      return
    }

    mode = nextMode
    leftExplorer = sanitizePaneForMode(leftExplorer, nextMode)
    rightExplorer = sanitizePaneForMode(rightExplorer, nextMode)
    directoryEntries = []
    entryGroups = []
    collapsedGroups = {}
    selectedRelativePath = ''
    activeDiff = null
    errorMessage = ''
  }

  function sanitizePaneForMode(pane: ExplorerPaneState, nextMode: CompareMode) {
    if (nextMode === 'file' && pane.selectedTargetKind !== 'file') {
      return {
        ...pane,
        selectedTargetPath: '',
        selectedTargetKind: null,
      }
    }

    if (nextMode === 'directory' && pane.selectedTargetKind !== 'directory') {
      return {
        ...pane,
        selectedTargetPath: '',
        selectedTargetKind: null,
      }
    }

    return pane
  }

  function goToSetup() {
    screen = 'setup'
    errorMessage = ''
  }

  async function browseSystem(side: Side) {
    const selected = await choosePath(mode === 'file' ? 'file' : 'directory')

    if (!selected) {
      return
    }

    const info = await pathInfo(selected)

    if (!info.exists) {
      return
    }

    if (info.isDirectory) {
      await openDirectory(side, info.path)
      selectTarget(side, info.path, 'directory')
      return
    }

    if (info.isFile) {
      if (info.parentPath) {
        await openDirectory(side, info.parentPath)
      }
      selectTarget(side, info.path, 'file')
    }
  }

  async function openDirectory(side: Side, path: string, historyMode: 'push' | 'keep' = 'push') {
    updatePane(side, (pane) => ({
      ...pane,
      loading: true,
      error: '',
    }))

    try {
      const pane = paneFor(side)
      const cached = pane.listings[path]
      const listing = cached ?? (await listDirectory(path))
      const historyState = buildNextHistoryState(pane, path, historyMode)

      updatePane(side, (current) => ({
        ...current,
        ...historyState,
        currentPath: path,
        currentListing: listing,
        listings: {
          ...current.listings,
          [path]: listing,
        },
        loading: false,
      }))
    } catch (error) {
      updatePane(side, (pane) => ({
        ...pane,
        loading: false,
        error: error instanceof Error ? error.message : 'Unable to open the folder.',
      }))
    }
  }

  async function navigateTo(side: Side, path: string) {
    await openDirectory(side, path)
  }

  async function navigateHistory(side: Side, direction: -1 | 1) {
    const pane = paneFor(side)
    const nextIndex = pane.historyIndex + direction

    if (nextIndex < 0 || nextIndex >= pane.history.length) {
      return
    }

    await openDirectory(side, pane.history[nextIndex], 'keep')

    updatePane(side, (current) => ({
      ...current,
      historyIndex: nextIndex,
    }))
  }

  async function changeDrive(side: Side, path: string) {
    if (!path) {
      return
    }

    await openDirectory(side, path)
  }

  function selectTarget(side: Side, path: string, kind: 'file' | 'directory') {
    updatePane(side, (pane) => ({
      ...pane,
      selectedTargetPath: path,
      selectedTargetKind: kind,
    }))
  }

  function useCurrentFolder(side: Side) {
    const pane = paneFor(side)

    if (pane.currentPath) {
      selectTarget(side, pane.currentPath, 'directory')
    }
  }

  function selectListEntry(side: Side, entry: ExplorerEntry) {
    if (mode === 'directory' && entry.kind !== 'file') {
      selectTarget(side, entry.path, 'directory')
      return
    }

    if (mode === 'file' && entry.kind === 'file') {
      selectTarget(side, entry.path, 'file')
    }
  }

  async function activateListEntry(side: Side, entry: ExplorerEntry) {
    if (entry.kind === 'directory' || entry.kind === 'drive') {
      await openDirectory(side, entry.path)
      return
    }

    if (mode === 'file') {
      selectTarget(side, entry.path, 'file')
    }
  }

  function canComparePane(pane: ExplorerPaneState) {
    return mode === 'file' ? pane.selectedTargetKind === 'file' : pane.selectedTargetKind === 'directory'
  }

  async function runCompare() {
    if (!canComparePane(leftExplorer) || !canComparePane(rightExplorer)) {
      errorMessage = 'Select valid targets on both sides first.'
      return
    }

    const nextLeftPath = leftExplorer.selectedTargetPath
    const nextRightPath = rightExplorer.selectedTargetPath

    loading = true
    detailLoading = false
    errorMessage = ''
    directoryEntries = []
    entryGroups = []
    collapsedGroups = {}
    selectedRelativePath = ''
    activeDiff = null
    leftPath = nextLeftPath
    rightPath = nextRightPath

    try {
      const response = await comparePaths(nextLeftPath, nextRightPath, mode, getOptions())
      compareRevision += 1
      screen = 'compare'

      if (response.kind === 'directory') {
        directoryEntries = response.entries
        entryGroups = buildGroups(directoryEntries)
        collapsedGroups = createCollapsedState(entryGroups)

        if (directoryEntries.length > 0) {
          await selectEntry(directoryEntries[0], compareRevision)
        }
      } else {
        activeDiff = response.result
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Compare failed.'
    } finally {
      loading = false
    }
  }

  async function selectEntry(entry: DirectoryEntryResult, revision = compareRevision) {
    if (!leftPath || !rightPath) {
      return
    }

    selectedRelativePath = entry.relativePath
    detailLoading = true
    errorMessage = ''

    try {
      const result = await openCompareItem(
        leftPath,
        rightPath,
        entry.relativePath,
        getOptions(),
      )

      if (revision === compareRevision) {
        activeDiff = result
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Unable to open the file diff.'
    } finally {
      detailLoading = false
    }
  }

  function buildGroups(entries: DirectoryEntryResult[]) {
    const groups = new Map<string, DirectoryEntryResult[]>()

    for (const entry of entries) {
      const groupKey = getParentPath(entry.relativePath)

      if (!groups.has(groupKey)) {
        groups.set(groupKey, [])
      }

      groups.get(groupKey)?.push(entry)
    }

    return Array.from(groups.entries())
      .map(([key, groupedEntries]) => ({
        key,
        label: key === ROOT_GROUP ? 'Root' : key,
        entries: [...groupedEntries].sort((left, right) =>
          left.relativePath.localeCompare(right.relativePath),
        ),
      }))
      .sort((left, right) => left.label.localeCompare(right.label))
  }

  function createCollapsedState(groups: EntryGroup[]) {
    const nextState: Record<string, boolean> = {}

    for (const group of groups) {
      nextState[group.key] = false
    }

    return nextState
  }

  function getParentPath(relativePath: string) {
    const normalized = relativePath.replaceAll('\\', '/')
    const lastSlash = normalized.lastIndexOf('/')

    if (lastSlash === -1) {
      return ROOT_GROUP
    }

    return normalized.slice(0, lastSlash)
  }

  function getFileName(relativePath: string) {
    const normalized = relativePath.replaceAll('\\', '/')
    const lastSlash = normalized.lastIndexOf('/')

    if (lastSlash === -1) {
      return normalized
    }

    return normalized.slice(lastSlash + 1)
  }

  function toggleGroup(groupKey: string) {
    collapsedGroups = {
      ...collapsedGroups,
      [groupKey]: !collapsedGroups[groupKey],
    }
  }

  function syncPaneScroll(source: 'left' | 'right') {
    const sourcePane = source === 'left' ? leftPaneScroll : rightPaneScroll
    const targetPane = source === 'left' ? rightPaneScroll : leftPaneScroll

    if (!sourcePane || !targetPane || syncingScroll) {
      return
    }

    syncingScroll = true
    targetPane.scrollTop = sourcePane.scrollTop
    targetPane.scrollLeft = sourcePane.scrollLeft

    requestAnimationFrame(() => {
      syncingScroll = false
    })
  }

  function formatSize(size: number | null) {
    if (size === null) {
      return '-'
    }

    if (size < 1024) {
      return `${size} B`
    }

    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`
    }

    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }

  function formatModified(value: number | null) {
    if (value === null) {
      return '-'
    }

    return new Intl.DateTimeFormat('de-CH', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(value)
  }

  function entryTypeLabel(entry: ExplorerEntry) {
    if (entry.kind === 'directory' || entry.kind === 'drive') {
      return 'Folder'
    }

    const extensionIndex = entry.name.lastIndexOf('.')

    if (extensionIndex === -1) {
      return 'File'
    }

    return `${entry.name.slice(extensionIndex + 1).toUpperCase()} file`
  }

  function buildSideBySideRenderItems(rows: SideBySideRow[]) {
    if (showFullFile) {
      return rows.map((row) => ({ type: 'row', row }) satisfies SideBySideRenderItem)
    }

    const ranges = buildHunkRanges(
      rows.map((row) => row.left?.change !== 'context' || row.right?.change !== 'context'),
    )

    return ranges.flatMap((range) => {
      const hunkRows = rows.slice(range.start, range.end + 1)

      return [
        {
          type: 'hunk',
          header: formatHunkHeader(
            hunkRows.map((row) => row.left?.lineNumber ?? null),
            hunkRows.map((row) => row.right?.lineNumber ?? null),
          ),
        } satisfies SideBySideRenderItem,
        ...hunkRows.map((row) => ({ type: 'row', row }) satisfies SideBySideRenderItem),
      ]
    })
  }

  function buildUnifiedRenderItems(rows: UnifiedLine[]) {
    if (showFullFile) {
      return rows.map((row) => ({ type: 'row', row }) satisfies UnifiedRenderItem)
    }

    const ranges = buildHunkRanges(rows.map((row) => row.change !== 'context'))

    return ranges.flatMap((range) => {
      const hunkRows = rows.slice(range.start, range.end + 1)

      return [
        {
          type: 'hunk',
          header: formatHunkHeader(
            hunkRows.map((row) => row.leftLineNumber),
            hunkRows.map((row) => row.rightLineNumber),
          ),
        } satisfies UnifiedRenderItem,
        ...hunkRows.map((row) => ({ type: 'row', row }) satisfies UnifiedRenderItem),
      ]
    })
  }

  function buildHunkRanges(changedRows: boolean[]) {
    const ranges: Array<{ start: number; end: number }> = []

    for (const [index, isChanged] of changedRows.entries()) {
      if (!isChanged) {
        continue
      }

      const nextStart = Math.max(0, index - DIFF_CONTEXT_LINES)
      const nextEnd = Math.min(changedRows.length - 1, index + DIFF_CONTEXT_LINES)
      const previous = ranges.at(-1)

      if (previous && nextStart <= previous.end + 1) {
        previous.end = Math.max(previous.end, nextEnd)
      } else {
        ranges.push({ start: nextStart, end: nextEnd })
      }
    }

    return ranges
  }

  function formatHunkHeader(
    leftLineNumbers: Array<number | null>,
    rightLineNumbers: Array<number | null>,
  ) {
    const leftRange = summarizeLineNumbers(leftLineNumbers)
    const rightRange = summarizeLineNumbers(rightLineNumbers)

    return `@@ -${leftRange.start},${leftRange.count} +${rightRange.start},${rightRange.count} @@`
  }

  function summarizeLineNumbers(lineNumbers: Array<number | null>) {
    const present = lineNumbers.filter((value): value is number => value !== null)

    if (present.length === 0) {
      return {
        start: 0,
        count: 0,
      }
    }

    return {
      start: present[0],
      count: present.length,
    }
  }

  function buildNextHistoryState(
    pane: ExplorerPaneState,
    path: string,
    historyMode: 'push' | 'keep',
  ) {
    if (historyMode === 'keep') {
      return {
        history: pane.history,
        historyIndex: pane.historyIndex,
      }
    }

    const currentPath = pane.history[pane.historyIndex]

    if (currentPath === path) {
      return {
        history: pane.history,
        historyIndex: pane.historyIndex,
      }
    }

    const nextHistory = pane.history.slice(0, pane.historyIndex + 1)
    nextHistory.push(path)

    return {
      history: nextHistory,
      historyIndex: nextHistory.length - 1,
    }
  }

  function canGoBack(pane: ExplorerPaneState) {
    return pane.historyIndex > 0
  }

  function canGoForward(pane: ExplorerPaneState) {
    return pane.historyIndex !== -1 && pane.historyIndex < pane.history.length - 1
  }

  function currentDrive(pane: ExplorerPaneState) {
    const normalized = pane.currentPath.toLowerCase()

    return pane.roots.find((root) => normalized.startsWith(root.path.toLowerCase()))?.path ?? ''
  }

  function isCurrentFolderSelected(pane: ExplorerPaneState) {
    return pane.selectedTargetKind === 'directory' && pane.selectedTargetPath === pane.currentPath
  }

  function isTargetSelected(pane: ExplorerPaneState, entry: ExplorerEntry) {
    return pane.selectedTargetPath === entry.path
  }

  $: compareSummary =
    mode === 'directory'
      ? `${directoryEntries.length} difference${directoryEntries.length === 1 ? '' : 's'}`
      : activeDiff?.summary ?? 'File compare'

  $: sideBySideRenderItems =
    activeDiff && showFullFile !== undefined
      ? buildSideBySideRenderItems(activeDiff.sideBySide)
      : []

  $: unifiedRenderItems =
    activeDiff && showFullFile !== undefined ? buildUnifiedRenderItems(activeDiff.unified) : []

  $: pickerCanCompare = canComparePane(leftExplorer) && canComparePane(rightExplorer)
  $: pickerSides = [
    { side: 'left' as Side, pane: leftExplorer },
    { side: 'right' as Side, pane: rightExplorer },
  ]
</script>

<svelte:head>
  <title>Diffly</title>
</svelte:head>

{#if screen === 'setup'}
  <main class="setup-screen explorer-screen">
    <header class="setup-toolbar">
      <div class="setup-toolbar-left">
        <h1>Diffly</h1>
        <div class="mode-tabs normal-tabs">
          <button class:active={mode === 'file'} type="button" on:click={() => setMode('file')}>
            Files
          </button>
          <button
            class:active={mode === 'directory'}
            type="button"
            on:click={() => setMode('directory')}
          >
            Directories
          </button>
        </div>
      </div>

      <div class="setup-toolbar-right">
        <label class="inline-check">
          <input bind:checked={ignoreWhitespace} type="checkbox" />
          Ignore whitespace
        </label>
        <label class="inline-check">
          <input bind:checked={ignoreCase} type="checkbox" />
          Ignore case
        </label>
        <button
          class:active={viewMode === 'unified'}
          class="secondary compact-toggle"
          type="button"
          on:click={() => (viewMode = viewMode === 'unified' ? 'sideBySide' : 'unified')}
        >
          Unified view
        </button>
        <button class="primary" disabled={!pickerCanCompare || loading} type="button" on:click={runCompare}>
          {#if loading}
            Comparing...
          {:else}
            Compare
          {/if}
        </button>
      </div>
    </header>

    {#if errorMessage}
      <p class="error-banner compare-error">{errorMessage}</p>
    {/if}

    <section class="picker-workspace">
      {#each pickerSides as item}
        <section class="picker-pane">
          <div class="picker-pane-header">
            <div class="picker-pane-title">
              <strong>{item.pane.title}</strong>
              <span>{item.pane.selectedTargetPath || 'No target selected'}</span>
            </div>
          </div>

          {#if item.pane.error}
            <p class="pane-error">{item.pane.error}</p>
          {/if}

          <div class="picker-pathbar">
            <div class="nav-buttons">
              <button
                class="secondary icon-button"
                disabled={!canGoBack(item.pane)}
                type="button"
                on:click={() => navigateHistory(item.side, -1)}
              >
                ←
              </button>
              <button
                class="secondary icon-button"
                disabled={!canGoForward(item.pane)}
                type="button"
                on:click={() => navigateHistory(item.side, 1)}
              >
                →
              </button>
              <button
                class="secondary icon-button"
                disabled={!item.pane.currentListing?.parentPath}
                type="button"
                on:click={() =>
                  item.pane.currentListing?.parentPath &&
                  navigateTo(item.side, item.pane.currentListing.parentPath)}
              >
                ↑
              </button>
            </div>

            <select
              class="drive-select"
              value={currentDrive(item.pane)}
              on:change={(event) => changeDrive(item.side, event.currentTarget.value)}
            >
              {#each item.pane.roots as root}
                <option value={root.path}>{root.name}</option>
              {/each}
            </select>

            <div class="path-display">{item.pane.currentPath || 'No folder open'}</div>

            <button class="secondary" type="button" on:click={() => browseSystem(item.side)}>
              System dialog
            </button>

            {#if mode === 'directory'}
              <button
                class:active={isCurrentFolderSelected(item.pane)}
                class="secondary"
                disabled={!item.pane.currentPath}
                type="button"
                on:click={() => useCurrentFolder(item.side)}
              >
                Use current folder
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
                {:else if item.pane.loading}
                  <div class="empty-state">Loading folder...</div>
                {:else if item.pane.currentListing}
                  {#each item.pane.currentListing.directories as entry}
                    <button
                      class:selected={isTargetSelected(item.pane, entry)}
                      class="entry-row"
                      type="button"
                      on:click={() => selectListEntry(item.side, entry)}
                      on:dblclick={() => activateListEntry(item.side, entry)}
                    >
                      <span class="entry-name">
                        <EntryIcon kind={entry.kind} open={false} />
                        <span class="entry-text">{entry.name}</span>
                      </span>
                      <span class="entry-type">{entryTypeLabel(entry)}</span>
                      <span class="entry-date">{formatModified(entry.modifiedMs)}</span>
                      <span class="entry-meta">-</span>
                    </button>
                  {/each}

                  {#each item.pane.currentListing.files as entry}
                    <button
                      class:selected={isTargetSelected(item.pane, entry)}
                      class="entry-row"
                      type="button"
                      on:click={() => selectListEntry(item.side, entry)}
                      on:dblclick={() => activateListEntry(item.side, entry)}
                    >
                      <span class="entry-name">
                        <EntryIcon kind={entry.kind} />
                        <span class="entry-text">{entry.name}</span>
                      </span>
                      <span class="entry-type">{entryTypeLabel(entry)}</span>
                      <span class="entry-date">{formatModified(entry.modifiedMs)}</span>
                      <span class="entry-meta">{formatSize(entry.size)}</span>
                    </button>
                  {/each}

                  {#if item.pane.currentListing.directories.length === 0 && item.pane.currentListing.files.length === 0}
                    <div class="empty-state">Folder is empty.</div>
                  {/if}
                {:else}
                  <div class="empty-state">No folder open.</div>
                {/if}
              </div>
          </section>
        </section>
      {/each}
    </section>
  </main>
{:else}
  <main class="compare-screen">
    <header class="compare-toolbar">
      <div class="toolbar-left">
        <button class="secondary" type="button" on:click={goToSetup}>Configure</button>

        <div class="toolbar-meta">
          <strong>{compareSummary}</strong>
          <div class="source-lines">
            <span><b>Left:</b> {leftPath}</span>
            <span><b>Right:</b> {rightPath}</span>
          </div>
        </div>
      </div>

      <div class="toolbar-right">
        <div class="inline-controls">
          <button
            class:active={viewMode === 'unified'}
            type="button"
            on:click={() => (viewMode = viewMode === 'unified' ? 'sideBySide' : 'unified')}
          >
            Unified
          </button>
          <button
            class:active={showFullFile}
            type="button"
            on:click={() => (showFullFile = !showFullFile)}
          >
            Full file
          </button>
        </div>

        <div class="checkbox-row">
          <label>
            <input bind:checked={ignoreWhitespace} type="checkbox" />
            Ignore whitespace
          </label>
          <label>
            <input bind:checked={ignoreCase} type="checkbox" />
            Ignore case
          </label>
        </div>

        <button class="primary" type="button" disabled={loading} on:click={runCompare}>
          Refresh
        </button>
      </div>
    </header>

    {#if errorMessage}
      <p class="error-banner compare-error">{errorMessage}</p>
    {/if}

    <section class:single-pane={mode === 'file'} class="compare-layout">
      {#if mode === 'directory'}
        <aside class="file-browser">
          {#if entryGroups.length === 0}
            <div class="empty-state">No differing files found.</div>
          {:else}
            {#each entryGroups as group}
              <section class="file-group">
                <button class="group-toggle" type="button" on:click={() => toggleGroup(group.key)}>
                  <span class="chevron">{collapsedGroups[group.key] ? '▸' : '▾'}</span>
                  <span class="group-label">{group.label}</span>
                  <span class="group-count">{group.entries.length}</span>
                </button>

                {#if !collapsedGroups[group.key]}
                  <div class="file-list">
                    {#each group.entries as entry}
                      <button
                        class:selected={selectedRelativePath === entry.relativePath}
                        class="file-row"
                        type="button"
                        on:click={() => selectEntry(entry)}
                      >
                        <span class={`status-mark ${entry.status}`}></span>
                        <span class="file-text">
                          <span class="file-name">
                            <EntryIcon kind="file" />
                            <span class="entry-text">{getFileName(entry.relativePath)}</span>
                          </span>
                          <span class="file-meta">
                            {statusLabel[entry.status]} | {formatSize(entry.leftSize)} / {formatSize(
                              entry.rightSize,
                            )}
                          </span>
                        </span>
                      </button>
                    {/each}
                  </div>
                {/if}
              </section>
            {/each}
          {/if}
        </aside>
      {/if}

      <section class="viewer">
        {#if detailLoading}
          <div class="empty-state">Loading diff...</div>
        {:else if activeDiff}
          {#if activeDiff.contentKind !== 'text'}
            <div class="message-card">{activeDiff.summary}</div>
          {:else if viewMode === 'sideBySide'}
            <div class="split-view">
              <section class="diff-pane">
                <div class="pane-header sticky-pane-header">
                  <span>Left</span>
                  <strong>{activeDiff.leftLabel}</strong>
                </div>
                <div
                  bind:this={leftPaneScroll}
                  class="pane-scroll"
                  on:scroll={() => syncPaneScroll('left')}
                >
                  <div class="pane-grid">
                    {#if sideBySideRenderItems.length === 0}
                      <div class="empty-inline-state">No changed lines.</div>
                    {/if}

                    {#each sideBySideRenderItems as item}
                      {#if item.type === 'hunk'}
                        <div class="hunk-row">{item.header}</div>
                      {:else if item.row}
                        <div class={`diff-row ${item.row.left?.change ?? 'context'}`}>
                          {#if item.row.left}
                            <span class="line-number">{item.row.left.lineNumber ?? ''}</span>
                            <span class="prefix">{item.row.left.prefix}</span>
                            <span class="line-text">{item.row.left.text || ' '}</span>
                          {/if}
                        </div>
                      {/if}
                    {/each}
                  </div>
                </div>
              </section>

              <section class="diff-pane">
                <div class="pane-header sticky-pane-header">
                  <span>Right</span>
                  <strong>{activeDiff.rightLabel}</strong>
                </div>
                <div
                  bind:this={rightPaneScroll}
                  class="pane-scroll"
                  on:scroll={() => syncPaneScroll('right')}
                >
                  <div class="pane-grid">
                    {#if sideBySideRenderItems.length === 0}
                      <div class="empty-inline-state">No changed lines.</div>
                    {/if}

                    {#each sideBySideRenderItems as item}
                      {#if item.type === 'hunk'}
                        <div class="hunk-row">{item.header}</div>
                      {:else if item.row}
                        <div class={`diff-row ${item.row.right?.change ?? 'context'}`}>
                          {#if item.row.right}
                            <span class="line-number">{item.row.right.lineNumber ?? ''}</span>
                            <span class="prefix">{item.row.right.prefix}</span>
                            <span class="line-text">{item.row.right.text || ' '}</span>
                          {/if}
                        </div>
                      {/if}
                    {/each}
                  </div>
                </div>
              </section>
            </div>
          {:else}
            <div class="viewer-header sticky-pane-header">
              <div class="viewer-source">
                <span>Left</span>
                <strong>{activeDiff.leftLabel}</strong>
              </div>
              <div class="viewer-source">
                <span>Right</span>
                <strong>{activeDiff.rightLabel}</strong>
              </div>
            </div>
            <div class="unified-grid">
              {#if unifiedRenderItems.length === 0}
                <div class="empty-inline-state">No changed lines.</div>
              {/if}

              {#each unifiedRenderItems as item}
                {#if item.type === 'hunk'}
                  <div class="hunk-row unified-hunk">{item.header}</div>
                {:else if item.row}
                  <div class={`unified-row ${item.row.change}`}>
                    <span class="line-number">{item.row.leftLineNumber ?? ''}</span>
                    <span class="line-number">{item.row.rightLineNumber ?? ''}</span>
                    <span class="prefix">{item.row.prefix}</span>
                    <span class="line-text">{item.row.text || ' '}</span>
                  </div>
                {/if}
              {/each}
            </div>
          {/if}
        {:else}
          <div class="empty-state">Run a compare to see the result.</div>
        {/if}
      </section>
    </section>
  </main>
{/if}
