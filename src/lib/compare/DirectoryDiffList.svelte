<script lang="ts">
  import PierreDirectoryCodeView from './PierreDirectoryCodeView.svelte'
  import { openCompareItem } from '../api'
  import type { AppearanceSettings } from '../theme'
  import type {
    CompareOptions,
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

  interface LoadedDirectoryDiff {
    entry: DirectoryEntryResult
    diff: FileDiffResult | null
    error: string
    loading: boolean
  }

  export let directoryEntries: DirectoryEntryResult[] = []
  export let selectedRelativePath = ''
  export let loading = false
  export let viewerSettings: CompareViewerSettings
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark'
  export let viewMode: ViewMode
  export let revision = 0
  export let leftPath = ''
  export let rightPath = ''
  export let compareOptions: CompareOptions = {
    ignoreWhitespace: false,
    ignoreCase: false,
  }
  export let resolveEntryBases: (relativePath: string) => {
    leftBase: string
    rightBase: string
    relativePath: string
  } = (relativePath) => ({
    leftBase: leftPath,
    rightBase: rightPath,
    relativePath,
  })

  const DIRECTORY_DIFF_LOAD_ATTEMPTS = 3
  const DIRECTORY_DIFF_LOAD_TIMEOUT_MS = 30000
  const DIRECTORY_DIFF_LOAD_CONCURRENCY = 2
  const DIRECTORY_DIFF_INITIAL_LOAD_COUNT = 12
  const DIRECTORY_DIFF_VISIBLE_LOAD_RADIUS = 8

  let entriesSignature = ''
  let loadGeneration = 0
  let collapsedPaths = new Set<string>()
  let entryStates = new Map<string, EntryDiffState>()
  let entryByPath = new Map<string, DirectoryEntryResult>()
  let loadQueue: string[] = []
  let loadQueueKeys = new Set<string>()
  let activeLoadCount = 0
  let scrollTargetRevision = 0
  let textEntries: LoadedDirectoryDiff[] = []
  let pendingEntryCount = 0

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
      if (
        state?.revision === revision &&
        (!state.loading || state.generation === loadGeneration)
      ) {
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
    loadQueue = loadQueue.filter((path) => nextPaths.has(path))
    loadQueueKeys = new Set(loadQueue)
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

  async function loadEntryDiffWithRetry(entry: DirectoryEntryResult) {
    let lastError: unknown = null

    for (let attempt = 0; attempt < DIRECTORY_DIFF_LOAD_ATTEMPTS; attempt += 1) {
      try {
        const bases = resolveEntryBases(entry.relativePath)
        return await withLoadTimeout(
          openCompareItem(
            bases.leftBase,
            bases.rightBase,
            bases.relativePath,
            compareOptions,
          ),
          DIRECTORY_DIFF_LOAD_TIMEOUT_MS,
        )
      } catch (error) {
        lastError = error
      }
    }

    throw lastError
  }

  async function ensureLoaded(
    entry: DirectoryEntryResult,
    generation = loadGeneration,
    loadRevision = revision,
  ) {
    const path = entryKey(entry)
    const state = getEntryState(path)

    if (state?.diff && state.revision === loadRevision) {
      return
    }

    if (state?.error && state.revision === loadRevision) {
      return
    }

    if (state?.loading && state.revision === loadRevision && state.generation === generation) {
      return
    }

    setEntryState(path, {
      diff: state?.revision === loadRevision ? state.diff : null,
      error: '',
      generation,
      loading: true,
      revision: loadRevision,
    })

    try {
      const diff = await loadEntryDiffWithRetry(entry)
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

  function scheduleEntryLoad(entry: DirectoryEntryResult | null | undefined, priority = false) {
    if (!entry || entry.status === 'unsupported') {
      return
    }

    const path = entryKey(entry)
    const state = getEntryState(path)

    if (state?.revision === revision && (state.diff || state.error || state.loading)) {
      return
    }

    const nextQueue = loadQueue.filter((queuedPath) => queuedPath !== path)
    if (priority) {
      nextQueue.unshift(path)
    } else if (!loadQueueKeys.has(path)) {
      nextQueue.push(path)
    } else {
      return
    }

    loadQueue = nextQueue
    loadQueueKeys = new Set(nextQueue)
    pumpLoadQueue()
  }

  function takeNextQueuedEntry() {
    while (loadQueue.length > 0) {
      const [nextPath, ...remainingQueue] = loadQueue
      loadQueue = remainingQueue
      loadQueueKeys = new Set(remainingQueue)

      const entry = entryByPath.get(nextPath)
      if (entry && entry.status !== 'unsupported') {
        return entry
      }
    }

    return null
  }

  function pumpLoadQueue() {
    while (activeLoadCount < DIRECTORY_DIFF_LOAD_CONCURRENCY) {
      const entry = takeNextQueuedEntry()
      if (!entry) {
        return
      }

      const generation = loadGeneration
      const loadRevision = revision
      activeLoadCount += 1

      void ensureLoaded(entry, generation, loadRevision).finally(() => {
        if (generation === loadGeneration) {
          activeLoadCount = Math.max(0, activeLoadCount - 1)
          pumpLoadQueue()
        }
      })
    }
  }

  function scheduleEntryWindow(path: string, priority = false) {
    if (!path) {
      return
    }

    const centerIndex = directoryEntries.findIndex((entry) => entry.relativePath === path)
    if (centerIndex < 0) {
      return
    }

    const startIndex = Math.max(0, centerIndex - DIRECTORY_DIFF_VISIBLE_LOAD_RADIUS)
    const endIndex = Math.min(
      directoryEntries.length - 1,
      centerIndex + DIRECTORY_DIFF_VISIBLE_LOAD_RADIUS,
    )

    for (let index = startIndex; index <= endIndex; index += 1) {
      scheduleEntryLoad(directoryEntries[index], priority && index === centerIndex)
    }
  }

  function scheduleInitialLoads() {
    let scheduledCount = 0

    for (const entry of directoryEntries) {
      if (scheduledCount >= DIRECTORY_DIFF_INITIAL_LOAD_COUNT) {
        return
      }

      if (entry.status !== 'unsupported') {
        scheduleEntryLoad(entry)
        scheduledCount += 1
      }
    }
  }

  function scheduleActiveLoads() {
    const selectedEntry = selectedRelativePath
      ? entryByPath.get(selectedRelativePath)
      : directoryEntries.find((entry) => entry.status !== 'unsupported')

    scheduleInitialLoads()
    if (selectedEntry) {
      scheduleEntryWindow(selectedEntry.relativePath, true)
    }
  }

  function requestVisibleEntries(paths: string[]) {
    const seenPaths = new Set<string>()

    for (const path of paths) {
      if (seenPaths.has(path)) {
        continue
      }

      seenPaths.add(path)
      scheduleEntryWindow(path)
      scheduleEntryLoad(entryByPath.get(path), true)
    }
  }

  function scrollToEntry(path: string) {
    if (!path) {
      return
    }

    const entry = entryByPath.get(path)
    if (!entry) {
      return
    }

    scrollTargetRevision += 1
    if (!isCollapsed(entry.relativePath)) {
      scheduleEntryWindow(entry.relativePath, true)
    }
  }

  function toggleEntry(entry: DirectoryEntryResult) {
    const nextCollapsed = !isCollapsed(entry.relativePath)
    setCollapsed(entry.relativePath, nextCollapsed)
    if (!nextCollapsed) {
      scheduleEntryLoad(entry, true)
    }
  }

  function toggleEntryByPath(path: string) {
    const entry = entryByPath.get(path)
    if (!entry) {
      return
    }

    toggleEntry(entry)
  }

  function rebuildVisibleEntries() {
    const nextTextEntries: LoadedDirectoryDiff[] = []
    let nextPendingEntryCount = 0

    for (const entry of directoryEntries) {
      const state = getEntryState(entry.relativePath)

      if (entry.status === 'unsupported') {
        nextTextEntries.push({
          entry,
          diff: null,
          error: 'No text diff is available for this file.',
          loading: false,
        })
        continue
      }

      if (state?.loading) {
        nextPendingEntryCount += 1
      }

      if (state?.diff?.contentKind === 'text' && state.diff.text) {
        nextTextEntries.push({
          entry,
          diff: state.diff,
          error: '',
          loading: state.loading,
        })
      } else if (state?.error || (state?.diff && state.diff.contentKind !== 'text')) {
        nextTextEntries.push({
          entry,
          diff: null,
          error: state.error || 'No text diff is available for this file.',
          loading: false,
        })
      } else {
        nextTextEntries.push({
          entry,
          diff: null,
          error: '',
          loading: state?.loading ?? false,
        })
      }
    }

    textEntries = nextTextEntries
    pendingEntryCount = nextPendingEntryCount
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

  $: {
    directoryEntries
    const nextSignature = String(revision)
    if (nextSignature !== entriesSignature) {
      entriesSignature = nextSignature
      loadGeneration += 1
      loadQueue = []
      loadQueueKeys = new Set()
      activeLoadCount = 0
    }
    syncEntryCollections()
  }

  $: entryByPath = new Map(directoryEntries.map((entry) => [entry.relativePath, entry]))

  $: {
    directoryEntries
    selectedRelativePath
    entryStates
    rebuildVisibleEntries()
  }

  $: directoryEntries, entryByPath, selectedRelativePath, revision, loadGeneration, scheduleActiveLoads()

  $: selectedRelativePath, scrollToEntry(selectedRelativePath)
</script>

<section class="directory-diff-list">
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
    {#if textEntries.length > 0}
      <PierreDirectoryCodeView
        entries={textEntries}
        {collapsedPaths}
        {selectedRelativePath}
        {viewerSettings}
        {appearanceSettings}
        {resolvedThemeMode}
        {viewMode}
        {scrollTargetRevision}
        toggleEntry={toggleEntryByPath}
        {requestVisibleEntries}
      />
    {:else if pendingEntryCount > 0}
      <div class="compare-viewer-state">
        <span class="refresh-spinner visible"></span>
        <p>Loading diffs...</p>
      </div>
    {:else if selectedRelativePath}
      <div class="compare-viewer-state">
        <p>No text diff selected.</p>
      </div>
    {/if}
  {/if}
</section>
