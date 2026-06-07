<script lang="ts">
  import { onMount, tick } from 'svelte'
  import CompareScreen from './lib/screens/CompareScreen.svelte'
  import SettingsRoute from './lib/screens/SettingsRoute.svelte'
  import SetupScreen from './lib/screens/SetupScreen.svelte'

  import {
    choosePath,
    checkForUpdates,
    comparePaths,
    cancelDirectoryCompare,
    downloadUpdate,
    getAppVersion,
    installUpdate,
    listDirectory,
    listRoots,
    loadSessionState,
    onLaunchContext,
    openCompareItem,
    pollDirectoryCompare,
    pathInfo,
    saveSessionState,
    startDirectoryCompare,
  } from './lib/api'
  import {
    buildCompareRootDisplay,
    directoryCompareEntryLabel,
    fileCompareLabel,
    filePaneLabel,
    type CompareRootDisplay,
  } from './lib/app/compare-display'
  import {
    DEFAULT_COMPARE_SIDEBAR_WIDTH,
    createCompareSidebarResizeController,
  } from './lib/app/compare-sidebar-resize'
  import { createDiffCacheController } from './lib/app/diff-cache'
  import {
    buildDirectoryComparePairs,
    findDirectoryComparePairForPath as findDirectoryComparePairInList,
    prefixedRelativePathFor as prefixedRelativePathForPair,
    type DirectoryComparePair,
  } from './lib/app/directory-compare-pairs'
  import {
    createUpdateController,
    formatUpdateChannelLabel,
    getUpdateIndicatorTitle,
    shouldShowUpdateIndicator as shouldShowUpdateIndicatorState,
    type UpdateIndicatorState,
    type UpdateStatus,
  } from './lib/app/update-controller'
  import {
    isLaunchContext,
    installE2EHarness,
    readE2ECompareTarget,
    readStartupFolderOverride,
    resolveInitialPanePath,
    resolveStartupTarget,
    waitForInitialPaint,
    type E2ECompareTarget,
    type E2EHarness,
    type StartupTarget,
  } from './lib/app/startup'
  import {
    applyAppearanceToRoot,
    resolveAppearanceState,
    scheduleThemeTransitionCleanup as scheduleThemeCleanup,
    setThemeColorOverride as applyThemeColorOverride,
    setThemeContrast as applyThemeContrast,
    setThemeFontOverride as applyThemeFontOverride,
    setThemeMode as applyThemeMode,
    setThemePreset as applyThemePreset,
    setThemeSemanticColorOverride as applyThemeSemanticColorOverride,
  } from './lib/app/theme-controller'
  import { entryTypeLabel, formatModified, formatSize } from './lib/format'
  import {
    normalizeSelectionPath,
    splitCommonPathPrefix,
  } from './lib/path-utils'
  import {
    defaultDirectoryEntry,
  } from './lib/app/directory-state'
  import {
    buildNextHistoryState,
    canComparePane as paneCanCompare,
    canGoBack,
    canGoForward,
    createExplorerPane,
    currentDrive,
    formatPickerTargetLabel,
    isCurrentFolderSelected,
    isTargetSelected,
    retitlePane,
    sanitizePaneForMode,
  } from './lib/app/explorer-state'
  import { buildPersistedSession } from './lib/app/session'
  import {
    createDefaultTreeSettings,
    createDefaultViewerSettings,
    normalizeTreeSettings,
    normalizeViewerSettings,
  } from './lib/app/settings-normalizers'
  import type {
    CompareMode,
    CompareOptions,
    CompareTreeSettings,
    CompareViewerSettings,
    DiffStatsSnapshot,
    DirectoryEntryResult,
    EntryStatus,
    ExplorerEntry,
    FileDiffResult,
    PersistedExplorerPane,
    PersistedSession,
    SystemMonitorSnapshot,
    ThemeMode,
    UpdateChannel,
    ViewMode,
  } from './lib/types'
  import {
    getAvailableThemes,
    getDefaultAppearanceSettings,
    type AppearanceSettings,
    type ThemeDefinition,
    type ThemeSemanticColorKey,
    type ThemeVariant,
  } from './lib/theme'
  import {
    normalizeAppearanceSettings,
    MAX_CODE_FONT_SIZE,
    MAX_UI_FONT_SIZE,
    MIN_CODE_FONT_SIZE,
    MIN_UI_FONT_SIZE,
  } from './lib/theme/runtime'
  import type {
    DiffHeaderContext,
    ExplorerPaneState,
    SettingsSection,
    Side,
  } from './lib/ui-types'

  const SESSION_SAVE_DELAY_MS = 180
  const THEME_SWITCH_DURATION_MS = 140
  const BACKGROUND_DIFF_PRELOAD_DELAY_MS = 250
  const BACKGROUND_DIFF_PRELOAD_CONCURRENCY = 1
  const DIRECTORY_COMPARE_POLL_INTERVAL_MS = 50
  const DEFAULT_UPDATE_CHANNEL: UpdateChannel = 'stable'

  type Screen = 'setup' | 'compare' | 'settings'
  type CompareDirtyReason = 'comparisonRules'
  interface DiffScrollSnapshot {
    viewMode: ViewMode
  }

  export let initialSession: PersistedSession | null = null
  export let startupFolderPath: string | null = null
  let pendingStartupOverridePath: string | null = null
  let e2eHarnessEnabled = false

  let screen: Screen = 'setup'
  let settingsReturnScreen: Exclude<Screen, 'settings'> = 'setup'
  let activeSettingsSection: SettingsSection = 'appearance'
  let mode: CompareMode = 'directory'
  let viewMode: ViewMode = 'sideBySide'
  let appearanceSettings: AppearanceSettings = normalizeAppearanceSettings(
    initialSession?.appearance,
    initialSession?.themeMode,
    initialSession?.viewerTextSize
  )
  let systemPrefersDark =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true
  let resolvedThemeMode: Exclude<ThemeMode, 'system'> = 'dark'
  let viewerSettings: CompareViewerSettings = createDefaultViewerSettings()
  let treeSettings: CompareTreeSettings = createDefaultTreeSettings()
  let checkForUpdatesOnLaunch = true
  let updateChannel: UpdateChannel = DEFAULT_UPDATE_CHANNEL
  let lastUpdateCheckAt = ''
  let leftPath = ''
  let rightPath = ''
  let ignoreWhitespace = false
  let ignoreCase = false
  let activeCompareOptions: CompareOptions = {
    ignoreWhitespace: false,
    ignoreCase: false,
  }
  let loading = false
  let detailLoading = false
  let pickerLoading = false
  let errorMessage = ''
  let directoryEntries: DirectoryEntryResult[] = []
  let directoryEntriesRevision = 0
  let filteredDirectoryEntries: DirectoryEntryResult[] = []
  let filteredDirectoryEntryPaths = new Set<string>()
  let directoryRenderableEntryCount = 0
  let selectedRelativePath = ''
  let directoryScrollTargetRevision = 0
  let activeDiff: FileDiffResult | null = null
  let diffStats: DiffStatsSnapshot = {
    files: 0,
    additions: 0,
    deletions: 0,
    lines: 0,
  }
  let systemMonitor: SystemMonitorSnapshot = {
    busyWorkers: 0,
    totalWorkers: 0,
    taskQueue: 0,
    renderedDiffs: 0,
    diffCache: 0,
  }
  let compareRevision = 0
  let activeDirectoryCompareJobId = ''
  let directoryComparePollTimer: number | null = null
  let directoryCompareEntrySlots: Array<DirectoryEntryResult | null | undefined> = []
  let directoryComparePairs: DirectoryComparePair[] = []
  let directoryComparePairSlots: Array<Array<DirectoryEntryResult | null | undefined>> = []
  let directoryComparePairChangedIndices: number[][] = []
  let directoryComparePairIndexSets: Array<Set<number>> = []
  let directoryComparePairIndexOrderDirty: boolean[] = []
  let directoryComparePairJobs: Array<{ jobId: string; pairIndex: number; done: boolean }> = []
  let directoryComparePairTimers: Array<number | null> = []
  let directoryEntriesFlushFrame: number | null = null
  let pendingDirectoryDefaultSelection: {
    previousSelectedPath: string
    revision: number
    restoreScroll: DiffScrollSnapshot | null
  } | null = null
  let paneNavigationScrollFrame: number | null = null
  let paneWheelScrollFrame: number | null = null
  let diffNavigationScrollFrame: number | null = null
  let diffNavigationIdleTimer: number | null = null
  let currentDiffHunk = -1
  let persistenceReady = false
  let saveSessionTimer: number | null = null
  let compareComponentsPreloadCancel: (() => void) | null = null
  let lastSavedSessionFingerprint: string | null = null
  let themeTransitionTimer: number | null = null
  let compareSurfaceTransitionFrame: number | null = null
  let compareSurfaceTransitionTimer: number | null = null
  let compareSurfaceTransitioning = false
  let activeDetailRequestId = 0
  let compareSidebarWidth = DEFAULT_COMPARE_SIDEBAR_WIDTH
  let compareSidebarResizeActive = false
  let compareDirtyReason: CompareDirtyReason | null = null
  let compareNeedsRefresh = false
  let leftExplorer = createExplorerPane('Left')
  let rightExplorer = createExplorerPane('Right')
  let paneNavigationRequestIds: Record<Side, number> = {
    left: 0,
    right: 0,
  }
  let canNavigateDiffs = false
  let canGoToPreviousDiff = false
  let canGoToNextDiff = false
  let textDiffActive = false
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
  const diffCache = createDiffCacheController({
    openCompareItem,
  })
  const compareSidebarResizeController = createCompareSidebarResizeController({
    getEnabled: () => mode === 'directory',
    setActive: (active) => {
      compareSidebarResizeActive = active
    },
    setWidth: (width) => {
      compareSidebarWidth = width
    },
  })
  let PierreDirectoryTreeComponent: typeof import('./lib/compare/PierreDirectoryTree.svelte').default | null = null
  let CompareViewerComponent: typeof import('./lib/compare/CompareViewer.svelte').default | null = null
  let compareComponentsPromise: Promise<void> | null = null
  const updateController = createUpdateController({
    getAppVersion,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
  })
  let updateIndicatorState: UpdateIndicatorState = {
    status: 'idle',
    currentVersion: '',
    metadata: null,
    message: 'Check for updates from any screen.',
  }
  let startupUpdateCheckStarted = false

  const availableLightThemes = getAvailableThemes('light')
  const availableDarkThemes = getAvailableThemes('dark')
  let lightAppearanceTheme: ThemeDefinition = getAvailableThemes('light')[0]
  let darkAppearanceTheme: ThemeDefinition = getAvailableThemes('dark')[0]
  let visibleAppearanceVariants: ThemeVariant[] = ['light']

  const getPendingCompareOptions = (): CompareOptions => ({
    ignoreWhitespace,
    ignoreCase,
  })

  function resetCompareMetrics() {
    diffStats = {
      files: 0,
      additions: 0,
      deletions: 0,
      lines: 0,
    }
    systemMonitor = {
      busyWorkers: 0,
      totalWorkers: 0,
      taskQueue: 0,
      renderedDiffs: 0,
      diffCache: 0,
    }
  }

  function setDiffStats(stats: DiffStatsSnapshot) {
    diffStats = stats
  }

  function setSystemMonitor(stats: SystemMonitorSnapshot) {
    systemMonitor = stats
  }

  function compareOptionsMatch(leftOptions: CompareOptions, rightOptions: CompareOptions) {
    return (
      leftOptions.ignoreWhitespace === rightOptions.ignoreWhitespace &&
      leftOptions.ignoreCase === rightOptions.ignoreCase
    )
  }

  function hasActiveCompareSession() {
    return screen === 'compare' || (screen === 'settings' && settingsReturnScreen === 'compare')
  }

  function syncCompareDirtyState() {
    if (!hasActiveCompareSession() || mode !== 'directory') {
      compareDirtyReason = null
      return
    }

    compareDirtyReason = compareOptionsMatch(getPendingCompareOptions(), activeCompareOptions)
      ? null
      : 'comparisonRules'
  }

  function runFileCompareRefreshIfActive() {
    if (screen !== 'compare' || mode !== 'file' || loading || detailLoading) {
      return
    }

    void runCompare()
  }

  const toggleViewMode = () => {
    setViewMode(viewMode === 'sideBySide' ? 'unified' : 'sideBySide')
  }

  function resetCompareSidebarWidth() {
    compareSidebarResizeController.reset()
  }

  function startCompareSidebarResize(event: PointerEvent) {
    compareSidebarResizeController.start(event)
  }

  const toggleIgnoreWhitespace = () => {
    ignoreWhitespace = !ignoreWhitespace
    syncCompareDirtyState()
    runFileCompareRefreshIfActive()
  }

  const toggleIgnoreCase = () => {
    ignoreCase = !ignoreCase
    syncCompareDirtyState()
    runFileCompareRefreshIfActive()
  }

  function loadCompareComponents() {
    if (PierreDirectoryTreeComponent && CompareViewerComponent) {
      return Promise.resolve()
    }

    if (!compareComponentsPromise) {
      compareComponentsPromise = Promise.all([
        import('./lib/compare/PierreDirectoryTree.svelte'),
        import('./lib/compare/CompareViewer.svelte'),
      ])
        .then(([directoryTreeModule, compareViewerModule]) => {
          PierreDirectoryTreeComponent = directoryTreeModule.default
          CompareViewerComponent = compareViewerModule.default
        })
        .catch((error) => {
          compareComponentsPromise = null
          throw error
        })
    }

    return compareComponentsPromise
  }

  function scheduleCompareComponentsPreload() {
    if (typeof window === 'undefined' || compareComponentsPreloadCancel) {
      return
    }

    const preload = () => {
      compareComponentsPreloadCancel = null
      void loadCompareComponents().catch(() => undefined)
    }

    if ('requestIdleCallback' in window && 'cancelIdleCallback' in window) {
      const handle = window.requestIdleCallback(preload, { timeout: 1500 })
      compareComponentsPreloadCancel = () => window.cancelIdleCallback(handle)
      return
    }

    const handle = globalThis.setTimeout(preload, 600)
    compareComponentsPreloadCancel = () => globalThis.clearTimeout(handle)
  }

  function pulseCompareSurface() {
    if (typeof window === 'undefined') {
      return
    }

    if (compareSurfaceTransitionTimer !== null) {
      window.clearTimeout(compareSurfaceTransitionTimer)
    }

    if (compareSurfaceTransitionFrame !== null) {
      window.cancelAnimationFrame(compareSurfaceTransitionFrame)
    }

    compareSurfaceTransitioning = false

    compareSurfaceTransitionFrame = window.requestAnimationFrame(() => {
      compareSurfaceTransitionFrame = null
      compareSurfaceTransitioning = true
      compareSurfaceTransitionTimer = window.setTimeout(() => {
        compareSurfaceTransitioning = false
        compareSurfaceTransitionTimer = null
      }, 180)
    })
  }

  function syncE2EHarness() {
    installE2EHarness(e2eHarnessEnabled, {
      getState: () => ({
        directoryEntries: directoryEntries.length,
        errorMessage,
        loading,
        mode,
        screen,
        selectedRelativePath,
      }),
      selectPath: async (relativePath: string) => {
        const entry = directoryEntries.find((candidate) => candidate.relativePath === relativePath)
        if (!entry) {
          return false
        }

        await selectEntry(entry)
        return true
      },
    })
  }

  onMount(() => {
    const colorSchemeQuery =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null
    const handleColorSchemeChange = (event: MediaQueryListEvent) => {
      systemPrefersDark = event.matches
    }

    if (colorSchemeQuery) {
      systemPrefersDark = colorSchemeQuery.matches

      if (typeof colorSchemeQuery.addEventListener === 'function') {
        colorSchemeQuery.addEventListener('change', handleColorSchemeChange)
      } else {
        colorSchemeQuery.addListener(handleColorSchemeChange)
      }
    }

    const removeLaunchContextListener = onLaunchContext((context) => {
      const openHerePath = isLaunchContext(context) ? context.openHerePath : ''
      void applyStartupOverride(openHerePath)
    })

    void initializeAppStartup()
    scheduleCompareComponentsPreload()

    return () => {
      if (colorSchemeQuery) {
        if (typeof colorSchemeQuery.removeEventListener === 'function') {
          colorSchemeQuery.removeEventListener('change', handleColorSchemeChange)
        } else {
          colorSchemeQuery.removeListener(handleColorSchemeChange)
        }
      }

      if (saveSessionTimer !== null) {
        window.clearTimeout(saveSessionTimer)
      }

      compareComponentsPreloadCancel?.()
      compareComponentsPreloadCancel = null

      removeLaunchContextListener()
      diffCache.cancelBackgroundPreload()

      if (themeTransitionTimer !== null) {
        window.clearTimeout(themeTransitionTimer)
      }

      if (compareSurfaceTransitionTimer !== null) {
        window.clearTimeout(compareSurfaceTransitionTimer)
      }

      if (compareSurfaceTransitionFrame !== null) {
        window.cancelAnimationFrame(compareSurfaceTransitionFrame)
      }

      if (paneNavigationScrollFrame !== null) {
        window.cancelAnimationFrame(paneNavigationScrollFrame)
      }

      if (paneWheelScrollFrame !== null) {
        window.cancelAnimationFrame(paneWheelScrollFrame)
      }

      compareSidebarResizeController.dispose()

      clearDirectoryComparePollTimer()

      if (diffNavigationScrollFrame !== null) {
        window.cancelAnimationFrame(diffNavigationScrollFrame)
      }

      if (diffNavigationIdleTimer !== null) {
        window.clearTimeout(diffNavigationIdleTimer)
      }

      if (e2eHarnessEnabled) {
        delete (window as unknown as { __difflyE2E?: E2EHarness }).__difflyE2E
      }
    }
  })

  function clampAppearanceSize(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, Math.round(value)))
  }

  function setUiFontSize(value: number) {
    appearanceSettings = {
      ...appearanceSettings,
      uiFontSize: clampAppearanceSize(value, MIN_UI_FONT_SIZE, MAX_UI_FONT_SIZE),
    }
  }

  function stepUiFontSize(direction: -1 | 1) {
    setUiFontSize(appearanceSettings.uiFontSize + direction)
  }

  function setCodeFontSize(value: number) {
    appearanceSettings = {
      ...appearanceSettings,
      codeFontSize: clampAppearanceSize(value, MIN_CODE_FONT_SIZE, MAX_CODE_FONT_SIZE),
    }
  }

  function stepCodeFontSize(direction: -1 | 1) {
    setCodeFontSize(appearanceSettings.codeFontSize + direction)
  }

  function setViewMode(nextViewMode: ViewMode) {
    viewMode = nextViewMode
    viewerSettings = {
      ...viewerSettings,
      diffStyle: nextViewMode === 'sideBySide' ? 'split' : 'unified',
    }
  }

  function setCheckForUpdatesOnLaunch(nextValue: boolean) {
    checkForUpdatesOnLaunch = nextValue
  }

  function setUpdateChannel(nextChannel: UpdateChannel) {
    if (updateChannel === nextChannel) {
      return
    }

    updateChannel = nextChannel
    updateIndicatorState = {
      ...updateIndicatorState,
      status: 'idle',
      metadata: null,
      message: `Switched to ${formatUpdateChannelLabel(nextChannel)} updates. Check again to refresh availability.`,
    }
  }

  function setUsePointerCursor(nextValue: boolean) {
    appearanceSettings = {
      ...appearanceSettings,
      usePointerCursor: nextValue,
    }
  }

  function setThemeMode(nextThemeMode: ThemeMode) {
    applyThemeMode(
      appearanceSettings,
      nextThemeMode,
      (nextAppearanceSettings) => {
        appearanceSettings = nextAppearanceSettings
      },
      (root) => scheduleThemeTransitionCleanup(root),
    )
  }

  function setThemePreset(variant: ThemeVariant, themeId: string) {
    appearanceSettings = applyThemePreset(
      appearanceSettings,
      variant,
      themeId,
      availableLightThemes,
      availableDarkThemes,
    )
  }

  function setThemeColorOverride(
    variant: ThemeVariant,
    field: 'accent' | 'surface' | 'ink',
    value: string
  ) {
    appearanceSettings = applyThemeColorOverride(appearanceSettings, variant, field, value)
  }

  function setThemeSemanticColorOverride(
    variant: ThemeVariant,
    field: ThemeSemanticColorKey,
    value: string
  ) {
    appearanceSettings = applyThemeSemanticColorOverride(appearanceSettings, variant, field, value)
  }

  function setThemeFontOverride(
    variant: ThemeVariant,
    field: 'ui' | 'code',
    value: string
  ) {
    appearanceSettings = applyThemeFontOverride(appearanceSettings, variant, field, value)
  }

  function setThemeContrast(variant: ThemeVariant, value: number) {
    appearanceSettings = applyThemeContrast(appearanceSettings, variant, value)
  }

  function updateIndicatorTitle() {
    return getUpdateIndicatorTitle(updateIndicatorState)
  }

  function shouldShowUpdateIndicator() {
    return shouldShowUpdateIndicatorState(updateIndicatorState)
  }

  async function initializeAppStartup() {
    await waitForInitialPaint()
    await initializePickers()
    await initializeUpdateVersion()
    startStartupUpdateCheck()
  }

  function startStartupUpdateCheck() {
    if (startupUpdateCheckStarted || !checkForUpdatesOnLaunch) {
      return
    }

    startupUpdateCheckStarted = true

    window.setTimeout(() => {
      void runUpdateCheck()
    }, 3000)
  }

  async function initializeUpdateVersion() {
    updateIndicatorState = await updateController.initializeUpdateVersion(updateIndicatorState)
  }

  async function runUpdateCheck() {
    if (
      updateIndicatorState.status === 'checking' ||
      updateIndicatorState.status === 'downloading'
    ) {
      return
    }

    updateIndicatorState = {
      ...updateIndicatorState,
      status: 'checking',
      message: 'Checking for updates...',
    }

    const [result] = await Promise.all([
      updateController.runUpdateCheck(updateIndicatorState, updateChannel),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ])
    updateIndicatorState = result.updateIndicatorState

    if (result.lastUpdateCheckAt) {
      lastUpdateCheckAt = result.lastUpdateCheckAt
    }
  }

  async function beginUpdateDownload() {
    updateIndicatorState = await updateController.beginUpdateDownload(
      updateIndicatorState,
      updateChannel,
    )
  }

  async function applyDownloadedUpdate() {
    updateIndicatorState = await updateController.applyDownloadedUpdate(
      updateIndicatorState,
      updateChannel,
    )
  }

  function openUpdateSettings() {
    openSettings('updates')
  }

  function openSettings(section: SettingsSection = 'appearance') {
    if (screen !== 'settings') {
      settingsReturnScreen = screen
    }

    activeSettingsSection = section
    screen = 'settings'
    errorMessage = ''
  }

  function goBackFromSettings() {
    screen = settingsReturnScreen
    errorMessage = ''
  }

  function scheduleThemeTransitionCleanup(root: HTMLElement) {
    scheduleThemeCleanup(root, themeTransitionTimer, THEME_SWITCH_DURATION_MS, (timer) => {
      themeTransitionTimer = timer
    })
  }

  function cancelBackgroundDiffPreload() {
    diffCache.cancelBackgroundPreload()
  }

  function clearDirectoryComparePollTimer() {
    if (directoryComparePollTimer !== null) {
      window.clearTimeout(directoryComparePollTimer)
      directoryComparePollTimer = null
    }

    for (const [index, timer] of directoryComparePairTimers.entries()) {
      if (timer !== null) {
        window.clearTimeout(timer)
        directoryComparePairTimers[index] = null
      }
    }
  }

  function clearDirectoryEntriesFlushFrame() {
    if (directoryEntriesFlushFrame !== null) {
      window.cancelAnimationFrame(directoryEntriesFlushFrame)
      directoryEntriesFlushFrame = null
    }
  }

  function stopDirectoryComparePolling(clearEntries = false, cancelBackendJobs = true) {
    const jobIds = cancelBackendJobs
      ? directoryComparePairJobs
          .map((job) => job.jobId)
          .filter((jobId) => jobId.length > 0)
      : []

    clearDirectoryComparePollTimer()
    clearDirectoryEntriesFlushFrame()
    pendingDirectoryDefaultSelection = null
    activeDirectoryCompareJobId = ''
    directoryComparePairJobs = []
    directoryComparePairTimers = []
    if (clearEntries) {
      directoryCompareEntrySlots = []
      directoryComparePairs = []
      directoryComparePairSlots = []
      directoryComparePairChangedIndices = []
      directoryComparePairIndexSets = []
      directoryComparePairIndexOrderDirty = []
      directoryRenderableEntryCount = 0
      directoryEntriesRevision += 1
    }

    for (const jobId of jobIds) {
      void cancelDirectoryCompare(jobId).catch(() => undefined)
    }
  }

  function isMultiPairCompare() {
    return directoryComparePairs.length > 1
  }

  function findDirectoryComparePairForPath(prefixedPath: string) {
    return findDirectoryComparePairInList(directoryComparePairs, prefixedPath)
  }

  function prefixedRelativePathFor(pair: DirectoryComparePair, relativePath: string) {
    return prefixedRelativePathForPair(directoryComparePairs, pair, relativePath)
  }

  function getDetailBasesForPath(prefixedPath: string): {
    leftBase: string
    rightBase: string
    relativePath: string
  } {
    const lookup = findDirectoryComparePairForPath(prefixedPath)
    if (lookup) {
      return {
        leftBase: lookup.pair.leftBase,
        rightBase: lookup.pair.rightBase,
        relativePath: lookup.relativePath,
      }
    }

    return {
      leftBase: leftPath,
      rightBase: rightPath,
      relativePath: prefixedPath,
    }
  }

  function getOrCreateDetailDiffPromise(
    relativePath: string,
    revision = compareRevision,
    options: { force?: boolean } = {},
  ) {
    const bases = getDetailBasesForPath(relativePath)
    return diffCache.getOrCreateDetailDiffPromise({
      revision,
      leftPath: bases.leftBase,
      rightPath: bases.rightBase,
      relativePath: bases.relativePath,
      ignoreWhitespace: activeCompareOptions.ignoreWhitespace,
      ignoreCase: activeCompareOptions.ignoreCase,
      force: options.force,
    })
  }

  function captureDiffScrollSnapshot(): DiffScrollSnapshot | null {
    if (!activeDiff || activeDiff.contentKind !== 'text') {
      return null
    }

    return {
      viewMode,
    }
  }

  async function restoreDiffScrollSnapshot(snapshot: DiffScrollSnapshot | null) {
    void snapshot
    await tick()
  }

  function startBackgroundDiffPreload(
    centerRelativePath: string,
    revision = compareRevision,
  ) {
    // Background preload assumes a single (leftPath, rightPath) pair. With
    // multi-folder compares the entries span multiple base pairs, so skip
    // preloading until the cache layer is taught to look up bases per entry.
    if (isMultiPairCompare()) {
      return
    }

    diffCache.startBackgroundPreload({
      centerRelativePath,
      revision,
      mode,
      leftPath,
      rightPath,
      directoryEntries,
      ignoreWhitespace: activeCompareOptions.ignoreWhitespace,
      ignoreCase: activeCompareOptions.ignoreCase,
      preloadConcurrency: BACKGROUND_DIFF_PRELOAD_CONCURRENCY,
      preloadDelayMs: BACKGROUND_DIFF_PRELOAD_DELAY_MS,
    })
  }

  function applyDirectoryCompareUpdatesForPair(
    pairIndex: number,
    updates: Array<{ index: number; entry: DirectoryEntryResult | null }>,
  ) {
    if (updates.length === 0) {
      return
    }

    const slots = directoryComparePairSlots[pairIndex]
    if (!slots) {
      return
    }

    const changedIndices =
      directoryComparePairChangedIndices[pairIndex] ?? []
    const changedIndexSet =
      directoryComparePairIndexSets[pairIndex] ?? new Set<number>()
    directoryComparePairChangedIndices[pairIndex] = changedIndices
    directoryComparePairIndexSets[pairIndex] = changedIndexSet

    for (const update of updates) {
      if (update.index >= slots.length) {
        slots.length = update.index + 1
      }

      if (!update.entry) {
        slots[update.index] = null
        if (changedIndexSet.delete(update.index)) {
          const removeIndex = changedIndices.indexOf(update.index)
          if (removeIndex >= 0) {
            changedIndices.splice(removeIndex, 1)
          }
        }
        continue
      }

      if (!changedIndexSet.has(update.index)) {
        changedIndexSet.add(update.index)
        changedIndices.push(update.index)
        directoryComparePairIndexOrderDirty[pairIndex] = true
      }

      slots[update.index] = update.entry
    }

    scheduleDirectoryEntriesRebuild()
  }

  function scheduleDirectoryEntriesRebuild() {
    if (directoryEntriesFlushFrame !== null) {
      return
    }

    directoryEntriesFlushFrame = window.requestAnimationFrame(() => {
      directoryEntriesFlushFrame = null
      flushDirectoryEntriesFromPairs()
    })
  }

  function requestDirectoryDefaultSelection(
    previousSelectedPath: string,
    revision: number,
    restoreScroll: DiffScrollSnapshot | null,
  ) {
    if (
      selectedRelativePath &&
      (!previousSelectedPath || selectedRelativePath === previousSelectedPath)
    ) {
      return
    }

    pendingDirectoryDefaultSelection = {
      previousSelectedPath,
      revision,
      restoreScroll,
    }
    scheduleDirectoryEntriesRebuild()
  }

  function flushDirectoryEntriesFromPairs() {
    clearDirectoryEntriesFlushFrame()
    rebuildDirectoryEntriesFromPairs()
    applyPendingDirectoryDefaultSelection()
  }

  function rebuildDirectoryEntriesFromPairs() {
    const isMulti = isMultiPairCompare()
    const aggregated: DirectoryEntryResult[] = []

    for (const [pairIndex, changedIndices] of directoryComparePairChangedIndices.entries()) {
      const slots = directoryComparePairSlots[pairIndex]
      const pair = directoryComparePairs[pairIndex]
      if (!pair || !slots) {
        continue
      }

      if (directoryComparePairIndexOrderDirty[pairIndex]) {
        changedIndices.sort((left, right) => left - right)
        directoryComparePairIndexOrderDirty[pairIndex] = false
      }

      for (const index of changedIndices) {
        const entry = slots[index]
        if (!entry) {
          continue
        }

        if (isMulti) {
          aggregated.push({
            ...entry,
            relativePath: prefixedRelativePathFor(pair, entry.relativePath),
          })
        } else {
          aggregated.push(entry)
        }
      }
    }

    directoryEntries = aggregated
    directoryEntriesRevision += 1
    syncFilteredDirectoryState(aggregated)
  }

  function applyPendingDirectoryDefaultSelection() {
    const pending = pendingDirectoryDefaultSelection
    pendingDirectoryDefaultSelection = null

    if (
      !pending ||
      pending.revision !== compareRevision ||
      detailLoading ||
      activeDiff
    ) {
      return
    }

    const preservedEntry = pending.previousSelectedPath
      ? filteredDirectoryEntries.find((entry) => entry.relativePath === pending.previousSelectedPath)
      : undefined
    const nextEntry =
      preservedEntry ??
      (filteredDirectoryEntries.length > 0 ? defaultDirectoryEntry(filteredDirectoryEntries) : null)

    if (nextEntry) {
      void selectEntry(
        nextEntry,
        pending.revision,
        nextEntry.relativePath === pending.previousSelectedPath ? pending.restoreScroll : null,
      )
    }
  }

  function queuePairPoll(
    pairIndex: number,
    jobId: string,
    previousSelectedPath: string,
    revision: number,
    restoreScroll: DiffScrollSnapshot | null,
  ) {
    const existing = directoryComparePairTimers[pairIndex]
    if (existing !== null && existing !== undefined) {
      window.clearTimeout(existing)
    }

    directoryComparePairTimers[pairIndex] = window.setTimeout(() => {
      directoryComparePairTimers[pairIndex] = null
      void pollDirectoryCompareJob(jobId, pairIndex, previousSelectedPath, revision, restoreScroll)
    }, DIRECTORY_COMPARE_POLL_INTERVAL_MS)
  }

  async function pollDirectoryCompareJob(
    jobId: string,
    pairIndex: number,
    previousSelectedPath: string,
    revision: number,
    restoreScroll: DiffScrollSnapshot | null,
  ) {
    if (revision !== compareRevision) {
      return
    }

    const job = directoryComparePairJobs[pairIndex]
    if (!job || job.jobId !== jobId) {
      return
    }

    try {
      const response = await pollDirectoryCompare(jobId)

      if (revision !== compareRevision) {
        return
      }

      const stillTracking = directoryComparePairJobs[pairIndex]
      if (!stillTracking || stillTracking.jobId !== jobId) {
        return
      }

      applyDirectoryCompareUpdatesForPair(pairIndex, response.updates)
      if (response.updates.length > 0) {
        requestDirectoryDefaultSelection(previousSelectedPath, revision, restoreScroll)
      }

      if (response.done) {
        flushDirectoryEntriesFromPairs()
        stillTracking.done = true

        if (response.error) {
          errorMessage = response.error
        }

        const allDone = directoryComparePairJobs.every((entry) => entry.done)
        if (allDone) {
          stopDirectoryComparePolling(false, false)
          loading = false

          if (directoryEntries.length === 0) {
            selectedRelativePath = ''
            activeDiff = null
            cancelBackgroundDiffPreload()
          }
        }

        return
      }

      queuePairPoll(pairIndex, jobId, previousSelectedPath, revision, restoreScroll)
    } catch (error) {
      if (revision !== compareRevision) {
        return
      }

      stopDirectoryComparePolling()
      loading = false
      errorMessage =
        error instanceof Error ? error.message : 'Compare progress could not be loaded.'
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

  function startPaneNavigationRequest(side: Side) {
    paneNavigationRequestIds[side] += 1
    return paneNavigationRequestIds[side]
  }

  function paneNavigationRequestIsCurrent(side: Side, requestId: number) {
    return paneNavigationRequestIds[side] === requestId
  }

  async function initializePickers() {
    pickerLoading = true

    try {
      const savedSessionPromise =
        initialSession === null
          ? loadSessionState().catch(() => null)
          : Promise.resolve(initialSession)
      const [roots, savedSession] = await Promise.all([
        listRoots(),
        savedSessionPromise,
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
      pickerLoading = false

      const e2eCompareTarget = readE2ECompareTarget()
      if (e2eCompareTarget) {
        await applyE2ECompareTarget(e2eCompareTarget)
        lastSavedSessionFingerprint = JSON.stringify(buildCurrentPersistedSession())
        return
      }

      if (roots.length > 0) {
        const startupFolderOverride =
          startupFolderPath ?? await readStartupFolderOverride().catch(() => null)
        const startupTarget = await resolveStartupTarget(startupFolderOverride, pathInfo)

        if (startupTarget) {
          await applyStartupTarget(startupTarget)
        } else {
          const [leftRoot, rightRoot] = await Promise.all([
            resolveInitialPanePath(
              savedSession?.leftPane ?? null,
              roots[0].path,
              pathInfo,
            ),
            resolveInitialPanePath(
              savedSession?.rightPane ?? null,
              roots[1]?.path ?? roots[0].path,
              pathInfo,
            ),
          ])

          await Promise.all([
            openDirectory('left', leftRoot),
            openDirectory('right', rightRoot),
          ])

          await Promise.all([
            restorePaneSelection('left', savedSession?.leftPane ?? null),
            restorePaneSelection('right', savedSession?.rightPane ?? null),
          ])
        }
      }

      lastSavedSessionFingerprint = JSON.stringify(buildCurrentPersistedSession())
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Unable to initialize the picker.'
    } finally {
      pickerLoading = false
      persistenceReady = true
      if (pendingStartupOverridePath !== null) {
        const queuedOverridePath = pendingStartupOverridePath
        pendingStartupOverridePath = null
        void applyStartupOverride(queuedOverridePath)
      }
    }
  }

  async function applyStartupOverride(overridePath: string | null) {
    if (pickerLoading || leftExplorer.roots.length === 0 || rightExplorer.roots.length === 0) {
      if (overridePath !== null) {
        pendingStartupOverridePath = overridePath
      }
      return
    }

    const startupTarget = await resolveStartupTarget(overridePath, pathInfo)

    if (startupTarget) {
      await applyStartupTarget(startupTarget)
      screen = 'setup'
      errorMessage = ''
    }
  }

  async function applyStartupTarget(startupTarget: StartupTarget) {
    mode = startupTarget.kind

    const opened = await openDirectoryForBothPanes(startupTarget.folderPath)
    if (!opened) {
      return
    }

    selectTarget('left', startupTarget.targetPath, startupTarget.kind)
    selectTarget('right', startupTarget.targetPath, startupTarget.kind)
  }

  async function applyE2ECompareTarget(target: E2ECompareTarget) {
    e2eHarnessEnabled = true
    mode = 'directory'

    const [leftOpened, rightOpened] = await Promise.all([
      openDirectory('left', target.leftPath, 'keep'),
      openDirectory('right', target.rightPath, 'keep'),
    ])

    if (!leftOpened || !rightOpened) {
      errorMessage = 'Unable to initialize E2E compare target.'
      return
    }

    selectTarget('left', target.leftPath, 'directory')
    selectTarget('right', target.rightPath, 'directory')
    await loadCompareComponents()
    await runCompare()
  }

  $: e2eHarnessEnabled,
    directoryEntries,
    loading,
    mode,
    screen,
    selectedRelativePath,
    syncE2EHarness()

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

    if (session.viewerSettings) {
      viewerSettings = normalizeViewerSettings(session.viewerSettings, viewerSettings, session)
      viewMode = viewerSettings.diffStyle === 'split' ? 'sideBySide' : 'unified'
    } else {
      viewerSettings = normalizeViewerSettings(null, viewerSettings, session)
    }

    if (session.treeSettings) {
      treeSettings = normalizeTreeSettings(session.treeSettings, treeSettings)
    }

    appearanceSettings = normalizeAppearanceSettings(
      session.appearance,
      session.themeMode,
      session.viewerTextSize
    )

    ignoreWhitespace = session.ignoreWhitespace
    ignoreCase = session.ignoreCase
    checkForUpdatesOnLaunch = session.checkForUpdatesOnLaunch ?? true
    updateChannel = session.updateChannel ?? DEFAULT_UPDATE_CHANNEL
    lastUpdateCheckAt = session.lastUpdateCheckAt ?? ''

    // Restore update indicator if the last session found an available update
    if (session.lastUpdateStatus === 'available' && session.lastUpdateMetadata) {
      updateIndicatorState = {
        ...updateIndicatorState,
        status: 'available',
        metadata: session.lastUpdateMetadata,
        message: 'A new Diffly build is available.',
      }
    }
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
    compareRevision += 1
    diffCache.clearDetailDiffs()
    cancelBackgroundDiffPreload()
    stopDirectoryComparePolling(true)
    loading = false
    detailLoading = false
    compareDirtyReason = null
    mode = nextMode
    leftExplorer = sanitizePaneForMode(leftExplorer, nextMode)
    rightExplorer = sanitizePaneForMode(rightExplorer, nextMode)
    directoryEntries = []
    directoryEntriesRevision += 1
    filteredDirectoryEntries = []
    filteredDirectoryEntryPaths = new Set()
    directoryRenderableEntryCount = 0
    selectedRelativePath = ''
    activeDiff = null
    errorMessage = ''
  }

  function goToSetup() {
    activeDetailRequestId += 1
    compareRevision += 1
    stopDirectoryComparePolling(false)
    loading = false
    detailLoading = false
    cancelBackgroundDiffPreload()
    compareDirtyReason = null
    screen = 'setup'
    errorMessage = ''
  }

  function resetPreferenceState() {
    mode = 'directory'
    viewMode = 'sideBySide'
    viewerSettings = normalizeViewerSettings(null, viewerSettings)
    treeSettings = normalizeTreeSettings(null, treeSettings)
    appearanceSettings = getDefaultAppearanceSettings()
    ignoreWhitespace = false
    ignoreCase = false
    checkForUpdatesOnLaunch = true
    updateChannel = DEFAULT_UPDATE_CHANNEL
    lastUpdateCheckAt = ''
    updateIndicatorState = {
      ...updateIndicatorState,
      status: 'idle',
      metadata: null,
      message: 'Check for updates from any screen.',
    }
  }

  function clearRememberedSelections() {
    leftExplorer = {
      ...leftExplorer,
      selectedTargetPath: '',
      selectedTargetKind: null,
      selectedTargetPaths: [],
      history: leftExplorer.currentPath ? [leftExplorer.currentPath] : [],
      historyIndex: leftExplorer.currentPath ? 0 : -1,
    }
    rightExplorer = {
      ...rightExplorer,
      selectedTargetPath: '',
      selectedTargetKind: null,
      selectedTargetPaths: [],
      history: rightExplorer.currentPath ? [rightExplorer.currentPath] : [],
      historyIndex: rightExplorer.currentPath ? 0 : -1,
    }
  }

  function confirmResetPreferences() {
    if (typeof window !== 'undefined' && !window.confirm('Reset saved preferences to defaults?')) {
      return
    }

    resetPreferenceState()
  }

  function confirmClearRememberedSelections() {
    if (
      typeof window !== 'undefined' &&
      !window.confirm('Clear remembered folders, files, and navigation history?')
    ) {
      return
    }

    clearRememberedSelections()
  }

  function resetEverything() {
    resetPreferenceState()
    clearRememberedSelections()
    goToSetup()
  }

  async function swapComparedSides() {
    if (loading || detailLoading || pickerLoading) {
      return
    }

    startPaneNavigationRequest('left')
    startPaneNavigationRequest('right')
    const nextLeftPane = retitlePane(rightExplorer, leftExplorer.title)
    const nextRightPane = retitlePane(leftExplorer, rightExplorer.title)

    leftExplorer = nextLeftPane
    rightExplorer = nextRightPane

    if (screen === 'compare') {
      await runCompare()
    }
  }

  async function browseSystem(side: Side, kind: 'file' | 'directory' = 'file') {
    const selected = await choosePath(kind)

    if (!selected) {
      return
    }

    const info = await pathInfo(selected)

    if (!info.exists) {
      return
    }

    if (info.isDirectory) {
      if (await openDirectory(side, info.path)) {
        selectTarget(side, info.path, 'directory')
      }
      return
    }

    if (info.isFile) {
      if (info.parentPath) {
        const opened = await openDirectory(side, info.parentPath)
        if (!opened) {
          return
        }
      }
      selectTarget(side, info.path, 'file')
    }
  }

  async function openDirectory(side: Side, path: string, historyMode: 'push' | 'keep' = 'push') {
    const requestId = startPaneNavigationRequest(side)
    updatePane(side, (pane) => ({
      ...pane,
      loading: true,
      error: '',
    }))

    try {
      const pane = paneFor(side)
      const cached = pane.listings[path]
      const listing = cached ?? (await listDirectory(path))

      if (!paneNavigationRequestIsCurrent(side, requestId)) {
        return false
      }

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
      return true
    } catch (error) {
      if (!paneNavigationRequestIsCurrent(side, requestId)) {
        return false
      }

      updatePane(side, (pane) => ({
        ...pane,
        loading: false,
        error: error instanceof Error ? error.message : 'Unable to open the folder.',
      }))
      return false
    }
  }

  async function openDirectoryForBothPanes(path: string, historyMode: 'push' | 'keep' = 'push') {
    const leftRequestId = startPaneNavigationRequest('left')
    const rightRequestId = startPaneNavigationRequest('right')

    leftExplorer = {
      ...leftExplorer,
      loading: true,
      error: '',
    }
    rightExplorer = {
      ...rightExplorer,
      loading: true,
      error: '',
    }

    try {
      const listing =
        leftExplorer.listings[path] ??
        rightExplorer.listings[path] ??
        await listDirectory(path)

      if (
        !paneNavigationRequestIsCurrent('left', leftRequestId) ||
        !paneNavigationRequestIsCurrent('right', rightRequestId)
      ) {
        return false
      }

      const leftHistoryState = buildNextHistoryState(leftExplorer, path, historyMode)
      const rightHistoryState = buildNextHistoryState(rightExplorer, path, historyMode)

      leftExplorer = {
        ...leftExplorer,
        ...leftHistoryState,
        currentPath: path,
        pathInput: path,
        currentListing: listing,
        listings: {
          ...leftExplorer.listings,
          [path]: listing,
        },
        loading: false,
      }
      rightExplorer = {
        ...rightExplorer,
        ...rightHistoryState,
        currentPath: path,
        pathInput: path,
        currentListing: listing,
        listings: {
          ...rightExplorer.listings,
          [path]: listing,
        },
        loading: false,
      }
      return true
    } catch (error) {
      if (
        !paneNavigationRequestIsCurrent('left', leftRequestId) ||
        !paneNavigationRequestIsCurrent('right', rightRequestId)
      ) {
        return false
      }

      const message = error instanceof Error ? error.message : 'Unable to open the folder.'
      leftExplorer = {
        ...leftExplorer,
        loading: false,
        error: message,
      }
      rightExplorer = {
        ...rightExplorer,
        loading: false,
        error: message,
      }
      return false
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

    const opened = await openDirectory(side, pane.history[nextIndex], 'keep')
    if (!opened) {
      return
    }

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
    const requestId = startPaneNavigationRequest(side)

    if (!nextPath) {
      if (paneNavigationRequestIsCurrent(side, requestId)) {
        updatePane(side, (current) => ({
          ...current,
          pathInput: current.currentPath,
        }))
      }
      return
    }

    const info = await pathInfo(nextPath)
    if (!paneNavigationRequestIsCurrent(side, requestId)) {
      return
    }

    if (!info.exists) {
      updatePane(side, (current) => ({
        ...current,
        error: 'The requested path does not exist.',
      }))
      return
    }

    if (info.isDirectory) {
      if (await openDirectory(side, info.path)) {
        selectTarget(side, info.path, 'directory')
      }
      return
    }

    if (info.isFile && info.parentPath) {
      if (await openDirectory(side, info.parentPath)) {
        selectTarget(side, info.path, 'file')
      }
    }
  }

  function selectTarget(side: Side, path: string, kind: 'file' | 'directory') {
    updatePane(side, (pane) => ({
      ...pane,
      selectedTargetPath: path,
      selectedTargetKind: kind,
      selectedTargetPaths: [path],
    }))

    if (screen === 'setup' && mode !== kind) {
      mode = kind
    }
  }

  function toggleTarget(side: Side, path: string, kind: 'file' | 'directory') {
    const pane = paneFor(side)
    const existing = pane.selectedTargetPaths ?? []
    const has = existing.includes(path)
    const nextPaths = has ? existing.filter((entry) => entry !== path) : [...existing, path]
    const primary = nextPaths.length > 0 ? nextPaths[nextPaths.length - 1] : ''
    const primaryKind =
      !primary
        ? null
        : primary === path
          ? kind
          : pane.selectedTargetKind

    updatePane(side, (current) => ({
      ...current,
      selectedTargetPaths: nextPaths,
      selectedTargetPath: primary,
      selectedTargetKind: primaryKind,
    }))

    if (primary && screen === 'setup' && primaryKind && mode !== primaryKind) {
      mode = primaryKind
    }
  }

  function useCurrentFolder(side: Side) {
    const pane = paneFor(side)

    if (pane.currentPath) {
      selectTarget(side, pane.currentPath, 'directory')
    }
  }

  function selectListEntry(side: Side, entry: ExplorerEntry, event?: MouseEvent) {
    if (entry.kind === 'drive') {
      return
    }

    const kind: 'file' | 'directory' = entry.kind === 'file' ? 'file' : 'directory'
    const isAdditive = Boolean(event && (event.ctrlKey || event.metaKey))

    if (isAdditive) {
      toggleTarget(side, entry.path, kind)
      return
    }

    selectTarget(side, entry.path, kind)
  }

  async function activateListEntry(side: Side, entry: ExplorerEntry) {
    if (entry.kind === 'directory' || entry.kind === 'drive') {
      await openDirectory(side, entry.path)
      return
    }

    if (entry.kind === 'file') {
      selectTarget(side, entry.path, 'file')
    }
  }

  async function runCompare() {
    if (!paneCanCompare(leftExplorer, mode) || !paneCanCompare(rightExplorer, mode)) {
      errorMessage = 'Select valid targets on both sides first.'
      return
    }

    const leftSelected =
      leftExplorer.selectedTargetPaths.length > 0
        ? leftExplorer.selectedTargetPaths
        : leftExplorer.selectedTargetPath
          ? [leftExplorer.selectedTargetPath]
          : []
    const rightSelected =
      rightExplorer.selectedTargetPaths.length > 0
        ? rightExplorer.selectedTargetPaths
        : rightExplorer.selectedTargetPath
          ? [rightExplorer.selectedTargetPath]
          : []

    if (leftSelected.length === 0 || rightSelected.length === 0) {
      errorMessage = 'Select valid targets on both sides first.'
      return
    }

    if (mode === 'directory' && leftSelected.length !== rightSelected.length) {
      errorMessage = `Select the same number of folders on both sides (left has ${leftSelected.length}, right has ${rightSelected.length}).`
      return
    }

    const nextLeftPath = leftSelected[0]
    const nextRightPath = rightSelected[0]
    const nextCompareOptions = getPendingCompareOptions()
    const previousSelectedPath = selectedRelativePath
    const restoreScroll = captureDiffScrollSnapshot()
    let directoryPollingStarted = false
    let requestRevision = compareRevision

    loading = true
    detailLoading = false
    errorMessage = ''
    resetCompareMetrics()
    pulseCompareSurface()
    activeDetailRequestId += 1
    cancelBackgroundDiffPreload()
    stopDirectoryComparePolling(true)
    leftPath = nextLeftPath
    rightPath = nextRightPath

    try {
      if (mode === 'directory') {
        compareRevision += 1
        requestRevision = compareRevision
        const revision = requestRevision
        diffCache.clearDetailDiffs()
        activeCompareOptions = { ...nextCompareOptions }
        compareDirtyReason = null
        screen = 'compare'
        directoryEntries = []
        directoryEntriesRevision += 1
        syncFilteredDirectoryState([])
        selectedRelativePath = ''
        activeDiff = null

        const pairs = buildDirectoryComparePairs(leftSelected, rightSelected)
        directoryComparePairs = pairs
        directoryComparePairSlots = pairs.map(() => [])
        directoryComparePairChangedIndices = pairs.map(() => [])
        directoryComparePairIndexSets = pairs.map(() => new Set<number>())
        directoryComparePairIndexOrderDirty = pairs.map(() => false)
        directoryComparePairTimers = pairs.map(() => null)
        directoryComparePairJobs = pairs.map((_, pairIndex) => ({
          jobId: '',
          pairIndex,
          done: false,
        }))

        const startResults = await Promise.all(
          pairs.map((pair) =>
            startDirectoryCompare(pair.leftBase, pair.rightBase, nextCompareOptions),
          ),
        )

        if (revision !== compareRevision) {
          for (const response of startResults) {
            void cancelDirectoryCompare(response.jobId).catch(() => undefined)
          }
          return
        }

        for (const [pairIndex, response] of startResults.entries()) {
          directoryComparePairJobs[pairIndex] = {
            jobId: response.jobId,
            pairIndex,
            done: false,
          }
        }

        activeDirectoryCompareJobId = startResults[0]?.jobId ?? ''

        for (const [pairIndex, response] of startResults.entries()) {
          void pollDirectoryCompareJob(
            response.jobId,
            pairIndex,
            previousSelectedPath,
            revision,
            restoreScroll,
          )
        }
        directoryPollingStarted = true
        return
      }

      compareRevision += 1
      requestRevision = compareRevision
      const revision = requestRevision
      const response = await comparePaths(
        nextLeftPath,
        nextRightPath,
        mode,
        nextCompareOptions,
      )

      if (revision !== compareRevision) {
        return
      }

      diffCache.clearDetailDiffs()
      activeCompareOptions = { ...nextCompareOptions }
      compareDirtyReason = null
      screen = 'compare'

      if (response.kind === 'directory') {
        directoryEntries = response.entries
        directoryEntriesRevision += 1
        syncFilteredDirectoryState(response.entries)

        const preservedEntry = filteredDirectoryEntries.find(
          (entry) => entry.relativePath === previousSelectedPath,
        )

        if (preservedEntry) {
          void selectEntry(preservedEntry, compareRevision, restoreScroll)
        } else if (filteredDirectoryEntries.length > 0) {
          const nextEntry = defaultDirectoryEntry(filteredDirectoryEntries)
          void selectEntry(nextEntry, compareRevision)
        } else {
          selectedRelativePath = ''
          activeDiff = null
          cancelBackgroundDiffPreload()
        }
      } else {
        selectedRelativePath = ''
        activeDiff = response.result
        cancelBackgroundDiffPreload()
      }
    } catch (error) {
      if (requestRevision === compareRevision) {
        errorMessage = error instanceof Error ? error.message : 'Compare failed.'
      }
    } finally {
      if (!directoryPollingStarted && requestRevision === compareRevision) {
        loading = false
      }
    }
  }

  async function selectEntry(
    entry: DirectoryEntryResult,
    revision = compareRevision,
    restoreScroll: DiffScrollSnapshot | null = null,
  ) {
    if (mode === 'directory') {
      if (revision === compareRevision) {
        if (selectedRelativePath !== entry.relativePath) {
          pulseCompareSurface()
        }
        selectedRelativePath = entry.relativePath
        if (arguments.length <= 1) {
          directoryScrollTargetRevision += 1
        }
        errorMessage = ''
      }
      return
    }

    if (!leftPath || !rightPath) {
      return
    }

    if (selectedRelativePath === entry.relativePath && detailLoading) {
      return
    }

    const switchingEntry = selectedRelativePath !== entry.relativePath
    const requestId = activeDetailRequestId + 1

    activeDetailRequestId = requestId
    selectedRelativePath = entry.relativePath
    detailLoading = true
    errorMessage = ''
    pulseCompareSurface()

    // Bump the preload generation so existing workers exit after their current
    // IPC resolves. They won't pile up thanks to the bounded worker pool; the
    // new preload below re-enters the same pool immediately.
    cancelBackgroundDiffPreload()

    try {
      if (switchingEntry) {
        activeDiff = null
      }

      if (revision !== compareRevision || requestId !== activeDetailRequestId) {
        return
      }

      const result = await getOrCreateDetailDiffPromise(entry.relativePath, revision)

      if (revision === compareRevision && requestId === activeDetailRequestId) {
        activeDiff = result
        await restoreDiffScrollSnapshot(restoreScroll)
        if (result.contentKind === 'text') {
          startBackgroundDiffPreload(entry.relativePath, revision)
        } else {
          cancelBackgroundDiffPreload()
        }
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

  function visibleDirectoryEntries() {
    return filteredDirectoryEntries.length > 0 ? filteredDirectoryEntries : directoryEntries
  }

  function ensureDirectorySelection(entries: DirectoryEntryResult[] = visibleDirectoryEntries()) {
    if (screen !== 'compare' || mode !== 'directory' || entries.length === 0) {
      return
    }

    if (
      selectedRelativePath &&
      (entries === filteredDirectoryEntries
        ? filteredDirectoryEntryPaths.has(selectedRelativePath)
        : entries.some((entry) => entry.relativePath === selectedRelativePath))
    ) {
      return
    }

    const nextEntry = defaultDirectoryEntry(entries)
    if (nextEntry) {
      selectedRelativePath = nextEntry.relativePath
    }
  }

  function syncFilteredDirectoryState(entries: DirectoryEntryResult[] = directoryEntries) {
    const entryPaths = new Set<string>()
    let renderableCount = 0

    for (const entry of entries) {
      entryPaths.add(entry.relativePath)
      if (entry.status !== 'unsupported') {
        renderableCount += 1
      }
    }

    filteredDirectoryEntries = entries
    filteredDirectoryEntryPaths = entryPaths
    directoryRenderableEntryCount = renderableCount
    ensureDirectorySelection(entries)
  }

  $: {
    screen
    mode
    selectedRelativePath
    filteredDirectoryEntries
    directoryEntries
    ensureDirectorySelection()
  }

  function cancelPaneNavigationScroll() {
    if (paneNavigationScrollFrame !== null) {
      window.cancelAnimationFrame(paneNavigationScrollFrame)
      paneNavigationScrollFrame = null
    }
  }

  function cancelPaneWheelScroll() {
    if (paneWheelScrollFrame !== null) {
      window.cancelAnimationFrame(paneWheelScrollFrame)
      paneWheelScrollFrame = null
    }
  }

  function buildCurrentPersistedSession() {
    return buildPersistedSession({
      mode,
      viewerSettings,
      treeSettings,
      appearanceSettings,
      ignoreWhitespace,
      ignoreCase,
      checkForUpdatesOnLaunch,
      updateChannel,
      lastUpdateCheckAt,
      lastUpdateStatus: updateIndicatorState.status,
      lastUpdateMetadata: updateIndicatorState.metadata,
      leftPane: leftExplorer,
      rightPane: rightExplorer,
    })
  }

  function scheduleSessionSave() {
    if (!persistenceReady) {
      return
    }

    if (saveSessionTimer !== null) {
      window.clearTimeout(saveSessionTimer)
    }

    saveSessionTimer = window.setTimeout(() => {
      saveSessionTimer = null
      const session = buildCurrentPersistedSession()
      const sessionFingerprint = JSON.stringify(session)

      if (sessionFingerprint === lastSavedSessionFingerprint) {
        return
      }

      void saveSessionState(session)
        .then(() => {
          lastSavedSessionFingerprint = sessionFingerprint
        })
        .catch(() => undefined)
    }, SESSION_SAVE_DELAY_MS)
  }

  function getCurrentFileLabel() {
    if (mode === 'directory') {
      return directoryCompareEntryLabel(
        selectedRelativePath,
        visibleDirectoryEntries(),
        'No file selected',
      )
    }

    return fileCompareLabel(activeDiff, 'No file selected')
  }

  function getPaneLabel(side: Side) {
    if (mode === 'directory') {
      return directoryCompareEntryLabel(selectedRelativePath, visibleDirectoryEntries(), '')
    }

    return filePaneLabel(activeDiff, side)
  }

  $: {
    const { leftSegments, rightSegments } = splitCommonPathPrefix(leftPath, rightPath)
    leftCompareRoot = buildCompareRootDisplay(leftPath, leftSegments)
    rightCompareRoot = buildCompareRootDisplay(rightPath, rightSegments)
  }

  $: {
    mode
    selectedRelativePath
    activeDiff
    directoryEntries
    filteredDirectoryEntries

    diffHeaderContext = {
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
  }

  $: textDiffActive = mode === 'directory'
    ? directoryRenderableEntryCount > 0
    : activeDiff?.contentKind === 'text'
  $: canNavigateDiffs = false
  $: canGoToPreviousDiff = false
  $: canGoToNextDiff = false
  $: {
    const appearanceState = resolveAppearanceState(appearanceSettings, systemPrefersDark)
    resolvedThemeMode = appearanceState.resolvedThemeMode
    lightAppearanceTheme = appearanceState.lightAppearanceTheme
    darkAppearanceTheme = appearanceState.darkAppearanceTheme
    visibleAppearanceVariants = appearanceState.visibleAppearanceVariants
  }

  $: if (screen === 'compare') {
    void loadCompareComponents().catch((error) => {
      errorMessage = error instanceof Error ? error.message : 'Unable to load compare view.'
    })
  }

  $: if (screen === 'compare') {
    activeDiff
    viewMode
  } else {
    currentDiffHunk = -1
  }

  $: if (typeof document !== 'undefined') {
    const root = document.documentElement
    applyAppearanceToRoot(root, appearanceSettings, systemPrefersDark, resolvedThemeMode)
  }

  $: if (persistenceReady) {
    mode
    viewMode
    appearanceSettings
    viewerSettings
    treeSettings
    ignoreWhitespace
    ignoreCase
    checkForUpdatesOnLaunch
    updateChannel
    lastUpdateCheckAt
    updateIndicatorState
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

  $: compareNeedsRefresh = compareDirtyReason !== null
  $: pickerCanCompare = paneCanCompare(leftExplorer, mode) && paneCanCompare(rightExplorer, mode)
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
  $: leftPickerReady = paneCanCompare(leftExplorer, mode)
  $: rightPickerReady = paneCanCompare(rightExplorer, mode)
  $: setupHintMessage = pickerCanCompare
    ? ''
    : !leftPickerReady && !rightPickerReady
      ? `Select ${mode === 'directory' ? 'left and right folders' : 'left and right files'}.`
      : !leftPickerReady
        ? `Select the left ${mode === 'directory' ? 'folder' : 'file'}.`
        : `Select the right ${mode === 'directory' ? 'folder' : 'file'}.`
  $: setupTopbarWarning = sameSelectionWarning || setupHintMessage
  $: leftSetupTargetLabel = formatPickerTargetLabel(leftExplorer.selectedTargetPath, 'Not selected')
  $: rightSetupTargetLabel = formatPickerTargetLabel(rightExplorer.selectedTargetPath, 'Not selected')
  $: comparePairsLabel = (() => {
    const count = directoryComparePairs.length
    if (count > 1) {
      return `${count} folder pairs`
    }
    return `${leftSetupTargetLabel} ↔ ${rightSetupTargetLabel}`
  })()
  $: comparePairsTooltip = (() => {
    if (directoryComparePairs.length > 1) {
      return directoryComparePairs
        .map((pair) => `${pair.leftBase}\n  ↔ ${pair.rightBase}`)
        .join('\n')
    }
    const left = leftExplorer.selectedTargetPath || 'Left target not selected'
    const right = rightExplorer.selectedTargetPath || 'Right target not selected'
    return `${left}\n  ↔ ${right}`
  })()
</script>

<svelte:head>
  <title>Diffly</title>
</svelte:head>

{#if screen === 'setup'}
  <SetupScreen
    {updateIndicatorState}
    showUpdateIndicator={shouldShowUpdateIndicator()}
    updateIndicatorTitle={updateIndicatorTitle()}
    {openUpdateSettings}
    {setupTopbarWarning}
    {loading}
    {pickerCanCompare}
    {sameSelectionWarning}
    {setupHintMessage}
    {runCompare}
    {openSettings}
    {errorMessage}
    {pickerSides}
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
{:else if screen === 'compare'}
  <CompareScreen
    {updateIndicatorState}
    showUpdateIndicator={shouldShowUpdateIndicator()}
    updateIndicatorTitle={updateIndicatorTitle()}
    {openUpdateSettings}
    {mode}
    {compareSidebarWidth}
    {compareSurfaceTransitioning}
    {diffHeaderContext}
    {selectedRelativePath}
    {comparePairsTooltip}
    {comparePairsLabel}
    {viewMode}
    {textDiffActive}
    {toggleViewMode}
    {loading}
    {detailLoading}
    {pickerLoading}
    {swapComparedSides}
    {compareNeedsRefresh}
    {runCompare}
    {openSettings}
    {goToSetup}
    {errorMessage}
    {compareSidebarResizeActive}
    {PierreDirectoryTreeComponent}
    {CompareViewerComponent}
    {directoryEntries}
    {directoryEntriesRevision}
    {treeSettings}
    {appearanceSettings}
    {resolvedThemeMode}
    {selectEntry}
    {resetCompareSidebarWidth}
    {startCompareSidebarResize}
    {activeDiff}
    {directoryScrollTargetRevision}
    {viewerSettings}
    {compareRevision}
    {leftPath}
    {rightPath}
    {activeCompareOptions}
    {diffStats}
    {systemMonitor}
    onDiffStatsChange={setDiffStats}
    onSystemMonitorChange={setSystemMonitor}
    {getDetailBasesForPath}
  />
{:else}
  <SettingsRoute
    {activeSettingsSection}
    {appearanceSettings}
    {resolvedThemeMode}
    {lightAppearanceTheme}
    {darkAppearanceTheme}
    {visibleAppearanceVariants}
    {availableLightThemes}
    {availableDarkThemes}
    {viewMode}
    {viewerSettings}
    {treeSettings}
    minUiFontSize={MIN_UI_FONT_SIZE}
    maxUiFontSize={MAX_UI_FONT_SIZE}
    minCodeFontSize={MIN_CODE_FONT_SIZE}
    maxCodeFontSize={MAX_CODE_FONT_SIZE}
    {checkForUpdatesOnLaunch}
    {updateChannel}
    {updateIndicatorState}
    {lastUpdateCheckAt}
    {errorMessage}
    showUpdateIndicator={shouldShowUpdateIndicator()}
    updateIndicatorTitle={updateIndicatorTitle()}
    {openUpdateSettings}
    onClose={goBackFromSettings}
    onSelectSection={(section) => (activeSettingsSection = section)}
    onSetThemeMode={setThemeMode}
    onSetThemePreset={setThemePreset}
    onSetThemeColor={setThemeColorOverride}
    onSetThemeSemanticColor={setThemeSemanticColorOverride}
    onSetThemeFont={setThemeFontOverride}
    onSetThemeContrast={setThemeContrast}
    onSetUsePointerCursor={setUsePointerCursor}
    onStepUiFontSize={stepUiFontSize}
    onStepCodeFontSize={stepCodeFontSize}
    onSetViewMode={setViewMode}
    onSetViewerSettings={(settings) => {
      viewerSettings = settings
      viewMode = settings.diffStyle === 'split' ? 'sideBySide' : 'unified'
    }}
    onSetTreeSettings={(settings) => {
      treeSettings = settings
    }}
    onSetCheckForUpdatesOnLaunch={setCheckForUpdatesOnLaunch}
    onSetUpdateChannel={setUpdateChannel}
    onCheckForUpdates={runUpdateCheck}
    onDownloadUpdate={beginUpdateDownload}
    onInstallUpdate={applyDownloadedUpdate}
    onResetPreferences={confirmResetPreferences}
    onClearRememberedSelections={confirmClearRememberedSelections}
    onResetEverything={resetEverything}
  />
{/if}
