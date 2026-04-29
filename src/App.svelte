<script lang="ts">
  import { onMount, tick } from 'svelte'
  import DirectoryBrowser from './lib/DirectoryBrowser.svelte'
  import DiffViewer from './lib/DiffViewer.svelte'
  import AppTopBar from './lib/AppTopBar.svelte'
  import PickerPane from './lib/PickerPane.svelte'
  import SettingsScreen from './lib/SettingsScreen.svelte'

  import {
    choosePath,
    checkForUpdates,
    comparePaths,
    downloadUpdate,
    getAppVersion,
    installUpdate,
    listDirectory,
    listRoots,
    loadBinaryPreview,
    loadSessionState,
    onLaunchContext,
    openCompareItem,
    pollDirectoryCompare,
    pathInfo,
    saveSessionState,
    startDirectoryCompare,
  } from './lib/api'
  import {
    buildSideBySideHunkRanges,
    buildSideBySideRenderItems,
    buildUnifiedHunkRanges,
    buildUnifiedRenderItems,
  } from './lib/diff-render'
  import {
    sideBySideMinimapRows,
    sideBySideItemMinimapRows,
    unifiedMinimapRows,
    unifiedItemMinimapRows,
    type MinimapRow,
  } from './lib/minimap-render'
  import { createDiffCacheController } from './lib/app/diff-cache'
  import {
    clampScrollOffset,
    getMaxScrollLeft,
    getMaxScrollTop,
    getScrollTopForAnchor,
    mapScrollOffset,
    normalizeWheelDelta,
  } from './lib/app/pane-scroll-sync'
  import {
    createUpdateController,
    formatLastUpdateCheck,
    formatLastUpdateCheckRelative,
    formatUpdateChannelLabel,
    getUpdateIndicatorTitle,
    shouldShowUpdateIndicator as shouldShowUpdateIndicatorState,
    type UpdateIndicatorState,
    type UpdateStatus,
  } from './lib/app/update-controller'
  import { readStartupFolderOverride } from './lib/app/startup'
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
    setThemeTranslucency as applyThemeTranslucency,
  } from './lib/app/theme-controller'
  import { entryTypeLabel, formatModified, formatSize } from './lib/format'
  import {
    buildFolderSections,
    formatCompactPath,
    formatRelativePathLabel,
    getFileName,
    getVisibleFolderSections,
    normalizeSelectionPath,
    splitCommonPathPrefix,
  } from './lib/path-utils'
  import {
    buildGroups,
    defaultDirectoryEntry,
    filterDirectoryEntries,
    reconcileCollapsedState,
  } from './lib/app/directory-state'
  import {
    buildNextHistoryState,
    canGoBack,
    canGoForward,
    createExplorerPane,
    currentDrive,
    retitlePane,
    sanitizePaneForMode,
  } from './lib/app/explorer-state'
  import { buildPersistedSession } from './lib/app/session'
  import type {
    CompareMode,
    CompareOptions,
    ContextLinesSetting,
    DirectoryEntryResult,
    EntryStatus,
    ExplorerEntry,
    FileDiffResult,
    LaunchContext,
    PathKind,
    PersistedExplorerPane,
    PersistedSession,
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
    DiffHunkRange,
    EntryGroup,
    ExplorerPaneState,
    FolderSection,
    SettingsSection,
    Side,
    SideBySideRenderItem,
    UnifiedRenderItem,
  } from './lib/ui-types'

  const SESSION_SAVE_DELAY_MS = 180
  const THEME_SWITCH_DURATION_MS = 140
  const BACKGROUND_DIFF_PRELOAD_DELAY_MS = 250
  const BACKGROUND_DIFF_PRELOAD_CONCURRENCY = 1
  const IMMEDIATE_DETAIL_PRIME_COUNT = 2
  const DIRECTORY_COMPARE_POLL_INTERVAL_MS = 50
  const DEFAULT_COMPARE_SIDEBAR_WIDTH = 280
  const FULL_FILE_NAVIGATION_REFRESH_DELAY_MS = 140
  const FULL_FILE_RENDER_ITEM_DEFER_THRESHOLD = 300
  const PANE_WHEEL_SMOOTHING = 0.18
  const PANE_WHEEL_MIN_STEP = 1.25
  const DEFAULT_CONTEXT_LINES: ContextLinesSetting = 3
  const contextLinePresets: ContextLinesSetting[] = [3, 10, 20]
  const DEFAULT_UPDATE_CHANNEL: UpdateChannel = 'stable'

  type Screen = 'setup' | 'compare' | 'settings'
  type CompareDirtyReason = 'comparisonRules'
  interface CompareRootDisplay {
    prefix: string
    suffix: string
    fullPath: string
  }

  interface DiffScrollSnapshot {
    viewMode: ViewMode
    leftTop: number
    rightTop: number
    unifiedTop: number
  }

  interface StartupTarget {
    folderPath: string
    targetPath: string
    kind: PathKind
  }

  export let initialSession: PersistedSession | null = null
  export let startupFolderPath: string | null = null

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
  let showFullFile = false
  let showInlineHighlights = true
  let wrapSideBySideLines = false
  let showSyntaxHighlighting = true
  let syncSideBySideScroll = true
  let contextLines: ContextLinesSetting = DEFAULT_CONTEXT_LINES
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
  let activeDirectoryCompareJobId = ''
  let directoryComparePollTimer: number | null = null
  let directoryCompareEntrySlots: Array<DirectoryEntryResult | null | undefined> = []
  type DirectoryComparePair = {
    id: string
    leftBase: string
    rightBase: string
    label: string
  }
  let directoryComparePairs: DirectoryComparePair[] = []
  let directoryComparePairSlots: Array<Array<DirectoryEntryResult | null | undefined>> = []
  let directoryComparePairJobs: Array<{ jobId: string; pairIndex: number; done: boolean }> = []
  let directoryComparePairTimers: Array<number | null> = []
  let scrollEchoTarget: 'left' | 'right' | null = null
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
  let initialSessionFingerprint: string | null = null
  let themeTransitionTimer: number | null = null
  let activeDetailRequestId = 0
  let compareSidebarWidth = DEFAULT_COMPARE_SIDEBAR_WIDTH
  let compareSidebarResizeActive = false
  let compareDirtyReason: CompareDirtyReason | null = null
  let compareNeedsRefresh = false
  let leftExplorer = createExplorerPane('Left')
  let rightExplorer = createExplorerPane('Right')
  let sideBySideHunkRanges: DiffHunkRange[] = []
  let unifiedHunkRanges: DiffHunkRange[] = []
  let sideBySideRenderItems: SideBySideRenderItem[] = []
  let unifiedRenderItems: UnifiedRenderItem[] = []
  let sideBySideMinimapData: MinimapRow[] = []
  let unifiedMinimapData: MinimapRow[] = []
  let maxLineNumber = 0
  let visibleDiffHunkCount = 0
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
    buildSideBySideHunkRanges,
    buildUnifiedHunkRanges,
    buildSideBySideRenderItems,
    buildUnifiedRenderItems,
    sideBySideMinimapRows,
    unifiedMinimapRows,
    sideBySideItemMinimapRows,
    unifiedItemMinimapRows,
    openCompareItem,
  })
  const updateController = createUpdateController({
    getAppVersion,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
  })
  let diffFontSize = `${appearanceSettings.codeFontSize}px`
  let diffRowLineHeight = `${appearanceSettings.codeFontSize + 3}px`
  let diffRowHeight = `${appearanceSettings.codeFontSize + 8}px`
  let updateIndicatorState: UpdateIndicatorState = {
    status: 'idle',
    currentVersion: '',
    metadata: null,
    message: 'Check for updates from any screen.',
  }
  let startupUpdateCheckStarted = false

  const statusLabel = {
    modified: 'Modified',
    leftOnly: 'Left only',
    rightOnly: 'Right only',
    binary: 'Binary',
    tooLarge: 'Too large',
  }
  const statusOrder: EntryStatus[] = ['modified', 'leftOnly', 'rightOnly', 'binary', 'tooLarge']
  const availableLightThemes = getAvailableThemes('light')
  const availableDarkThemes = getAvailableThemes('dark')
  let lightAppearanceTheme: ThemeDefinition = getAvailableThemes('light')[0]
  let darkAppearanceTheme: ThemeDefinition = getAvailableThemes('dark')[0]
  let visibleAppearanceVariants: ThemeVariant[] = ['light']

  const getPendingCompareOptions = (): CompareOptions => ({
    ignoreWhitespace,
    ignoreCase,
  })

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
    viewMode = viewMode === 'sideBySide' ? 'unified' : 'sideBySide'
  }

  function clampCompareSidebarWidth(value: number) {
    return Math.min(420, Math.max(240, Math.round(value)))
  }

  function stopCompareSidebarResize() {
    compareSidebarResizeActive = false
  }

  function updateCompareSidebarWidth(clientX: number) {
    if (typeof window === 'undefined') {
      return
    }

    compareSidebarWidth = clampCompareSidebarWidth(clientX)
  }

  function resetCompareSidebarWidth() {
    compareSidebarWidth = DEFAULT_COMPARE_SIDEBAR_WIDTH
    stopCompareSidebarResize()
  }

  function startCompareSidebarResize(event: PointerEvent) {
    if (mode !== 'directory') {
      return
    }

    compareSidebarResizeActive = true
    updateCompareSidebarWidth(event.clientX)

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateCompareSidebarWidth(moveEvent.clientX)
    }

    const handlePointerUp = () => {
      stopCompareSidebarResize()
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
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

  const toggleSyncSideBySideScroll = () => {
    syncSideBySideScroll = !syncSideBySideScroll

    if (!syncSideBySideScroll) {
      cancelPaneNavigationScroll()
      cancelPaneWheelScroll()
    }
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

      removeLaunchContextListener()
      diffCache.cancelBackgroundPreload()

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

      clearDirectoryComparePollTimer()

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
  }

  function setShowFullFile(nextValue: boolean) {
    showFullFile = nextValue
  }

  function setWrapSideBySideLines(nextValue: boolean) {
    wrapSideBySideLines = nextValue
  }

  function setShowInlineHighlights(nextValue: boolean) {
    showInlineHighlights = nextValue
  }

  function setShowSyntaxHighlighting(nextValue: boolean) {
    showSyntaxHighlighting = nextValue
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

  function setThemeTranslucency(variant: ThemeVariant, enabled: boolean) {
    appearanceSettings = applyThemeTranslucency(appearanceSettings, variant, enabled)
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

  function waitForInitialPaint() {
    if (typeof window === 'undefined') {
      return Promise.resolve()
    }

    return new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.setTimeout(resolve, 0)
      })
    })
  }

  function isLaunchContext(value: unknown): value is LaunchContext {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as LaunchContext).openHerePath === 'string'
    )
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

  function stopDirectoryComparePolling(clearEntries = false) {
    clearDirectoryComparePollTimer()
    activeDirectoryCompareJobId = ''
    directoryComparePairJobs = []
    directoryComparePairTimers = []
    if (clearEntries) {
      directoryCompareEntrySlots = []
      directoryComparePairs = []
      directoryComparePairSlots = []
    }
  }

  function basenameOf(path: string) {
    const parts = path.split(/[\\/]+/).filter(Boolean)
    const last = parts[parts.length - 1] ?? path
    return /^[A-Za-z]:$/.test(last) ? `${last}\\` : last
  }

  function buildDirectoryComparePairs(
    leftPaths: string[],
    rightPaths: string[],
  ): DirectoryComparePair[] {
    // Selection order on left and right is independent (the user clicks in
    // arbitrary order). Pair by basename first so e.g. CPU on the left gets
    // matched with CPU on the right regardless of click order. Anything that
    // does not have a same-named partner falls back to index pairing on the
    // remaining items.
    const remainingRight = [...rightPaths]
    const matchedLeft: Array<{ leftBase: string; rightBase: string }> = []
    const unmatchedLeft: string[] = []

    for (const leftBase of leftPaths) {
      const leftName = basenameOf(leftBase)
      const matchIndex = remainingRight.findIndex(
        (candidate) => basenameOf(candidate) === leftName,
      )

      if (matchIndex >= 0) {
        const [rightBase] = remainingRight.splice(matchIndex, 1)
        matchedLeft.push({ leftBase, rightBase })
      } else {
        unmatchedLeft.push(leftBase)
      }
    }

    const fallbackPairs: Array<{ leftBase: string; rightBase: string }> = []
    for (const [index, leftBase] of unmatchedLeft.entries()) {
      const rightBase = remainingRight[index] ?? leftBase
      fallbackPairs.push({ leftBase, rightBase })
    }

    const orderedPairs = [...matchedLeft, ...fallbackPairs]
    const labels: string[] = []

    return orderedPairs.map(({ leftBase, rightBase }, index) => {
      const leftName = basenameOf(leftBase)
      const rightName = basenameOf(rightBase)
      const baseLabel = leftName === rightName ? leftName : `${leftName} ↔ ${rightName}`

      let label = baseLabel
      let suffix = 2
      while (labels.includes(label)) {
        label = `${baseLabel} (${suffix})`
        suffix += 1
      }
      labels.push(label)

      return {
        id: `${index}-${leftBase}-${rightBase}`,
        leftBase,
        rightBase,
        label,
      }
    })
  }

  function isMultiPairCompare() {
    return directoryComparePairs.length > 1
  }

  function findDirectoryComparePairForPath(prefixedPath: string) {
    if (directoryComparePairs.length === 0) {
      return null
    }

    if (directoryComparePairs.length === 1) {
      return { pair: directoryComparePairs[0], relativePath: prefixedPath }
    }

    for (const pair of directoryComparePairs) {
      const prefix = `${pair.label}/`
      if (prefixedPath === pair.label) {
        return { pair, relativePath: '' }
      }

      if (prefixedPath.startsWith(prefix)) {
        return { pair, relativePath: prefixedPath.slice(prefix.length) }
      }
    }

    return null
  }

  function prefixedRelativePathFor(pair: DirectoryComparePair, relativePath: string) {
    if (!isMultiPairCompare()) {
      return relativePath
    }

    return relativePath ? `${pair.label}/${relativePath}` : pair.label
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

  function getOrCreateDetailDiffPromise(relativePath: string, revision = compareRevision) {
    const bases = getDetailBasesForPath(relativePath)
    return diffCache.getOrCreateDetailDiffPromise({
      revision,
      leftPath: bases.leftBase,
      rightPath: bases.rightBase,
      relativePath: bases.relativePath,
      ignoreWhitespace: activeCompareOptions.ignoreWhitespace,
      ignoreCase: activeCompareOptions.ignoreCase,
    })
  }

  function captureDiffScrollSnapshot(): DiffScrollSnapshot | null {
    if (!activeDiff || activeDiff.contentKind !== 'text') {
      return null
    }

    return {
      viewMode,
      leftTop: leftPaneScroll?.scrollTop ?? 0,
      rightTop: rightPaneScroll?.scrollTop ?? 0,
      unifiedTop: unifiedScroll?.scrollTop ?? 0,
    }
  }

  async function restoreDiffScrollSnapshot(snapshot: DiffScrollSnapshot | null) {
    if (!snapshot || !activeDiff || activeDiff.contentKind !== 'text') {
      return
    }

    await tick()

    if (snapshot.viewMode === 'sideBySide') {
      if (leftPaneScroll) {
        leftPaneScroll.scrollTop = clampScrollOffset(snapshot.leftTop, getMaxScrollTop(leftPaneScroll))
      }

      if (rightPaneScroll) {
        rightPaneScroll.scrollTop = clampScrollOffset(snapshot.rightTop, getMaxScrollTop(rightPaneScroll))
      }
      return
    }

    if (unifiedScroll) {
      unifiedScroll.scrollTop = clampScrollOffset(snapshot.unifiedTop, getMaxScrollTop(unifiedScroll))
    }
  }

  function isImmediatePrimeCandidate(entry: DirectoryEntryResult, centerRelativePath: string) {
    return (
      entry.relativePath !== centerRelativePath &&
      entry.status !== 'binary' &&
      entry.status !== 'tooLarge'
    )
  }

  function primeAdjacentDetailDiffs(
    centerRelativePath: string,
    revision = compareRevision,
    entries = filteredDirectoryEntries,
  ) {
    if (
      mode !== 'directory' ||
      !leftPath ||
      !rightPath ||
      IMMEDIATE_DETAIL_PRIME_COUNT <= 0 ||
      entries.length < 2
    ) {
      return
    }

    const centerIndex = entries.findIndex((entry) => entry.relativePath === centerRelativePath)
    if (centerIndex === -1) {
      return
    }

    const primePaths: string[] = []

    for (
      let offset = 1;
      offset < entries.length && primePaths.length < IMMEDIATE_DETAIL_PRIME_COUNT;
      offset += 1
    ) {
      const nextEntry = entries[centerIndex + offset]
      if (
        nextEntry &&
        isImmediatePrimeCandidate(nextEntry, centerRelativePath) &&
        !primePaths.includes(nextEntry.relativePath)
      ) {
        primePaths.push(nextEntry.relativePath)
      }

      const previousEntry = entries[centerIndex - offset]
      if (
        previousEntry &&
        isImmediatePrimeCandidate(previousEntry, centerRelativePath) &&
        !primePaths.includes(previousEntry.relativePath)
      ) {
        primePaths.push(previousEntry.relativePath)
      }
    }

    for (const relativePath of primePaths) {
      void getOrCreateDetailDiffPromise(relativePath, revision).catch(() => {
        // Leave neighbor-prime failures to explicit file open handling.
      })
    }
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

    for (const update of updates) {
      if (update.index >= slots.length) {
        slots.length = update.index + 1
      }

      slots[update.index] = update.entry
    }

    rebuildDirectoryEntriesFromPairs()
  }

  function rebuildDirectoryEntriesFromPairs() {
    const isMulti = isMultiPairCompare()
    const aggregated: DirectoryEntryResult[] = []

    for (const [pairIndex, slots] of directoryComparePairSlots.entries()) {
      const pair = directoryComparePairs[pairIndex]
      if (!pair) {
        continue
      }

      for (const entry of slots) {
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
    syncFilteredDirectoryState(aggregated)
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

      if (!detailLoading && !activeDiff) {
        const preservedEntry = previousSelectedPath
          ? filteredDirectoryEntries.find((entry) => entry.relativePath === previousSelectedPath)
          : undefined
        const nextEntry =
          preservedEntry ??
          (filteredDirectoryEntries.length > 0 ? defaultDirectoryEntry(filteredDirectoryEntries) : null)

        if (nextEntry) {
          primeAdjacentDetailDiffs(nextEntry.relativePath, revision)
          void selectEntry(
            nextEntry,
            revision,
            nextEntry.relativePath === previousSelectedPath ? restoreScroll : null,
          )
        }
      }

      if (response.done) {
        stillTracking.done = true

        if (response.error) {
          errorMessage = response.error
        }

        const allDone = directoryComparePairJobs.every((entry) => entry.done)
        if (allDone) {
          stopDirectoryComparePolling()
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

      if (roots.length > 0) {
        const startupFolderOverride =
          startupFolderPath ?? await readStartupFolderOverride().catch(() => null)
        const startupTarget = await resolveStartupTarget(startupFolderOverride)

        if (startupTarget) {
          await applyStartupTarget(startupTarget)
        } else {
          const leftRoot = await resolveInitialPanePath(
            savedSession?.leftPane ?? null,
            roots[0].path,
          )
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
      }

      initialSessionFingerprint = JSON.stringify(
        buildPersistedSession({
          mode,
          viewMode,
          appearanceSettings,
          ignoreWhitespace,
          ignoreCase,
          showFullFile,
          showInlineHighlights,
          wrapSideBySideLines,
          showSyntaxHighlighting,
          syncSideBySideScroll,
          contextLines,
          checkForUpdatesOnLaunch,
          updateChannel,
          lastUpdateCheckAt,
          lastUpdateStatus: updateIndicatorState.status,
          lastUpdateMetadata: updateIndicatorState.metadata,
          leftPane: leftExplorer,
          rightPane: rightExplorer,
        }),
      )
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Unable to initialize the picker.'
    } finally {
      pickerLoading = false
      persistenceReady = true
    }
  }

  async function applyStartupOverride(overridePath: string | null) {
    if (pickerLoading || leftExplorer.roots.length === 0 || rightExplorer.roots.length === 0) {
      return
    }

    const startupTarget = await resolveStartupTarget(overridePath)

    if (startupTarget) {
      await applyStartupTarget(startupTarget)
      screen = 'setup'
      errorMessage = ''
    }
  }

  async function applyStartupTarget(startupTarget: StartupTarget) {
    mode = startupTarget.kind

    await Promise.all([
      openDirectory('left', startupTarget.folderPath),
      openDirectory('right', startupTarget.folderPath),
    ])

    selectTarget('left', startupTarget.targetPath, startupTarget.kind)
    selectTarget('right', startupTarget.targetPath, startupTarget.kind)
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

    appearanceSettings = normalizeAppearanceSettings(
      session.appearance,
      session.themeMode,
      session.viewerTextSize
    )

    ignoreWhitespace = session.ignoreWhitespace
    ignoreCase = session.ignoreCase
    showFullFile = session.showFullFile
    showInlineHighlights = session.showInlineHighlights ?? true
    wrapSideBySideLines = session.wrapSideBySideLines ?? false
    showSyntaxHighlighting = session.showSyntaxHighlighting ?? true
    syncSideBySideScroll = session.syncSideBySideScroll ?? true
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

  async function resolveStartupTarget(overridePath: string | null): Promise<StartupTarget | null> {
    if (!overridePath) {
      return null
    }

    const info = await pathInfo(overridePath)

    if (info.exists && info.isDirectory) {
      return {
        folderPath: info.path,
        targetPath: info.path,
        kind: 'directory',
      }
    }

    if (info.exists && info.isFile && info.parentPath) {
      return {
        folderPath: info.parentPath,
        targetPath: info.path,
        kind: 'file',
      }
    }

    return null
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
    diffCache.clearDetailDiffs()
    cancelBackgroundDiffPreload()
    detailLoading = false
    compareDirtyReason = null
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

  function goToSetup() {
    activeDetailRequestId += 1
    detailLoading = false
    cancelBackgroundDiffPreload()
    compareDirtyReason = null
    screen = 'setup'
    errorMessage = ''
  }

  function resetPreferenceState() {
    mode = 'directory'
    viewMode = 'sideBySide'
    appearanceSettings = getDefaultAppearanceSettings()
    ignoreWhitespace = false
    ignoreCase = false
    showFullFile = false
    showInlineHighlights = true
    wrapSideBySideLines = false
    showSyntaxHighlighting = true
    syncSideBySideScroll = true
    contextLines = DEFAULT_CONTEXT_LINES
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
      selectTarget(side, info.path, 'directory')
      return
    }

    if (info.isFile && info.parentPath) {
      await openDirectory(side, info.parentPath)
      selectTarget(side, info.path, 'file')
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
      !primary ? null : primary === path ? kind : primary === pane.selectedTargetPath ? pane.selectedTargetKind : null

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

  function canComparePane(pane: ExplorerPaneState) {
    return Boolean(pane.selectedTargetPath) && pane.selectedTargetKind === mode
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

    loading = true
    detailLoading = false
    errorMessage = ''
    activeDetailRequestId += 1
    cancelBackgroundDiffPreload()
    stopDirectoryComparePolling(true)
    leftPath = nextLeftPath
    rightPath = nextRightPath

    try {
      if (mode === 'directory') {
        compareRevision += 1
        const revision = compareRevision
        diffCache.clearDetailDiffs()
        activeCompareOptions = { ...nextCompareOptions }
        compareDirtyReason = null
        screen = 'compare'
        directoryEntries = []
        syncFilteredDirectoryState([])
        selectedRelativePath = ''
        activeDiff = null

        const pairs = buildDirectoryComparePairs(leftSelected, rightSelected)
        directoryComparePairs = pairs
        directoryComparePairSlots = pairs.map(() => [])
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
        return
      }

      const response = await comparePaths(
        nextLeftPath,
        nextRightPath,
        mode,
        nextCompareOptions,
      )
      compareRevision += 1
      diffCache.clearDetailDiffs()
      activeCompareOptions = { ...nextCompareOptions }
      compareDirtyReason = null
      screen = 'compare'

      if (response.kind === 'directory') {
        directoryEntries = response.entries
        syncFilteredDirectoryState(response.entries)

        const preservedEntry = filteredDirectoryEntries.find(
          (entry) => entry.relativePath === previousSelectedPath,
        )

        if (preservedEntry) {
          primeAdjacentDetailDiffs(preservedEntry.relativePath, compareRevision)
          void selectEntry(preservedEntry, compareRevision, restoreScroll)
        } else if (filteredDirectoryEntries.length > 0) {
          const nextEntry = defaultDirectoryEntry(filteredDirectoryEntries)
          primeAdjacentDetailDiffs(nextEntry.relativePath, compareRevision)
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
        if (response.result.contentKind === 'binary') {
          void loadActiveBinaryPreview(
            nextLeftPath,
            nextRightPath,
            activeDetailRequestId,
            compareRevision,
          ).catch(() => undefined)
        }
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Compare failed.'
    } finally {
      loading = false
    }
  }

  async function selectEntry(
    entry: DirectoryEntryResult,
    revision = compareRevision,
    restoreScroll: DiffScrollSnapshot | null = null,
  ) {
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

    // Bump the preload generation so existing workers exit after their current
    // IPC resolves. They won't pile up thanks to the bounded worker pool; the
    // new preload below re-enters the same pool immediately.
    cancelBackgroundDiffPreload()

    try {
      if (switchingEntry) {
        activeDiff = null
      }

      await tick()

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
          if (result.contentKind === 'binary') {
            void loadSelectedBinaryPreview(entry, requestId, revision)
          }
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

  async function loadSelectedBinaryPreview(
    entry: DirectoryEntryResult,
    requestId: number,
    revision: number,
  ) {
    if (
      !entry.leftPath ||
      !entry.rightPath
    ) {
      return
    }

    try {
      await loadActiveBinaryPreview(
        entry.leftPath,
        entry.rightPath,
        requestId,
        revision,
        entry.relativePath,
      )
    } catch {
      // Keep the placeholder binary state visible; the user can keep navigating.
    }
  }

  async function loadActiveBinaryPreview(
    leftFilePath: string,
    rightFilePath: string,
    requestId: number,
    revision: number,
    relativePath = '',
  ) {
    const preview = await loadBinaryPreview(leftFilePath, rightFilePath, {
      ignoreWhitespace: false,
      ignoreCase: false,
    })

    if (
      revision === compareRevision &&
      requestId === activeDetailRequestId &&
      (relativePath === '' || selectedRelativePath === relativePath) &&
      activeDiff?.contentKind === 'binary'
    ) {
      activeDiff = {
        ...activeDiff,
        binary: preview,
      }
    }
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

  function getActiveDiffHunkRanges() {
    if (!activeDiff || activeDiff.contentKind !== 'text') {
      return []
    }

    return viewMode === 'sideBySide' ? sideBySideHunkRanges : unifiedHunkRanges
  }

  function canUseComputedFullFileNavigation() {
    if (!activeDiff || activeDiff.contentKind !== 'text' || !showFullFile) {
      return false
    }

    return viewMode === 'unified' || !wrapSideBySideLines
  }

  function getApproximateDiffRowHeightPx() {
    return Math.max(1, Number.parseFloat(diffRowHeight) || 19)
  }

  function getCurrentDiffHunkFromScrollTop(
    scrollTop: number,
    hunkRanges: DiffHunkRange[],
    rowHeightPx: number,
  ) {
    if (hunkRanges.length === 0) {
      return -1
    }

    const threshold = scrollTop + 16
    let low = 0
    let high = hunkRanges.length - 1
    let currentIndex = -1

    while (low <= high) {
      const middle = Math.floor((low + high) / 2)
      const anchorTop = hunkRanges[middle].start * rowHeightPx

      if (anchorTop <= threshold) {
        currentIndex = middle
        low = middle + 1
      } else {
        high = middle - 1
      }
    }

    return currentIndex
  }

  function getScrollTopForHunk(
    targetIndex: number,
    hunkRanges: DiffHunkRange[],
    rowHeightPx: number,
  ) {
    const targetHunk = hunkRanges[targetIndex]

    if (!targetHunk) {
      return null
    }

    return targetHunk.start * rowHeightPx
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
    let nextCurrentIndex = -1

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

    if (!container) {
      currentDiffHunk = -1
      return
    }

    if (canUseComputedFullFileNavigation()) {
      const hunkRanges = getActiveDiffHunkRanges()

      currentDiffHunk = getCurrentDiffHunkFromScrollTop(
        container.scrollTop,
        hunkRanges,
        getApproximateDiffRowHeightPx(),
      )
      return
    }

    const anchors = getActiveDiffAnchors()

    if (anchors.length === 0) {
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

    if (!container) {
      return
    }

    currentDiffHunk = targetIndex
    const behavior = prefersReducedMotion() ? 'auto' : 'smooth'

    if (canUseComputedFullFileNavigation()) {
      const nextTop = getScrollTopForHunk(
        targetIndex,
        getActiveDiffHunkRanges(),
        getApproximateDiffRowHeightPx(),
      )

      if (nextTop === null) {
        return
      }

      if (viewMode === 'sideBySide') {
        scrollSideBySidePanes(nextTop, nextTop, behavior)
        return
      }

      container.scrollTo({
        top: nextTop,
        behavior,
      })
      return
    }

    const anchors = getActiveDiffAnchors()
    const anchor = anchors[targetIndex]

    if (!anchor) {
      return
    }

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
      currentDiffHunk === -1 ? 0 : currentDiffHunk + 1,
    )
    scrollDiffHunkIntoView(targetIndex)
  }

  function getPaneScroll(side: 'left' | 'right') {
    return side === 'left' ? leftPaneScroll : rightPaneScroll
  }

  function getPaneContentRoot(pane: HTMLDivElement) {
    const contentRoot = pane.querySelector('[data-pane-content-root="true"]')
    return contentRoot instanceof HTMLDivElement ? contentRoot : null
  }

  function findPaneItemAtOffset(contentRoot: HTMLDivElement, offset: number) {
    const items = contentRoot.children as HTMLCollectionOf<HTMLElement>

    if (items.length === 0) {
      return null
    }

    let low = 0
    let high = items.length - 1

    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      const item = items.item(mid)

      if (!item) {
        break
      }

      const top = item.offsetTop
      const bottom = top + item.offsetHeight

      if (offset < top) {
        high = mid - 1
      } else if (offset >= bottom) {
        low = mid + 1
      } else {
        return { index: mid, item }
      }
    }

    const fallbackIndex = Math.max(
      0,
      Math.min(items.length - 1, low >= items.length ? items.length - 1 : Math.max(0, low - 1)),
    )
    const fallbackItem = items.item(fallbackIndex)

    if (!fallbackItem) {
      return null
    }

    return { index: fallbackIndex, item: fallbackItem }
  }

  function mapPaneScrollTop(sourcePane: HTMLDivElement, targetPane: HTMLDivElement) {
    const sourceContentRoot = getPaneContentRoot(sourcePane)
    const targetContentRoot = getPaneContentRoot(targetPane)
    const sourceMaxScrollTop = getMaxScrollTop(sourcePane)
    const targetMaxScrollTop = getMaxScrollTop(targetPane)

    if (!wrapSideBySideLines) {
      return clampScrollOffset(sourcePane.scrollTop, targetMaxScrollTop)
    }

    if (sourcePane.scrollTop <= 1) {
      return 0
    }

    if (sourceMaxScrollTop - sourcePane.scrollTop <= 1) {
      return targetMaxScrollTop
    }

    if (!sourceContentRoot || !targetContentRoot) {
      return clampScrollOffset(sourcePane.scrollTop, targetMaxScrollTop)
    }

    if (sourceContentRoot.children.length !== targetContentRoot.children.length) {
      return clampScrollOffset(sourcePane.scrollTop, targetMaxScrollTop)
    }

    const sourceLastItem = sourceContentRoot.lastElementChild
    const targetLastItem = targetContentRoot.lastElementChild

    if (sourceLastItem instanceof HTMLElement && targetLastItem instanceof HTMLElement) {
      const sourceTrailingStart = Math.max(
        0,
        sourceLastItem.offsetTop + sourceLastItem.offsetHeight - sourcePane.clientHeight,
      )
      const targetTrailingStart = Math.max(
        0,
        targetLastItem.offsetTop + targetLastItem.offsetHeight - targetPane.clientHeight,
      )

      if (sourcePane.scrollTop >= sourceTrailingStart) {
        const sourceTrailingRange = Math.max(1, sourceMaxScrollTop - sourceTrailingStart)
        const targetTrailingRange = Math.max(0, targetMaxScrollTop - targetTrailingStart)
        const trailingProgress = clampScrollOffset(
          (sourcePane.scrollTop - sourceTrailingStart) / sourceTrailingRange,
          1,
        )

        return clampScrollOffset(
          targetTrailingStart + trailingProgress * targetTrailingRange,
          targetMaxScrollTop,
        )
      }
    }

    const sourceMatch = findPaneItemAtOffset(sourceContentRoot, sourcePane.scrollTop)

    if (!sourceMatch) {
      return clampScrollOffset(sourcePane.scrollTop, targetMaxScrollTop)
    }

    const targetItem = targetContentRoot.children.item(sourceMatch.index)

    if (!(targetItem instanceof HTMLElement)) {
      return clampScrollOffset(sourcePane.scrollTop, targetMaxScrollTop)
    }

    const sourceItemHeight = Math.max(sourceMatch.item.offsetHeight, 1)
    const targetItemHeight = Math.max(targetItem.offsetHeight, 1)
    const offsetWithinItem = clampScrollOffset(
      sourcePane.scrollTop - sourceMatch.item.offsetTop,
      sourceItemHeight,
    )
    const itemProgress = offsetWithinItem / sourceItemHeight

    return clampScrollOffset(
      targetItem.offsetTop + itemProgress * targetItemHeight,
      targetMaxScrollTop,
    )
  }

  function applyPaneScrollSync(source: 'left' | 'right') {
    const sourcePane = getPaneScroll(source)
    const targetSide = source === 'left' ? 'right' : 'left'
    const targetPane = getPaneScroll(targetSide)

    if (!sourcePane || !targetPane) {
      return
    }

    const nextTargetTop = mapPaneScrollTop(sourcePane, targetPane)
    const nextTargetLeft = clampScrollOffset(sourcePane.scrollLeft, getMaxScrollLeft(targetPane))

    scrollEchoTarget = targetSide
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

    if (!sourcePane || event.ctrlKey) {
      return
    }

    if (event.shiftKey) {
      event.preventDefault()

      const deltaLeft = normalizeWheelDelta(
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY,
        event.deltaMode,
      )
      const maxScrollLeft = getMaxScrollLeft(sourcePane)
      const nextScrollLeft = clampScrollOffset(sourcePane.scrollLeft + deltaLeft, maxScrollLeft)

      if (Math.abs(nextScrollLeft - sourcePane.scrollLeft) >= 0.5) {
        sourcePane.scrollLeft = nextScrollLeft
        applyPaneScrollSync(source)
      }

      return
    }

    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
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

      const stepMagnitude = Math.min(
        Math.abs(remaining),
        Math.max(PANE_WHEEL_MIN_STEP, Math.abs(remaining) * PANE_WHEEL_SMOOTHING),
      )
      const step = Math.sign(remaining) * stepMagnitude
      activePane.scrollTop = clampScrollOffset(
        activePane.scrollTop + step,
        getMaxScrollTop(activePane),
      )
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

    if (source === scrollEchoTarget) {
      scrollEchoTarget = null
      return
    }

    applyPaneScrollSync(source)
  }

  function scheduleSessionSave() {
    if (!persistenceReady) {
      return
    }

    if (saveSessionTimer !== null) {
      window.clearTimeout(saveSessionTimer)
    }

    const session = buildPersistedSession({
      mode,
      viewMode,
      appearanceSettings,
      ignoreWhitespace,
      ignoreCase,
      showFullFile,
      showInlineHighlights,
      wrapSideBySideLines,
      showSyntaxHighlighting,
      syncSideBySideScroll,
      contextLines,
      checkForUpdatesOnLaunch,
      updateChannel,
      lastUpdateCheckAt,
      lastUpdateStatus: updateIndicatorState.status,
      lastUpdateMetadata: updateIndicatorState.metadata,
      leftPane: leftExplorer,
      rightPane: rightExplorer,
    })

    const sessionFingerprint = JSON.stringify(session)

    if (initialSessionFingerprint !== null && sessionFingerprint === initialSessionFingerprint) {
      return
    }

    saveSessionTimer = window.setTimeout(() => {
      void saveSessionState(session).catch(() => undefined)
      saveSessionTimer = null
    }, SESSION_SAVE_DELAY_MS)
  }

  function isCurrentFolderSelected(pane: ExplorerPaneState) {
    return pane.selectedTargetKind === 'directory' && pane.selectedTargetPath === pane.currentPath
  }

  function isTargetSelected(pane: ExplorerPaneState, entry: ExplorerEntry) {
    const paths = pane.selectedTargetPaths
    if (paths && paths.length > 0) {
      return paths.includes(entry.path)
    }
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

  function shouldDeferFullFileRenderItems() {
    if (!activeDiff || activeDiff.contentKind !== 'text' || !showFullFile) {
      return false
    }

    if (viewMode === 'sideBySide') {
      return (
        !wrapSideBySideLines &&
        activeDiff.sideBySide.length > FULL_FILE_RENDER_ITEM_DEFER_THRESHOLD
      )
    }

    return activeDiff.unified.length > FULL_FILE_RENDER_ITEM_DEFER_THRESHOLD
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
    maxLineNumber = diffCache.getCachedMaxLineNumber(activeDiff)
    if (viewMode === 'sideBySide') {
      sideBySideHunkRanges = diffCache.getCachedSideBySideHunks(activeDiff, contextLines)
      sideBySideRenderItems = shouldDeferFullFileRenderItems()
        ? []
        : diffCache.getCachedSideBySideRenderItems(
            activeDiff,
            showFullFile,
            contextLines,
          )
      sideBySideMinimapData = showFullFile
        ? diffCache.getCachedSideBySideFullMinimapRows(activeDiff)
        : diffCache.getCachedSideBySideItemMinimapRows(
            activeDiff,
            showFullFile,
            contextLines,
          )
      unifiedHunkRanges = []
      unifiedRenderItems = []
      unifiedMinimapData = []
    } else {
      unifiedHunkRanges = diffCache.getCachedUnifiedHunks(activeDiff, contextLines)
      unifiedRenderItems = shouldDeferFullFileRenderItems()
        ? []
        : diffCache.getCachedUnifiedRenderItems(
            activeDiff,
            showFullFile,
            contextLines,
          )
      unifiedMinimapData = showFullFile
        ? diffCache.getCachedUnifiedFullMinimapRows(activeDiff)
        : diffCache.getCachedUnifiedItemMinimapRows(
            activeDiff,
            showFullFile,
            contextLines,
          )
      sideBySideHunkRanges = []
      sideBySideRenderItems = []
      sideBySideMinimapData = []
    }
  } else {
    maxLineNumber = 0
    sideBySideHunkRanges = []
    unifiedHunkRanges = []
    sideBySideRenderItems = []
    unifiedRenderItems = []
    sideBySideMinimapData = []
    unifiedMinimapData = []
  }

  $: visibleDiffHunkCount =
    viewMode === 'sideBySide' ? sideBySideHunkRanges.length : unifiedHunkRanges.length

  $: canNavigateDiffs =
    !loading &&
    !detailLoading &&
    !pickerLoading &&
    activeDiff?.contentKind === 'text' &&
    visibleDiffHunkCount > 0

  $: textDiffActive = activeDiff?.contentKind === 'text'

  $: canGoToPreviousDiff = canNavigateDiffs && currentDiffHunk > 0

  $: canGoToNextDiff =
    canNavigateDiffs && currentDiffHunk < visibleDiffHunkCount - 1

  $: diffFontSize = `${appearanceSettings.codeFontSize}px`
  $: diffRowLineHeight = `${appearanceSettings.codeFontSize + 3}px`
  $: diffRowHeight = `${appearanceSettings.codeFontSize + 8}px`
  $: {
    const appearanceState = resolveAppearanceState(appearanceSettings, systemPrefersDark)
    resolvedThemeMode = appearanceState.resolvedThemeMode
    lightAppearanceTheme = appearanceState.lightAppearanceTheme
    darkAppearanceTheme = appearanceState.darkAppearanceTheme
    visibleAppearanceVariants = appearanceState.visibleAppearanceVariants
  }

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
    const root = document.documentElement
    applyAppearanceToRoot(root, appearanceSettings, systemPrefersDark, resolvedThemeMode)
  }

  $: if (persistenceReady) {
    mode
    viewMode
    appearanceSettings
    ignoreWhitespace
    ignoreCase
    showFullFile
    showInlineHighlights
    wrapSideBySideLines
    showSyntaxHighlighting
    syncSideBySideScroll
    contextLines
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
    <AppTopBar context="Setup">
      {#snippet status()}
        {#if shouldShowUpdateIndicator()}
          <button class="secondary update-indicator" title={updateIndicatorTitle()} type="button" on:click={openUpdateSettings}>
            {#if updateIndicatorState.status === 'downloading'}<span class="refresh-spinner visible"></span>{:else}Update{/if}
          </button>
        {/if}
      {/snippet}

      {#snippet actions()}
      <div class="setup-bar-actions">
        <button
          class="primary setup-compare-button"
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
        <button class="secondary" type="button" on:click={() => openSettings('appearance')}>
          Settings
        </button>
      </div>
      {/snippet}
    </AppTopBar>

    {#if errorMessage}
      <p class="error-banner">{errorMessage}</p>
    {/if}

    {#if sameSelectionWarning}
      <p class="setup-warning-banner">{sameSelectionWarning}</p>
    {/if}

    <section class="setup-body">
      <section class="setup-launcher" aria-label="Compare setup">
        <section class="picker-workspace">
          {#each pickerSides as item}
            <PickerPane
              side={item.side}
              pane={item.pane}
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
    </section>
  </main>
{:else if screen === 'compare'}
  <main
    class="screen compare-screen"
    style:--compare-sidebar-width={mode === 'directory' ? `${compareSidebarWidth}px` : undefined}
  >
    <AppTopBar context="Compare">
      {#snippet status()}
        {#if shouldShowUpdateIndicator()}
          <button class="secondary update-indicator" title={updateIndicatorTitle()} type="button" on:click={openUpdateSettings}>
            {#if updateIndicatorState.status === 'downloading'}<span class="refresh-spinner visible"></span>{:else}Update{/if}
          </button>
        {/if}
      {/snippet}

      {#snippet middle()}
      <div class="compare-editor-context" aria-label="Compare context">
        <strong title={diffHeaderContext.currentFileLabel || selectedRelativePath}>
          {diffHeaderContext.currentFileLabel || selectedRelativePath || 'Compare results'}
        </strong>
        <span title={comparePairsTooltip}>
          {comparePairsLabel}
        </span>
      </div>
      {/snippet}

      {#snippet actions()}
      <div class="compare-actions">
        <div class="compare-action-group diff-nav-actions">
          <div
            class="nav-button-group segmented-control toolbar-segmented-control"
            aria-label="Diff navigation"
            role="group"
          >
            <button
              class="secondary toolbar-button nav-button nav-button-group-item"
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
              class="secondary toolbar-button nav-button nav-button-group-item"
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
        </div>

        <div class="compare-action-group display-actions">
          <button
            aria-label={viewMode === 'sideBySide' ? 'Switch to unified view' : 'Switch to split view'}
            aria-pressed={viewMode === 'unified'}
            class:unified-active={viewMode === 'unified'}
            class="view-mode-toggle"
            disabled={!textDiffActive}
            type="button"
            on:click={toggleViewMode}
          >
            <span
              aria-hidden="true"
              class="view-mode-toggle-thumb"
            ></span>
            <span
              aria-hidden="true"
              class:active={viewMode === 'sideBySide'}
              class="view-mode-option"
            >
              <svg aria-hidden="true" class="view-mode-icon" viewBox="0 0 16 16">
                <rect x="2.5" y="3" width="4.2" height="10" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3" />
                <rect x="9.3" y="3" width="4.2" height="10" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3" />
              </svg>
              <span class="view-mode-label">Split</span>
            </span>
            <span
              aria-hidden="true"
              class:active={viewMode === 'unified'}
              class="view-mode-option"
            >
              <svg aria-hidden="true" class="view-mode-icon" viewBox="0 0 16 16">
                <rect x="2.5" y="3" width="11" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3" />
                <path d="M4.8 5.5h6.4M4.8 8h6.4M4.8 10.5h4.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.3" />
              </svg>
              <span class="view-mode-label">Unified</span>
            </span>
          </button>
        </div>

        <div class="compare-action-group utility-actions">
          <button
            class="secondary toolbar-button icon-button swap-button"
            aria-label="Switch left and right sides"
            disabled={loading || detailLoading || pickerLoading}
            title="Switch left and right sides"
            type="button"
            on:click={swapComparedSides}
          >
            <svg aria-hidden="true" class="swap-icon" viewBox="0 0 16 16">
              <path d="M2.5 5h6.6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6" />
              <path d="m8.9 2.4 2.6 2.6-2.6 2.6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" />
              <path d="M13.5 11H6.9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6" />
              <path d="m7.1 8.4-2.6 2.6 2.6 2.6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" />
            </svg>
          </button>

          <button
            aria-label={compareNeedsRefresh ? 'Refresh to apply comparison rule changes' : 'Refresh compare'}
            aria-busy={loading}
            class:pending-refresh={compareNeedsRefresh}
            class="secondary toolbar-button icon-button refresh-button"
            title={compareNeedsRefresh ? 'Refresh to apply comparison rule changes' : 'Refresh compare'}
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
                    d="M12.8 7.8a4.8 4.8 0 0 1-8.2 3.4"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.7"
                  />
                  <path
                    d="M10.1 10.9h2.7v2.6"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.7"
                  />
                  <path
                    d="M3.2 8.2a4.8 4.8 0 0 1 8.2-3.4"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.7"
                  />
                  <path
                    d="M5.9 5.1H3.2V2.5"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.7"
                  />
                </svg>
              {/if}
            </span>
          </button>
        </div>

        <div class="compare-action-group global-actions">
          <button class="secondary toolbar-button" type="button" on:click={() => openSettings('viewer')}>
            Settings
          </button>
          <button class="secondary toolbar-button toolbar-setup-button" type="button" on:click={goToSetup}>
            Setup
          </button>
        </div>
      </div>
      {/snippet}
    </AppTopBar>

    {#if errorMessage}
      <p class="error-banner">{errorMessage}</p>
    {/if}

    <section
      class:resizing-sidebar={compareSidebarResizeActive}
      class:single-pane={mode === 'file'}
      class="compare-layout"
      style:--compare-sidebar-width={mode === 'directory' ? `${compareSidebarWidth}px` : undefined}
    >
      {#if mode === 'directory'}
        <DirectoryBrowser
          {loading}
          {activeStatusFilters}
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
        />
        <button
          aria-label="Resize file list panel"
          class="compare-sidebar-resizer"
          type="button"
          on:dblclick={resetCompareSidebarWidth}
          on:pointerdown={startCompareSidebarResize}
        ></button>
      {/if}

      <DiffViewer
        {activeDiff}
        loading={mode === 'file' ? loading : false}
        {detailLoading}
        {viewMode}
        {currentDiffHunk}
        {showFullFile}
        {showInlineHighlights}
        {wrapSideBySideLines}
        {showSyntaxHighlighting}
        {syncSideBySideScroll}
        {sideBySideRenderItems}
        {unifiedRenderItems}
        {sideBySideHunkRanges}
        {unifiedHunkRanges}
        {sideBySideMinimapData}
        {unifiedMinimapData}
        {maxLineNumber}
        {diffHeaderContext}
        {diffFontSize}
        {diffRowLineHeight}
        {diffRowHeight}
        {syncPaneWheel}
        {syncPaneScroll}
        {scheduleScrollNavigationRefresh}
        bind:leftPaneScroll
        bind:rightPaneScroll
        bind:unifiedScroll
      />
    </section>
  </main>
{:else}
  <main class="screen settings-view">
    <AppTopBar context="Settings">
      {#snippet status()}
        {#if shouldShowUpdateIndicator()}
          <button class="secondary update-indicator" title={updateIndicatorTitle()} type="button" on:click={openUpdateSettings}>
            {#if updateIndicatorState.status === 'downloading'}<span class="refresh-spinner visible"></span>{:else}Update{/if}
          </button>
        {/if}
      {/snippet}

      {#snippet actions()}
      <button
        aria-label="Close settings"
        class="secondary toolbar-button settings-close-button"
        title="Close settings"
        type="button"
        on:click={goBackFromSettings}
      >
        <svg aria-hidden="true" class="settings-close-icon" viewBox="0 0 16 16">
          <path
            d="M4 4l8 8M12 4 4 12"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-width="1.6"
          />
        </svg>
        <span>Close</span>
      </button>
      {/snippet}
    </AppTopBar>

    {#if errorMessage}
      <p class="error-banner">{errorMessage}</p>
    {/if}

    <SettingsScreen
      activeSection={activeSettingsSection}
      {appearanceSettings}
      lightTheme={lightAppearanceTheme}
      darkTheme={darkAppearanceTheme}
      visibleThemeVariants={visibleAppearanceVariants}
      availableLightThemes={availableLightThemes}
      availableDarkThemes={availableDarkThemes}
      {ignoreWhitespace}
      {ignoreCase}
      {viewMode}
      {showFullFile}
      {contextLines}
      {contextLinePresets}
      minUiFontSize={MIN_UI_FONT_SIZE}
      maxUiFontSize={MAX_UI_FONT_SIZE}
      minCodeFontSize={MIN_CODE_FONT_SIZE}
      maxCodeFontSize={MAX_CODE_FONT_SIZE}
      {wrapSideBySideLines}
      {showInlineHighlights}
      {showSyntaxHighlighting}
      {syncSideBySideScroll}
      {checkForUpdatesOnLaunch}
      {updateChannel}
      updateChannelLabel={formatUpdateChannelLabel(updateChannel)}
      currentVersion={updateIndicatorState.currentVersion}
      updateIndicatorState={updateIndicatorState.status}
      updateStatusMessage={updateIndicatorState.message}
      availableUpdate={updateIndicatorState.metadata}
      lastUpdateCheckLabel={formatLastUpdateCheck(lastUpdateCheckAt)}
      lastUpdateCheckRelativeLabel={formatLastUpdateCheckRelative(lastUpdateCheckAt)}
      updateBusy={updateIndicatorState.status === 'checking' || updateIndicatorState.status === 'downloading'}
      comparisonRulesRequireRefresh={hasActiveCompareSession() && mode === 'directory'}
      {compareNeedsRefresh}
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
      onToggleIgnoreWhitespace={toggleIgnoreWhitespace}
      onToggleIgnoreCase={toggleIgnoreCase}
      onSetViewMode={setViewMode}
      onToggleShowFullFile={() => setShowFullFile(!showFullFile)}
      onSetContextLines={applyContextLines}
      onToggleWrapSideBySideLines={() => setWrapSideBySideLines(!wrapSideBySideLines)}
      onToggleShowInlineHighlights={() => setShowInlineHighlights(!showInlineHighlights)}
      onToggleShowSyntaxHighlighting={() => setShowSyntaxHighlighting(!showSyntaxHighlighting)}
      onToggleSyncSideBySideScroll={toggleSyncSideBySideScroll}
      onSetCheckForUpdatesOnLaunch={setCheckForUpdatesOnLaunch}
      onSetUpdateChannel={setUpdateChannel}
      onCheckForUpdates={runUpdateCheck}
      onDownloadUpdate={beginUpdateDownload}
      onInstallUpdate={applyDownloadedUpdate}
      onResetPreferences={confirmResetPreferences}
      onClearRememberedSelections={confirmClearRememberedSelections}
      onResetEverything={resetEverything}
    />
  </main>
{/if}
