<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte'
  import { FileTree } from '@pierre/trees'
  import type { FileTreeOptions, GitStatusEntry } from '@pierre/trees'
  import type { AppearanceSettings } from '../theme'
  import { buildPierreTreeUnsafeCss } from '../theme/pierre'
  import type { CompareTreeSettings, DirectoryEntryResult, EntryStatus } from '../types'

  type FallbackTreeNode = {
    childMap: Map<string, FallbackTreeNode>
    children: FallbackTreeNode[]
    depth: number
    entry: DirectoryEntryResult | null
    kind: 'directory' | 'file'
    name: string
    path: string
  }

  type FallbackTreeRow = {
    depth: number
    entry: DirectoryEntryResult | null
    expanded: boolean
    id: string
    kind: 'directory' | 'file'
    name: string
    path: string
    status: EntryStatus | null
  }

  export let loading = false
  export let directoryEntries: DirectoryEntryResult[] = []
  export let entriesRevision = 0
  export let selectedRelativePath = ''
  export let statusLabel: Record<EntryStatus, string>
  export let treeSettings: CompareTreeSettings
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark'
  export let selectEntry: (entry: DirectoryEntryResult) => Promise<void>

  let host: HTMLDivElement | null = null
  let fileTree: FileTree | null = null
  let renderVersion = 0
  let renderedStructureKey = ''
  let renderedEntriesRevision = -1
  let currentStructureKey = ''
  let lastSyncedSelectionPath = ''
  let hostResizeObserver: ResizeObserver | null = null
  let observedHost: HTMLDivElement | null = null
  let hostViewportHeight = 0
  let treeHealthFrame: number | null = null
  let treeFallbackActive = true
  let fallbackScrollHost: HTMLDivElement | null = null
  let fallbackSearch = ''
  let fallbackScrollTop = 0
  let fallbackViewportHeight = 0
  let fallbackExpandedPaths = new Set<string>()
  let fallbackExpansionKey = ''

  $: visibleEntries = directoryEntries
  $: sortedEntries = treeSettings.sortMode === 'path'
    ? [...visibleEntries].sort((left, right) => left.relativePath.localeCompare(right.relativePath))
    : visibleEntries
  $: fallbackQuery = fallbackSearch.trim().toLocaleLowerCase()
  $: fallbackTreeRows = buildFallbackTreeRows(sortedEntries, fallbackQuery, fallbackExpandedPaths, treeSettings)
  $: fallbackRowHeight = Math.max(18, treeSettings.itemHeight || 22)
  $: fallbackViewport = fallbackViewportHeight || hostViewportHeight || 1
  $: fallbackStartIndex = Math.max(0, Math.floor(fallbackScrollTop / fallbackRowHeight) - treeSettings.overscan)
  $: fallbackVisibleCount = Math.ceil(fallbackViewport / fallbackRowHeight) + treeSettings.overscan * 2
  $: fallbackVisibleRows = fallbackTreeRows.slice(fallbackStartIndex, fallbackStartIndex + fallbackVisibleCount)
  $: fallbackTotalHeight = fallbackTreeRows.length * fallbackRowHeight
  let entryByPath = new Map<string, DirectoryEntryResult>()
  $: currentStructureKey = JSON.stringify({
    treeSettings,
    appearanceSettings,
    resolvedThemeMode,
  })

  function resolveDensity(settings: CompareTreeSettings) {
    return settings.density === 'custom'
      ? settings.customDensity
      : settings.density
  }

  function resolveInitialExpansion(settings: CompareTreeSettings) {
    return settings.initialExpansion === 'depth'
      ? settings.initialExpansionDepth
      : settings.initialExpansion
  }

  function buildTreePaths(entries: DirectoryEntryResult[]) {
    const paths = entries.map((entry) => entry.relativePath)
    return treeSettings.sortMode === 'path' ? paths.sort() : paths
  }

  function createFallbackNode(kind: FallbackTreeNode['kind'], path: string, name: string, depth: number, entry: DirectoryEntryResult | null): FallbackTreeNode {
    return {
      childMap: new Map(),
      children: [],
      depth,
      entry,
      kind,
      name,
      path,
    }
  }

  function pathParts(path: string) {
    return path.split('/').filter(Boolean)
  }

  function directoryAncestors(path: string) {
    const parts = pathParts(path)
    const ancestors: string[] = []

    for (let index = 0; index < parts.length - 1; index += 1) {
      ancestors.push(parts.slice(0, index + 1).join('/'))
    }

    return ancestors
  }

  function collectDirectoryPaths(entries: DirectoryEntryResult[]) {
    const paths = new Map<string, number>()
    for (const entry of entries) {
      const parts = pathParts(entry.relativePath)
      for (let index = 0; index < parts.length - 1; index += 1) {
        paths.set(parts.slice(0, index + 1).join('/'), index)
      }
    }

    return paths
  }

  function syncFallbackExpansion() {
    const nextExpansionKey = JSON.stringify({
      entriesRevision,
      initialExpansion: treeSettings.initialExpansion,
      initialExpansionDepth: treeSettings.initialExpansionDepth,
      initialExpandedPaths: treeSettings.initialExpandedPaths,
    })
    if (nextExpansionKey === fallbackExpansionKey) {
      return
    }

    const directoryPaths = collectDirectoryPaths(visibleEntries)
    const expandedPaths = new Set<string>()
    for (const [path, depth] of directoryPaths) {
      if (
        treeSettings.initialExpansion === 'open'
        || (treeSettings.initialExpansion === 'depth' && depth < treeSettings.initialExpansionDepth)
        || treeSettings.initialExpandedPaths.includes(path)
      ) {
        expandedPaths.add(path)
      }
    }

    for (const path of treeSettings.initialExpandedPaths) {
      expandedPaths.add(path)
      for (const ancestor of directoryAncestors(`${path}/placeholder`)) {
        expandedPaths.add(ancestor)
      }
    }

    for (const ancestor of directoryAncestors(selectedRelativePath)) {
      expandedPaths.add(ancestor)
    }

    fallbackExpansionKey = nextExpansionKey
    fallbackExpandedPaths = expandedPaths
  }

  function expandFallbackAncestors(path: string) {
    if (!path) {
      return
    }

    let nextExpandedPaths: Set<string> | null = null
    for (const ancestor of directoryAncestors(path)) {
      if (!fallbackExpandedPaths.has(ancestor)) {
        nextExpandedPaths ??= new Set(fallbackExpandedPaths)
        nextExpandedPaths.add(ancestor)
      }
    }

    if (nextExpandedPaths) {
      fallbackExpandedPaths = nextExpandedPaths
    }
  }

  function toggleFallbackDirectory(path: string) {
    const nextExpandedPaths = new Set(fallbackExpandedPaths)
    if (nextExpandedPaths.has(path)) {
      nextExpandedPaths.delete(path)
    } else {
      nextExpandedPaths.add(path)
    }
    fallbackExpandedPaths = nextExpandedPaths
  }

  function handleFallbackRowClick(row: FallbackTreeRow) {
    if (row.kind === 'directory') {
      toggleFallbackDirectory(row.path)
      return
    }

    if (row.entry) {
      void selectEntry(row.entry)
    }
  }

  function sortFallbackChildren(children: FallbackTreeNode[], settings: CompareTreeSettings) {
    if (settings.sortMode !== 'path') {
      return
    }

    children.sort((left, right) => {
      if (settings.stickyFolders && left.kind !== right.kind) {
        return left.kind === 'directory' ? -1 : 1
      }
      return left.name.localeCompare(right.name)
    })

    for (const child of children) {
      sortFallbackChildren(child.children, settings)
    }
  }

  function addFallbackEntry(root: FallbackTreeNode, entry: DirectoryEntryResult) {
    const parts = pathParts(entry.relativePath)
    if (parts.length === 0) {
      return
    }

    let parent = root
    for (let index = 0; index < parts.length - 1; index += 1) {
      const path = parts.slice(0, index + 1).join('/')
      let node = parent.childMap.get(path)
      if (!node) {
        node = createFallbackNode('directory', path, parts[index], index, null)
        parent.childMap.set(path, node)
        parent.children.push(node)
      }
      parent = node
    }

    const fileNode = createFallbackNode('file', entry.relativePath, parts[parts.length - 1], parts.length - 1, entry)
    parent.children.push(fileNode)
  }

  function buildFallbackTreeRows(
    entries: DirectoryEntryResult[],
    query: string,
    expandedPaths: Set<string>,
    settings: CompareTreeSettings,
  ): FallbackTreeRow[] {
    const filteredEntries = query
      ? entries.filter((entry) => entry.relativePath.toLocaleLowerCase().includes(query))
      : entries
    const root = createFallbackNode('directory', '', '', -1, null)
    const rows: FallbackTreeRow[] = []

    for (const entry of filteredEntries) {
      addFallbackEntry(root, entry)
    }
    sortFallbackChildren(root.children, settings)

    const visit = (node: FallbackTreeNode) => {
      const expanded = query.length > 0 || expandedPaths.has(node.path)
      rows.push({
        depth: node.depth,
        entry: node.entry,
        expanded,
        id: `${node.kind}:${node.path}`,
        kind: node.kind,
        name: node.name,
        path: node.path,
        status: node.entry?.status ?? null,
      })

      if (node.kind === 'directory' && expanded) {
        for (const child of node.children) {
          visit(child)
        }
      }
    }

    for (const child of root.children) {
      visit(child)
    }

    return rows
  }

  function buildGitStatus(entries: DirectoryEntryResult[]): GitStatusEntry[] {
    return entries.map((entry) => ({
      path: entry.relativePath,
      status: entry.status === 'modified'
        ? 'modified'
        : entry.status === 'leftOnly'
          ? 'deleted'
          : entry.status === 'rightOnly'
            ? 'added'
            : 'ignored',
    }))
  }

  function buildOptions(paths: string[], selectedPath: string): FileTreeOptions {
    return {
      paths,
      density: resolveDensity(treeSettings),
      flattenEmptyDirectories: treeSettings.flattenEmptyDirectories,
      stickyFolders: treeSettings.stickyFolders,
      fileTreeSearchMode: treeSettings.searchMode,
      initialExpansion: resolveInitialExpansion(treeSettings),
      initialExpandedPaths: treeSettings.initialExpandedPaths,
      initialSelectedPaths: selectedPath ? [selectedPath] : [],
      search: treeSettings.search,
      searchFakeFocus: treeSettings.searchFakeFocus,
      searchBlurBehavior: treeSettings.searchBlurBehavior,
      initialSearchQuery: treeSettings.initialSearchQuery || null,
      initialVisibleRowCount: treeSettings.initialVisibleRowCount,
      itemHeight: treeSettings.itemHeight,
      overscan: treeSettings.overscan,
      dragAndDrop: treeSettings.dragAndDrop,
      renaming: treeSettings.renaming,
      // Built-in icon set (configurable). The colored "complete" set gives the
      // per-file-type colors; git status only recolours the name + shows the
      // A/M/D letter in the git lane, so the file-type icon colours stay intact.
      icons: { set: treeSettings.iconSet, colored: treeSettings.coloredIcons },
      unsafeCSS: buildPierreTreeUnsafeCss(appearanceSettings, resolvedThemeMode),
      gitStatus: buildGitStatus(visibleEntries),
      onSelectionChange: (paths) => {
        const nextPath = paths[0]
        const entry = nextPath ? entryByPath.get(nextPath) : null
        if (entry && entry.relativePath !== selectedRelativePath) {
          void selectEntry(entry)
        }
      },
    }
  }

  function measureHostViewport() {
    if (!host) {
      return 0
    }

    const hostRect = host.getBoundingClientRect()
    const panelRect = host.parentElement?.getBoundingClientRect()
    const nextHeight = Math.floor(panelRect?.height || hostRect.height || 0)
    if (nextHeight > 0 && nextHeight !== hostViewportHeight) {
      hostViewportHeight = nextHeight
      host.style.height = `${nextHeight}px`
    }

    return nextHeight
  }

  function updateFallbackViewport() {
    if (!fallbackScrollHost) {
      fallbackViewportHeight = hostViewportHeight
      return
    }

    fallbackViewportHeight = Math.floor(fallbackScrollHost.getBoundingClientRect().height || hostViewportHeight)
  }

  function handleFallbackScroll() {
    fallbackScrollTop = fallbackScrollHost?.scrollTop ?? 0
  }

  function resetFallbackScroll() {
    fallbackScrollTop = 0
    if (fallbackScrollHost) {
      fallbackScrollHost.scrollTop = 0
    }
  }

  function enableFallbackTree() {
    if (treeFallbackActive) {
      return
    }

    treeFallbackActive = true
    fileTree?.cleanUp()
    fileTree = null
    resetRenderedKeys()
    updateFallbackViewport()
  }

  function cancelTreeHealthCheck() {
    if (treeHealthFrame !== null) {
      window.cancelAnimationFrame(treeHealthFrame)
      treeHealthFrame = null
    }
  }

  function scheduleTreeHealthCheck(expectedPathCount: number) {
    cancelTreeHealthCheck()
    if (expectedPathCount === 0 || !host) {
      return
    }

    treeHealthFrame = window.requestAnimationFrame(() => {
      treeHealthFrame = window.requestAnimationFrame(() => {
        treeHealthFrame = null
        const container = host?.querySelector('file-tree-container')
        const itemCount = container?.shadowRoot?.querySelectorAll("[data-type='item']").length ?? 0
        if (expectedPathCount > 0 && itemCount === 0) {
          enableFallbackTree()
        }
      })
    })
  }

  function syncHostObserver() {
    if (!hostResizeObserver || host === observedHost) {
      return
    }

    if (observedHost) {
      hostResizeObserver.unobserve(observedHost)
    }

    observedHost = host
    if (observedHost) {
      hostResizeObserver.observe(observedHost)
      measureHostViewport()
      updateFallbackViewport()
    }
  }

  function resetRenderedKeys() {
    renderedStructureKey = ''
    renderedEntriesRevision = -1
    lastSyncedSelectionPath = ''
  }

  function selectCurrentPath(scrollToSelection = true) {
    if (!fileTree) {
      return
    }

    if (!selectedRelativePath) {
      for (const selectedPath of fileTree.getSelectedPaths()) {
        fileTree.getItem(selectedPath)?.deselect()
      }
      lastSyncedSelectionPath = ''
      return
    }

    const item = fileTree.getItem(selectedRelativePath)
    if (!item) {
      return
    }

    for (const selectedPath of fileTree.getSelectedPaths()) {
      if (selectedPath !== selectedRelativePath) {
        fileTree.getItem(selectedPath)?.deselect()
      }
    }

    if (!item.isSelected()) {
      item.select()
    }

    const shouldScroll = scrollToSelection && selectedRelativePath !== lastSyncedSelectionPath
    lastSyncedSelectionPath = selectedRelativePath
    fileTree.focusPath(selectedRelativePath)
    if (shouldScroll) {
      fileTree.scrollToPath(selectedRelativePath, { focus: false, offset: 'nearest' })
    }
  }

  async function syncTreeData() {
    if (treeFallbackActive) {
      updateFallbackViewport()
      return
    }

    if (!host) {
      return
    }

    const version = ++renderVersion
    await tick()

    if (!host || version !== renderVersion) {
      return
    }

    const measuredHeight = measureHostViewport()
    if (measuredHeight <= 0) {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
      if (!host || version !== renderVersion) {
        return
      }
      measureHostViewport()
    }

    entryByPath = new Map(visibleEntries.map((entry) => [entry.relativePath, entry]))
    const paths = buildTreePaths(visibleEntries)
    const nextStructureKey = currentStructureKey
    const entriesChanged = entriesRevision !== renderedEntriesRevision

    if (!fileTree || nextStructureKey !== renderedStructureKey) {
      fileTree?.cleanUp()
      fileTree = new FileTree(buildOptions(paths, selectedRelativePath))
      fileTree.render({ containerWrapper: host })
      measureHostViewport()
      scheduleTreeHealthCheck(paths.length)
      renderedStructureKey = nextStructureKey
      renderedEntriesRevision = entriesRevision
      lastSyncedSelectionPath = ''
      selectCurrentPath()
      return
    }

    if (entriesChanged) {
      fileTree.resetPaths(paths, { initialExpandedPaths: treeSettings.initialExpandedPaths })
      fileTree.setGitStatus(buildGitStatus(visibleEntries))
      scheduleTreeHealthCheck(paths.length)
      renderedEntriesRevision = entriesRevision
    }

    selectCurrentPath(selectedRelativePath !== lastSyncedSelectionPath)
  }

  $: host, visibleEntries, entriesRevision, treeSettings, appearanceSettings, resolvedThemeMode, void syncTreeData()
  $: host, syncHostObserver()
  $: fallbackScrollHost, updateFallbackViewport()
  $: visibleEntries, entriesRevision, treeSettings.initialExpansion, treeSettings.initialExpansionDepth, treeSettings.initialExpandedPaths, syncFallbackExpansion()
  $: selectedRelativePath, expandFallbackAncestors(selectedRelativePath)
  $: selectedRelativePath, selectCurrentPath()

  onMount(() => {
    hostResizeObserver = new ResizeObserver(() => {
      measureHostViewport()
      updateFallbackViewport()
    })
    syncHostObserver()
  })

  onDestroy(() => {
    cancelTreeHealthCheck()
    hostResizeObserver?.disconnect()
    hostResizeObserver = null
    fileTree?.cleanUp()
    fileTree = null
    resetRenderedKeys()
  })
