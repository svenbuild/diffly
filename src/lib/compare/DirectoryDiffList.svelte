<script lang="ts">
  import { onDestroy } from 'svelte'
  import PierreDirectoryVirtualDiffView from './PierreDirectoryVirtualDiffView.svelte'
  import { openCompareItem, openDiffEntry } from '../api'
  import { resolveDirectoryDiffLoadConcurrency } from './diff-concurrency'
  import type { CompareSourceKind } from '../actions/compare-actions'
  import { markCompareTimingOnce } from '../app/compare-timing'
  import { EMPTY_DIFF_STATS, buildTextDiffStats } from '../app/diff-stats'
  import { isDiffableDirectoryEntry } from '../app/directory-state'
  import type { AppearanceSettings } from '../theme'
  import type {
    CompareOptions,
    CompareViewerSettings,
    DiffStatsSnapshot,
    DirectoryDetailLoader,
    DirectoryEntryResult,
    FileDiffResult,
    SystemMonitorSnapshot,
    ViewMode,
  } from '../types'

  interface EntryDiffState {
    detailKey: string
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

  interface PendingDiffStats {
    detailKey: string
    entry: DirectoryEntryResult
    revision: number
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
  export let onDiffStatsChange: (stats: DiffStatsSnapshot) => void = () => {}
  export let onSystemMonitorChange: (stats: SystemMonitorSnapshot) => void = () => {}
  export let resolveEntryBases: (relativePath: string) => {
    leftBase: string
    rightBase: string
    relativePath: string
  } = (relativePath) => ({
    leftBase: leftPath,
    rightBase: rightPath,
    relativePath,
  })
  export let detailLoader: DirectoryDetailLoader = { kind: 'localPaths' }
  export let emptyMessage = 'No file changes.'
  export let reviewModeEnabled = false
  export let reviewSourceKind: CompareSourceKind = 'local'
  export let onReviewRefresh: () => Promise<void> | void = () => {}

  const DIRECTORY_DIFF_LOAD_CONCURRENCY = resolveDirectoryDiffLoadConcurrency()
  const DIRECTORY_DIFF_SESSION_LOAD_CONCURRENCY = resolveDirectoryDiffLoadConcurrency()
  const DIRECTORY_DIFF_INITIAL_LOAD_COUNT = 0
  const DIRECTORY_DIFF_SELECTION_LOAD_RADIUS = 0
  const DIRECTORY_DIFF_VISIBLE_LOAD_PADDING = 0
  const EMPTY_SYSTEM_MONITOR: SystemMonitorSnapshot = {
    busyWorkers: 0,
    totalWorkers: 0,
    taskQueue: 0,
    renderingDiffs: 0,
    preparedDiffs: 0,
    diffCache: 0,
  }

  let entriesSignature = ''
  let resolvedEntryStateRevision = -1
  let loadGeneration = 0
  let collapsedPaths = new Set<string>()
  let entryStates = new Map<string, EntryDiffState>()
  let resolvedEntryStatesByDetailKey = new Map<string, EntryDiffState>()
  let pendingEntryStateUpdates = new Map<string, EntryDiffState>()
  let entryByPath = new Map<string, DirectoryEntryResult>()
  let entryIndexByPath = new Map<string, number>()
  let textEntryIndexByPath = new Map<string, number>()
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
  let loadResumeTimer: number | null = null
  let entryStateFlushFrame: number | null = null
  let textEntries: LoadedDirectoryDiff[] = []
  let hasRenderableDirectoryItems = false
  let hasDiffableDirectoryItems = false
  let pendingEntryCount = 0
  let unresolvedEntryCount = 0
  let diffStatsByEntryKey = new Map<string, {
    additions: number
    deletions: number
    lines: number
    signature: string
  }>()
  let pendingDiffStats = new Map<string, PendingDiffStats>()
  let diffStatsTotals: DiffStatsSnapshot = { ...EMPTY_DIFF_STATS }
  let childSystemMonitor: SystemMonitorSnapshot = { ...EMPTY_SYSTEM_MONITOR }
  let lastSystemMonitorSignature = ''
  let diffStatsFrame: number | null = null
  let diffStatsTimer: number | null = null

  function queuedLoadCount() {
    return (
      Math.max(0, priorityLoadQueue.length - priorityLoadQueueHead) +
      Math.max(0, normalLoadQueue.length - normalLoadQueueHead)
    )
  }

  function publishDirectorySystemMonitorStats(stats = childSystemMonitor) {
    childSystemMonitor = stats
    const nextStats: SystemMonitorSnapshot = {
      ...stats,
      taskQueue: stats.taskQueue + activeLoadCount + queuedLoadCount(),
    }
    const signature = [
      nextStats.busyWorkers,
      nextStats.totalWorkers,
      nextStats.taskQueue,
      nextStats.renderingDiffs,
      nextStats.preparedDiffs,
      nextStats.diffCache,
    ].join(':')

    if (signature === lastSystemMonitorSignature) {
      return
    }

    lastSystemMonitorSignature = signature
    onSystemMonitorChange(nextStats)
  }

  function handleSystemMonitorChange(stats: SystemMonitorSnapshot) {
    publishDirectorySystemMonitorStats(stats)
  }

  function entryKey(entry: DirectoryEntryResult) {
    return entry.relativePath
  }

  function entryDetailKey(entry: DirectoryEntryResult) {
    return entry.diffEntryId ?? [
      detailLoader.kind,
      entry.relativePath,
      entry.leftPath ?? '',
      entry.rightPath ?? '',
    ].join('\u0000')
  }

  function entryDetailKeys(entry: DirectoryEntryResult) {
    const keys = [entryDetailKey(entry), ...(entry.diffEntryAliasIds ?? [])]
    return Array.from(new Set(keys))
  }

  function directoryEntriesSignature() {
    return [
      revision,
      ...directoryEntries.map((entry) => entryDetailKey(entry)),
    ].join('\u0000')
  }

  function entryStateIsCurrent(state: EntryDiffState, entry: DirectoryEntryResult) {
    return (
      state.revision === revision &&
      state.detailKey === entryDetailKey(entry) &&
      (!state.loading || state.generation === loadGeneration)
    )
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
    const nextDiffablePaths = new Set<string>()
    const nextDiffableDetailKeys = new Set<string>()
    const nextEntryByPath = new Map<string, DirectoryEntryResult>()
    const nextEntryIndexByPath = new Map<string, number>()
    const nextCollapsedPaths = new Set<string>()
    const nextStates = new Map<string, EntryDiffState>()

    for (const [index, entry] of directoryEntries.entries()) {
      const key = entryKey(entry)
      nextPaths.add(key)
      nextEntryByPath.set(key, entry)
      nextEntryIndexByPath.set(key, index)
      if (isDiffableDirectoryEntry(entry)) {
        nextDiffablePaths.add(key)
        nextDiffableDetailKeys.add(entryDetailKey(entry))
      }

      const state = entryStates.get(key)
      if (state && entryStateIsCurrent(state, entry)) {
        nextStates.set(key, state)
      } else {
        const cachedState = getResolvedEntryState(entry)
        if (cachedState) {
          nextStates.set(key, cachedState)
        }
      }

      const pendingState = pendingEntryStateUpdates.get(key)
      if (pendingState && entryStateIsCurrent(pendingState, entry)) {
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
      .filter((path) => nextDiffablePaths.has(path))
    normalLoadQueue = normalLoadQueue
      .slice(normalLoadQueueHead)
      .filter((path) => nextDiffablePaths.has(path))
    priorityLoadQueueHead = 0
    normalLoadQueueHead = 0
    loadQueueKeys = new Set([...priorityLoadQueue, ...normalLoadQueue])
    loadedEntryCache = new Map(
      Array.from(loadedEntryCache).filter(([path]) => nextDiffablePaths.has(path)),
    )
    entryByPath = nextEntryByPath
    entryIndexByPath = nextEntryIndexByPath
    changedEntryPaths = []
    entryStructureRevision += 1
    pruneDiffStats(nextDiffableDetailKeys)
    publishDiffStats()
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
    const entry = entryByPath.get(path)
    if (entry) {
      cacheResolvedEntryState(entry, state)
    }
    pendingEntryStateUpdates.set(path, state)
    scheduleEntryStateFlush()
  }

  function cacheResolvedEntryState(entry: DirectoryEntryResult, state: EntryDiffState) {
    if (state.revision !== revision || state.loading || (!state.diff && !state.error)) {
      return
    }

    for (const detailKey of entryDetailKeys(entry)) {
      resolvedEntryStatesByDetailKey.set(detailKey, {
        ...state,
        detailKey,
      })
    }
  }

  function getResolvedEntryState(entry: DirectoryEntryResult) {
    const state = resolvedEntryStatesByDetailKey.get(entryDetailKey(entry)) ?? null
    return state && entryStateIsCurrent(state, entry) ? state : null
  }

  function publishDiffStats() {
    onDiffStatsChange({
      files: directoryEntries.filter(isDiffableDirectoryEntry).length,
      additions: diffStatsTotals.additions,
      deletions: diffStatsTotals.deletions,
      lines: diffStatsTotals.lines,
    })
  }

  function resetDiffStats() {
    diffStatsByEntryKey = new Map()
    diffStatsTotals = { ...EMPTY_DIFF_STATS }
    publishDiffStats()
  }

  function pruneDiffStats(activeKeys: Set<string>) {
    let changed = false

    for (const [key, stats] of diffStatsByEntryKey) {
      if (activeKeys.has(key)) {
        continue
      }

      diffStatsTotals = {
        files: 0,
        additions: diffStatsTotals.additions - stats.additions,
        deletions: diffStatsTotals.deletions - stats.deletions,
        lines: diffStatsTotals.lines - stats.lines,
      }
      diffStatsByEntryKey.delete(key)
      changed = true
    }

    if (changed) {
      publishDiffStats()
    }
  }

  function trackDiffStats(entry: DirectoryEntryResult, diff: FileDiffResult | null) {
    if (!diff?.text) {
      return
    }

    const key = entryDetailKey(entry)
    const stats = buildTextDiffStats(diff.text)
    const previous = diffStatsByEntryKey.get(key)
    if (previous?.signature === stats.signature) {
      return
    }

    diffStatsByEntryKey.set(key, stats)
    diffStatsTotals = {
      files: 0,
      additions: diffStatsTotals.additions + stats.additions - (previous?.additions ?? 0),
      deletions: diffStatsTotals.deletions + stats.deletions - (previous?.deletions ?? 0),
      lines: diffStatsTotals.lines + stats.lines - (previous?.lines ?? 0),
    }
    publishDiffStats()
  }

  function cancelQueuedDiffStats() {
    if (diffStatsFrame !== null) {
      window.cancelAnimationFrame(diffStatsFrame)
      diffStatsFrame = null
    }

    if (diffStatsTimer !== null) {
      window.clearTimeout(diffStatsTimer)
      diffStatsTimer = null
    }

    pendingDiffStats = new Map()
  }

  function scheduleDiffStatsFlush() {
    if (diffStatsFrame !== null || diffStatsTimer !== null) {
      return
    }

    diffStatsFrame = window.requestAnimationFrame(() => {
      diffStatsFrame = null
      diffStatsTimer = window.setTimeout(() => {
        diffStatsTimer = null
        flushQueuedDiffStats()
      }, 0)
    })
  }

  function queueDiffStats(entry: DirectoryEntryResult, diff: FileDiffResult | null) {
    if (!diff?.text) {
      return
    }

    const detailKey = entryDetailKey(entry)
    pendingDiffStats.set(detailKey, {
      detailKey,
      entry,
      revision,
    })
    scheduleDiffStatsFlush()
  }

  function flushQueuedDiffStats() {
    if (pendingDiffStats.size === 0) {
      return
    }

    const pending = Array.from(pendingDiffStats.values())
    pendingDiffStats = new Map()

    for (const item of pending) {
      if (item.revision !== revision) {
        continue
      }

      const currentEntry = entryByPath.get(item.entry.relativePath)
      if (!currentEntry || entryDetailKey(currentEntry) !== item.detailKey) {
        continue
      }

      const state = getEntryState(currentEntry)
      if (!state?.diff?.text || state.revision !== item.revision) {
        continue
      }

      trackDiffStats(currentEntry, state.diff)
    }
  }

  function getEntryState(entry: DirectoryEntryResult) {
    const path = entryKey(entry)
    const state = pendingEntryStateUpdates.get(path) ?? entryStates.get(path) ?? null
    if (state && entryStateIsCurrent(state, entry)) {
      return state
    }

    return getResolvedEntryState(entry)
  }

  function entryNeedsLoad(
    entry: DirectoryEntryResult | null | undefined,
  ): entry is DirectoryEntryResult {
    if (!isDiffableDirectoryEntry(entry)) {
      return false
    }
    if (entryUsesNativeGitPatch(entry)) {
      return false
    }

    const state = getEntryState(entry)
    return !(state?.revision === revision && (state.diff || state.error || state.loading))
  }

  function entryUsesNativeGitPatch(entry: DirectoryEntryResult) {
    return Boolean(
      entry.diffEntryScope &&
        entry.diffEntryStatus !== 'untracked' &&
        entry.diffEntryStatus !== 'conflicted' &&
        entry.diffEntryStatus !== 'unsupported' &&
        !entry.binary,
    )
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

  async function ensureLoaded(
    entry: DirectoryEntryResult,
    generation = loadGeneration,
    loadRevision = revision,
  ) {
    const path = entryKey(entry)
    const detailKey = entryDetailKey(entry)
    const state = getEntryState(entry)

    if (state?.diff && state.revision === loadRevision) {
      queueDiffStats(entry, state.diff)
      return
    }

    if (state?.error && state.revision === loadRevision) {
      return
    }

    if (state?.loading && state.revision === loadRevision && state.generation === generation) {
      return
    }

    setEntryState(path, {
      detailKey,
      diff: state?.revision === loadRevision ? state.diff : null,
      error: '',
      generation,
      loading: true,
      revision: loadRevision,
    })
    markCompareTimingOnce('first-entry-load-start', {
      loader: detailLoader.kind,
      path,
    })

    try {
      let diff: FileDiffResult
      if (detailLoader.kind === 'diffSession') {
        if (!entry.diffEntryId) {
          // Session-backed entries must carry a scope-specific diff entry id.
          // Surface the gap as a visible error instead of deriving local paths.
          setEntryState(path, {
            detailKey,
            diff: null,
            error: 'No diff details are available for this file.',
            generation,
            loading: false,
            revision: loadRevision,
          })
          return
        }
        diff = await openDiffEntry(detailLoader.sessionId, entry.diffEntryId, compareOptions)
      } else {
        const bases = resolveEntryBases(entry.relativePath)
        diff = await openCompareItem(
          bases.leftBase,
          bases.rightBase,
          bases.relativePath,
          compareOptions,
        )
      }
      if (revision !== loadRevision || generation !== loadGeneration) {
        return
      }
      markCompareTimingOnce('first-entry-loaded', {
        contentKind: diff.contentKind,
        hasTextDiff: Boolean(diff.contentKind === 'text' && diff.text),
        loader: detailLoader.kind,
        path,
      })
      if (diff.contentKind === 'text' && diff.text) {
        markCompareTimingOnce('first-text-entry-loaded', {
          loader: detailLoader.kind,
          path,
        })
      }

      setEntryState(path, {
        detailKey,
        diff,
        error: '',
        generation,
        loading: false,
        revision: loadRevision,
      })
      queueDiffStats(entry, diff)
    } catch (error) {
      if (revision !== loadRevision || generation !== loadGeneration) {
        return
      }

      setEntryState(path, {
        detailKey,
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
    publishDirectorySystemMonitorStats()
    pumpLoadQueue()
  }

  function scheduleLoadResume() {
    if (loadResumeTimer !== null) {
      window.clearTimeout(loadResumeTimer)
    }

    loadResumeTimer = window.setTimeout(() => {
      loadResumeTimer = null
      pumpLoadQueue()
    }, 16)
  }

  function pauseDirectoryDiffLoads() {
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

  function takeNextQueuedEntry() {
    while (true) {
      const nextPath = takeQueuedPath()
      if (!nextPath) {
        return null
      }

      loadQueueKeys.delete(nextPath)

      const entry = entryByPath.get(nextPath)
      if (isDiffableDirectoryEntry(entry)) {
        return entry
      }
    }
  }

  function pumpLoadQueue() {
    const loadConcurrency = detailLoader.kind === 'diffSession'
      ? DIRECTORY_DIFF_SESSION_LOAD_CONCURRENCY
      : DIRECTORY_DIFF_LOAD_CONCURRENCY
    while (activeLoadCount < loadConcurrency) {
      const entry = takeNextQueuedEntry()
      if (!entry) {
        return
      }

      const generation = loadGeneration
      const loadRevision = revision
      activeLoadCount += 1
      publishDirectorySystemMonitorStats()

      void ensureLoaded(entry, generation, loadRevision).finally(() => {
        if (generation === loadGeneration) {
          activeLoadCount = Math.max(0, activeLoadCount - 1)
          publishDirectorySystemMonitorStats()
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
    publishDirectorySystemMonitorStats()
    pumpLoadQueue()
  }

  function scheduleInitialLoads() {
    let scheduledCount = 0

    for (const entry of directoryEntries) {
      if (scheduledCount >= DIRECTORY_DIFF_INITIAL_LOAD_COUNT) {
        return
      }

      if (isDiffableDirectoryEntry(entry)) {
        scheduleEntryLoad(entry)
        scheduledCount += 1
      }
    }
  }

  function scheduleActiveLoads() {
    const selectedEntry = selectedRelativePath
      ? entryByPath.get(selectedRelativePath)
      : directoryEntries.find(isDiffableDirectoryEntry)

    if (selectedEntry) {
      scheduleEntryLoad(selectedEntry, true)
      if (detailLoader.kind === 'localPaths') {
        scheduleEntryWindow(selectedEntry.relativePath, DIRECTORY_DIFF_SELECTION_LOAD_RADIUS, true)
      }
    }
    if (detailLoader.kind === 'localPaths') {
      scheduleInitialLoads()
    }
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
    if (!isDiffableDirectoryEntry(entry)) {
      return
    }

    if (!isCollapsed(entry.relativePath)) {
      scheduleEntryLoad(entry, true)
      if (detailLoader.kind === 'localPaths') {
        scheduleEntryWindow(entry.relativePath, DIRECTORY_DIFF_SELECTION_LOAD_RADIUS, true)
      }
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

    if (state?.diff?.contentKind === 'text' && state.diff.text) {
      return createEntry(state.diff, '', state.loading)
    }

    if (state?.error || (state?.diff && state.diff.contentKind !== 'text')) {
      return createEntry(null, state.error || 'No text diff is available for this file.', false)
    }

    return createEntry(null, '', state?.loading ?? false)
  }

  function entryStateIsPending(
    entry: DirectoryEntryResult,
    state: EntryDiffState | null | undefined,
  ) {
    return Boolean(state && entryStateIsCurrent(state, entry) && state.loading)
  }

  function entryStateIsResolved(
    entry: DirectoryEntryResult,
    state: EntryDiffState | null | undefined,
  ) {
    if (!isDiffableDirectoryEntry(entry)) {
      return true
    }
    if (entryUsesNativeGitPatch(entry)) {
      return true
    }

    return Boolean(
      state &&
        entryStateIsCurrent(state, entry) &&
        !state.loading &&
        (state.diff || state.error),
    )
  }

  function rebuildVisibleEntries(states = entryStates) {
    const nextTextEntries: LoadedDirectoryDiff[] = []
    const nextTextEntryIndexByPath = new Map<string, number>()
    const nextLoadedEntryCache = new Map<string, LoadedDirectoryDiff>()
    let nextPendingEntryCount = 0
    let nextUnresolvedEntryCount = 0

    for (const entry of directoryEntries) {
      if (!isDiffableDirectoryEntry(entry)) {
        continue
      }

      const state = states.get(entry.relativePath) ?? null
      if (entryStateIsPending(entry, state)) {
        nextPendingEntryCount += 1
      }
      if (!entryStateIsResolved(entry, state)) {
        nextUnresolvedEntryCount += 1
      }

      const loadedEntry = buildLoadedEntry(entry, state)
      if (state?.diff?.text) {
        queueDiffStats(entry, state.diff)
      }
      nextLoadedEntryCache.set(entry.relativePath, loadedEntry)
      nextTextEntryIndexByPath.set(entry.relativePath, nextTextEntries.length)
      nextTextEntries.push(loadedEntry)
    }

    loadedEntryCache = nextLoadedEntryCache
    textEntryIndexByPath = nextTextEntryIndexByPath
    textEntries = nextTextEntries
    pendingEntryCount = nextPendingEntryCount
    unresolvedEntryCount = nextUnresolvedEntryCount
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
    let nextUnresolvedEntryCount = unresolvedEntryCount
    let changed = false

    for (const path of paths) {
      const entry = entryByPath.get(path)
      const index = textEntryIndexByPath.get(path)
      if (!entry || index === undefined) {
        continue
      }

      const previousPending = entryStateIsPending(entry, previousStates.get(path))
      const previousResolved = entryStateIsResolved(entry, previousStates.get(path))
      const nextState = nextStates.get(path) ?? null
      const nextPending = entryStateIsPending(entry, nextState)
      const nextResolved = entryStateIsResolved(entry, nextState)
      if (previousPending !== nextPending) {
        nextPendingEntryCount += nextPending ? 1 : -1
      }
      if (previousResolved !== nextResolved) {
        nextUnresolvedEntryCount += nextResolved ? -1 : 1
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
    unresolvedEntryCount = Math.max(0, nextUnresolvedEntryCount)
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
      entry.diffEntryId ?? '',
      entry.diffEntryScope ?? '',
      entry.relativePath,
      entry.status,
      entry.leftPath ?? '',
      entry.rightPath ?? '',
      entry.leftSize ?? '',
      entry.rightSize ?? '',
      entry.diffPatchCacheKey ?? entry.diffPatchText?.length ?? '',
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
    cancelQueuedDiffStats()
    cancelEntryStateFlush()
  })

  $: {
    directoryEntries
    const nextSignature = directoryEntriesSignature()
    if (nextSignature !== entriesSignature) {
      entriesSignature = nextSignature
      loadGeneration += 1
      priorityLoadQueue = []
      normalLoadQueue = []
      priorityLoadQueueHead = 0
      normalLoadQueueHead = 0
      loadQueueKeys = new Set()
      activeLoadCount = 0
      childSystemMonitor = { ...EMPTY_SYSTEM_MONITOR }
      lastSystemMonitorSignature = ''
      cancelQueuedDiffStats()
      if (resolvedEntryStateRevision !== revision) {
        resolvedEntryStateRevision = revision
        resolvedEntryStatesByDetailKey = new Map()
        resetDiffStats()
      }
      publishDirectorySystemMonitorStats()
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

  $: selectedRelativePath, scheduleSelectedEntryWindow(selectedRelativePath)
  $: hasRenderableDirectoryItems = textEntries.length > 0
  $: hasDiffableDirectoryItems = directoryEntries.some(isDiffableDirectoryEntry)
</script>

<section class="directory-diff-list">
  {#if loading && directoryEntries.length === 0}
    <div class="compare-viewer-state">
      <span class="refresh-spinner visible"></span>
      <p>Comparing folders...</p>
    </div>
  {:else if directoryEntries.length === 0}
    <div class="compare-viewer-state">
      <p>{emptyMessage}</p>
    </div>
  {:else if !hasDiffableDirectoryItems}
    <div class="compare-viewer-state">
      <p>No text file changes.</p>
    </div>
  {:else if !hasRenderableDirectoryItems}
    <div class="compare-viewer-state">
      <span class="refresh-spinner visible"></span>
      <p>Preparing diffs...</p>
    </div>
  {:else}
    <PierreDirectoryVirtualDiffView
      entries={textEntries}
      compareKey={`${leftPath}\u0000${rightPath}`}
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
      onSystemMonitorChange={handleSystemMonitorChange}
      {reviewModeEnabled}
      {reviewSourceKind}
      {onReviewRefresh}
      {resolveEntryBases}
    />
  {/if}
</section>
