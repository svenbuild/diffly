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
    formatCompactPath,
    formatRelativePathLabel,
    getFileName,
    getParentPath,
    getVisibleFolderSections,
    normalizeSelectionPath,
    ROOT_GROUP,
    splitCommonPathPrefix,
  } from './lib/path-utils'
  import type {
    CompareMode,
    ContextLinesSetting,
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
    DiffHeaderContext,
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
  const FULL_FILE_NAVIGATION_REFRESH_DELAY_MS = 140
  const COMPARE_OPTIONS_POPOVER_ID = 'compare-options-popover'
  const DEFAULT_CONTEXT_LINES: ContextLinesSetting = 3
  const contextLinePresets: ContextLinesSetting[] = [3, 10, 20]

  type Screen = 'setup' | 'compare'

  interface CachedDiffRenderState {
    sideBySideHunks: Map<ContextLinesSetting, DiffHunkRange[]>
    unifiedHunks: Map<ContextLinesSetting, DiffHunkRange[]>
    sideBySideItems: Map<string, SideBySideRenderItem[]>
    unifiedItems: Map<string, UnifiedRenderItem[]>
  }

  interface CompareRootDisplay {
    prefix: string
    suffix: string
    fullPath: string
  }

  let screen: Screen = 'setup'
  let mode: CompareMode = 'directory'
  let viewMode: ViewMode = 'sideBySide'
  let themeMode: ThemeMode = 'dark'
  let showFullFile = false
  let showInlineHighlights = true
  let wrapSideBySideLines = false
  let showSyntaxHighlighting = true
  let syncSideBySideScroll = true
  let contextLines: ContextLinesSetting = DEFAULT_CONTEXT_LINES
  let compareOptionsOpen = false
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
  let compareOptionsTrigger: HTMLButtonElement | null = null
  let compareOptionsPopover: HTMLDivElement | null = null
  let compareOptionsFirstControl: HTMLInputElement | null = null
  let selectedRelativePath = ''
  let activeDiff: FileDiffResult | null = null
  let compareRevision = 0
  let scrollEchoTarget: 'left' | 'right' | null = null
  let scrollEchoTop = 0
  let scrollEchoLeft = 0
  let scrollEchoResetFrame: number | null = null
  let paneNavigationScrollFrame: number | null = null
  let paneNavigationSyncActive = false
  let paneWheelScrollFrame: number | null = null
  let paneWheelScrollSource: 'left' | 'right' | null = null
  let paneWheelScrollTargetTop = 0
  let diffNavigationRefreshQueued = false
  let diffNavigationScrollFrame: number | null = null
  let diffNavigationIdleTimer: number | null = null
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
  let leftCompareRoot: CompareRootDisplay = {
    prefix: '',
    suffix: '',
    fullPath: '',
  }
  let rightCompareRoot: CompareRootDisplay = {
    prefix: '',
    suffix: '',
    fullPath: '',
  }
  let diffHeaderContext: DiffHeaderContext = {
    currentFileLabel: '',
    leftPaneLabel: '',
    rightPaneLabel: '',
    leftAbsolutePath: '',
    rightAbsolutePath: '',
    leftRootLabel: '',
    rightRootLabel: '',
    leftRootFullPath: '',
    rightRootFullPath: '',
  }
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

  const toggleSyncSideBySideScroll = () => {
    syncSideBySideScroll = !syncSideBySideScroll

    if (!syncSideBySideScroll) {
      cancelPaneNavigationScroll()
      cancelPaneWheelScroll()
    }
  }

  const toggleCompareOptions = () => {
    if (compareOptionsOpen) {
      closeCompareOptions()
      return
    }

    void openCompareOptions()
  }

  onMount(() => {
    void initializePickers()

    return () => {
      detachCompareOptionsListeners()

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

      if (paneNavigationScrollFrame !== null) {
        window.cancelAnimationFrame(paneNavigationScrollFrame)
      }

      if (paneWheelScrollFrame !== null) {
        window.cancelAnimationFrame(paneWheelScrollFrame)
      }

      if (diffNavigationScrollFrame !== null) {
        window.cancelAnimationFrame(diffNavigationScrollFrame)
      }

      if (diffNavigationIdleTimer !== null) {
        window.clearTimeout(diffNavigationIdleTimer)
      }
    }
  })

  function isContextLinesSetting(value: number): value is ContextLinesSetting {
    return contextLinePresets.includes(value as ContextLinesSetting)
  }

  function applyContextLines(value: string) {
    const nextValue = Number(value)

    if (isContextLinesSetting(nextValue)) {
      contextLines = nextValue
    }
  }

  function handleCompareOptionsPointerDown(event: PointerEvent) {
    const target = event.target

    if (!(target instanceof Node)) {
      return
    }

    if (
      compareOptionsTrigger?.contains(target) ||
      compareOptionsPopover?.contains(target)
    ) {
      return
    }

    closeCompareOptions(false)
  }

  function handleCompareOptionsKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') {
      return
    }

    event.preventDefault()
    closeCompareOptions()
  }

  function attachCompareOptionsListeners() {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return
    }

    document.addEventListener('pointerdown', handleCompareOptionsPointerDown, true)
    window.addEventListener('keydown', handleCompareOptionsKeydown)
  }

  function detachCompareOptionsListeners() {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return
    }

    document.removeEventListener('pointerdown', handleCompareOptionsPointerDown, true)
    window.removeEventListener('keydown', handleCompareOptionsKeydown)
  }

  async function openCompareOptions() {
    compareOptionsOpen = true
    attachCompareOptionsListeners()
    await tick()
    compareOptionsFirstControl?.focus()
  }

  function closeCompareOptions(restoreFocus = true) {
    if (!compareOptionsOpen) {
      return
    }

    compareOptionsOpen = false
    detachCompareOptionsListeners()

    if (restoreFocus) {
      compareOptionsTrigger?.focus()
    }
  }

  function getCachedDiffRenderState(diff: FileDiffResult) {
    const cached = diffRenderCache.get(diff)

    if (cached) {
      return cached
    }

    const state: CachedDiffRenderState = {
      sideBySideHunks: new Map(),
      unifiedHunks: new Map(),
      sideBySideItems: new Map(),
      unifiedItems: new Map(),
    }

    diffRenderCache.set(diff, state)
    return state
  }

  function getRenderItemsCacheKey(
    nextContextLines: ContextLinesSetting,
    includeFullFile: boolean,
  ) {
    return `${nextContextLines}:${includeFullFile ? 'full' : 'hunks'}`
  }

  function getCachedSideBySideHunks(diff: FileDiffResult, nextContextLines: ContextLinesSetting) {
    const state = getCachedDiffRenderState(diff)
    const cached = state.sideBySideHunks.get(nextContextLines)

    if (cached) {
      return cached
    }

    const hunks = buildSideBySideHunkRanges(diff.sideBySide, nextContextLines)
    state.sideBySideHunks.set(nextContextLines, hunks)
    return hunks
  }

  function getCachedUnifiedHunks(diff: FileDiffResult, nextContextLines: ContextLinesSetting) {
    const state = getCachedDiffRenderState(diff)
    const cached = state.unifiedHunks.get(nextContextLines)

    if (cached) {
      return cached
    }

    const hunks = buildUnifiedHunkRanges(diff.unified, nextContextLines)
    state.unifiedHunks.set(nextContextLines, hunks)
    return hunks
  }

  function getCachedSideBySideRenderItems(
    diff: FileDiffResult,
    includeFullFile: boolean,
    nextContextLines: ContextLinesSetting,
  ) {
    const state = getCachedDiffRenderState(diff)
    const cacheKey = getRenderItemsCacheKey(nextContextLines, includeFullFile)
    const cached = state.sideBySideItems.get(cacheKey)

    if (cached) {
      return cached
    }

    const items = buildSideBySideRenderItems(
      diff.sideBySide,
      getCachedSideBySideHunks(diff, nextContextLines),
      includeFullFile,
    )

    state.sideBySideItems.set(cacheKey, items)
    return items
  }

  function getCachedUnifiedRenderItems(
    diff: FileDiffResult,
    includeFullFile: boolean,
    nextContextLines: ContextLinesSetting,
  ) {
    const state = getCachedDiffRenderState(diff)
    const cacheKey = getRenderItemsCacheKey(nextContextLines, includeFullFile)
    const cached = state.unifiedItems.get(cacheKey)

    if (cached) {
      return cached
    }

    const items = buildUnifiedRenderItems(
      diff.unified,
      getCachedUnifiedHunks(diff, nextContextLines),
      includeFullFile,
    )

    state.unifiedItems.set(cacheKey, items)
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
    wrapSideBySideLines = session.wrapSideBySideLines ?? false
    showSyntaxHighlighting = session.showSyntaxHighlighting ?? true
    syncSideBySideScroll = session.syncSideBySideScroll ?? true

    const nextContextLines = session.contextLines ?? DEFAULT_CONTEXT_LINES
    contextLines = isContextLinesSetting(nextContextLines)
      ? nextContextLines
      : DEFAULT_CONTEXT_LINES
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
    closeCompareOptions(false)
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

  function formatPickerTargetLabel(path: string, emptyLabel: string) {
    if (!path) {
      return emptyLabel
    }

    const label = getFileName(path)
    return label || formatCompactPath(path, 2) || path
  }

  async function runCompare() {
    if (!canComparePane(leftExplorer) || !canComparePane(rightExplorer)) {
      errorMessage = 'Select valid targets on both sides first.'
      return
    }

    const nextLeftPath = leftExplorer.selectedTargetPath
    const nextRightPath = rightExplorer.selectedTargetPath

    loading = true
    detailLoading = false
    errorMessage = ''
    closeCompareOptions(false)
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
          await selectEntry(defaultDirectoryEntry(filteredDirectoryEntries), compareRevision)
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

  function defaultDirectoryEntry(entries: DirectoryEntryResult[]) {
    return entries.find((entry) => getParentPath(entry.relativePath) === ROOT_GROUP) ?? entries[0]
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
      await selectEntry(defaultDirectoryEntry(filteredDirectoryEntries))
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
    if (showFullFile) {
      if (diffNavigationIdleTimer !== null) {
        window.clearTimeout(diffNavigationIdleTimer)
      }

      diffNavigationIdleTimer = window.setTimeout(() => {
        diffNavigationIdleTimer = null
        refreshDiffNavigationState()
      }, FULL_FILE_NAVIGATION_REFRESH_DELAY_MS)

      return
    }

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

  function cancelPaneNavigationScroll() {
    paneNavigationSyncActive = false
    scrollEchoTarget = null

    if (paneNavigationScrollFrame !== null) {
      window.cancelAnimationFrame(paneNavigationScrollFrame)
      paneNavigationScrollFrame = null
    }
  }

  function cancelPaneWheelScroll() {
    paneWheelScrollSource = null

    if (paneWheelScrollFrame !== null) {
      window.cancelAnimationFrame(paneWheelScrollFrame)
      paneWheelScrollFrame = null
    }
  }

  function getScrollTopForAnchor(container: HTMLDivElement, anchor: HTMLElement) {
    return clampScrollOffset(
      container.scrollTop + anchor.getBoundingClientRect().top - container.getBoundingClientRect().top - 8,
      getMaxScrollTop(container),
    )
  }

  function getSideBySideDiffAnchorPair(targetIndex: number) {
    if (!leftPaneScroll || !rightPaneScroll) {
      return null
    }

    const selector = `[data-diff-anchor="true"][data-diff-index="${targetIndex}"]`
    const leftAnchor = leftPaneScroll.querySelector<HTMLElement>(selector)
    const rightAnchor = rightPaneScroll.querySelector<HTMLElement>(selector)

    if (!leftAnchor || !rightAnchor) {
      return null
    }

    return {
      leftAnchor,
      rightAnchor,
    }
  }

  function scrollSideBySidePanes(
    leftTop: number,
    rightTop: number,
    behavior: ScrollBehavior,
  ) {
    if (!leftPaneScroll || !rightPaneScroll) {
      return
    }

    cancelPaneNavigationScroll()
    cancelPaneWheelScroll()

    const nextLeftTop = clampScrollOffset(leftTop, getMaxScrollTop(leftPaneScroll))
    const nextRightTop = clampScrollOffset(rightTop, getMaxScrollTop(rightPaneScroll))

    if (behavior === 'auto') {
      leftPaneScroll.scrollTop = nextLeftTop
      rightPaneScroll.scrollTop = nextRightTop
      scheduleScrollNavigationRefresh()
      return
    }

    const startLeftTop = leftPaneScroll.scrollTop
    const startRightTop = rightPaneScroll.scrollTop

    if (
      Math.abs(nextLeftTop - startLeftTop) < 0.5 &&
      Math.abs(nextRightTop - startRightTop) < 0.5
    ) {
      scheduleScrollNavigationRefresh()
      return
    }

    const distance = Math.max(
      Math.abs(nextLeftTop - startLeftTop),
      Math.abs(nextRightTop - startRightTop),
    )
    const duration = Math.min(220, Math.max(120, distance * 0.18))
    const startTime = window.performance.now()
    paneNavigationSyncActive = true

    const animate = (timestamp: number) => {
      if (!leftPaneScroll || !rightPaneScroll) {
        cancelPaneNavigationScroll()
        return
      }

      const progress = Math.min((timestamp - startTime) / duration, 1)
      const easedProgress = 1 - Math.pow(1 - progress, 3)

      leftPaneScroll.scrollTop = startLeftTop + (nextLeftTop - startLeftTop) * easedProgress
      rightPaneScroll.scrollTop = startRightTop + (nextRightTop - startRightTop) * easedProgress

      scheduleScrollNavigationRefresh()

      if (progress >= 1) {
        leftPaneScroll.scrollTop = nextLeftTop
        rightPaneScroll.scrollTop = nextRightTop
        paneNavigationScrollFrame = null
        paneNavigationSyncActive = false
        scheduleScrollNavigationRefresh()
        return
      }

      paneNavigationScrollFrame = window.requestAnimationFrame(animate)
    }

    paneNavigationScrollFrame = window.requestAnimationFrame(animate)
  }

  function scrollDiffHunkIntoView(targetIndex: number) {
    const container = getActiveDiffScrollContainer()
    const anchors = getActiveDiffAnchors()
    const anchor = anchors[targetIndex]

    if (!container || !anchor) {
      return
    }

    currentDiffHunk = targetIndex
    const behavior = prefersReducedMotion() ? 'auto' : 'smooth'

    if (viewMode === 'sideBySide') {
      const anchorPair = getSideBySideDiffAnchorPair(targetIndex)

      if (anchorPair && leftPaneScroll && rightPaneScroll) {
        scrollSideBySidePanes(
          getScrollTopForAnchor(leftPaneScroll, anchorPair.leftAnchor),
          getScrollTopForAnchor(rightPaneScroll, anchorPair.rightAnchor),
          behavior,
        )
        return
      }

      const nextLeftTop = getScrollTopForAnchor(container, anchor)
      scrollSideBySidePanes(
        nextLeftTop,
        mapScrollOffset(
          nextLeftTop,
          getMaxScrollTop(container),
          getMaxScrollTop(rightPaneScroll ?? container),
        ),
        behavior,
      )
      return
    }

    container.scrollTo({
      top: getScrollTopForAnchor(container, anchor),
      behavior,
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

    if (!syncSideBySideScroll) {
      if (source === 'left') {
        scheduleScrollNavigationRefresh()
      }

      return
    }

    cancelPaneNavigationScroll()
    event.preventDefault()

    const deltaTop = normalizeWheelDelta(event.deltaY, event.deltaMode)
    const maxScrollTop = getMaxScrollTop(sourcePane)

    if (paneWheelScrollSource && paneWheelScrollSource !== source) {
      cancelPaneWheelScroll()
    }

    const baseTop =
      paneWheelScrollSource === source ? paneWheelScrollTargetTop : sourcePane.scrollTop
    const nextSourceTop = clampScrollOffset(baseTop + deltaTop, maxScrollTop)

    if (Math.abs(nextSourceTop - baseTop) < 0.5) {
      return
    }

    paneWheelScrollSource = source
    paneWheelScrollTargetTop = nextSourceTop

    if (paneWheelScrollFrame !== null) {
      return
    }

    const animate = () => {
      const activePane = getPaneScroll(source)

      if (!activePane || paneWheelScrollSource !== source) {
        cancelPaneWheelScroll()
        return
      }

      const remaining = paneWheelScrollTargetTop - activePane.scrollTop

      if (Math.abs(remaining) < 0.5) {
        activePane.scrollTop = paneWheelScrollTargetTop
        applyPaneScrollSync(source)
        cancelPaneWheelScroll()
        return
      }

      activePane.scrollTop += remaining * 0.28
      applyPaneScrollSync(source)
      paneWheelScrollFrame = window.requestAnimationFrame(animate)
    }

    paneWheelScrollFrame = window.requestAnimationFrame(animate)
  }

  function syncPaneScroll(source: 'left' | 'right') {
    const sourcePane = getPaneScroll(source)

    if (!sourcePane) {
      return
    }

    if (!syncSideBySideScroll) {
      if (source === 'left') {
        scheduleScrollNavigationRefresh()
      }

      return
    }

    if (paneNavigationSyncActive) {
      scheduleScrollNavigationRefresh()
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
      wrapSideBySideLines,
      showSyntaxHighlighting,
      syncSideBySideScroll,
      contextLines,
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

  function buildCompareRootDisplay(fullPath: string, distinctSegments: string[]): CompareRootDisplay {
    if (!fullPath) {
      return {
        prefix: '',
        suffix: '',
        fullPath: '',
      }
    }

    const distinctPath = distinctSegments.join('/')
    const suffix = distinctPath ? formatCompactPath(distinctPath, 3) : formatCompactPath(fullPath, 3)
    const prefix = distinctPath && suffix && !suffix.startsWith('...') ? '...\\' : ''

    return {
      prefix,
      suffix: suffix || formatCompactPath(fullPath, 3),
      fullPath,
    }
  }

  function getCurrentFileLabel() {
    if (mode === 'directory') {
      return selectedRelativePath ? formatRelativePathLabel(selectedRelativePath) : 'No file selected'
    }

    if (!activeDiff) {
      return 'No file selected'
    }

    const leftName = getFileName(activeDiff.leftLabel)
    const rightName = getFileName(activeDiff.rightLabel)

    return leftName === rightName ? leftName : `${leftName} <-> ${rightName}`
  }

  function getPaneLabel(side: Side) {
    if (mode === 'directory') {
      return selectedRelativePath ? formatRelativePathLabel(selectedRelativePath) : ''
    }

    if (!activeDiff) {
      return ''
    }

    return getFileName(side === 'left' ? activeDiff.leftLabel : activeDiff.rightLabel)
  }

  $: {
    const { leftSegments, rightSegments } = splitCommonPathPrefix(leftPath, rightPath)
    leftCompareRoot = buildCompareRootDisplay(leftPath, leftSegments)
    rightCompareRoot = buildCompareRootDisplay(rightPath, rightSegments)
  }

  $: diffHeaderContext = {
    currentFileLabel: getCurrentFileLabel(),
    leftPaneLabel: getPaneLabel('left'),
    rightPaneLabel: getPaneLabel('right'),
    leftAbsolutePath: activeDiff?.leftLabel ?? '',
    rightAbsolutePath: activeDiff?.rightLabel ?? '',
    leftRootLabel: `${leftCompareRoot.prefix}${leftCompareRoot.suffix}`,
    rightRootLabel: `${rightCompareRoot.prefix}${rightCompareRoot.suffix}`,
    leftRootFullPath: leftCompareRoot.fullPath,
    rightRootFullPath: rightCompareRoot.fullPath,
  }

  $: if (activeDiff?.contentKind === 'text') {
    if (viewMode === 'sideBySide') {
      sideBySideHunkRanges = getCachedSideBySideHunks(activeDiff, contextLines)
      sideBySideRenderItems = getCachedSideBySideRenderItems(activeDiff, showFullFile, contextLines)
      unifiedHunkRanges = []
      unifiedRenderItems = []
    } else {
      unifiedHunkRanges = getCachedUnifiedHunks(activeDiff, contextLines)
      unifiedRenderItems = getCachedUnifiedRenderItems(activeDiff, showFullFile, contextLines)
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
    contextLines
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
    wrapSideBySideLines
    showSyntaxHighlighting
    syncSideBySideScroll
    contextLines
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
  $: leftPickerReady = canComparePane(leftExplorer)
  $: rightPickerReady = canComparePane(rightExplorer)
  $: setupHintMessage = pickerCanCompare
    ? ''
    : !leftPickerReady && !rightPickerReady
      ? `Select ${mode === 'directory' ? 'left and right folders' : 'left and right files'}.`
      : !leftPickerReady
        ? `Select the left ${mode === 'directory' ? 'folder' : 'file'}.`
        : `Select the right ${mode === 'directory' ? 'folder' : 'file'}.`
  $: leftSetupTargetLabel = formatPickerTargetLabel(leftExplorer.selectedTargetPath, 'Not selected')
  $: rightSetupTargetLabel = formatPickerTargetLabel(rightExplorer.selectedTargetPath, 'Not selected')
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
          <span>Setup</span>
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

        <div class="setup-selection-summary">
          <span>Selected:</span>
          <strong title={leftExplorer.selectedTargetPath || 'Left target not selected'}>
            L {leftSetupTargetLabel}
          </strong>
          <strong title={rightExplorer.selectedTargetPath || 'Right target not selected'}>
            R {rightSetupTargetLabel}
          </strong>
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
          class="secondary icon-button swap-button"
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
        </button>
        <button
          class="primary"
          disabled={!pickerCanCompare || loading}
          title={sameSelectionWarning || setupHintMessage || 'Compare selected targets'}
          type="button"
          on:click={runCompare}
        >
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
            setCurrentFolderAsTarget={useCurrentFolder}
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
      <div class="app-bar-main compare-bar-main">
        <div class="compare-bar-brand">
          <div class="app-identity">
            <h1>Diffly</h1>
            <span>Compare</span>
          </div>
        </div>
      </div>

      <div class="app-bar-actions compare-actions">
        <div class="compare-action-group diff-nav-actions">
          <button
            class="secondary nav-button"
            aria-label="Jump to the previous difference"
            disabled={!canGoToPreviousDiff}
            title="Jump to the previous difference"
            type="button"
            on:click={goToPreviousDifference}
          >
            <svg aria-hidden="true" class="nav-button-icon" viewBox="0 0 16 16">
              <path
                d="M9.8 3.2 5.4 8l4.4 4.8"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.7"
              />
            </svg>
            <span>Prev</span>
          </button>
          <button
            class="secondary nav-button"
            aria-label="Jump to the next difference"
            disabled={!canGoToNextDiff}
            title="Jump to the next difference"
            type="button"
            on:click={goToNextDifference}
          >
            <span>Next</span>
            <svg aria-hidden="true" class="nav-button-icon" viewBox="0 0 16 16">
              <path
                d="M6.2 3.2 10.6 8l-4.4 4.8"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.7"
              />
            </svg>
          </button>
        </div>

        <div class="compare-action-group display-actions">
          <button
            class="secondary view-mode-button"
            type="button"
            on:click={toggleViewMode}
          >
            <svg aria-hidden="true" class="view-mode-icon" viewBox="0 0 16 16">
              {#if viewMode === 'sideBySide'}
                <rect x="2.5" y="3" width="11" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3" />
                <path d="M4.8 5.5h6.4M4.8 8h6.4M4.8 10.5h4.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.3" />
              {:else}
                <rect x="2.5" y="3" width="4.2" height="10" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3" />
                <rect x="9.3" y="3" width="4.2" height="10" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3" />
              {/if}
            </svg>
            <span class="view-mode-button-label">
              {viewMode === 'sideBySide' ? 'Unified view' : 'Split view'}
            </span>
          </button>

          <div class="compare-options-anchor">
            <button
              bind:this={compareOptionsTrigger}
              aria-controls={COMPARE_OPTIONS_POPOVER_ID}
              aria-expanded={compareOptionsOpen}
              aria-label="Compare options"
              class:active={compareOptionsOpen}
              class="secondary compare-options-toggle"
              title="Compare options"
              type="button"
              on:click={toggleCompareOptions}
            >
              <svg aria-hidden="true" class="compare-options-icon" viewBox="0 0 16 16">
                <path
                  d="M3 4h5.4"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-width="1.4"
                />
                <path
                  d="M9.8 4H13"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-width="1.4"
                />
                <path
                  d="M3 8h2.2"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-width="1.4"
                />
                <path
                  d="M7.6 8H13"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-width="1.4"
                />
                <path
                  d="M3 12h6"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-width="1.4"
                />
                <path
                  d="M11.4 12H13"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-width="1.4"
                />
                <circle cx="7.1" cy="4" r="1.3" fill="none" stroke="currentColor" stroke-width="1.4" />
                <circle cx="6.4" cy="8" r="1.3" fill="none" stroke="currentColor" stroke-width="1.4" />
                <circle cx="10.1" cy="12" r="1.3" fill="none" stroke="currentColor" stroke-width="1.4" />
              </svg>
            </button>

            {#if compareOptionsOpen}
              <div
                bind:this={compareOptionsPopover}
                aria-label="Compare options"
                class="compare-options-popover"
                id={COMPARE_OPTIONS_POPOVER_ID}
                role="dialog"
              >
                <label class="compare-options-row">
                  <span>Full file</span>
                  <input bind:this={compareOptionsFirstControl} bind:checked={showFullFile} type="checkbox" />
                </label>

                <label class:disabled={showFullFile} class="compare-options-row compare-options-select-row">
                  <span>Context lines</span>
                  <select
                    disabled={showFullFile}
                    value={contextLines}
                    on:change={(event) =>
                      applyContextLines((event.currentTarget as HTMLSelectElement).value)}
                  >
                    {#each contextLinePresets as preset}
                      <option value={preset}>{preset}</option>
                    {/each}
                  </select>
                </label>

                <label class="compare-options-row">
                  <span>Wrap long lines</span>
                  <input bind:checked={wrapSideBySideLines} type="checkbox" />
                </label>

                <label class="compare-options-row">
                  <span>Inline highlights</span>
                  <input bind:checked={showInlineHighlights} type="checkbox" />
                </label>

                <label class="compare-options-row">
                  <span>Syntax highlighting</span>
                  <input bind:checked={showSyntaxHighlighting} type="checkbox" />
                </label>

                <label class="compare-options-row">
                  <span>Sync scrolling</span>
                  <input checked={syncSideBySideScroll} type="checkbox" on:change={toggleSyncSideBySideScroll} />
                </label>

                <div class="compare-options-divider"></div>

                <label class="compare-options-row">
                  <span>Ignore whitespace</span>
                  <input checked={ignoreWhitespace} type="checkbox" on:change={toggleIgnoreWhitespace} />
                </label>

                <label class="compare-options-row">
                  <span>Ignore case</span>
                  <input checked={ignoreCase} type="checkbox" on:change={toggleIgnoreCase} />
                </label>
              </div>
            {/if}
          </div>
        </div>

        <div class="compare-action-group utility-actions">
          <button
            class="secondary icon-button swap-button"
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
          <button class="primary" type="button" on:click={goToSetup}>Setup</button>
        </div>
      </div>
    </header>

    {#if errorMessage}
      <p class="error-banner">{errorMessage}</p>
    {/if}

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
        {wrapSideBySideLines}
        {showSyntaxHighlighting}
        {syncSideBySideScroll}
        {sideBySideRenderItems}
        {unifiedRenderItems}
        {diffHeaderContext}
        {syncPaneWheel}
        {syncPaneScroll}
        {scheduleScrollNavigationRefresh}
        bind:leftPaneScroll
        bind:rightPaneScroll
        bind:unifiedScroll
      />
    </section>
  </main>
{/if}

