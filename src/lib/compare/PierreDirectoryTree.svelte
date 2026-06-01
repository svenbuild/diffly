<script lang="ts">
  import { onDestroy, tick } from 'svelte'
  import { FileTree, preparePresortedFileTreeInput } from '@pierre/trees'
  import type { FileTreeOptions } from '@pierre/trees'
  import type { AppearanceSettings } from '../theme'
  import { buildPierreTreeUnsafeCss } from '../theme/pierre'
  import type { CompareTreeSettings, DirectoryEntryResult, EntryStatus } from '../types'

  export let loading = false
  export let directoryEntries: DirectoryEntryResult[] = []
  export let selectedRelativePath = ''
  export let activeStatusFilters: EntryStatus[] = []
  export let statusLabel: Record<EntryStatus, string>
  export let treeSettings: CompareTreeSettings
  export let appearanceSettings: AppearanceSettings
  export let selectEntry: (entry: DirectoryEntryResult) => Promise<void>
  export let isStatusFilterActive: (status: EntryStatus) => boolean
  export let toggleStatusFilter: (status: EntryStatus) => Promise<void>

  let host: HTMLDivElement | null = null
  let fileTree: FileTree | null = null
  let searchQuery = ''
  let renderVersion = 0

  const statusOrder: EntryStatus[] = ['modified', 'leftOnly', 'rightOnly', 'unsupported']

  $: visibleEntries = activeStatusFilters.length === 0
    ? directoryEntries
    : directoryEntries.filter((entry) => activeStatusFilters.includes(entry.status))
  $: entryByPath = new Map(visibleEntries.map((entry) => [entry.relativePath, entry]))
  $: statusSummary = statusOrder.map((status) => ({
    status,
    label: statusLabel[status],
    count: directoryEntries.filter((entry) => entry.status === status).length,
  }))

  function buildOptions(paths: string[]): FileTreeOptions {
    return {
      preparedInput: preparePresortedFileTreeInput(paths),
      density: treeSettings.density,
      flattenEmptyDirectories: treeSettings.flattenEmptyDirectories,
      stickyFolders: treeSettings.stickyFolders,
      fileTreeSearchMode: treeSettings.searchMode,
      initialExpansion: 'open',
      initialSelectedPaths: selectedRelativePath ? [selectedRelativePath] : [],
      search: true,
      initialSearchQuery: searchQuery || null,
      unsafeCSS: buildPierreTreeUnsafeCss(appearanceSettings),
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

    const paths = visibleEntries.map((entry) => entry.relativePath).sort()

    fileTree?.cleanUp()
    fileTree = new FileTree(buildOptions(paths))
    fileTree.render({ containerWrapper: host })

    if (searchQuery) {
      fileTree.setSearch(searchQuery)
    }

    if (selectedRelativePath && paths.includes(selectedRelativePath)) {
      fileTree.focusPath(selectedRelativePath)
      fileTree.scrollToPath(selectedRelativePath, { focus: false, offset: 'nearest' })
    }
  }

  function updateSearch(value: string) {
    searchQuery = value
    fileTree?.setSearch(value || null)
  }

  $: host, visibleEntries, selectedRelativePath, treeSettings, appearanceSettings, void renderTree()

  onDestroy(() => {
    fileTree?.cleanUp()
    fileTree = null
  })
</script>

<aside class="directory-tree-panel">
  <div class="directory-toolbar">
    <input
      aria-label="Search changed files"
      placeholder="Search files"
      type="search"
      value={searchQuery}
      on:input={(event) => updateSearch((event.currentTarget as HTMLInputElement).value)}
    />
  </div>

  <div class="directory-filter-row" role="group" aria-label="Directory filters">
    {#each statusSummary as item}
      <button
        aria-pressed={isStatusFilterActive(item.status)}
        class:active={isStatusFilterActive(item.status)}
        class={`filter-chip ${item.status}`}
        disabled={item.count === 0}
        type="button"
        on:click={() => toggleStatusFilter(item.status)}
      >
        <span>{item.label}</span>
        <strong>{item.count}</strong>
      </button>
    {/each}
  </div>

  <div class="directory-tree-host" bind:this={host}>
    {#if loading && directoryEntries.length === 0}
      <div class="directory-tree-state">
        <span class="refresh-spinner visible"></span>
        <p>Scanning folders...</p>
      </div>
    {/if}
  </div>
</aside>
