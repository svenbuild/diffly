<script lang="ts">
  import { tick } from 'svelte'
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
    generation: number
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
  export let loadEntryDiff: (entry: DirectoryEntryResult, revision: number) => Promise<FileDiffResult>

  const DIRECTORY_DIFF_LOAD_CONCURRENCY = 2
  const DIRECTORY_DIFF_LOAD_ATTEMPTS = 2
  const DIRECTORY_DIFF_LOAD_TIMEOUT_MS = 30000
  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

  let scrollHost: HTMLElement | null = null
  let entriesSignature = ''
  let loadGeneration = 0
  let activeQueueRevision = -1
  let activeWorkerCount = 0
  let collapsedPaths = new Set<string>()
  let entryStates = new Map<string, EntryDiffState>()
  let queuedPaths = new Set<string>()
  let loadQueue: DirectoryEntryResult[] = []
  const sectionHosts = new Map<string, HTMLElement>()
  const headerPrefixRenderers = new Map<string, () => HTMLElement | null>()

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
      if (state?.revision === revision) {
        nextStates.set(key, state)
      }
    }

    for (const key of collapsedPaths) {
      if (nextPaths.has(key)) {
        nextCollapsedPaths.add(key)
      }
    }

    for (const key of headerPrefixRenderers.keys()) {
      if (!nextPaths.has(key)) {
        headerPrefixRenderers.delete(key)
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

  async function loadEntryDiffWithRetry(entry: DirectoryEntryResult, loadRevision: number) {
    let lastError: unknown = null

    for (let attempt = 1; attempt <= DIRECTORY_DIFF_LOAD_ATTEMPTS; attempt += 1) {
      try {
        return await Promise.race([
          loadEntryDiff(entry, loadRevision),
          new Promise<FileDiffResult>((_, reject) => {
            window.setTimeout(() => reject(new Error('Timed out while loading this file diff.')), DIRECTORY_DIFF_LOAD_TIMEOUT_MS)
          }),
        ])
      } catch (error) {
        lastError = error
      }
    }

    throw lastError
  }

  async function ensureLoaded(entry: DirectoryEntryResult, generation = loadGeneration) {
    const path = entryKey(entry)
    const state = getEntryState(path)

    if (state?.diff && state.revision === revision) {
      return
    }

    if (state?.loading && state.revision === revision && state.generation === generation) {
      return
    }

    const loadRevision = revision
    setEntryState(path, {
      diff: state?.revision === loadRevision ? state.diff : null,
      error: '',
      generation,
      loading: true,
      revision: loadRevision,
    })

    try {
      const diff = await loadEntryDiffWithRetry(entry, loadRevision)
      if (revision !== loadRevision || generation !== loadGeneration) {
        return
      }

      setEntryState(path, {
        diff,
        error: '',
        generation,
        loading: false,
        revision: loadRevision,
      })
    } catch (error) {
      if (revision !== loadRevision || generation !== loadGeneration) {
        return
      }

      setEntryState(path, {
        diff: null,
        error: error instanceof Error ? error.message : 'Unable to open this file diff.',
        generation,
        loading: false,
        revision: loadRevision,
      })
    }
  }

  function resetQueueForRevision() {
    activeQueueRevision = revision
    loadGeneration += 1
    activeWorkerCount = 0
    loadQueue = []
    queuedPaths = new Set()
  }

  function queueMissingDiffLoads() {
    if (activeQueueRevision !== revision) {
      resetQueueForRevision()
    }

    const generation = loadGeneration
    let changed = false

    for (const entry of directoryEntries) {
      const path = entryKey(entry)
      const state = getEntryState(path)

      if (state?.diff || state?.loading || queuedPaths.has(path)) {
        continue
      }

      loadQueue = [...loadQueue, entry]
      queuedPaths = new Set(queuedPaths).add(path)
      changed = true
    }

    if (changed || loadQueue.length > 0) {
      pumpLoadQueue(generation)
    }
  }

  async function runLoadWorker(generation: number) {
    activeWorkerCount += 1

    try {
      while (generation === loadGeneration) {
        const [entry, ...rest] = loadQueue
        loadQueue = rest

        if (!entry) {
          return
        }

        const path = entryKey(entry)
        const nextQueuedPaths = new Set(queuedPaths)
        nextQueuedPaths.delete(path)
        queuedPaths = nextQueuedPaths

        await ensureLoaded(entry, generation)
      }
    } finally {
      if (generation !== loadGeneration) {
        return
      }

      activeWorkerCount -= 1
      if (loadQueue.length > 0) {
        pumpLoadQueue(generation)
      }
    }
  }

  function pumpLoadQueue(generation = loadGeneration) {
    while (
      generation === loadGeneration &&
      activeWorkerCount < DIRECTORY_DIFF_LOAD_CONCURRENCY &&
      loadQueue.length > 0
    ) {
      void runLoadWorker(generation)
    }
  }

  function trackSection(node: HTMLElement, entry: DirectoryEntryResult) {
    let activeEntry = entry

    node.dataset.relativePath = activeEntry.relativePath
    sectionHosts.set(activeEntry.relativePath, node)

    const onClick = (event: MouseEvent) => {
      handleSectionClick(event, activeEntry)
    }
    node.addEventListener('click', onClick)

    return {
      update(nextEntry: DirectoryEntryResult) {
        sectionHosts.delete(activeEntry.relativePath)
        activeEntry = nextEntry
        node.dataset.relativePath = activeEntry.relativePath
        sectionHosts.set(activeEntry.relativePath, node)
      },
      destroy() {
        node.removeEventListener('click', onClick)
        sectionHosts.delete(activeEntry.relativePath)
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

    void ensureLoaded(entry)
  }

  function clickedToggle(event: MouseEvent) {
    return event.composedPath().some((target) => {
      return target instanceof HTMLElement && target.classList.contains('diffly-diff-header-toggle')
    })
  }

  function handleSectionClick(event: MouseEvent, entry: DirectoryEntryResult) {
    if (!clickedToggle(event)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    toggleEntry(entry)
  }

  function createChevronIcon() {
    const svg = document.createElementNS(SVG_NAMESPACE, 'svg')
    const path = document.createElementNS(SVG_NAMESPACE, 'path')

    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('viewBox', '0 0 16 16')
    svg.setAttribute('focusable', 'false')
    svg.classList.add('diffly-diff-header-toggle-icon')
    path.setAttribute('d', 'M5.75 3.5 10.25 8l-4.5 4.5')
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', 'currentColor')
    path.setAttribute('stroke-linecap', 'round')
    path.setAttribute('stroke-linejoin', 'round')
    path.setAttribute('stroke-width', '1.8')
    svg.appendChild(path)

    return svg
  }

  function renderDiffHeaderPrefix(entry: DirectoryEntryResult) {
    const button = document.createElement('button')
    const collapsed = isCollapsed(entry.relativePath)

    button.type = 'button'
    button.className = 'diffly-diff-header-toggle'
    button.setAttribute('aria-label', collapsed ? 'Expand file diff' : 'Collapse file diff')
    button.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
    button.title = collapsed ? 'Expand file diff' : 'Collapse file diff'
    button.dataset.collapsed = collapsed ? 'true' : 'false'
    button.appendChild(createChevronIcon())
    button.addEventListener('pointerdown', (event) => {
      event.stopPropagation()
    })
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      toggleEntry(entry)
    })

    return button
  }

  function getHeaderPrefixRenderer(entry: DirectoryEntryResult) {
    const path = entryKey(entry)
    let renderer = headerPrefixRenderers.get(path)

    if (!renderer) {
      renderer = () => renderDiffHeaderPrefix(entry)
      headerPrefixRenderers.set(path, renderer)
    }

    return renderer
  }

  $: {
    const nextSignature = `${revision}:${directoryEntries.map((entry) => entry.relativePath).join('\u0000')}`
    if (nextSignature !== entriesSignature) {
      entriesSignature = nextSignature
      syncEntryCollections()
      queueMissingDiffLoads()
    }
  }

  $: selectedRelativePath, void scrollToEntry(selectedRelativePath)
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
        use:trackSection={entry}
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
              renderHeaderPrefix={getHeaderPrefixRenderer(entry)}
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
