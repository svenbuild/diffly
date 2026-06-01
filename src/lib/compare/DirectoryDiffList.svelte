<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte'
  import PierreDiffViewer from './PierreDiffViewer.svelte'
  import UnsupportedCompareView from './UnsupportedCompareView.svelte'
  import type { AppearanceSettings } from '../theme'
  import type {
    CompareViewerSettings,
    DirectoryEntryResult,
    EntryStatus,
    FileDiffResult,
    ViewMode,
  } from '../types'

  interface EntryDiffState {
    diff: FileDiffResult | null
    error: string
    loading: boolean
    revision: number
  }

  export let directoryEntries: DirectoryEntryResult[] = []
  export let selectedRelativePath = ''
  export let loading = false
  export let viewerSettings: CompareViewerSettings
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark'
  export let viewMode: ViewMode
  export let statusLabel: Record<EntryStatus, string>
  export let revision = 0
  export let loadEntryDiff: (entry: DirectoryEntryResult) => Promise<FileDiffResult>
  export let selectEntry: (entry: DirectoryEntryResult) => Promise<void>

  let scrollHost: HTMLElement | null = null
  let observer: IntersectionObserver | null = null
  let entriesSignature = ''
  let expandedPaths = new Set<string>()
  let entryStates = new Map<string, EntryDiffState>()
  const sectionHosts = new Map<string, HTMLElement>()

  function entryKey(entry: DirectoryEntryResult) {
    return entry.relativePath
  }

  function fileName(path: string) {
    return path.split(/[\\/]/).pop() || path
  }

  function folderName(path: string) {
    const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
    return index > 0 ? path.slice(0, index) : ''
  }

  function syncEntryCollections() {
    const nextPaths = new Set(directoryEntries.map((entry) => entryKey(entry)))
    const nextExpandedPaths = new Set<string>()
    const nextStates = new Map<string, EntryDiffState>()

    for (const entry of directoryEntries) {
      const key = entryKey(entry)
      nextExpandedPaths.add(key)

      const state = entryStates.get(key)
      if (state) {
        nextStates.set(key, state)
      }
    }

    for (const key of expandedPaths) {
      if (nextPaths.has(key)) {
        nextExpandedPaths.add(key)
      }
    }

    expandedPaths = nextExpandedPaths
    entryStates = nextStates
  }

  function setEntryState(path: string, state: EntryDiffState) {
    const nextStates = new Map(entryStates)
    nextStates.set(path, state)
    entryStates = nextStates
  }

  function getEntryState(path: string) {
    return entryStates.get(path) ?? null
  }

  function isExpanded(path: string) {
    return expandedPaths.has(path)
  }

  function setExpanded(path: string, expanded: boolean) {
    const nextExpandedPaths = new Set(expandedPaths)
    if (expanded) {
      nextExpandedPaths.add(path)
    } else {
      nextExpandedPaths.delete(path)
    }
    expandedPaths = nextExpandedPaths
  }

  async function ensureLoaded(entry: DirectoryEntryResult) {
    const path = entryKey(entry)
    const state = getEntryState(path)

    if (state?.loading || (state?.diff && state.revision === revision)) {
      return
    }

    const loadRevision = revision
    setEntryState(path, {
      diff: state?.revision === loadRevision ? state.diff : null,
      error: '',
      loading: true,
      revision: loadRevision,
    })

    try {
      const diff = await loadEntryDiff(entry)
      if (revision !== loadRevision) {
        return
      }

      setEntryState(path, {
        diff,
        error: '',
        loading: false,
        revision: loadRevision,
      })
    } catch (error) {
      if (revision !== loadRevision) {
        return
      }

      setEntryState(path, {
        diff: null,
        error: error instanceof Error ? error.message : 'Unable to open this file diff.',
        loading: false,
        revision: loadRevision,
      })
    }
  }

  function loadVisibleSections(entries: IntersectionObserverEntry[]) {
    for (const entry of entries) {
      if (!entry.isIntersecting) {
        continue
      }

      const relativePath = (entry.target as HTMLElement).dataset.relativePath
      const directoryEntry = directoryEntries.find((candidate) => candidate.relativePath === relativePath)
      if (directoryEntry && isExpanded(directoryEntry.relativePath)) {
        void ensureLoaded(directoryEntry)
      }
    }
  }

  function observeSection(node: HTMLElement, relativePath: string) {
    node.dataset.relativePath = relativePath
    sectionHosts.set(relativePath, node)
    observer?.observe(node)

    return {
      update(nextRelativePath: string) {
        observer?.unobserve(node)
        sectionHosts.delete(relativePath)
        relativePath = nextRelativePath
        node.dataset.relativePath = relativePath
        sectionHosts.set(relativePath, node)
        observer?.observe(node)
      },
      destroy() {
        observer?.unobserve(node)
        sectionHosts.delete(relativePath)
      },
    }
  }

  async function scrollToEntry(path: string) {
    if (!path) {
      return
    }

    const entry = directoryEntries.find((candidate) => candidate.relativePath === path)
    if (!entry) {
      return
    }

    setExpanded(path, true)
    await tick()

    const node = sectionHosts.get(path)
    node?.scrollIntoView({ block: 'start' })
    void ensureLoaded(entry)
  }

  async function handleHeaderClick(entry: DirectoryEntryResult) {
    setExpanded(entry.relativePath, true)
    await selectEntry(entry)
    await scrollToEntry(entry.relativePath)
  }

  function toggleEntry(event: MouseEvent, entry: DirectoryEntryResult) {
    event.stopPropagation()
    const nextExpanded = !isExpanded(entry.relativePath)
    setExpanded(entry.relativePath, nextExpanded)

    if (nextExpanded) {
      void ensureLoaded(entry)
    }
  }

  $: {
    const nextSignature = `${revision}:${directoryEntries.map((entry) => entry.relativePath).join('\u0000')}`
    if (nextSignature !== entriesSignature) {
      entriesSignature = nextSignature
      syncEntryCollections()
    }
  }

  $: selectedRelativePath, void scrollToEntry(selectedRelativePath)

  onMount(() => {
    observer = new IntersectionObserver(loadVisibleSections, {
      root: scrollHost,
      rootMargin: '720px 0px',
      threshold: 0,
    })

    for (const node of sectionHosts.values()) {
      observer.observe(node)
    }
  })

  onDestroy(() => {
    observer?.disconnect()
    observer = null
  })
