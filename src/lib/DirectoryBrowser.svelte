<script lang="ts">
  import EntryIcon from './EntryIcon.svelte'

  import type { DirectoryEntryResult, EntryStatus } from './types'
  import type { FolderSection } from './ui-types'

  export let loading: boolean
  export let activeStatusFilters: EntryStatus[]
  export let filteredDirectoryEntries: DirectoryEntryResult[]
  export let directoryEntries: DirectoryEntryResult[]
  export let directoryStatusSummary: Array<{
    status: EntryStatus
    label: string
    count: number
  }>
  export let visibleFolderSections: FolderSection[]
  export let collapsedGroups: Record<string, boolean>
  export let selectedRelativePath: string
  export let statusLabel: Record<EntryStatus, string>
  export let isStatusFilterActive: (status: EntryStatus) => boolean
  export let toggleStatusFilter: (status: EntryStatus) => Promise<void>
  export let toggleGroup: (groupKey: string) => void
  export let selectEntry: (entry: DirectoryEntryResult) => Promise<void>
  export let getFileName: (path: string) => string
  export let formatSize: (size: number | null) => string
</script>

<aside class:refreshing={loading} class="file-browser">
  <header class="browser-header">
    <div class="browser-title">
      <h2>Files</h2>
      <span>
        {#if activeStatusFilters.length > 0}
          {filteredDirectoryEntries.length} of {directoryEntries.length} changed files
        {:else}
          {directoryEntries.length} changed files
        {/if}
      </span>
    </div>

    {#if directoryStatusSummary.length > 0}
      <div class="status-summary">
        {#each directoryStatusSummary as item}
          <button
            aria-pressed={isStatusFilterActive(item.status)}
            class:active-filter={isStatusFilterActive(item.status)}
            class={`status-chip filter-chip ${item.status}`}
            type="button"
            on:click={() => toggleStatusFilter(item.status)}
          >
            {item.label} {item.count}
          </button>
        {/each}
      </div>
    {/if}
  </header>

  {#if visibleFolderSections.length === 0}
    <div class="empty-state">
      {activeStatusFilters.length > 0
        ? 'No files match the selected filters.'
        : 'No differing files found.'}
    </div>
  {:else}
    <div class="browser-list">
      {#each visibleFolderSections as group}
        <section class="file-group">
          <button
            class="group-toggle"
            style={`padding-left: ${group.depth * 14 + 10}px`}
            type="button"
            on:click={() => toggleGroup(group.key)}
          >
            <span class="chevron">
              <svg aria-hidden="true" class:collapsed={collapsedGroups[group.key]} class="chevron-icon" viewBox="0 0 16 16">
                <path d="m5.25 3.75 4.5 4.25-4.5 4.25" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" />
              </svg>
            </span>
            <span class="group-label">{group.label}</span>
            <span class="group-count">{group.totalCount}</span>
          </button>

          {#if !collapsedGroups[group.key] && group.entries.length > 0}
            <div class="file-list">
              {#each group.entries as entry}
                <button
                  class:selected={selectedRelativePath === entry.relativePath}
                  class="file-row"
                  type="button"
                  on:click={() => selectEntry(entry)}
                >
                  <span class="file-row-top">
                    <EntryIcon kind="file" />
                    <span class="entry-text">{getFileName(entry.relativePath)}</span>
                  </span>
                  <span class="file-row-bottom">
                    <span class={`status-chip ${entry.status}`}>{statusLabel[entry.status]}</span>
                    <span>{formatSize(entry.leftSize)} / {formatSize(entry.rightSize)}</span>
                  </span>
                </button>
              {/each}
            </div>
          {/if}
        </section>
      {/each}
    </div>
  {/if}
</aside>
