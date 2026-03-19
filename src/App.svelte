<script lang="ts">
  import { onMount, tick } from 'svelte'
  import DirectoryBrowser from './lib/DirectoryBrowser.svelte'
  import DiffViewer from './lib/DiffViewer.svelte'
  import PickerPane from './lib/PickerPane.svelte'

  import {
    choosePath,
    comparePaths,
    listDirectory,
    listRoots,
    loadSessionState,
    openCompareItem,
    pathInfo,
    saveSessionState,
  } from './lib/api'
  import {
    buildSideBySideHunkRanges,
    buildSideBySideRenderItems,
    buildUnifiedHunkRanges,
    buildUnifiedRenderItems,
  } from './lib/diff-render'
  import { entryTypeLabel, formatModified, formatSize } from './lib/format'
  import {
    buildFolderSections,
    getFileName,
    getParentPath,
    getVisibleFolderSections,
    normalizeSelectionPath,
    ROOT_GROUP,
  } from './lib/path-utils'
  import type {
    CompareMode,
    DirectoryEntryResult,
    EntryStatus,
    ExplorerEntry,
    FileDiffResult,
    PersistedExplorerPane,
    PersistedSession,
    ThemeMode,
    ViewMode,
  } from './lib/types'
  import type {
    DiffHunkRange,
    EntryGroup,
    ExplorerPaneState,
    FolderSection,
    Side,
    SideBySideRenderItem,
    UnifiedRenderItem,
  } from './lib/ui-types'

  const SESSION_SAVE_DELAY_MS = 180
  const THEME_SWITCH_DURATION_MS = 140
  const DIFF_PREFETCH_RADIUS = 2
  const DIFF_PREFETCH_DELAY_MS = 70

  type Screen = 'setup' | 'compare'

  interface CachedDiffRenderState {
    sideBySideHunks: DiffHunkRange[] | null
    unifiedHunks: DiffHunkRange[] | null
    sideBySideItems: Map<boolean, SideBySideRenderItem[]>
    unifiedItems: Map<boolean, UnifiedRenderItem[]>
  }

  let screen: Screen = 'setup'
  let mode: CompareMode = 'directory'
  let viewMode: ViewMode = 'sideBySide'
  let themeMode: ThemeMode = 'dark'
  let showFullFile = false
  let showInlineHighlights = true
  let leftPath = ''
  let rightPath = ''
  let ignoreWhitespace = false
  let ignoreCase = false
  let loading = false
  let detailLoading = false
  let pickerLoading = false
  let errorMessage = ''
  let directoryEntries: DirectoryEntryResult[] = []
  let filteredDirectoryEntries: DirectoryEntryResult[] = []
  let filteredEntryGroups: EntryGroup[] = []
  let folderSections: FolderSection[] = []
  let collapsedGroups: Record<string, boolean> = {}
  let activeStatusFilters: EntryStatus[] = []
  let leftPaneScroll: HTMLDivElement | null = null
  let rightPaneScroll: HTMLDivElement | null = null
  let unifiedScroll: HTMLDivElement | null = null
  let selectedRelativePath = ''
  let activeDiff: FileDiffResult | null = null
  let compareRevision = 0
  let scrollEchoTarget: 'left' | 'right' | null = null
  let scrollEchoTop = 0
  let scrollEchoLeft = 0
  let scrollEchoResetFrame: number | null = null
  let diffNavigationRefreshQueued = false
  let diffNavigationScrollFrame: number | null = null
  let currentDiffHunk = -1
  let persistenceReady = false
  let saveSessionTimer: number | null = null
  let compareRefreshTimer: number | null = null
  let detailPrefetchTimer: number | null = null
  let themeTransitionTimer: number | null = null
  let activeDetailRequestId = 0
  let leftExplorer = createExplorerPane('Left')
  let rightExplorer = createExplorerPane('Right')
  let sideBySideHunkRanges: DiffHunkRange[] = []
  let unifiedHunkRanges: DiffHunkRange[] = []
  let sideBySideRenderItems: SideBySideRenderItem[] = []
  let unifiedRenderItems: UnifiedRenderItem[] = []
  let visibleDiffHunkCount = 0
  let canNavigateDiffs = false
  let canGoToPreviousDiff = false
  let canGoToNextDiff = false
  const detailDiffCache = new Map<string, Promise<FileDiffResult>>()
  const diffRenderCache = new WeakMap<FileDiffResult, CachedDiffRenderState>()

  const statusLabel = {
    modified: 'Modified',
    leftOnly: 'Left only',
    rightOnly: 'Right only',
    binary: 'Binary',
    tooLarge: 'Too large',
  }
  const statusOrder: EntryStatus[] = ['modified', 'leftOnly', 'rightOnly', 'binary', 'tooLarge']

  const getOptions = () => ({
    ignoreWhitespace,
    ignoreCase,
  })

  const toggleThemeMode = () => {
    setThemeMode(themeMode === 'dark' ? 'light' : 'dark')
  }

  const toggleViewMode = () => {
    viewMode = viewMode === 'sideBySide' ? 'unified' : 'sideBySide'
  }

  const toggleIgnoreWhitespace = () => {
    ignoreWhitespace = !ignoreWhitespace
    scheduleCompareRefresh()
  }

  const toggleIgnoreCase = () => {
    ignoreCase = !ignoreCase
    scheduleCompareRefresh()
  }

  onMount(() => {
    void initializePickers()

    return () => {
      if (saveSessionTimer !== null) {
        window.clearTimeout(saveSessionTimer)
      }

      if (compareRefreshTimer !== null) {
        window.clearTimeout(compareRefreshTimer)
      }

      if (detailPrefetchTimer !== null) {
        window.clearTimeout(detailPrefetchTimer)
      }

      if (themeTransitionTimer !== null) {
        window.clearTimeout(themeTransitionTimer)
      }

      if (scrollEchoResetFrame !== null) {
        window.cancelAnimationFrame(scrollEchoResetFrame)
      }

      if (diffNavigationScrollFrame !== null) {
        window.cancelAnimationFrame(diffNavigationScrollFrame)
      }
    }
  })

  function getCachedDiffRenderState(diff: FileDiffResult) {
    const cached = diffRenderCache.get(diff)

    if (cached) {
      return cached
    }

    const state: CachedDiffRenderState = {
      sideBySideHunks: null,
      unifiedHunks: null,
      sideBySideItems: new Map(),
      unifiedItems: new Map(),
    }

    diffRenderCache.set(diff, state)
    return state
  }

  function getCachedSideBySideHunks(diff: FileDiffResult) {
    const state = getCachedDiffRenderState(diff)

    if (!state.sideBySideHunks) {
      state.sideBySideHunks = buildSideBySideHunkRanges(diff.sideBySide)
    }

    return state.sideBySideHunks
  }

  function getCachedUnifiedHunks(diff: FileDiffResult) {
    const state = getCachedDiffRenderState(diff)

    if (!state.unifiedHunks) {
      state.unifiedHunks = buildUnifiedHunkRanges(diff.unified)
    }

    return state.unifiedHunks
  }

  function getCachedSideBySideRenderItems(diff: FileDiffResult, includeFullFile: boolean) {
    const state = getCachedDiffRenderState(diff)
    const cached = state.sideBySideItems.get(includeFullFile)

    if (cached) {
      return cached
    }

    const items = buildSideBySideRenderItems(
      diff.sideBySide,
      getCachedSideBySideHunks(diff),
      includeFullFile,
    )

    state.sideBySideItems.set(includeFullFile, items)
    return items
  }

  function getCachedUnifiedRenderItems(diff: FileDiffResult, includeFullFile: boolean) {
    const state = getCachedDiffRenderState(diff)
    const cached = state.unifiedItems.get(includeFullFile)

    if (cached) {
      return cached
    }

    const items = buildUnifiedRenderItems(
      diff.unified,
      getCachedUnifiedHunks(diff),
      includeFullFile,
    )

    state.unifiedItems.set(includeFullFile, items)
    return items
  }

  function scheduleThemeTransitionCleanup(root: HTMLElement) {
    if (themeTransitionTimer !== null) {
      window.clearTimeout(themeTransitionTimer)
    }

    themeTransitionTimer = window.setTimeout(() => {
      root.classList.remove('theme-switching')
      themeTransitionTimer = null
    }, THEME_SWITCH_DURATION_MS)
  }

  function buildDetailCacheKey(relativePath: string, revision = compareRevision) {
    return [
      revision,
      leftPath,
      rightPath,
      relativePath,
      ignoreWhitespace ? '1' : '0',
      ignoreCase ? '1' : '0',
    ].join('\u0000')
  }

  function getOrCreateDetailDiffPromise(relativePath: string, revision = compareRevision) {
    if (!leftPath || !rightPath) {
      throw new Error('No active compare is available.')
    }

    const cacheKey = buildDetailCacheKey(relativePath, revision)
    let resultPromise = detailDiffCache.get(cacheKey)

    if (resultPromise) {
      return resultPromise
    }

    resultPromise = openCompareItem(
      leftPath,
      rightPath,
      relativePath,
      getOptions(),
    ).catch((error) => {
      detailDiffCache.delete(cacheKey)
      throw error
    })

    detailDiffCache.set(cacheKey, resultPromise)
    return resultPromise
  }

  function clearDetailPrefetch() {
    if (detailPrefetchTimer !== null) {
      window.clearTimeout(detailPrefetchTimer)
      detailPrefetchTimer = null
    }
  }

  function scheduleAdjacentDiffPrefetch(centerRelativePath: string, revision = compareRevision) {
    clearDetailPrefetch()

    if (
      screen !== 'compare' ||
      mode !== 'directory' ||
      !leftPath ||
      !rightPath ||
      filteredDirectoryEntries.length < 2
    ) {
      return
    }

    const centerIndex = filteredDirectoryEntries.findIndex(
      (entry) => entry.relativePath === centerRelativePath,
    )

    if (centerIndex === -1) {
      return
    }

    const candidates: DirectoryEntryResult[] = []

    for (let offset = 1; offset <= DIFF_PREFETCH_RADIUS; offset += 1) {
      const nextEntry = filteredDirectoryEntries[centerIndex + offset]
      const previousEntry = filteredDirectoryEntries[centerIndex - offset]

      if (nextEntry) {
        candidates.push(nextEntry)
      }

      if (previousEntry) {
        candidates.push(previousEntry)
      }
    }

    if (candidates.length === 0) {
      return
    }

    detailPrefetchTimer = window.setTimeout(() => {
      detailPrefetchTimer = null

      if (revision !== compareRevision || !leftPath || !rightPath) {
        return
      }

      for (const entry of candidates) {
        void getOrCreateDetailDiffPromise(entry.relativePath, revision).catch(() => undefined)
      }
    }, DIFF_PREFETCH_DELAY_MS)
  }

  function setThemeMode(nextThemeMode: ThemeMode) {
    if (themeMode === nextThemeMode) {
      return
    }

    if (typeof document === 'undefined') {
      themeMode = nextThemeMode
      return
    }

    const root = document.documentElement
    root.classList.add('theme-switching')

    if (typeof document.startViewTransition === 'function') {
      void document
        .startViewTransition(() => {
          themeMode = nextThemeMode
        })
        .finished.finally(() => {
          scheduleThemeTransitionCleanup(root)
        })

      return
    }

    themeMode = nextThemeMode
    scheduleThemeTransitionCleanup(root)
  }

  function createExplorerPane(title: string): ExplorerPaneState {
    return {
      title,
      roots: [],
      currentPath: '',
      pathInput: '',
      currentListing: null,
      listings: {},
      history: [],
      historyIndex: -1,
      selectedTargetPath: '',
      selectedTargetKind: null,
      loading: false,
      error: '',
    }
  }

  function paneFor(side: Side) {
    return side === 'left' ? leftExplorer : rightExplorer
  }

  function setPane(side: Side, pane: ExplorerPaneState) {
    if (side === 'left') {
      leftExplorer = pane
    } else {
      rightExplorer = pane
    }
  }

  function updatePane(side: Side, updater: (pane: ExplorerPaneState) => ExplorerPaneState) {
    setPane(side, updater(paneFor(side)))
  }

  async function initializePickers() {
    pickerLoading = true

    try {
      const [roots, savedSession] = await Promise.all([
        listRoots(),
        loadSessionState().catch(() => null),
      ])

      applyPersistedSession(savedSession)

      leftExplorer = {
        ...createExplorerPane('Left'),
        roots,
      }

      rightExplorer = {
        ...createExplorerPane('Right'),
        roots,
      }

      if (roots.length > 0) {
        const leftRoot = await resolveInitialPanePath(savedSession?.leftPane ?? null, roots[0].path)
        const rightRoot = await resolveInitialPanePath(
          savedSession?.rightPane ?? null,
          roots[1]?.path ?? roots[0].path,
        )

        await Promise.all([
          openDirectory('left', leftRoot),
          openDirectory('right', rightRoot),
        ])

        await Promise.all([
          restorePaneSelection('left', savedSession?.leftPane ?? null),
          restorePaneSelection('right', savedSession?.rightPane ?? null),
        ])
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Unable to initialize the picker.'
    } finally {
      pickerLoading = false
      persistenceReady = true
    }
  }

  function applyPersistedSession(session: PersistedSession | null) {
    if (!session) {
      return
    }

    if (session.mode === 'file' || session.mode === 'directory') {
      mode = session.mode
    }

    if (session.viewMode === 'sideBySide' || session.viewMode === 'unified') {
      viewMode = session.viewMode
    }

    if (session.themeMode === 'dark' || session.themeMode === 'light') {
      themeMode = session.themeMode
    }

    ignoreWhitespace = session.ignoreWhitespace
    ignoreCase = session.ignoreCase
    showFullFile = session.showFullFile
    showInlineHighlights = session.showInlineHighlights ?? true
  }

  async function resolveInitialPanePath(
    pane: PersistedExplorerPane | null,
    fallbackPath: string,
  ) {
    if (pane?.currentPath) {
      const currentInfo = await pathInfo(pane.currentPath)

      if (currentInfo.exists && currentInfo.isDirectory) {
        return currentInfo.path
      }
    }

    if (pane?.selectedTargetPath) {
      const targetInfo = await pathInfo(pane.selectedTargetPath)

      if (targetInfo.exists && targetInfo.isDirectory) {
        return targetInfo.path
      }

      if (targetInfo.exists && targetInfo.isFile && targetInfo.parentPath) {
        return targetInfo.parentPath
      }
    }

    return fallbackPath
  }

  async function restorePaneSelection(side: Side, pane: PersistedExplorerPane | null) {
    if (!pane?.selectedTargetPath || !pane.selectedTargetKind) {
      return
    }

    const info = await pathInfo(pane.selectedTargetPath)

    if (!info.exists) {
      return
    }

    if (pane.selectedTargetKind === 'directory' && info.isDirectory) {
      selectTarget(side, info.path, 'directory')
      return
    }

    if (pane.selectedTargetKind === 'file' && info.isFile) {
      selectTarget(side, info.path, 'file')
    }
  }

  function setMode(nextMode: CompareMode) {
    if (mode === nextMode) {
      return
    }

    activeDetailRequestId += 1
    detailDiffCache.clear()
    clearDetailPrefetch()
    detailLoading = false
    mode = nextMode
    leftExplorer = sanitizePaneForMode(leftExplorer, nextMode)
    rightExplorer = sanitizePaneForMode(rightExplorer, nextMode)
    directoryEntries = []
    filteredDirectoryEntries = []
    filteredEntryGroups = []
    folderSections = []
    collapsedGroups = {}
    activeStatusFilters = []
    selectedRelativePath = ''
    activeDiff = null
    errorMessage = ''
  }

  function sanitizePaneForMode(pane: ExplorerPaneState, nextMode: CompareMode) {
    if (nextMode === 'file' && pane.selectedTargetKind !== 'file') {
      return {
        ...pane,
        selectedTargetPath: '',
        selectedTargetKind: null,
      }
    }

    if (nextMode === 'directory' && pane.selectedTargetKind !== 'directory') {
      return {
        ...pane,
        selectedTargetPath: '',
        selectedTargetKind: null,
      }
    }

    return pane
  }

  function goToSetup() {
    activeDetailRequestId += 1
    detailLoading = false
    clearDetailPrefetch()
    screen = 'setup'
    errorMessage = ''
  }

  function retitlePane(pane: ExplorerPaneState, title: string): ExplorerPaneState {
    return {
      ...pane,
      title,
    }
  }

  async function swapComparedSides() {
    if (loading || detailLoading || pickerLoading) {
      return
    }

    const nextLeftPane = retitlePane(rightExplorer, leftExplorer.title)
    const nextRightPane = retitlePane(leftExplorer, rightExplorer.title)

    leftExplorer = nextLeftPane
    rightExplorer = nextRightPane

    if (screen === 'compare') {
      await runCompare()
    }
  }

  async function browseSystem(side: Side) {
    const selected = await choosePath(mode === 'file' ? 'file' : 'directory')

    if (!selected) {
      return
    }

    const info = await pathInfo(selected)

    if (!info.exists) {
      return
    }

    if (info.isDirectory) {
      await openDirectory(side, info.path)
      selectTarget(side, info.path, 'directory')
      return
    }

    if (info.isFile) {
      if (info.parentPath) {
        await openDirectory(side, info.parentPath)
      }
      selectTarget(side, info.path, 'file')
    }
  }

  async function openDirectory(side: Side, path: string, historyMode: 'push' | 'keep' = 'push') {
    updatePane(side, (pane) => ({
      ...pane,
      loading: true,
      error: '',
    }))

    try {
      const pane = paneFor(side)
      const cached = pane.listings[path]
      const listing = cached ?? (await listDirectory(path))
      const historyState = buildNextHistoryState(pane, path, historyMode)

      updatePane(side, (current) => ({
        ...current,
        ...historyState,
        currentPath: path,
        pathInput: path,
        currentListing: listing,
        listings: {
          ...current.listings,
          [path]: listing,
        },
        loading: false,
      }))
    } catch (error) {
      updatePane(side, (pane) => ({
        ...pane,
        loading: false,
        error: error instanceof Error ? error.message : 'Unable to open the folder.',
      }))
    }
  }

  async function navigateTo(side: Side, path: string) {
    await openDirectory(side, path)
  }

  async function navigateHistory(side: Side, direction: -1 | 1) {
    const pane = paneFor(side)
    const nextIndex = pane.historyIndex + direction

    if (nextIndex < 0 || nextIndex >= pane.history.length) {
      return
    }

    await openDirectory(side, pane.history[nextIndex], 'keep')

    updatePane(side, (current) => ({
      ...current,
      historyIndex: nextIndex,
    }))
  }

  async function changeDrive(side: Side, path: string) {
    if (!path) {
      return
    }

    await openDirectory(side, path)
  }

  function updatePathInput(side: Side, value: string) {
    updatePane(side, (pane) => ({
      ...pane,
      pathInput: value,
    }))
  }

  async function submitPathInput(side: Side) {
    const pane = paneFor(side)
    const nextPath = pane.pathInput.trim()

    if (!nextPath) {
      updatePane(side, (current) => ({
        ...current,
        pathInput: current.currentPath,
      }))
      return
    }

    const info = await pathInfo(nextPath)

    if (!info.exists) {
      updatePane(side, (current) => ({
        ...current,
        error: 'The requested path does not exist.',
      }))
      return
    }

    if (info.isDirectory) {
      await openDirectory(side, info.path)
      if (mode === 'directory') {
        selectTarget(side, info.path, 'directory')
      }
      return
    }

    if (info.isFile && info.parentPath) {
      await openDirectory(side, info.parentPath)
      if (mode === 'file') {
        selectTarget(side, info.path, 'file')
      }
    }
  }

  function selectTarget(side: Side, path: string, kind: 'file' | 'directory') {
    updatePane(side, (pane) => ({
      ...pane,
      selectedTargetPath: path,
      selectedTargetKind: kind,
    }))
  }

  function useCurrentFolder(side: Side) {
    const pane = paneFor(side)

    if (pane.currentPath) {
      selectTarget(side, pane.currentPath, 'directory')
    }
  }

  function selectListEntry(side: Side, entry: ExplorerEntry) {
    if (mode === 'directory' && entry.kind !== 'file') {
      selectTarget(side, entry.path, 'directory')
      return
    }

    if (mode === 'file' && entry.kind === 'file') {
      selectTarget(side, entry.path, 'file')
    }
  }

  async function activateListEntry(side: Side, entry: ExplorerEntry) {
    if (entry.kind === 'directory' || entry.kind === 'drive') {
      await openDirectory(side, entry.path)
      return
    }

    if (mode === 'file') {
      selectTarget(side, entry.path, 'file')
    }
  }

  function canComparePane(pane: ExplorerPaneState) {
    return mode === 'file' ? pane.selectedTargetKind === 'file' : pane.selectedTargetKind === 'directory'
  }



  async function runCompare() {
    if (!canComparePane(leftExplorer) || !canComparePane(rightExplorer)) {
      errorMessage = 'Select valid targets on both sides first.'
      return
    }

    const nextLeftPath = leftExplorer.selectedTargetPath
    const nextRightPath = rightExplorer.selectedTargetPath
    const previousRelativePath = selectedRelativePath

    loading = true
    detailLoading = false
    errorMessage = ''
    activeDetailRequestId += 1
    clearDetailPrefetch()
    leftPath = nextLeftPath
    rightPath = nextRightPath

    try {
      const response = await comparePaths(nextLeftPath, nextRightPath, mode, getOptions())
      compareRevision += 1
      detailDiffCache.clear()
      screen = 'compare'

      if (response.kind === 'directory') {
        directoryEntries = response.entries
        syncFilteredDirectoryState(response.entries)

        if (filteredDirectoryEntries.length > 0) {
          const retainedEntry =
            filteredDirectoryEntries.find((entry) => entry.relativePath === previousRelativePath) ??
            filteredDirectoryEntries[0]
          await selectEntry(retainedEntry, compareRevision)
        } else {
          selectedRelativePath = ''
          activeDiff = null
        }
      } else {
        selectedRelativePath = ''
        activeDiff = response.result
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Compare failed.'
    } finally {
      loading = false
    }
  }

  function scheduleCompareRefresh() {
    if (screen !== 'compare' || !canComparePane(leftExplorer) || !canComparePane(rightExplorer)) {
      return
    }

    if (compareRefreshTimer !== null) {
      window.clearTimeout(compareRefreshTimer)
    }

    compareRefreshTimer = window.setTimeout(() => {
      compareRefreshTimer = null

      if (!loading && !detailLoading) {
        void runCompare()
      }
    }, 120)
  }

  async function selectEntry(entry: DirectoryEntryResult, revision = compareRevision) {
    if (!leftPath || !rightPath) {
      return
    }

    if (selectedRelativePath === entry.relativePath && detailLoading) {
      return
    }

    const requestId = activeDetailRequestId + 1

    activeDetailRequestId = requestId
    selectedRelativePath = entry.relativePath
    detailLoading = true
    errorMessage = ''

    try {
      const resultPromise = getOrCreateDetailDiffPromise(entry.relativePath, revision)
      await tick()

      const result = await resultPromise

      if (revision === compareRevision && requestId === activeDetailRequestId) {
        activeDiff = result
        scheduleAdjacentDiffPrefetch(entry.relativePath, revision)
      }
    } catch (error) {
      if (requestId === activeDetailRequestId) {
        errorMessage = error instanceof Error ? error.message : 'Unable to open the file diff.'
      }
    } finally {
      if (requestId === activeDetailRequestId) {
        detailLoading = false
      }
    }
  }

  function buildGroups(entries: DirectoryEntryResult[]) {
    const groups = new Map<string, DirectoryEntryResult[]>()

    for (const entry of entries) {
      const groupKey = getParentPath(entry.relativePath)

      if (!groups.has(groupKey)) {
        groups.set(groupKey, [])
      }

      groups.get(groupKey)?.push(entry)
    }

    return Array.from(groups.entries())
      .map(([key, groupedEntries]) => ({
        key,
        label: key === ROOT_GROUP ? 'Root' : key,
        entries: [...groupedEntries].sort((left, right) =>
          left.relativePath.localeCompare(right.relativePath),
        ),
      }))
      .sort((left, right) => left.label.localeCompare(right.label))
  }

  function filterDirectoryEntries(
    entries: DirectoryEntryResult[],
    statusFilters: EntryStatus[],
  ) {
    if (statusFilters.length === 0) {
      return entries
    }

    return entries.filter((entry) => statusFilters.includes(entry.status))
  }

  function reconcileCollapsedState(
    previousState: Record<string, boolean>,
    sections: FolderSection[],
  ) {
    const nextState: Record<string, boolean> = {}

    for (const section of sections) {
      nextState[section.key] = previousState[section.key] ?? false
    }

    return nextState
  }

  function syncFilteredDirectoryState(entries: DirectoryEntryResult[] = directoryEntries) {
    filteredDirectoryEntries = filterDirectoryEntries(entries, activeStatusFilters)
    filteredEntryGroups = buildGroups(filteredDirectoryEntries)

    if (filteredEntryGroups.length === 0) {
      folderSections = []
      collapsedGroups = {}
      return
    }

    const nextSections = buildFolderSections(filteredEntryGroups)
    folderSections = nextSections
    collapsedGroups = reconcileCollapsedState(collapsedGroups, nextSections)
  }

  async function toggleStatusFilter(status: EntryStatus) {
    activeStatusFilters = activeStatusFilters.includes(status)
      ? activeStatusFilters.filter((value) => value !== status)
      : [...activeStatusFilters, status]
    syncFilteredDirectoryState()

    if (mode !== 'directory' || screen !== 'compare') {
      return
    }

    if (filteredDirectoryEntries.some((entry) => entry.relativePath === selectedRelativePath)) {
      return
    }

    if (filteredDirectoryEntries.length > 0) {
      await selectEntry(filteredDirectoryEntries[0])
      return
    }

    selectedRelativePath = ''
    activeDiff = null
  }

  function toggleGroup(groupKey: string) {
    collapsedGroups = {
      ...collapsedGroups,
      [groupKey]: !collapsedGroups[groupKey],
    }
  }

  function getActiveDiffScrollContainer() {
    if (!activeDiff || activeDiff.contentKind !== 'text') {
      return null
    }

    return viewMode === 'sideBySide' ? leftPaneScroll : unifiedScroll
  }

  function getActiveDiffAnchors() {
    const container = getActiveDiffScrollContainer()

    if (!container) {
      return []
    }

    return Array.from(container.querySelectorAll<HTMLElement>('[data-diff-anchor="true"]'))
  }

  function getCurrentDiffHunkFromScroll(
    container: HTMLDivElement,
    anchors: HTMLElement[],
  ) {
    if (anchors.length === 0) {
      return -1
    }

    const threshold = container.getBoundingClientRect().top + 16
    let nextCurrentIndex = 0

    for (const [index, anchor] of anchors.entries()) {
      if (anchor.getBoundingClientRect().top <= threshold) {
        nextCurrentIndex = index
        continue
      }

      break
    }

    return nextCurrentIndex
  }

  function refreshDiffNavigationState() {
    const container = getActiveDiffScrollContainer()
    const anchors = getActiveDiffAnchors()

    if (!container || anchors.length === 0) {
      currentDiffHunk = -1
      return
    }

    currentDiffHunk = getCurrentDiffHunkFromScroll(container, anchors)
  }

  function scheduleDiffNavigationRefresh() {
    if (diffNavigationRefreshQueued) {
      return
    }

    diffNavigationRefreshQueued = true

    void tick().then(() => {
      diffNavigationRefreshQueued = false
      refreshDiffNavigationState()
    })
  }

  function scheduleScrollNavigationRefresh() {
    if (diffNavigationScrollFrame !== null) {
      return
    }

    diffNavigationScrollFrame = window.requestAnimationFrame(() => {
      diffNavigationScrollFrame = null
      refreshDiffNavigationState()
    })
  }

  function prefersReducedMotion() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false
    }

    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  function scrollDiffHunkIntoView(targetIndex: number) {
    const container = getActiveDiffScrollContainer()
    const anchors = getActiveDiffAnchors()
    const anchor = anchors[targetIndex]

    if (!container || !anchor) {
      return
    }

    const top =
      container.scrollTop +
      anchor.getBoundingClientRect().top -
      container.getBoundingClientRect().top -
      8

    currentDiffHunk = targetIndex
    container.scrollTo({
      top: Math.max(0, top),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }

  function goToPreviousDifference() {
    if (!canGoToPreviousDiff) {
      return
    }

    const targetIndex = Math.max(0, (currentDiffHunk === -1 ? 0 : currentDiffHunk) - 1)
    scrollDiffHunkIntoView(targetIndex)
  }

  function goToNextDifference() {
    if (!canGoToNextDiff) {
      return
    }

    const targetIndex = Math.min(
      visibleDiffHunkCount - 1,
      (currentDiffHunk === -1 ? 0 : currentDiffHunk) + 1,
    )
    scrollDiffHunkIntoView(targetIndex)
  }

  function getPaneScroll(side: 'left' | 'right') {
    return side === 'left' ? leftPaneScroll : rightPaneScroll
  }

  function getMaxScrollTop(element: HTMLDivElement) {
    return Math.max(0, element.scrollHeight - element.clientHeight)
  }

  function getMaxScrollLeft(element: HTMLDivElement) {
    return Math.max(0, element.scrollWidth - element.clientWidth)
  }

  function clampScrollOffset(nextValue: number, maxValue: number) {
    return Math.min(Math.max(nextValue, 0), maxValue)
  }

  function mapScrollOffset(
    sourceOffset: number,
    sourceMaxOffset: number,
    targetMaxOffset: number,
  ) {
    if (targetMaxOffset <= 0) {
      return 0
    }

    if (sourceMaxOffset <= 0) {
      return clampScrollOffset(sourceOffset, targetMaxOffset)
    }

    return clampScrollOffset((sourceOffset / sourceMaxOffset) * targetMaxOffset, targetMaxOffset)
  }

  function normalizeWheelDelta(delta: number, deltaMode: number) {
    if (deltaMode === WheelEvent.DOM_DELTA_LINE) {
      return delta * 16
    }

    if (deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      return delta * 100
    }

    return delta
  }

  function applyPaneScrollSync(source: 'left' | 'right') {
    const sourcePane = getPaneScroll(source)
    const targetSide = source === 'left' ? 'right' : 'left'
    const targetPane = getPaneScroll(targetSide)

    if (!sourcePane || !targetPane) {
      return
    }

    const nextTargetTop = mapScrollOffset(
      sourcePane.scrollTop,
      getMaxScrollTop(sourcePane),
      getMaxScrollTop(targetPane),
    )
    const nextTargetLeft = mapScrollOffset(
      sourcePane.scrollLeft,
      getMaxScrollLeft(sourcePane),
      getMaxScrollLeft(targetPane),
    )

    scrollEchoTarget = targetSide
    scrollEchoTop = nextTargetTop
    scrollEchoLeft = nextTargetLeft

    if (Math.abs(targetPane.scrollTop - nextTargetTop) >= 0.5) {
      targetPane.scrollTop = nextTargetTop
    }

    if (Math.abs(targetPane.scrollLeft - nextTargetLeft) >= 0.5) {
      targetPane.scrollLeft = nextTargetLeft
    }

    if (scrollEchoResetFrame !== null) {
      window.cancelAnimationFrame(scrollEchoResetFrame)
    }

    scrollEchoResetFrame = window.requestAnimationFrame(() => {
      scrollEchoResetFrame = null
      scrollEchoTarget = null
    })

    scheduleScrollNavigationRefresh()
  }

  function syncPaneWheel(event: WheelEvent, source: 'left' | 'right') {
    const sourcePane = getPaneScroll(source)

    if (!sourcePane || event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return
    }

    event.preventDefault()

    const nextSourceTop = clampScrollOffset(
      sourcePane.scrollTop + normalizeWheelDelta(event.deltaY, event.deltaMode),
      getMaxScrollTop(sourcePane),
    )

    if (Math.abs(nextSourceTop - sourcePane.scrollTop) < 0.5) {
      return
    }

    sourcePane.scrollTop = nextSourceTop
    applyPaneScrollSync(source)
  }

  function syncPaneScroll(source: 'left' | 'right') {
    const sourcePane = getPaneScroll(source)

    if (!sourcePane) {
      return
    }

    if (
      source === scrollEchoTarget &&
      Math.abs(sourcePane.scrollTop - scrollEchoTop) < 1 &&
      Math.abs(sourcePane.scrollLeft - scrollEchoLeft) < 1
    ) {
      scrollEchoTarget = null
      return
    }

    applyPaneScrollSync(source)
  }

  function buildNextHistoryState(
    pane: ExplorerPaneState,
    path: string,
    historyMode: 'push' | 'keep',
  ) {
    if (historyMode === 'keep') {
      return {
        history: pane.history,
        historyIndex: pane.historyIndex,
      }
    }

    const currentPath = pane.history[pane.historyIndex]

    if (currentPath === path) {
      return {
        history: pane.history,
        historyIndex: pane.historyIndex,
      }
    }

    const nextHistory = pane.history.slice(0, pane.historyIndex + 1)
    nextHistory.push(path)

    return {
      history: nextHistory,
      historyIndex: nextHistory.length - 1,
    }
  }

  function canGoBack(pane: ExplorerPaneState) {
    return pane.historyIndex > 0
  }

  function canGoForward(pane: ExplorerPaneState) {
    return pane.historyIndex !== -1 && pane.historyIndex < pane.history.length - 1
  }

  function currentDrive(pane: ExplorerPaneState) {
    const normalized = pane.currentPath.toLowerCase()

    return pane.roots.find((root) => normalized.startsWith(root.path.toLowerCase()))?.path ?? ''
  }

  function buildPersistedPane(pane: ExplorerPaneState): PersistedExplorerPane {
    return {
      currentPath: pane.currentPath,
      history: pane.history,
      historyIndex: pane.historyIndex,
      selectedTargetPath: pane.selectedTargetPath,
      selectedTargetKind: pane.selectedTargetKind,
    }
  }

  function buildPersistedSession(): PersistedSession {
    return {
      mode,
      viewMode,
      themeMode,
      ignoreWhitespace,
      ignoreCase,
      showFullFile,
      showInlineHighlights,
      leftPane: buildPersistedPane(leftExplorer),
      rightPane: buildPersistedPane(rightExplorer),
    }
  }

  function scheduleSessionSave() {
    if (!persistenceReady) {
      return
    }

    if (saveSessionTimer !== null) {
      window.clearTimeout(saveSessionTimer)
    }

    const session = buildPersistedSession()

    saveSessionTimer = window.setTimeout(() => {
      void saveSessionState(session).catch(() => undefined)
      saveSessionTimer = null
    }, SESSION_SAVE_DELAY_MS)
  }

  function isCurrentFolderSelected(pane: ExplorerPaneState) {
    return pane.selectedTargetKind === 'directory' && pane.selectedTargetPath === pane.currentPath
  }

  function isTargetSelected(pane: ExplorerPaneState, entry: ExplorerEntry) {
    return pane.selectedTargetPath === entry.path
  }

  function isStatusFilterActive(status: EntryStatus) {
    return activeStatusFilters.includes(status)
  }

  $: compareSummary =
    mode === 'directory'
      ? `${directoryEntries.length} difference${directoryEntries.length === 1 ? '' : 's'}`
      : activeDiff?.summary ?? 'File compare'

  $: if (activeDiff?.contentKind === 'text') {
    if (viewMode === 'sideBySide') {
      sideBySideHunkRanges = getCachedSideBySideHunks(activeDiff)
      sideBySideRenderItems = getCachedSideBySideRenderItems(activeDiff, showFullFile)
      unifiedHunkRanges = []
      unifiedRenderItems = []
    } else {
      unifiedHunkRanges = getCachedUnifiedHunks(activeDiff)
      unifiedRenderItems = getCachedUnifiedRenderItems(activeDiff, showFullFile)
      sideBySideHunkRanges = []
      sideBySideRenderItems = []
    }
  } else {
    sideBySideHunkRanges = []
    unifiedHunkRanges = []
    sideBySideRenderItems = []
    unifiedRenderItems = []
  }

  $: visibleDiffHunkCount =
    viewMode === 'sideBySide' ? sideBySideHunkRanges.length : unifiedHunkRanges.length

  $: canNavigateDiffs =
    !loading &&
    !detailLoading &&
    !pickerLoading &&
    activeDiff?.contentKind === 'text' &&
    visibleDiffHunkCount > 0

  $: canGoToPreviousDiff = canNavigateDiffs && Math.max(currentDiffHunk, 0) > 0

  $: canGoToNextDiff =
    canNavigateDiffs && Math.max(currentDiffHunk, 0) < visibleDiffHunkCount - 1

  $: themeToggleLabel = themeMode === 'dark' ? 'Light mode' : 'Dark mode'

  $: if (screen === 'compare') {
    activeDiff
    viewMode
    showFullFile
    sideBySideRenderItems
    unifiedRenderItems
    scheduleDiffNavigationRefresh()
  } else {
    currentDiffHunk = -1
  }

  $: if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = themeMode
  }

  $: if (persistenceReady) {
    mode
    viewMode
    themeMode
    ignoreWhitespace
    ignoreCase
    showFullFile
    showInlineHighlights
    leftExplorer.currentPath
    leftExplorer.selectedTargetPath
    leftExplorer.selectedTargetKind
    leftExplorer.history
    leftExplorer.historyIndex
    rightExplorer.currentPath
    rightExplorer.selectedTargetPath
    rightExplorer.selectedTargetKind
    rightExplorer.history
    rightExplorer.historyIndex
    scheduleSessionSave()
  }

  $: pickerCanCompare = canComparePane(leftExplorer) && canComparePane(rightExplorer)
  $: visibleFolderSections = getVisibleFolderSections(folderSections, collapsedGroups)
  $: pickerSides = [
    { side: 'left' as Side, pane: leftExplorer },
    { side: 'right' as Side, pane: rightExplorer },
  ]
  $: sameSelectionWarning =
    pickerCanCompare &&
    leftExplorer.selectedTargetKind === rightExplorer.selectedTargetKind &&
    leftExplorer.selectedTargetPath &&
    rightExplorer.selectedTargetPath &&
    normalizeSelectionPath(leftExplorer.selectedTargetPath) ===
      normalizeSelectionPath(rightExplorer.selectedTargetPath)
      ? `Both sides currently point to the same ${mode === 'directory' ? 'folder' : 'file'}. The compare will usually be empty.`
      : ''
  $: directoryStatusSummary = statusOrder
    .map((status) => ({
      status,
      label: statusLabel[status],
      count: directoryEntries.filter((entry) => entry.status === status).length,
    }))
    .filter((item) => item.count > 0)
</script>

<svelte:head>
  <title>Diffly</title>
</svelte:head>

{#if screen === 'setup'}
  <main class="screen setup-screen">
    <header class="app-bar">
      <div class="app-bar-main">
        <div class="app-identity">
          <h1>Diffly</h1>
          <span>{mode === 'directory' ? 'Directory workspace' : 'File workspace'}</span>
        </div>

        <div class="segmented-control">
          <button class:active={mode === 'file'} type="button" on:click={() => setMode('file')}>
            Files
          </button>
          <button
            class:active={mode === 'directory'}
            type="button"
            on:click={() => setMode('directory')}
          >
            Directories
          </button>
        </div>
      </div>

      <div class="app-bar-actions">
        <button
          class="secondary theme-toggle"
          aria-label={`Switch to ${themeMode === 'dark' ? 'light' : 'dark'} mode`}
          title={themeToggleLabel}
          type="button"
          on:click={toggleThemeMode}
        >
          {#if themeMode === 'dark'}
            <svg aria-hidden="true" class="theme-icon" viewBox="0 0 16 16">
              <path d="M8 3.2v-1.7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
              <path d="M8 14.5v-1.7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
              <path d="M12.1 8h1.7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
              <path d="M2.2 8h1.7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
              <path d="m11 5 1.2-1.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
              <path d="m3.8 12.2 1.2-1.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
              <path d="m11 11 1.2 1.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
              <path d="m3.8 3.8 1.2 1.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
              <circle cx="8" cy="8" r="2.6" fill="none" stroke="currentColor" stroke-width="1.4" />
            </svg>
          {:else}
            <svg aria-hidden="true" class="theme-icon theme-icon-moon" viewBox="0 0 16 16">
              <path
                d="M8.9 1.9a5.6 5.6 0 1 0 5.2 8.6 5.9 5.9 0 0 1-5.2-8.6Z"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.4"
              />
            </svg>
          {/if}
        </button>
        <button
          class="secondary"
          disabled={loading || detailLoading || pickerLoading}
          type="button"
          on:click={swapComparedSides}
        >
          Swap sides
        </button>
        <button class="primary" disabled={!pickerCanCompare || loading} type="button" on:click={runCompare}>
          {#if loading}
            Comparing...
          {:else}
            Compare
          {/if}
        </button>
      </div>
    </header>

    {#if errorMessage}
      <p class="error-banner">{errorMessage}</p>
    {/if}

    <section class="setup-body">
      <aside class="setup-sidebar">
        <section class="sidebar-panel">
          <h2>Selection</h2>
          <dl class="definition-list">
            <div>
              <dt>Mode</dt>
              <dd>{mode === 'directory' ? 'Compare folders' : 'Compare files'}</dd>
            </div>
            <div>
              <dt>Left</dt>
              <dd>{leftExplorer.selectedTargetPath || 'Nothing selected yet'}</dd>
            </div>
            <div>
              <dt>Right</dt>
              <dd>{rightExplorer.selectedTargetPath || 'Nothing selected yet'}</dd>
            </div>
          </dl>
        </section>

        <section class="sidebar-panel">
          <h2>Options</h2>
          <div class="stacked-actions">
            <button
              class:active={ignoreWhitespace}
              class="secondary"
              aria-pressed={ignoreWhitespace}
              type="button"
              on:click={toggleIgnoreWhitespace}
            >
              Ignore whitespace
            </button>
            <button
              class:active={ignoreCase}
              class="secondary"
              aria-pressed={ignoreCase}
              type="button"
              on:click={toggleIgnoreCase}
            >
              Ignore case
            </button>
          </div>
        </section>

        <section class="sidebar-panel">
          <h2>Workflow</h2>
          <p class="sidebar-note">
            {mode === 'directory'
              ? 'Open the folders you want, mark one target on each side, then run the compare.'
              : 'Open the parent folders, choose one file on each side, then run the compare.'}
          </p>
          {#if sameSelectionWarning}
            <div class="setup-warning">
              <strong>Heads up</strong>
              <span>{sameSelectionWarning}</span>
            </div>
          {/if}
        </section>
      </aside>

      <section class="picker-workspace">
        {#each pickerSides as item}
          <PickerPane
            side={item.side}
            pane={item.pane}
            {mode}
            {pickerLoading}
            {canGoBack}
            {canGoForward}
            {currentDrive}
            {formatModified}
            {formatSize}
            {entryTypeLabel}
            {changeDrive}
            {navigateHistory}
            {navigateTo}
            {updatePathInput}
            {submitPathInput}
            {browseSystem}
            {useCurrentFolder}
            {isCurrentFolderSelected}
            {selectListEntry}
            {activateListEntry}
            {isTargetSelected}
          />
        {/each}
      </section>
    </section>
  </main>
{:else}
  <main class="screen compare-screen">
    <header class="app-bar compare-bar">
      <div class="app-bar-main">
        <button class="secondary" type="button" on:click={goToSetup}>Setup</button>
        <div class="compare-summary">
          <strong>{compareSummary}</strong>
          <span>{mode === 'directory' ? 'Directory compare' : 'File compare'}</span>
        </div>
      </div>

      <div class="app-bar-actions compare-actions">
        <div class="compare-action-group utility-actions">
          <button
            class="secondary theme-toggle"
            aria-label={`Switch to ${themeMode === 'dark' ? 'light' : 'dark'} mode`}
            title={themeToggleLabel}
            type="button"
            on:click={toggleThemeMode}
          >
            {#if themeMode === 'dark'}
              <svg aria-hidden="true" class="theme-icon" viewBox="0 0 16 16">
                <path d="M8 3.2v-1.7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
                <path d="M8 14.5v-1.7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
                <path d="M12.1 8h1.7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
                <path d="M2.2 8h1.7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
                <path d="m11 5 1.2-1.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
                <path d="m3.8 12.2 1.2-1.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
                <path d="m11 11 1.2 1.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
                <path d="m3.8 3.8 1.2 1.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
                <circle cx="8" cy="8" r="2.6" fill="none" stroke="currentColor" stroke-width="1.4" />
              </svg>
            {:else}
              <svg aria-hidden="true" class="theme-icon theme-icon-moon" viewBox="0 0 16 16">
                <path
                  d="M8.9 1.9a5.6 5.6 0 1 0 5.2 8.6 5.9 5.9 0 0 1-5.2-8.6Z"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.4"
                />
              </svg>
            {/if}
          </button>
        </div>

        <div class="compare-action-group diff-nav-actions">
          <button
            class="secondary"
            aria-label="Jump to the previous difference"
            disabled={!canGoToPreviousDiff}
            title="Jump to the previous difference"
            type="button"
            on:click={goToPreviousDifference}
          >
            Previous difference
          </button>
          <button
            class="secondary"
            aria-label="Jump to the next difference"
            disabled={!canGoToNextDiff}
            title="Jump to the next difference"
            type="button"
            on:click={goToNextDifference}
          >
            Next difference
          </button>
        </div>

        <div class="compare-action-group display-actions">
          <button class:active={viewMode === 'unified'} class="secondary" type="button" on:click={toggleViewMode}>
            {viewMode === 'sideBySide' ? 'Unified view' : 'Side by side'}
          </button>

          <div class="inline-actions">
            <button
              class:active={showFullFile}
              class="secondary"
              type="button"
              on:click={() => (showFullFile = !showFullFile)}
            >
              Full file
            </button>
            <button
              class:active={showInlineHighlights}
              class="secondary"
              type="button"
              on:click={() => (showInlineHighlights = !showInlineHighlights)}
            >
              Inline highlights
            </button>
            <button
              class:active={ignoreWhitespace}
              class="secondary"
              aria-pressed={ignoreWhitespace}
              type="button"
              on:click={toggleIgnoreWhitespace}
            >
              Ignore whitespace
            </button>
            <button
              class:active={ignoreCase}
              class="secondary"
              aria-pressed={ignoreCase}
              type="button"
              on:click={toggleIgnoreCase}
            >
              Ignore case
            </button>
          </div>
        </div>

        <div class="compare-action-group utility-actions">
          <button
            class="secondary swap-button"
            aria-label="Switch left and right sides"
            disabled={loading || detailLoading || pickerLoading}
            title="Switch left and right sides"
            type="button"
            on:click={swapComparedSides}
          >
            <svg aria-hidden="true" class="swap-icon" viewBox="0 0 16 16">
              <path d="M2.5 5h8.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6" />
              <path d="m8.5 2 3 3-3 3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" />
              <path d="M13.5 11H5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6" />
              <path d="m7.5 8-3 3 3 3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" />
            </svg>
            <span>Swap sides</span>
          </button>

          <button
            aria-label="Refresh compare"
            aria-busy={loading}
            class="refresh-button"
            title="Refresh compare"
            type="button"
            disabled={loading}
            on:click={runCompare}
          >
            <span class="refresh-icon-slot" aria-hidden="true">
              {#if loading}
                <span class="refresh-spinner visible"></span>
              {:else}
                <svg class="refresh-icon" viewBox="0 0 16 16">
                  <path
                    d="M13 5.5V2.8L11.3 4.5A5.4 5.4 0 0 0 2.8 6.3"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                  />
                  <path
                    d="M3 10.5v2.7l1.7-1.7A5.4 5.4 0 0 0 13.2 9.7"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                  />
                </svg>
              {/if}
            </span>
          </button>
        </div>
      </div>
    </header>

    {#if errorMessage}
      <p class="error-banner">{errorMessage}</p>
    {/if}

    <section class:refreshing={loading} class="compare-context">
      <div class="context-card compact">
        <span>Left</span>
        <strong>{leftPath}</strong>
      </div>
      <div class="context-card compact">
        <span>Right</span>
        <strong>{rightPath}</strong>
      </div>
    </section>

    <section class:single-pane={mode === 'file'} class="compare-layout">
      {#if mode === 'directory'}
        <DirectoryBrowser
          {loading}
          {activeStatusFilters}
          {filteredDirectoryEntries}
          {directoryEntries}
          {directoryStatusSummary}
          {visibleFolderSections}
          {collapsedGroups}
          {selectedRelativePath}
          {statusLabel}
          {isStatusFilterActive}
          {toggleStatusFilter}
          {toggleGroup}
          {selectEntry}
          {getFileName}
          {formatSize}
        />
      {/if}

      <DiffViewer
        {activeDiff}
        {loading}
        {detailLoading}
        {viewMode}
        {currentDiffHunk}
        {showInlineHighlights}
        {sideBySideRenderItems}
        {unifiedRenderItems}
        {getFileName}
        {syncPaneWheel}
        {syncPaneScroll}
        {refreshDiffNavigationState}
        bind:leftPaneScroll
        bind:rightPaneScroll
        bind:unifiedScroll
      />
    </section>
  </main>
{/if}

