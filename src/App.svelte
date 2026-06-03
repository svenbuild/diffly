<script lang="ts">
  import { onMount, tick } from 'svelte'
  import PierreDirectoryTree from './lib/compare/PierreDirectoryTree.svelte'
  import CompareViewer from './lib/compare/CompareViewer.svelte'
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
    loadSessionState,
    onLaunchContext,
    openCompareItem,
    pollDirectoryCompare,
    pathInfo,
    saveSessionState,
    startDirectoryCompare,
  } from './lib/api'
  import { createDiffCacheController } from './lib/app/diff-cache'
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
    formatCompactPath,
    formatRelativePathLabel,
    getFileName,
    normalizeSelectionPath,
    splitCommonPathPrefix,
  } from './lib/path-utils'
  import {
    defaultDirectoryEntry,
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
    CompareTreeSettings,
    CompareViewerSettings,
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
    ExplorerPaneState,
    SettingsSection,
    Side,
  } from './lib/ui-types'

  const SESSION_SAVE_DELAY_MS = 180
  const THEME_SWITCH_DURATION_MS = 140
  const BACKGROUND_DIFF_PRELOAD_DELAY_MS = 250
  const BACKGROUND_DIFF_PRELOAD_CONCURRENCY = 1
  const DIRECTORY_DETAIL_PRELOAD_CONCURRENCY = 2
  const DIRECTORY_DETAIL_PRELOAD_ATTEMPTS = 3
  const DIRECTORY_DETAIL_PRELOAD_TIMEOUT_MS = 30000
  const DIRECTORY_COMPARE_POLL_INTERVAL_MS = 50
  const DEFAULT_COMPARE_SIDEBAR_WIDTH = 238
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
  }

  interface StartupTarget {
    folderPath: string
    targetPath: string
    kind: PathKind
  }

  export let initialSession: PersistedSession | null = null
  export let startupFolderPath: string | null = null
  let pendingStartupOverridePath: string | null = null

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
  let viewerSettings: CompareViewerSettings = {
    diffStyle: 'split',
    codeOverflow: 'scroll',
    diffIndicators: 'bars',
    lineDiffType: 'word-alt',
    hunkSeparators: 'line-info',
    expandUnchanged: false,
    collapsedContextThreshold: 3,
    expansionLineCount: 100,
    disableLineNumbers: false,
    disableFileHeader: false,
    disableBackground: false,
    disableVirtualizationBuffers: false,
    stickyHeader: false,
    syntaxMode: 'shiki',
    preferredHighlighter: 'shiki-js',
    useCSSClasses: false,
    tokenizeMaxLineLength: 1000,
    tokenizeMaxLength: 100000,
    maxLineDiffLength: 1000,
    lineHoverHighlight: 'disabled',
    enableTokenInteractionsOnWhitespace: false,
    enableGutterUtility: false,
    enableLineSelection: false,
    controlledSelection: false,
  }
  let treeSettings: CompareTreeSettings = {
    density: 'compact',
    customDensity: 1,
    flattenEmptyDirectories: true,
    stickyFolders: true,
    initialExpansion: 'open',
    initialExpansionDepth: 2,
    initialExpandedPaths: [],
    sortMode: 'path',
    searchMode: 'expand-matches',
    search: true,
    searchFakeFocus: false,
    searchBlurBehavior: 'close',
    initialSearchQuery: '',
    initialVisibleRowCount: 18,
    itemHeight: 22,
    overscan: 8,
    dragAndDrop: false,
    renaming: false,
  }
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
  let initialSessionFingerprint: string | null = null
  let themeTransitionTimer: number | null = null
  let activeDetailRequestId = 0
  let directoryDetailPreloadGeneration = 0
  let directoryDetailPreloadSignature = ''
  let compareSidebarWidth = DEFAULT_COMPARE_SIDEBAR_WIDTH
  let compareSidebarResizeActive = false
  let compareDirtyReason: CompareDirtyReason | null = null
  let compareNeedsRefresh = false
  let leftExplorer = createExplorerPane('Left')
  let rightExplorer = createExplorerPane('Right')
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
    openCompareItem,
  })
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

  const statusLabel = {
    modified: 'Modified',
    leftOnly: 'Left only',
    rightOnly: 'Right only',
    unsupported: 'Unsupported',
  }
  const availableLightThemes = getAvailableThemes('light')
  const availableDarkThemes = getAvailableThemes('dark')
  let lightAppearanceTheme: ThemeDefinition = getAvailableThemes('light')[0]
  let darkAppearanceTheme: ThemeDefinition = getAvailableThemes('dark')[0]
  let visibleAppearanceVariants: ThemeVariant[] = ['light']

  const getPendingCompareOptions = (): CompareOptions => ({
    ignoreWhitespace,
    ignoreCase,
  })

  function normalizeViewerSettings(
    settings: CompareViewerSettings | null | undefined,
    legacy?: PersistedSession | null,
  ): CompareViewerSettings {
    const current = viewerSettings
    const legacyDiffStyle = legacy?.viewMode === 'unified' ? 'unified' : 'split'
    const legacyOverflow = legacy?.wrapSideBySideLines ? 'wrap' : 'scroll'
    const legacyLineDiffType = legacy?.showInlineHighlights === false ? 'none' : 'word-alt'
    const legacySyntaxMode = legacy?.showSyntaxHighlighting === false ? 'plain' : 'shiki'

    return {
      diffStyle: settings?.diffStyle ?? legacyDiffStyle,
      codeOverflow: settings?.codeOverflow ?? legacyOverflow,
      diffIndicators: settings?.diffIndicators ?? 'bars',
      lineDiffType: settings?.lineDiffType ?? legacyLineDiffType,
      hunkSeparators: settings?.hunkSeparators ?? 'line-info',
      expandUnchanged: settings?.expandUnchanged ?? Boolean(legacy?.showFullFile),
      collapsedContextThreshold: clampNumber(
        settings?.collapsedContextThreshold ?? legacy?.contextLines,
        0,
        500,
        current.collapsedContextThreshold,
      ),
      expansionLineCount: clampNumber(settings?.expansionLineCount, 1, 5000, current.expansionLineCount),
      disableLineNumbers: settings?.disableLineNumbers ?? false,
      disableFileHeader: settings?.disableFileHeader ?? false,
      disableBackground: settings?.disableBackground ?? false,
      disableVirtualizationBuffers: settings?.disableVirtualizationBuffers ?? false,
      stickyHeader: settings?.stickyHeader ?? false,
      syntaxMode: settings?.syntaxMode ?? legacySyntaxMode,
      preferredHighlighter: isPreferredHighlighter(settings?.preferredHighlighter)
        ? settings.preferredHighlighter
        : current.preferredHighlighter,
      useCSSClasses: settings?.useCSSClasses ?? false,
      tokenizeMaxLineLength: clampNumber(settings?.tokenizeMaxLineLength, 0, 20000, current.tokenizeMaxLineLength),
      tokenizeMaxLength: clampNumber(settings?.tokenizeMaxLength, 0, 1000000, current.tokenizeMaxLength),
      maxLineDiffLength: clampNumber(settings?.maxLineDiffLength, 0, 20000, current.maxLineDiffLength),
      lineHoverHighlight: isLineHoverHighlight(settings?.lineHoverHighlight)
        ? settings.lineHoverHighlight
        : current.lineHoverHighlight,
      enableTokenInteractionsOnWhitespace: settings?.enableTokenInteractionsOnWhitespace ?? false,
      enableGutterUtility: settings?.enableGutterUtility ?? false,
      enableLineSelection: settings?.enableLineSelection ?? false,
      controlledSelection: settings?.controlledSelection ?? false,
    }
  }

  function normalizeTreeSettings(settings: CompareTreeSettings | null | undefined): CompareTreeSettings {
    const current = treeSettings

    return {
      density: isTreeDensity(settings?.density) ? settings.density : current.density,
      customDensity: clampNumber(settings?.customDensity, 0.5, 2, current.customDensity),
      flattenEmptyDirectories: settings?.flattenEmptyDirectories ?? true,
      stickyFolders: settings?.stickyFolders ?? true,
      initialExpansion: isTreeInitialExpansion(settings?.initialExpansion)
        ? settings.initialExpansion
        : current.initialExpansion,
      initialExpansionDepth: clampNumber(settings?.initialExpansionDepth, 0, 12, current.initialExpansionDepth),
      initialExpandedPaths: Array.isArray(settings?.initialExpandedPaths)
        ? settings.initialExpandedPaths
            .filter((path) => typeof path === 'string' && path.trim())
            .map((path) => path.trim())
        : current.initialExpandedPaths,
      sortMode: settings?.sortMode === 'default' ? 'default' : 'path',
      searchMode: isTreeSearchMode(settings?.searchMode) ? settings.searchMode : current.searchMode,
      search: settings?.search ?? true,
      searchFakeFocus: settings?.searchFakeFocus ?? false,
      searchBlurBehavior: settings?.searchBlurBehavior === 'retain' ? 'retain' : 'close',
      initialSearchQuery: typeof settings?.initialSearchQuery === 'string' ? settings.initialSearchQuery : '',
      initialVisibleRowCount: clampNumber(settings?.initialVisibleRowCount, 1, 200, current.initialVisibleRowCount),
      itemHeight: clampNumber(settings?.itemHeight, 18, 60, current.itemHeight),
      overscan: clampNumber(settings?.overscan, 0, 200, current.overscan),
      dragAndDrop: settings?.dragAndDrop ?? false,
      renaming: settings?.renaming ?? false,
    }
  }

  function clampNumber(value: number | null | undefined, min: number, max: number, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fallback
    }

    return Math.min(max, Math.max(min, Math.round(value)))
  }

  function isPreferredHighlighter(value: string | null | undefined): value is CompareViewerSettings['preferredHighlighter'] {
    return value === 'shiki-js' || value === 'shiki-wasm'
  }

  function isLineHoverHighlight(value: string | null | undefined): value is CompareViewerSettings['lineHoverHighlight'] {
    return value === 'disabled' || value === 'both' || value === 'number' || value === 'line'
  }

  function isTreeDensity(value: string | null | undefined): value is CompareTreeSettings['density'] {
    return value === 'compact' || value === 'default' || value === 'relaxed' || value === 'custom'
  }

  function isTreeInitialExpansion(value: string | null | undefined): value is CompareTreeSettings['initialExpansion'] {
    return value === 'closed' || value === 'open' || value === 'depth'
  }

  function isTreeSearchMode(value: string | null | undefined): value is CompareTreeSettings['searchMode'] {
    return value === 'expand-matches' || value === 'collapse-non-matches' || value === 'hide-non-matches'
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

  function clampCompareSidebarWidth(value: number) {
    return Math.min(380, Math.max(206, Math.round(value)))
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
      cancelDirectoryDetailPreload()

      if (themeTransitionTimer !== null) {
        window.clearTimeout(themeTransitionTimer)
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

  function cancelDirectoryDetailPreload() {
    directoryDetailPreloadGeneration += 1
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

  function stopDirectoryComparePolling(clearEntries = false) {
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

  async function preloadDirectoryEntryDiff(
    entry: DirectoryEntryResult,
    revision: number,
    generation: number,
  ) {
    let lastError: unknown = null

    for (let attempt = 1; attempt <= DIRECTORY_DETAIL_PRELOAD_ATTEMPTS; attempt += 1) {
      if (generation !== directoryDetailPreloadGeneration || revision !== compareRevision) {
        return
      }

      try {
        await withDirectoryPreloadTimeout(
          getOrCreateDetailDiffPromise(entry.relativePath, revision, { force: attempt > 1 }),
          DIRECTORY_DETAIL_PRELOAD_TIMEOUT_MS,
        )
        return
      } catch (error) {
        lastError = error
      }
    }

    throw lastError
  }

  function withDirectoryPreloadTimeout<T>(promise: Promise<T>, timeoutMs: number) {
    let timeoutId: number | null = null
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error('Timed out while preloading this file diff.'))
      }, timeoutMs)
    })

    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    })
  }

  function startDirectoryDetailPreload(entries: DirectoryEntryResult[], revision = compareRevision) {
    cancelDirectoryDetailPreload()

    if (mode !== 'directory' || entries.length === 0 || !leftPath || !rightPath) {
      return
    }

    const generation = directoryDetailPreloadGeneration
    const queue = [...entries]
    const workerCount = Math.min(DIRECTORY_DETAIL_PRELOAD_CONCURRENCY, queue.length)

    const runWorker = async () => {
      while (generation === directoryDetailPreloadGeneration && revision === compareRevision) {
        const entry = queue.shift()

        if (!entry) {
          return
        }

        try {
          await preloadDirectoryEntryDiff(entry, revision, generation)
        } catch {
          // The visible directory diff list reports per-file errors on demand.
        }
      }
    }

    for (let index = 0; index < workerCount; index += 1) {
      void runWorker()
    }
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

    for (const update of updates) {
      if (update.index >= slots.length) {
        slots.length = update.index + 1
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
        }),
      )
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

    const startupTarget = await resolveStartupTarget(overridePath)

    if (startupTarget) {
      await applyStartupTarget(startupTarget)
      screen = 'setup'
      errorMessage = ''
    }
  }

  async function applyStartupTarget(startupTarget: StartupTarget) {
    mode = startupTarget.kind

    await openDirectoryForBothPanes(startupTarget.folderPath)

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

    if (session.viewerSettings) {
      viewerSettings = normalizeViewerSettings(session.viewerSettings, session)
      viewMode = viewerSettings.diffStyle === 'split' ? 'sideBySide' : 'unified'
    } else {
      viewerSettings = normalizeViewerSettings(null, session)
    }

    if (session.treeSettings) {
      treeSettings = normalizeTreeSettings(session.treeSettings)
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
    viewerSettings = normalizeViewerSettings(null)
    treeSettings = normalizeTreeSettings(null)
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

  async function openDirectoryForBothPanes(path: string, historyMode: 'push' | 'keep' = 'push') {
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
    } catch (error) {
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
    if (mode === 'directory') {
      if (revision === compareRevision) {
        selectedRelativePath = entry.relativePath
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

  async function loadEntryDiff(
    entry: DirectoryEntryResult,
    revision = compareRevision,
    options: { force?: boolean } = {},
  ) {
    return getOrCreateDetailDiffPromise(entry.relativePath, revision, options)
  }

  $: {
    const nextDirectoryPreloadSignature =
      mode === 'directory' && directoryEntries.length > 0
        ? [
            compareRevision,
            activeCompareOptions.ignoreWhitespace ? '1' : '0',
            activeCompareOptions.ignoreCase ? '1' : '0',
            directoryEntries.map((entry) => entry.relativePath).join('\u0000'),
          ].join('\u0001')
        : ''

    if (nextDirectoryPreloadSignature !== directoryDetailPreloadSignature) {
      directoryDetailPreloadSignature = nextDirectoryPreloadSignature
      cancelDirectoryDetailPreload()
    }
  }

  function syncFilteredDirectoryState(entries: DirectoryEntryResult[] = directoryEntries) {
    filteredDirectoryEntries = entries
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

  function goToPreviousDifference() {
    currentDiffHunk = Math.max(0, currentDiffHunk - 1)
  }

  function goToNextDifference() {
    currentDiffHunk += 1
  }

  function syncPaneWheel(event: WheelEvent, source: 'left' | 'right') {
    void event
    void source
  }

  function syncPaneScroll(source: 'left' | 'right') {
    void source
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

  $: textDiffActive = mode === 'directory'
    ? directoryEntries.some((entry) => entry.status !== 'unsupported')
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
  $: pickerCanCompare = canComparePane(leftExplorer) && canComparePane(rightExplorer)
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
  <main class="screen setup-screen">
    <AppTopBar context="Setup">
      {#snippet status()}
        {#if shouldShowUpdateIndicator()}
          <button class="secondary update-indicator" title={updateIndicatorTitle()} type="button" on:click={openUpdateSettings}>
            {#if updateIndicatorState.status === 'downloading'}<span class="refresh-spinner visible"></span>{:else}Update{/if}
          </button>
        {/if}
      {/snippet}

      {#snippet middle()}
        {#if setupTopbarWarning}
          <p class="setup-topbar-warning">{setupTopbarWarning}</p>
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
          <button class="secondary toolbar-button" type="button" on:click={() => openSettings('compare')}>
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
        <PierreDirectoryTree
          {loading}
          {directoryEntries}
          {selectedRelativePath}
          {statusLabel}
          {treeSettings}
          {appearanceSettings}
          {resolvedThemeMode}
          {selectEntry}
        />
        <button
          aria-label="Resize file list panel"
          class="compare-sidebar-resizer"
          type="button"
          on:dblclick={resetCompareSidebarWidth}
          on:pointerdown={startCompareSidebarResize}
        ></button>
      {/if}

      <CompareViewer
        {mode}
        {activeDiff}
        {directoryEntries}
        {selectedRelativePath}
        {loading}
        {detailLoading}
        {viewerSettings}
        {appearanceSettings}
        {resolvedThemeMode}
        {viewMode}
        revision={compareRevision}
        {leftPath}
        {rightPath}
        compareOptions={activeCompareOptions}
        resolveEntryBases={getDetailBasesForPath}
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
      {viewerSettings}
      {treeSettings}
      minUiFontSize={MIN_UI_FONT_SIZE}
      maxUiFontSize={MAX_UI_FONT_SIZE}
      minCodeFontSize={MIN_CODE_FONT_SIZE}
      maxCodeFontSize={MAX_CODE_FONT_SIZE}
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
  </main>
{/if}