</script>

<section class="directory-diff-list" bind:this={scrollHost}>
  {#if loading && directoryEntries.length === 0}
    <div class="compare-viewer-state">
      <span class="refresh-spinner visible"></span>
      <p>Comparing folders...</p>
    </div>
  {:else if directoryEntries.length === 0}
    <div class="compare-viewer-state">
      <p>No file changes.</p>
    </div>
  {:else}
    {#each directoryEntries as entry (entry.relativePath)}
      {@const state = getEntryState(entry.relativePath)}
      {@const expanded = isExpanded(entry.relativePath)}
      <article
        class:selected={selectedRelativePath === entry.relativePath}
        class="directory-diff-section"
        use:observeSection={entry.relativePath}
      >
        <div class="directory-diff-header">
          <button
            aria-label={expanded ? 'Collapse file diff' : 'Expand file diff'}
            aria-expanded={expanded}
            class="directory-diff-collapse-button"
            type="button"
            on:click={(event) => toggleEntry(event, entry)}
          >
            <span class:expanded class="directory-diff-disclosure" aria-hidden="true">
              <svg viewBox="0 0 16 16">
                <path d="M5.7 3.8 10.3 8l-4.6 4.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" />
              </svg>
            </span>
          </button>

          <button
            class="directory-diff-title-button"
            type="button"
            on:click={() => handleHeaderClick(entry)}
          >
            <span class="directory-diff-title">
              <strong>{fileName(entry.relativePath)}</strong>
              {#if folderName(entry.relativePath)}
                <span>{folderName(entry.relativePath)}</span>
              {/if}
            </span>
            <span class={`directory-diff-status status-${entry.status}`}>
              {statusLabel[entry.status]}
            </span>
          </button>
        </div>

        {#if expanded}
          <div class="directory-diff-body">
            {#if state?.loading}
              <div class="directory-diff-loading">
                <span class="refresh-spinner visible"></span>
                <span>Loading diff...</span>
              </div>
            {:else if state?.error}
              <div class="directory-diff-error">{state.error}</div>
            {:else if state?.diff?.contentKind === 'text' && state.diff.text}
              <PierreDiffViewer
                text={state.diff.text}
                leftLabel={state.diff.leftLabel}
                rightLabel={state.diff.rightLabel}
                {viewerSettings}
                {appearanceSettings}
                {resolvedThemeMode}
                {viewMode}
              />
            {:else if state?.diff}
              <UnsupportedCompareView
                unsupported={state.diff.unsupported ?? null}
                summary={state.diff.summary}
              />
            {:else}
              <div class="directory-diff-loading">
                <span>Waiting for viewport...</span>
              </div>
            {/if}
          </div>
        {/if}
      </article>
    {/each}
  {/if}
</section>
