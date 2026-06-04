<script lang="ts">
  import { onDestroy } from 'svelte'
  import PierreDirectoryVirtualDiffView from './PierreDirectoryVirtualDiffView.svelte'
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
    renderKey: string
  }

  export let directoryEntries: DirectoryEntryResult[] = []
  export let selectedRelativePath = ''
  export let loading = false
  export let viewerSettings: CompareViewerSettings
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark'
  export let viewMode: ViewMode
  export let scrollTargetRevision = 0
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
  const DIRECTORY_DIFF_LOAD_CONCURRENCY = 8
  const DIRECTORY_DIFF_BACKGROUND_ENQUEUE_BATCH = 96
  const DIRECTORY_DIFF_BACKGROUND_ENQUEUE_DELAY_MS = 24
  const DIRECTORY_DIFF_INITIAL_LOAD_COUNT = 8
  const DIRECTORY_DIFF_SELECTION_LOAD_RADIUS = 2
  const DIRECTORY_DIFF_VISIBLE_LOAD_PADDING = 1
  const DIRECTORY_DIFF_SCROLL_LOAD_PAUSE_MS = 80

  let entriesSignature = ''
  let loadGeneration = 0
  let collapsedPaths = new Set<string>()
  let entryStates = new Map<string, EntryDiffState>()
  let pendingEntryStateUpdates = new Map<string, EntryDiffState>()
  let entryByPath = new Map<string, DirectoryEntryResult>()
  let entryIndexByPath = new Map<string, number>()
  let loadedEntryCache = new Map<string, LoadedDirectoryDiff>()
  let changedEntryPaths: string[] = []
  let changedEntryRevision = 0
  let entryStructureRevision = 0
  let priorityLoadQueue: string[] = []
  let normalLoadQueue: string[] = []
  let priorityLoadQueueHead = 0
  let normalLoadQueueHead = 0
  let loadQueueKeys = new Set<string>()
  let activeLoadCount = 0
  let loadPausedUntil = 0
  let loadResumeTimer: number | null = null
  let backgroundLoadTimer: number | null = null
  let backgroundLoadCursor = 0
  let entryStateFlushFrame: number | null = null
  let textEntries: LoadedDirectoryDiff[] = []
  let pendingEntryCount = 0

  function entryKey(entry: DirectoryEntryResult) {
    return entry.relativePath
  }

  function entryStateIsCurrent(state: EntryDiffState) {
    return state.revision === revision && (!state.loading || state.generation === loadGeneration)
  }

  function cancelEntryStateFlush() {
    if (entryStateFlushFrame !== null) {
      window.cancelAnimationFrame(entryStateFlushFrame)
      entryStateFlushFrame = null
    }
  }

  function flushEntryStateUpdates() {
    entryStateFlushFrame = null

    if (pendingEntryStateUpdates.size === 0) {
      return
    }

    const previousStates = entryStates
    const nextStates = new Map(entryStates)
    const changedPaths: string[] = []
    for (const [path, state] of pendingEntryStateUpdates) {
      nextStates.set(path, state)
      changedPaths.push(path)
    }

    pendingEntryStateUpdates = new Map()
    entryStates = nextStates
    updateVisibleEntriesForStatePaths(changedPaths, previousStates, nextStates)
  }

  function scheduleEntryStateFlush() {
    if (entryStateFlushFrame !== null) {
      return
    }

    entryStateFlushFrame = window.requestAnimationFrame(flushEntryStateUpdates)
  }

  function syncEntryCollections() {
    const nextPaths = new Set<string>()
    const nextEntryByPath = new Map<string, DirectoryEntryResult>()
    const nextEntryIndexByPath = new Map<string, number>()
    const nextCollapsedPaths = new Set<string>()
    const nextStates = new Map<string, EntryDiffState>()

    for (const [index, entry] of directoryEntries.entries()) {
      const key = entryKey(entry)
      nextPaths.add(key)
      nextEntryByPath.set(key, entry)
      nextEntryIndexByPath.set(key, index)

      const state = entryStates.get(key)
      if (state && entryStateIsCurrent(state)) {
        nextStates.set(key, state)
      }

      const pendingState = pendingEntryStateUpdates.get(key)
      if (pendingState && entryStateIsCurrent(pendingState)) {
        nextStates.set(key, pendingState)
      }
    }

    for (const key of collapsedPaths) {
      if (nextPaths.has(key)) {
        nextCollapsedPaths.add(key)
      }
    }

    collapsedPaths = nextCollapsedPaths
    entryStates = nextStates
    pendingEntryStateUpdates = new Map()
    cancelEntryStateFlush()
    priorityLoadQueue = priorityLoadQueue
      .slice(priorityLoadQueueHead)
      .filter((path) => nextPaths.has(path))
    normalLoadQueue = normalLoadQueue
      .slice(normalLoadQueueHead)
      .filter((path) => nextPaths.has(path))
    priorityLoadQueueHead = 0
    normalLoadQueueHead = 0
    loadQueueKeys = new Set([...priorityLoadQueue, ...normalLoadQueue])
    loadedEntryCache = new Map(
      Array.from(loadedEntryCache).filter(([path]) => nextPaths.has(path)),
    )
    entryByPath = nextEntryByPath
    entryIndexByPath = nextEntryIndexByPath
    changedEntryPaths = []
    entryStructureRevision += 1
    rebuildVisibleEntries(nextStates)
  }

  function publishChangedEntryPaths(paths: string[]) {
    if (paths.length === 0) {
      return
    }

    changedEntryPaths = paths
    changedEntryRevision += 1
  }

  function setEntryState(path: string, state: EntryDiffState) {
    pendingEntryStateUpdates.set(path, state)
    scheduleEntryStateFlush()
  }

  function getEntryState(path: string) {
    return pendingEntryStateUpdates.get(path) ?? entryStates.get(path) ?? null
  }

  function entryNeedsLoad(
    entry: DirectoryEntryResult | null | undefined,
  ): entry is DirectoryEntryResult {
    if (!entry || entry.status === 'unsupported') {
      return false
    }

    const state = getEntryState(entryKey(entry))
    return !(state?.revision === revision && (state.diff || state.error || state.loading))
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
    if (!entryNeedsLoad(entry)) {
      return
    }

    const path = entryKey(entry)
    if (loadQueueKeys.has(path)) {
      return
    }

    if (priority) {
      priorityLoadQueue.push(path)
    } else {
      normalLoadQueue.push(path)
    }

    loadQueueKeys.add(path)
    pumpLoadQueue()
  }

  function cancelBackgroundLoadScheduling() {
    if (backgroundLoadTimer !== null) {
      window.clearTimeout(backgroundLoadTimer)
      backgroundLoadTimer = null
    }
  }

  function scheduleBackgroundLoadPump() {
    if (backgroundLoadTimer !== null) {
      return
    }

    backgroundLoadTimer = window.setTimeout(() => {
      backgroundLoadTimer = null
      enqueueBackgroundLoads()
    }, DIRECTORY_DIFF_BACKGROUND_ENQUEUE_DELAY_MS)
  }

  function enqueueBackgroundLoads() {
    let queuedCount = 0

    while (
      backgroundLoadCursor < directoryEntries.length &&
      queuedCount < DIRECTORY_DIFF_BACKGROUND_ENQUEUE_BATCH
    ) {
      const entry = directoryEntries[backgroundLoadCursor]
      backgroundLoadCursor += 1

      if (!entryNeedsLoad(entry)) {
        continue
      }

      scheduleEntryLoad(entry)
      queuedCount += 1
    }

    if (backgroundLoadCursor < directoryEntries.length) {
      scheduleBackgroundLoadPump()
    }
  }

  function scheduleLoadResume() {
    if (loadResumeTimer !== null) {
      window.clearTimeout(loadResumeTimer)
    }

    const delay = Math.max(16, Math.ceil(loadPausedUntil - performance.now()))
    loadResumeTimer = window.setTimeout(() => {
      loadResumeTimer = null
      pumpLoadQueue()
    }, delay)
  }

  function pauseDirectoryDiffLoads(durationMs = DIRECTORY_DIFF_SCROLL_LOAD_PAUSE_MS) {
    loadPausedUntil = Math.max(loadPausedUntil, performance.now() + durationMs)
    scheduleLoadResume()
  }

  function compactPriorityLoadQueue() {
    if (priorityLoadQueueHead > 64 && priorityLoadQueueHead * 2 > priorityLoadQueue.length) {
      priorityLoadQueue = priorityLoadQueue.slice(priorityLoadQueueHead)
      priorityLoadQueueHead = 0
    }
  }

  function compactNormalLoadQueue() {
    if (normalLoadQueueHead > 64 && normalLoadQueueHead * 2 > normalLoadQueue.length) {
      normalLoadQueue = normalLoadQueue.slice(normalLoadQueueHead)
      normalLoadQueueHead = 0
    }
  }

  function takeQueuedPath() {
    if (priorityLoadQueueHead < priorityLoadQueue.length) {
      const path = priorityLoadQueue[priorityLoadQueueHead]
      priorityLoadQueueHead += 1
      compactPriorityLoadQueue()
      return path
    }

    if (normalLoadQueueHead < normalLoadQueue.length) {
      const path = normalLoadQueue[normalLoadQueueHead]
      normalLoadQueueHead += 1
      compactNormalLoadQueue()
      return path
    }

    return null
  }

  function takeNextQueuedEntry(priorityOnly = false) {
    while (true) {
      if (priorityOnly && priorityLoadQueueHead >= priorityLoadQueue.length) {
        return null
      }

      const nextPath = takeQueuedPath()
      if (!nextPath) {
        return null
      }

      loadQueueKeys.delete(nextPath)

      const entry = entryByPath.get(nextPath)
      if (entry && entry.status !== 'unsupported') {
        return entry
      }
    }
  }

  function pumpLoadQueue() {
    const priorityOnly = performance.now() < loadPausedUntil

    while (activeLoadCount < DIRECTORY_DIFF_LOAD_CONCURRENCY) {
      const entry = takeNextQueuedEntry(priorityOnly)
      if (!entry) {
        if (priorityOnly) {
          scheduleLoadResume()
        }
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

  function collectEntryWindow(
    path: string,
    radius: number,
    target: string[],
    seenPaths: Set<string>,
  ) {
    if (!path) {
      return
    }

    const centerIndex = entryIndexByPath.get(path) ?? -1
    if (centerIndex < 0) {
      return
    }

    const startIndex = Math.max(0, centerIndex - radius)
    const endIndex = Math.min(
      directoryEntries.length - 1,
      centerIndex + radius,
    )

    for (let index = startIndex; index <= endIndex; index += 1) {
      const entry = directoryEntries[index]
      const entryPath = entry.relativePath

      if (seenPaths.has(entryPath) || !entryNeedsLoad(entry)) {
        continue
      }

      seenPaths.add(entryPath)
      target.push(entryPath)
    }
  }

  function scheduleEntryWindow(path: string, radius: number, priority = false) {
    const paths: string[] = []
    collectEntryWindow(path, radius, paths, new Set())

    for (const entryPath of paths) {
      scheduleEntryLoad(entryByPath.get(entryPath), priority && entryPath === path)
    }
  }

  function replacePriorityLoadQueue(paths: string[]) {
    const priorityPaths: string[] = []
    const priorityPathSet = new Set<string>()

    for (const path of paths) {
      collectEntryWindow(
        path,
        DIRECTORY_DIFF_VISIBLE_LOAD_PADDING,
        priorityPaths,
        priorityPathSet,
      )
    }

    const normalQueuedPaths = normalLoadQueue
      .slice(normalLoadQueueHead)
      .filter((path) => !priorityPathSet.has(path))

    priorityLoadQueue = priorityPaths
    normalLoadQueue = normalQueuedPaths
    priorityLoadQueueHead = 0
    normalLoadQueueHead = 0
    loadQueueKeys = new Set([...priorityLoadQueue, ...normalLoadQueue])
    pumpLoadQueue()
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

    if (selectedEntry) {
      scheduleEntryWindow(selectedEntry.relativePath, DIRECTORY_DIFF_SELECTION_LOAD_RADIUS, true)
    }
    scheduleInitialLoads()
  }

  function requestVisibleEntries(paths: string[]) {
    const visiblePaths: string[] = []
    const seenPaths = new Set<string>()

    for (const path of paths) {
      if (seenPaths.has(path)) {
        continue
      }

      seenPaths.add(path)
      visiblePaths.push(path)
    }

    if (visiblePaths.length > 0) {
      replacePriorityLoadQueue(visiblePaths)
    }
  }

  function scheduleSelectedEntryWindow(path: string) {
    if (!path) {
      return
    }

    const entry = entryByPath.get(path)
    if (!entry) {
      return
    }

    if (!isCollapsed(entry.relativePath)) {
      scheduleEntryWindow(entry.relativePath, DIRECTORY_DIFF_SELECTION_LOAD_RADIUS, true)
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

  function buildLoadedEntry(
    entry: DirectoryEntryResult,
    state: EntryDiffState | null,
    cached = loadedEntryCache.get(entry.relativePath),
  ) {
    const renderKey = buildLoadedEntryRenderKey(entry, state)
    const createEntry = (
      diff: FileDiffResult | null,
      error: string,
      itemLoading: boolean,
    ) =>
      cached?.renderKey === renderKey
        ? cached
        : {
            entry,
            diff,
            error,
            loading: itemLoading,
            renderKey,
          }

    if (entry.status === 'unsupported') {
      return createEntry(null, 'No text diff is available for this file.', false)
    }

    if (state?.diff?.contentKind === 'text' && state.diff.text) {
      return createEntry(state.diff, '', state.loading)
    }

    if (state?.error || (state?.diff && state.diff.contentKind !== 'text')) {
      return createEntry(null, state.error || 'No text diff is available for this file.', false)
    }

    return createEntry(null, '', state?.loading ?? false)
  }

  function entryStateIsPending(state: EntryDiffState | null | undefined) {
    return Boolean(state && entryStateIsCurrent(state) && state.loading)
  }

  function rebuildVisibleEntries(states = entryStates) {
    const nextTextEntries: LoadedDirectoryDiff[] = []
    const nextLoadedEntryCache = new Map<string, LoadedDirectoryDiff>()
    let nextPendingEntryCount = 0

    for (const entry of directoryEntries) {
      const state = states.get(entry.relativePath) ?? null
      if (entryStateIsPending(state)) {
        nextPendingEntryCount += 1
      }

      const loadedEntry = buildLoadedEntry(entry, state)
      nextLoadedEntryCache.set(entry.relativePath, loadedEntry)
      nextTextEntries.push(loadedEntry)
    }

    loadedEntryCache = nextLoadedEntryCache
    textEntries = nextTextEntries
    pendingEntryCount = nextPendingEntryCount
  }

  function updateVisibleEntriesForStatePaths(
    paths: string[],
    previousStates: Map<string, EntryDiffState>,
    nextStates: Map<string, EntryDiffState>,
  ) {
    if (paths.length === 0 || textEntries.length === 0) {
      return
    }

    const nextTextEntries = [...textEntries]
    const nextLoadedEntryCache = new Map(loadedEntryCache)
    let nextPendingEntryCount = pendingEntryCount
    let changed = false

    for (const path of paths) {
      const entry = entryByPath.get(path)
      const index = entryIndexByPath.get(path)
      if (!entry || index === undefined) {
        continue
      }

      const previousPending = entryStateIsPending(previousStates.get(path))
      const nextState = nextStates.get(path) ?? null
      const nextPending = entryStateIsPending(nextState)
      if (previousPending !== nextPending) {
        nextPendingEntryCount += nextPending ? 1 : -1
      }

      const loadedEntry = buildLoadedEntry(entry, nextState, nextLoadedEntryCache.get(path))
      nextLoadedEntryCache.set(path, loadedEntry)
      nextTextEntries[index] = loadedEntry
      changed = true
    }

    if (!changed) {
      return
    }

    pendingEntryCount = Math.max(0, nextPendingEntryCount)
    loadedEntryCache = nextLoadedEntryCache
    textEntries = nextTextEntries
    publishChangedEntryPaths(paths)
  }

  function buildLoadedEntryRenderKey(
    entry: DirectoryEntryResult,
    state: EntryDiffState | null,
  ) {
    const diff = state?.diff
    const text = diff?.text
    return [
      revision,
      entry.relativePath,
      entry.status,
      entry.leftPath ?? '',
      entry.rightPath ?? '',
      entry.leftSize ?? '',
      entry.rightSize ?? '',
      state?.loading ? 'loading' : 'idle',
      state?.error ?? '',
      diff?.contentKind ?? '',
      text?.leftCacheKey ?? text?.leftSha256 ?? text?.leftText.length ?? '',
      text?.rightCacheKey ?? text?.rightSha256 ?? text?.rightText.length ?? '',
    ].join('\u0000')
  }

  onDestroy(() => {
    if (loadResumeTimer !== null) {
      window.clearTimeout(loadResumeTimer)
      loadResumeTimer = null
    }
    cancelBackgroundLoadScheduling()
    cancelEntryStateFlush()
  })

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
      priorityLoadQueue = []
      normalLoadQueue = []
      priorityLoadQueueHead = 0
      normalLoadQueueHead = 0
      loadQueueKeys = new Set()
      activeLoadCount = 0
      backgroundLoadCursor = 0
      cancelBackgroundLoadScheduling()
    }
    syncEntryCollections()
  }

  $: directoryEntries,
    entryByPath,
    entryIndexByPath,
    selectedRelativePath,
    revision,
    loadGeneration,
    scheduleActiveLoads()

  $: directoryEntries,
    entryByPath,
    revision,
    loadGeneration,
    scheduleBackgroundLoadPump()

  $: selectedRelativePath, scheduleSelectedEntryWindow(selectedRelativePath)
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
      <PierreDirectoryVirtualDiffView
        entries={textEntries}
        {collapsedPaths}
        {selectedRelativePath}
        {viewerSettings}
        {appearanceSettings}
        {resolvedThemeMode}
        {viewMode}
        {scrollTargetRevision}
        {changedEntryPaths}
        {changedEntryRevision}
        {entryStructureRevision}
        toggleEntry={toggleEntryByPath}
        {requestVisibleEntries}
        pauseDiffLoading={pauseDirectoryDiffLoads}
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
