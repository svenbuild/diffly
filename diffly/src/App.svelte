<script lang="ts">
  import { comparePaths, choosePath, openCompareItem } from './lib/api'
  import type {
    CompareMode,
    DirectoryEntryResult,
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

  type Screen = 'setup' | 'compare'

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

  function setMode(nextMode: CompareMode) {
    if (mode === nextMode) {
      return
    }

    mode = nextMode
    directoryEntries = []
    entryGroups = []
    collapsedGroups = {}
    selectedRelativePath = ''
    activeDiff = null
    errorMessage = ''
  }

  function goToSetup() {
    screen = 'setup'
    errorMessage = ''
  }

  async function browse(side: 'left' | 'right') {
    const selected = await choosePath(mode === 'file' ? 'file' : 'directory')

    if (!selected) {
      return
    }

    if (side === 'left') {
      leftPath = selected
    } else {
      rightPath = selected
    }
  }

  async function runCompare() {
    if (!leftPath || !rightPath) {
      errorMessage = 'Pick two paths first.'
      return
    }

    loading = true
    detailLoading = false
    errorMessage = ''
    directoryEntries = []
    entryGroups = []
    collapsedGroups = {}
    selectedRelativePath = ''
    activeDiff = null

    try {
      const response = await comparePaths(leftPath, rightPath, mode, getOptions())
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

  function buildSideBySideRenderItems(rows: SideBySideRow[]) {
    if (showFullFile) {
      return rows.map((row) => ({ type: 'row', row }) satisfies SideBySideRenderItem)
    }

    const ranges = buildHunkRanges(rows.map((row) => row.left?.change !== 'context' || row.right?.change !== 'context'))

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
</script>

<svelte:head>
  <title>Diffly</title>
</svelte:head>

{#if screen === 'setup'}
  <main class="setup-screen">
    <section class="setup-panel">
      <div class="setup-header">
        <div>
          <h1>Diffly</h1>
          <p>Choose two files or two folders, then open the compare workspace.</p>
        </div>

        <div class="mode-tabs">
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

      <div class="setup-grid">
        <label class="field">
          <span>Left path</span>
          <div class="field-row">
            <input bind:value={leftPath} placeholder="Select the left side" />
            <button type="button" on:click={() => browse('left')}>Browse</button>
          </div>
        </label>

        <label class="field">
          <span>Right path</span>
          <div class="field-row">
            <input bind:value={rightPath} placeholder="Select the right side" />
            <button type="button" on:click={() => browse('right')}>Browse</button>
          </div>
        </label>
      </div>

      <div class="setup-options">
        <label>
          <input bind:checked={ignoreWhitespace} type="checkbox" />
          Ignore whitespace
        </label>
        <label>
          <input bind:checked={ignoreCase} type="checkbox" />
          Ignore case
        </label>
        <div class="view-picker">
          <button
            class:active={viewMode === 'unified'}
            type="button"
            on:click={() => (viewMode = viewMode === 'unified' ? 'sideBySide' : 'unified')}
          >
            Unified view
          </button>
        </div>
      </div>

      {#if errorMessage}
        <p class="error-banner">{errorMessage}</p>
      {/if}

      <div class="setup-actions">
        <button class="primary" type="button" disabled={loading} on:click={runCompare}>
          {#if loading}
            Comparing...
          {:else}
            Open compare
          {/if}
        </button>
      </div>
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
                  <span>{collapsedGroups[group.key] ? '▸' : '▾'}</span>
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
                          <span class="file-name">{getFileName(entry.relativePath)}</span>
                          <span class="file-meta">
                            {statusLabel[entry.status]} · {formatSize(entry.leftSize)} / {formatSize(
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
