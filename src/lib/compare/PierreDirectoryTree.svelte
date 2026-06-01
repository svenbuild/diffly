<script lang="ts">
  import { onDestroy, tick } from 'svelte'
  import { FileTree, prepareFileTreeInput, preparePresortedFileTreeInput } from '@pierre/trees'
  import type { FileTreeOptions } from '@pierre/trees'
  import type { AppearanceSettings } from '../theme'
  import { buildPierreTreeUnsafeCss } from '../theme/pierre'
  import type { CompareTreeSettings, DirectoryEntryResult, EntryStatus } from '../types'

  export let loading = false
  export let directoryEntries: DirectoryEntryResult[] = []
  export let selectedRelativePath = ''
  export let statusLabel: Record<EntryStatus, string>
  export let treeSettings: CompareTreeSettings
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark'
  export let selectEntry: (entry: DirectoryEntryResult) => Promise<void>

  let host: HTMLDivElement | null = null
  let fileTree: FileTree | null = null
  let renderVersion = 0

  $: visibleEntries = directoryEntries
  $: entryByPath = new Map(visibleEntries.map((entry) => [entry.relativePath, entry]))

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

  function buildOptions(paths: string[]): FileTreeOptions {
    return {
      preparedInput: buildPreparedInput(paths, treeSettings),
      density: resolveDensity(treeSettings),
      flattenEmptyDirectories: treeSettings.flattenEmptyDirectories,
      stickyFolders: treeSettings.stickyFolders,
      fileTreeSearchMode: treeSettings.searchMode,
      initialExpansion: resolveInitialExpansion(treeSettings),
      initialExpandedPaths: treeSettings.initialExpandedPaths,
      initialSelectedPaths: selectedRelativePath ? [selectedRelativePath] : [],
      search: treeSettings.search,
      searchFakeFocus: treeSettings.searchFakeFocus,
      searchBlurBehavior: treeSettings.searchBlurBehavior,
      initialSearchQuery: treeSettings.initialSearchQuery || null,
      initialVisibleRowCount: treeSettings.initialVisibleRowCount,
      itemHeight: treeSettings.itemHeight,
      overscan: treeSettings.overscan,
      unsafeCSS: buildPierreTreeUnsafeCss(appearanceSettings, resolvedThemeMode),
      gitStatus: visibleEntries.map((entry) => ({
        path: entry.relativePath,
        status: entry.status === 'modified'
          ? 'modified'
          : entry.status === 'leftOnly'
            ? 'deleted'
            : entry.status === 'rightOnly'
              ? 'added'
              : 'ignored',
      })),
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

  async function renderTree() {
    if (!host) {
      return
    }

    const version = ++renderVersion
    await tick()

    if (!host || version !== renderVersion) {
      return
    }

    const paths = visibleEntries.map((entry) => entry.relativePath)

    fileTree?.cleanUp()
    fileTree = new FileTree(buildOptions(paths))
    fileTree.render({ containerWrapper: host })

    if (selectedRelativePath && paths.includes(selectedRelativePath)) {
      fileTree.focusPath(selectedRelativePath)
      fileTree.scrollToPath(selectedRelativePath, { focus: false, offset: 'nearest' })
    }
  }

  $: host, visibleEntries, selectedRelativePath, treeSettings, appearanceSettings, resolvedThemeMode, void renderTree()

  onDestroy(() => {
    fileTree?.cleanUp()
    fileTree = null
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
