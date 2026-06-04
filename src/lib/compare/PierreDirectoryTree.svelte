<script lang="ts">
  import { onDestroy, tick } from 'svelte'
  import { FileTree, prepareFileTreeInput, preparePresortedFileTreeInput } from '@pierre/trees'
  import type { FileTreeOptions, GitStatusEntry } from '@pierre/trees'
  import type { AppearanceSettings } from '../theme'
  import { buildPierreTreeUnsafeCss } from '../theme/pierre'
  import type { CompareTreeSettings, DirectoryEntryResult, EntryStatus } from '../types'

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

  $: visibleEntries = directoryEntries
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

  function buildPreparedInput(paths: string[], settings: CompareTreeSettings) {
    if (settings.sortMode === 'default') {
      return prepareFileTreeInput(paths)
    }

    return preparePresortedFileTreeInput([...paths].sort())
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
      preparedInput: buildPreparedInput(paths, treeSettings),
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
      unsafeCSS: buildPierreTreeUnsafeCss(appearanceSettings, resolvedThemeMode),
      gitStatus: buildGitStatus(visibleEntries),
      renderRowDecoration: ({ item }) => {
        const entry = entryByPath.get(item.path)
        if (!entry) {
          return null
        }
        return {
          text: statusLabel[entry.status],
          title: statusLabel[entry.status],
        }
      },
      onSelectionChange: (paths) => {
        const nextPath = paths[0]
        const entry = nextPath ? entryByPath.get(nextPath) : null
        if (entry && entry.relativePath !== selectedRelativePath) {
          void selectEntry(entry)
        }
      },
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

    entryByPath = new Map(visibleEntries.map((entry) => [entry.relativePath, entry]))
    const paths = visibleEntries.map((entry) => entry.relativePath)
    const nextStructureKey = currentStructureKey
    const entriesChanged = entriesRevision !== renderedEntriesRevision

    if (!fileTree || nextStructureKey !== renderedStructureKey) {
      fileTree?.cleanUp()
      fileTree = new FileTree(buildOptions(paths, selectedRelativePath))
      fileTree.render({ containerWrapper: host })
      renderedStructureKey = nextStructureKey
      renderedEntriesRevision = entriesRevision
      lastSyncedSelectionPath = ''
      selectCurrentPath()
      return
    }

    if (entriesChanged) {
      fileTree.resetPaths(paths, {
        preparedInput: buildPreparedInput(paths, treeSettings),
        initialExpandedPaths: treeSettings.initialExpandedPaths,
      })
      fileTree.setGitStatus(buildGitStatus(visibleEntries))
      renderedEntriesRevision = entriesRevision
    }

    selectCurrentPath(selectedRelativePath !== lastSyncedSelectionPath)
  }

  $: host, visibleEntries, entriesRevision, treeSettings, appearanceSettings, resolvedThemeMode, void syncTreeData()
  $: selectedRelativePath, selectCurrentPath()

  onDestroy(() => {
    fileTree?.cleanUp()
    fileTree = null
    resetRenderedKeys()
  })
</script>

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
