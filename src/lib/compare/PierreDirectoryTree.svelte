<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte'
  import { FileTree } from '@pierre/trees'
  import type {
    FileTreeOptions,
    FileTreeRowDecoration,
    FileTreeRowDecorationContext,
  } from '@pierre/trees'
  import type { AppearanceSettings } from '../theme'
  import { buildPierreTreeUnsafeCss } from '../theme/pierre'
  import type { CompareTreeSettings, DirectoryEntryResult } from '../types'
  import { buildChangedDirectorySet, getEntryStatusBadge } from './diffStatusBadge'

  export let loading = false
  export let directoryEntries: DirectoryEntryResult[] = []
  export let entriesRevision = 0
  export let selectedRelativePath = ''
  export let treeSettings: CompareTreeSettings
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark'
  export let selectEntry: (entry: DirectoryEntryResult) => Promise<void>
  export let embedded = false

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
  let entryByPath = new Map<string, DirectoryEntryResult>()
  let changedDirectories = new Set<string>()

  $: visibleEntries = directoryEntries
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

  // Render the full status badge set (M/A/D/R/C/T/?/U + local) through the
  // library's row-annotation lane. The built-in gitStatus lane only supports a
  // 6-status subset with fixed letters, so it is intentionally not used. Reads
  // live component state (entryByPath, changedDirectories), which is refreshed
  // before each render.
  function renderRowDecoration(
    context: FileTreeRowDecorationContext,
  ): FileTreeRowDecoration | null {
    const { path, kind } = context.item

    if (kind === 'directory') {
      return changedDirectories.has(path)
        ? {
            icon: { name: 'file-tree-icon-dot', width: 6, height: 6 },
            title: 'Contains changes',
          }
        : null
    }

    const entry = entryByPath.get(path)
    if (!entry) {
      return null
    }

    const badge = getEntryStatusBadge(entry)
    return badge ? { text: badge.text, title: badge.title } : null
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
      renderRowDecoration,
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
    changedDirectories = buildChangedDirectorySet(visibleEntries)
    const paths = buildTreePaths(visibleEntries)
    const nextStructureKey = currentStructureKey
    const entriesChanged = entriesRevision !== renderedEntriesRevision

    if (!fileTree || nextStructureKey !== renderedStructureKey) {
      fileTree?.cleanUp()
      fileTree = new FileTree(buildOptions(paths, selectedRelativePath))
      fileTree.render({ containerWrapper: host })
      measureHostViewport()
      renderedStructureKey = nextStructureKey
      renderedEntriesRevision = entriesRevision
      lastSyncedSelectionPath = ''
      selectCurrentPath()
      return
    }

    if (entriesChanged) {
      fileTree.resetPaths(paths, { initialExpandedPaths: treeSettings.initialExpandedPaths })
      // Force a full re-render so row decorations pick up the latest entry data
      // even when the path set is unchanged (e.g. a status flips on staging).
      // renderRowDecoration reads live component state, so this re-evaluates
      // every visible badge. Re-rendering reconciles the existing DOM, so scroll
      // and expansion state are preserved.
      if (host) {
        fileTree.render({ containerWrapper: host })
      }
      renderedEntriesRevision = entriesRevision
    }

    selectCurrentPath(selectedRelativePath !== lastSyncedSelectionPath)
  }

  $: host, visibleEntries, entriesRevision, treeSettings, appearanceSettings, resolvedThemeMode, void syncTreeData()
  $: host, syncHostObserver()
  $: selectedRelativePath, selectCurrentPath()

  onMount(() => {
    hostResizeObserver = new ResizeObserver(() => {
      measureHostViewport()
    })
    syncHostObserver()
  })

  onDestroy(() => {
    hostResizeObserver?.disconnect()
    hostResizeObserver = null
    fileTree?.cleanUp()
    fileTree = null
    resetRenderedKeys()
  })
</script>

{#if embedded}
  <div class="directory-tree-host" bind:this={host}>
    {#if loading && directoryEntries.length === 0}
      <div class="directory-tree-state">
        <span class="refresh-spinner visible"></span>
        <p>Scanning folders...</p>
      </div>
    {/if}
  </div>
{:else}
  <aside class="directory-tree-panel">
    <div class="directory-tree-host" bind:this={host}>
      {#if loading && directoryEntries.length === 0}
        <div class="directory-tree-state">
          <span class="refresh-spinner visible"></span>
          <p>Scanning folders...</p>
        </div>
      {/if}
    </div>
  </aside>
{/if}
