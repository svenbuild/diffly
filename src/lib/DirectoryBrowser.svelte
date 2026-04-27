<script lang="ts">
  import { onMount } from 'svelte'
  import EntryIcon from './EntryIcon.svelte'
  import { ROOT_GROUP } from './path-utils'

  import type { DirectoryEntryResult, EntryStatus } from './types'
  import type { FolderSection } from './ui-types'

  export let loading: boolean
  export let activeStatusFilters: EntryStatus[]
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

  let fileFilter = ''
  let hideCollapsedFoldersWithoutMatches = false
  let filterInput: HTMLInputElement | null = null

  $: normalizedFileFilter = fileFilter.trim().toLowerCase()
  $: filteredFolderSections = visibleFolderSections
    .map((group) => {
      const entries = normalizedFileFilter
        ? group.entries.filter((entry) =>
            entry.relativePath.toLowerCase().includes(normalizedFileFilter),
          )
        : group.entries

      return {
        ...group,
        entries,
      }
    })
    .filter((group) => !hideCollapsedFoldersWithoutMatches || group.entries.length > 0)
  $: visibleEntryCount = filteredFolderSections.reduce(
    (total, group) => total + group.entries.length,
    0,
  )
  $: hasVisibleEntries = filteredFolderSections.some((group) => group.entries.length > 0)
  $: hasActiveFilters = activeStatusFilters.length > 0 || normalizedFileFilter !== ''
  $: changeSummary = hasActiveFilters
    ? `${visibleEntryCount} of ${directoryEntries.length} changed files`
    : `${directoryEntries.length} changed files`

  function formatGroupCount(group: FolderSection) {
    const visibleGroupTotal = getVisibleGroupTotal(group)

    if (!hasActiveFilters || visibleGroupTotal === group.totalCount) {
      return String(group.totalCount)
    }

    return `${visibleGroupTotal} shown`
  }

  function formatChangedFilesLabel(count: number) {
    return `${count} changed ${count === 1 ? 'file' : 'files'}`
  }

  function getGroupCountTitle(group: FolderSection) {
    const visibleGroupTotal = getVisibleGroupTotal(group)

    if (!hasActiveFilters || visibleGroupTotal === group.totalCount) {
      return formatChangedFilesLabel(group.totalCount)
    }

    return `${visibleGroupTotal} visible of ${formatChangedFilesLabel(group.totalCount)}`
  }

  function getVisibleGroupTotal(group: FolderSection) {
    return filteredFolderSections.reduce((total, section) => {
      if (
        group.key === ROOT_GROUP ||
        section.key === group.key ||
        section.key.startsWith(`${group.key}/`)
      ) {
        return total + section.entries.length
      }

      return total
    }, 0)
  }

  function displayStatusLabel(status: EntryStatus) {
    if (status === 'rightOnly') {
      return 'Added'
    }

    if (status === 'leftOnly') {
      return 'Deleted'
    }

    return statusLabel[status]
  }

  async function clearStatusFilters() {
    const filtersToClear = [...activeStatusFilters]

    for (const status of filtersToClear) {
      await toggleStatusFilter(status)
    }
  }

  onMount(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        filterInput?.focus()
        filterInput?.select()
      }
    }

    window.addEventListener('keydown', handleKeydown)

    return () => {
      window.removeEventListener('keydown', handleKeydown)
    }
  })
</script>

<aside class:refreshing={loading} class="file-browser">
  <header class="browser-header">
    <div class="browser-tools">
      <label class="browser-filter-field">
        <span class="sr-only">Filter files</span>
        <input
          bind:this={filterInput}
          bind:value={fileFilter}
          autocomplete="off"
          placeholder="Filter files"
          spellcheck="false"
          type="text"
        />
        <span aria-hidden="true" class="browser-filter-shortcut">Ctrl+K</span>
      </label>

      <label class="browser-toggle">
        <input bind:checked={hideCollapsedFoldersWithoutMatches} type="checkbox" />
        <span>Hide empty folders</span>
      </label>
    </div>

    <section class="changes-summary" aria-label="Changed files">
      <div class="changes-heading">
        <span>CHANGES</span>
        <strong>{changeSummary}</strong>
      </div>

      {#if directoryStatusSummary.length > 0}
        <div class="status-summary">
          <button
            aria-pressed={activeStatusFilters.length === 0}
            class:active-filter={activeStatusFilters.length === 0}
            class="status-chip filter-chip all"
            type="button"
            on:click={clearStatusFilters}
          >
            <span aria-hidden="true" class="status-dot all"></span>
            <span>All {directoryEntries.length}</span>
          </button>
          {#each directoryStatusSummary as item}
            <button
              aria-pressed={isStatusFilterActive(item.status)}
              class:active-filter={isStatusFilterActive(item.status)}
              class={`status-chip filter-chip ${item.status}`}
              type="button"
              on:click={() => toggleStatusFilter(item.status)}
            >
              <span aria-hidden="true" class={`status-dot ${item.status}`}></span>
              <span>{displayStatusLabel(item.status)} {item.count}</span>
            </button>
          {/each}
        </div>
      {/if}
    </section>
  </header>

  {#if filteredFolderSections.length === 0 || !hasVisibleEntries}
    <div class="empty-state">
      {(activeStatusFilters.length > 0 || normalizedFileFilter)
        ? 'No files match the selected filters.'
        : 'No differing files found.'}
    </div>
  {:else}
    <div class="browser-list">
      {#each filteredFolderSections as group}
        <section class="file-group">
          <button
            aria-label={`${group.label}, ${getGroupCountTitle(group)}`}
            aria-expanded={!collapsedGroups[group.key]}
            class="group-toggle tree-row"
            style={`--tree-depth: ${group.depth}`}
            title={getGroupCountTitle(group)}
            type="button"
            on:click={() => toggleGroup(group.key)}
          >
            <span class="tree-row-lead">
              <svg aria-hidden="true" class:collapsed={collapsedGroups[group.key]} class="chevron-icon" viewBox="0 0 16 16">
                <path d="m5.25 3.75 4.5 4.25-4.5 4.25" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" />
              </svg>
            </span>
            <span class="tree-row-icon">
              <EntryIcon kind="directory" open={!collapsedGroups[group.key]} />
            </span>
            <span class="tree-row-name group-label">{group.label}</span>
            <span class="tree-row-meta group-count">{formatGroupCount(group)}</span>
          </button>

          {#if !collapsedGroups[group.key] && group.entries.length > 0}
            <div class="file-list">
              {#each group.entries as entry}
                <button
                  class:selected={selectedRelativePath === entry.relativePath}
                  class="file-row tree-row"
                  style={`--tree-depth: ${group.depth + 1}`}
                  type="button"
                  on:click={() => selectEntry(entry)}
                >
                  <span class="tree-row-lead">
                    <span class={`file-status-marker ${entry.status}`}></span>
                  </span>
                  <span class="tree-row-icon">
                    <EntryIcon kind="file" />
                  </span>
                  <span class="tree-row-name entry-text">{getFileName(entry.relativePath)}</span>
                  <span aria-hidden="true" class="tree-row-meta"></span>
                </button>
              {/each}
            </div>
          {/if}
        </section>
      {/each}
      <div aria-hidden="true" class="browser-list-filler"></div>
    </div>
  {/if}
</aside>
