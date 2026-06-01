<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte'
  import PierreDiffViewer from './PierreDiffViewer.svelte'
  import UnsupportedCompareView from './UnsupportedCompareView.svelte'
  import type { AppearanceSettings } from '../theme'
  import type {
    CompareViewerSettings,
    DirectoryEntryResult,
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
  export let revision = 0
  export let loadEntryDiff: (entry: DirectoryEntryResult) => Promise<FileDiffResult>

  let scrollHost: HTMLElement | null = null
  let observer: IntersectionObserver | null = null
  let entriesSignature = ''
  let collapsedPaths = new Set<string>()
  let entryStates = new Map<string, EntryDiffState>()
  const sectionHosts = new Map<string, HTMLElement>()

  function entryKey(entry: DirectoryEntryResult) {
    return entry.relativePath
  }

  function syncEntryCollections() {
    const nextPaths = new Set(directoryEntries.map((entry) => entryKey(entry)))
    const nextCollapsedPaths = new Set<string>()
    const nextStates = new Map<string, EntryDiffState>()

    for (const entry of directoryEntries) {
      const key = entryKey(entry)

      const state = entryStates.get(key)
      if (state) {
        nextStates.set(key, state)
      }
    }

    for (const key of collapsedPaths) {
      if (nextPaths.has(key)) {
        nextCollapsedPaths.add(key)
      }
    }

    collapsedPaths = nextCollapsedPaths
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

  function isCollapsed(path: string) {
    return collapsedPaths.has(path)
  }

  function setCollapsed(path: string, collapsed: boolean) {
    const nextCollapsedPaths = new Set(collapsedPaths)
    if (collapsed) {
      nextCollapsedPaths.add(path)
    } else {
      nextCollapsedPaths.delete(path)
    }
    collapsedPaths = nextCollapsedPaths
  }

  function isNearViewport(node: HTMLElement) {
    const root = scrollHost
    const nodeRect = node.getBoundingClientRect()
    const rootRect = root?.getBoundingClientRect()
    const top = rootRect?.top ?? 0
    const bottom = rootRect?.bottom ?? window.innerHeight
    const preloadMargin = 720

    return nodeRect.bottom >= top - preloadMargin && nodeRect.top <= bottom + preloadMargin
  }

  function ensureLoadedIfNearViewport(relativePath: string) {
    const node = sectionHosts.get(relativePath)
    const entry = directoryEntries.find((candidate) => candidate.relativePath === relativePath)

    if (node && entry && !isCollapsed(relativePath) && isNearViewport(node)) {
      void ensureLoaded(entry)
    }
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
      if (directoryEntry && !isCollapsed(directoryEntry.relativePath)) {
        void ensureLoaded(directoryEntry)
      }
    }
  }

  function scheduleViewportCheck(relativePath: string) {
    window.requestAnimationFrame(() => {
      ensureLoadedIfNearViewport(relativePath)
    })
  }

  function observeSection(node: HTMLElement, relativePath: string) {
    node.dataset.relativePath = relativePath
    sectionHosts.set(relativePath, node)
    observer?.observe(node)
    scheduleViewportCheck(relativePath)

    return {
      update(nextRelativePath: string) {
        observer?.unobserve(node)
        sectionHosts.delete(relativePath)
        relativePath = nextRelativePath
        node.dataset.relativePath = relativePath
        sectionHosts.set(relativePath, node)
        observer?.observe(node)
        scheduleViewportCheck(relativePath)
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

    setCollapsed(path, false)
    await tick()

    const node = sectionHosts.get(path)
    node?.scrollIntoView({ block: 'start' })
    void ensureLoaded(entry)
  }

  function toggleEntry(entry: DirectoryEntryResult) {
    const nextCollapsed = !isCollapsed(entry.relativePath)
    setCollapsed(entry.relativePath, nextCollapsed)

    if (!nextCollapsed) {
      void ensureLoaded(entry)
    }
  }

  function renderDiffHeaderPrefix(entry: DirectoryEntryResult) {
    const button = document.createElement('button')
    const icon = document.createElement('span')
    const collapsed = isCollapsed(entry.relativePath)

    button.type = 'button'
    button.className = 'diffly-diff-header-toggle'
    button.setAttribute('aria-label', collapsed ? 'Expand file diff' : 'Collapse file diff')
    button.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
    button.title = collapsed ? 'Expand file diff' : 'Collapse file diff'
    icon.className = 'diffly-diff-header-toggle-icon'
    icon.textContent = '>'
    button.dataset.collapsed = collapsed ? 'true' : 'false'
    button.appendChild(icon)
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      toggleEntry(entry)
    })

    return button
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

    for (const entry of directoryEntries) {
      ensureLoadedIfNearViewport(entry.relativePath)
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
      {@const collapsed = isCollapsed(entry.relativePath)}
      <article
        class:collapsed
        class:selected={selectedRelativePath === entry.relativePath}
        class="directory-diff-section"
        use:observeSection={entry.relativePath}
      >
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
              {collapsed}
              renderHeaderPrefix={() => renderDiffHeaderPrefix(entry)}
            />
          {:else if state?.diff}
            <UnsupportedCompareView
              unsupported={state.diff.unsupported ?? null}
              summary={state.diff.summary}
            />
          {:else}
            <div class="directory-diff-loading">
              <span class="refresh-spinner visible"></span>
              <span>Loading diff...</span>
            </div>
          {/if}
        </div>
      </article>
    {/each}
  {/if}
</section>