</script>

<aside class="directory-tree-panel">
  {#if treeFallbackActive}
    <div class="directory-tree-fallback">
      {#if treeSettings.search}
        <input
          aria-label="Search files"
          class="directory-tree-fallback-search"
          placeholder="Search..."
          type="search"
          bind:value={fallbackSearch}
          on:input={resetFallbackScroll}
        />
      {/if}

      {#if loading && directoryEntries.length === 0}
        <div class="directory-tree-state">
          <span class="refresh-spinner visible"></span>
          <p>Scanning folders...</p>
        </div>
      {:else}
        <div
          class="directory-tree-fallback-list"
          bind:this={fallbackScrollHost}
          on:scroll={handleFallbackScroll}
        >
          <div class="directory-tree-fallback-spacer" style:height={`${fallbackTotalHeight}px`}>
            {#each fallbackVisibleRows as row, index (row.id)}
              <button
                aria-expanded={row.kind === 'directory' ? row.expanded : null}
                class:directory={row.kind === 'directory'}
                class:file={row.kind === 'file'}
                class:selected={row.entry?.relativePath === selectedRelativePath}
                class="directory-tree-fallback-row"
                style:height={`${fallbackRowHeight}px`}
                style:padding-left={`${8 + Math.min(row.depth, 8) * 12}px`}
                style:transform={`translateY(${(fallbackStartIndex + index) * fallbackRowHeight}px)`}
                title={row.path}
                type="button"
                on:click={() => handleFallbackRowClick(row)}
              >
                {#if row.kind === 'directory'}
                  <span class="directory-tree-fallback-icon directory" aria-hidden="true">
                    {row.expanded ? '-' : '+'}
                  </span>
                {:else}
                  <span class="directory-tree-fallback-icon" data-status={row.status}></span>
                {/if}
                <span class="directory-tree-fallback-label">
                  <span>{row.name}</span>
                </span>
                {#if row.status}
                  <span class="directory-tree-fallback-status">{statusLabel[row.status]}</span>
                {/if}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <div class="directory-tree-host" bind:this={host}>
      {#if loading && directoryEntries.length === 0}
        <div class="directory-tree-state">
          <span class="refresh-spinner visible"></span>
          <p>Scanning folders...</p>
        </div>
      {/if}
    </div>
  {/if}
</aside>
