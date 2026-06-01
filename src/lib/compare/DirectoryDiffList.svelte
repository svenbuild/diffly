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
  export let loadEntryDiff: (
    entry: DirectoryEntryResult,
    revision: number,
    options?: { force?: boolean },
  ) => Promise<FileDiffResult>

  const DIRECTORY_DIFF_LOAD_CONCURRENCY = 2
  const DIRECTORY_DIFF_LOAD_ATTEMPTS = 3
  const DIRECTORY_DIFF_LOAD_TIMEOUT_MS = 30000
  const statusLabel: Record<DirectoryEntryResult['status'], string> = {
    modified: 'Modified',
    leftOnly: 'Left only',
    rightOnly: 'Right only',
    unsupported: 'Unsupported',
  }

  let scrollHost: HTMLElement | null = null
  let embeddedViewerSettings: CompareViewerSettings = viewerSettings
  let entriesSignature = ''
  let loadGeneration = 0
  let activeQueueRevision = -1
  let activeWorkerCount = 0
  let collapsedPaths = new Set<string>()
  let entryStates = new Map<string, EntryDiffState>()
  let queuedPaths = new Set<string>()
  let loadQueue: DirectoryEntryResult[] = []
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
      if (state?.revision === revision) {
        nextStates.set(key, state)
      }

      if (!collapsedPaths.has(key) && !state) {
        nextCollapsedPaths.add(key)
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

  async function loadEntryDiffWithRetry(entry: DirectoryEntryResult, loadRevision: number) {
    let lastError: unknown = null

    for (let attempt = 1; attempt <= DIRECTORY_DIFF_LOAD_ATTEMPTS; attempt += 1) {
      try {
        return await withLoadTimeout(
          loadEntryDiff(entry, loadRevision, { force: attempt > 1 }),
          DIRECTORY_DIFF_LOAD_TIMEOUT_MS,
        )
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

    return {
      update(nextEntry: DirectoryEntryResult) {
        sectionHosts.delete(activeEntry.relativePath)
        activeEntry = nextEntry
        node.dataset.relativePath = activeEntry.relativePath
        sectionHosts.set(activeEntry.relativePath, node)
      },
      destroy() {
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

    setOnlyExpanded(path)
    await tick()

    const node = sectionHosts.get(path)
    node?.scrollIntoView({ block: 'start' })
    void ensureLoaded(entry)
  }

  function toggleEntry(entry: DirectoryEntryResult) {
    const nextCollapsed = !isCollapsed(entry.relativePath)
    if (nextCollapsed) {
      setCollapsed(entry.relativePath, true)
    } else {
      setOnlyExpanded(entry.relativePath)
    }

    if (!nextCollapsed) {
      void ensureLoaded(entry)
    }
  }

  function setOnlyExpanded(path: string) {
    const nextCollapsedPaths = new Set<string>()
    for (const entry of directoryEntries) {
      if (entry.relativePath !== path) {
        nextCollapsedPaths.add(entry.relativePath)
      }
    }
    collapsedPaths = nextCollapsedPaths
  }

  function withLoadTimeout<T>(promise: Promise<T>, timeoutMs: number) {
    let timeoutId: number | null = null
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error('Timed out while loading this file diff.'))
      }, timeoutMs)
    })

    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    })
  }

  $: embeddedViewerSettings = { ...viewerSettings, disableFileHeader: true }

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
        <button
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand file diff' : 'Collapse file diff'}
          class="directory-diff-header"
          title={collapsed ? 'Expand file diff' : 'Collapse file diff'}
          type="button"
          onclick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            toggleEntry(entry)
          }}
        >
          <span class="directory-diff-toggle">
            <svg aria-hidden="true" class:collapsed viewBox="0 0 16 16">
              <path
                d="M5.75 3.5 10.25 8l-4.5 4.5"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.8"
              />
            </svg>
          </span>
          <span aria-hidden="true" class="directory-diff-file-marker"></span>
          <span class="directory-diff-title">{entry.relativePath}</span>
          <span class:danger={entry.status === 'leftOnly'} class:success={entry.status !== 'leftOnly'} class="directory-diff-status">
            {statusLabel[entry.status]}
          </span>
        </button>

        {#if !collapsed}
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
                viewerSettings={embeddedViewerSettings}
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
                <span class="refresh-spinner visible"></span>
                <span>Loading diff...</span>
              </div>
            {/if}
          </div>
        {/if}
      </article>
    {/each}
  {/if}
</section>
