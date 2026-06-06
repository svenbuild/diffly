<script lang="ts">
  import { onDestroy, tick } from 'svelte'
  import {
    CodeView,
    getFiletypeFromFileName,
    parseDiffFromFile,
    type CodeViewItem,
    type CodeViewLineSelection,
    type CodeViewOptions,
    type DiffLineAnnotation,
    type FileContents,
    type FileDiffMetadata,
    type LineAnnotation,
    type SelectedLineRange,
  } from '@pierre/diffs'
  import {
    WorkerPoolManager,
    type WorkerInitializationRenderOptions,
    type WorkerPoolOptions,
  } from '@pierre/diffs/worker'
  import DiffsWorker from '@pierre/diffs/worker/worker.js?worker'
  import './directory-code-view.css'
  import type { AppearanceSettings } from '../theme'
  import {
    buildPierreDiffUnsafeCss,
    resolvePierreDiffTheme,
  } from '../theme/pierre'
  import {
    buildDirectoryCodeViewFile,
    buildPlaceholderFile,
    estimatePlaceholderLineCount,
  } from './directory-code-view-items'
  import {
    loadStoredCommentAnnotations,
    persistCommentAnnotations,
    removeCommentAnnotation,
    renderCommentAnnotationElement,
    type DifflyCommentAnnotation,
  } from './directory-code-view-comments'
  import {
    applyDirectoryItemPostRender,
    getCodeViewItemContext,
    renderDirectoryCollapseButton,
    renderDirectoryHeaderMetadata,
    type CodeViewItemContext,
  } from './directory-code-view-renderers'
  import { createTokenHoverController } from './token-hover/controller'
  import type {
    CompareViewerSettings,
    DirectoryEntryResult,
    FileDiffResult,
    TextDiffPayload,
    ViewMode,
  } from '../types'

  interface LoadedDirectoryDiff {
    entry: DirectoryEntryResult
    diff: FileDiffResult | null
    error: string
    loading: boolean
    renderKey?: string
  }

  interface CachedCodeViewDiff {
    annotations: Array<DiffLineAnnotation<DifflyCommentAnnotation>>
    collapsed: boolean
    fileDiff: FileDiffMetadata
    signature: string
    version: number
  }

  interface CachedPlaceholderItem {
    file: FileContents
    key: string
    version: number
  }

  export let entries: LoadedDirectoryDiff[] = []
  export let compareKey = ''
  export let collapsedPaths = new Set<string>()
  export let selectedRelativePath = ''
  export let viewerSettings: CompareViewerSettings
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark'
  export let viewMode: ViewMode
  export let scrollTargetRevision = 0
  export let changedEntryPaths: string[] = []
  export let changedEntryRevision = 0
  export let entryStructureRevision = 0
  export let toggleEntry: (relativePath: string) => void = () => {}
  export let requestVisibleEntries: (relativePaths: string[]) => void = () => {}
  export let pauseDiffLoading: () => void = () => {}

  let host: HTMLDivElement | null = null
  let codeView: CodeView<DifflyCommentAnnotation> | null = null
  let workerPool: WorkerPoolManager | null = null
  let unsubscribeScroll: (() => void) | null = null
  let unsubscribeNativeScroll: (() => void) | null = null
  let visibleRequestTimer: number | null = null
  let placeholderRequestTimer: number | null = null
  let layoutRetryFrame: number | null = null
  let scrollHost: HTMLDivElement | null = null
  let lastRequestedVisibleKey = ''
  let lastOptionsKey = ''
  let lastWorkerOptionsKey = ''
  let lastEntryStructureRevision = -1
  let lastChangedEntryRevision = 0
  let lastDiffRenderPathRevision = 0
  let lastCollapsedPaths: Set<string> | null = null
  let lastCommentAnnotations: Map<string, Array<DiffLineAnnotation<DifflyCommentAnnotation>>> | null = null
  let appliedScrollTargetRevision = 0
  let renderRevision = 0
  let diffRenderPathRevision = 0
  let selectedLineSelection: CodeViewLineSelection | null = null
  let commentId = 0
  let commentAnnotations = new Map<string, Array<DiffLineAnnotation<DifflyCommentAnnotation>>>()
  let entryByPath = new Map<string, LoadedDirectoryDiff>()
  let placeholderPaths = new Set<string>()
  let loadingPaths = new Set<string>()
  let pendingPlaceholderRequestPaths = new Set<string>()
  let diffRenderPaths = new Set<string>()
  let interactionMessage = ''
  let interactionMessageTimer: number | null = null

  const tokenHoverController = createTokenHoverController()
  const tokenHoverLanguageByPath = new Map<string, string>()

  function tokenHoverLanguageFor(itemId: string | undefined): string {
    if (!itemId) {
      return ''
    }

    const cached = tokenHoverLanguageByPath.get(itemId)
    if (cached !== undefined) {
      return cached
    }

    const fileName = itemId.split(/[\\/]/).pop() || itemId
    const language = getFiletypeFromFileName(fileName)
    tokenHoverLanguageByPath.set(itemId, language)
    return language
  }

  function handleTokenEnter(...args: unknown[]) {
    const props = args[0] as { tokenText: string; tokenElement: HTMLElement }
    const event = args[1] as PointerEvent
    const context = getCodeViewItemContext(args)
    tokenHoverController.handleEnter(props, event, tokenHoverLanguageFor(context?.item?.id))
  }

  function handleTokenLeave() {
    tokenHoverController.handleLeave()
  }

  const parsedDiffs = new Map<string, CachedCodeViewDiff>()
  const placeholderItems = new Map<string, CachedPlaceholderItem>()
  const emptyAnnotations: Array<DiffLineAnnotation<DifflyCommentAnnotation>> = []
  let renderedItems: Array<CodeViewItem<DifflyCommentAnnotation>> = []
  let hasRenderedItems = false
  let itemIndexByPath = new Map<string, number>()
  let itemInputIndexByPath = new Map<string, number>()
  let itemKeyByPath = new Map<string, string>()
  const DIRECTORY_CODE_VIEW_MIN_OVERSCROLL_PX = 900
  const DIRECTORY_CODE_VIEW_MAX_OVERSCROLL_PX = 1800
  const DIRECTORY_CODE_VIEW_OVERSCROLL_VIEWPORTS = 1.25
  const DIRECTORY_CODE_VIEW_VISIBLE_LOAD_IDLE_MS = 5000
  const DIRECTORY_CODE_VIEW_BATCH_UPDATE_THRESHOLD = 32
  const DIRECTORY_CODE_VIEW_INITIAL_PARSED_DIFF_COUNT = 4
  const DIRECTORY_CODE_VIEW_VISIBLE_PARSE_BATCH = 1
  const placeholderBlankLineSuffixes = new Map<number, string>()

  function workerPoolSize() {
    const cores = Math.max(1, window.navigator.hardwareConcurrency || 4)
    return Math.max(2, Math.min(6, Math.floor(cores / 2)))
  }

  function directoryCodeViewOverscrollSize() {
    const viewportHeight = host?.clientHeight || window.innerHeight || 800

    return Math.min(
      DIRECTORY_CODE_VIEW_MAX_OVERSCROLL_PX,
      Math.max(
        DIRECTORY_CODE_VIEW_MIN_OVERSCROLL_PX,
        Math.round(viewportHeight * DIRECTORY_CODE_VIEW_OVERSCROLL_VIEWPORTS),
      ),
    )
  }

  function syncCodeViewVirtualization(view: CodeView<DifflyCommentAnnotation>) {
    const overscrollSize = directoryCodeViewOverscrollSize()
    if (view.config.overscrollSize !== overscrollSize) {
      view.config.overscrollSize = overscrollSize
      lastRequestedVisibleKey = ''
    }

    if (view.config.intersectionObserverMargin < overscrollSize) {
      view.config.intersectionObserverMargin = overscrollSize
    }
  }

  function handleHostNativeScroll() {
    if (!codeView) {
      return
    }

    // Native scrolling drives this. We only piggy-back on the passive scroll
    // event to pause background diff loading and lazy-load the diffs that just
    // scrolled into view — no preventDefault, no manual scroll animation, so the
    // browser keeps scrolling on the compositor thread.
    pauseDiffLoading()
    scheduleVisibleEntryRequest()
  }

  function syncNativeScrollHandling() {
    if (scrollHost === host) {
      return
    }

    unsubscribeNativeScroll?.()
    unsubscribeNativeScroll = null
    scrollHost = host

    if (!host) {
      return
    }

    const nextHost = host
    nextHost.addEventListener('scroll', handleHostNativeScroll, {
      capture: true,
      passive: true,
    })
    unsubscribeNativeScroll = () => {
      nextHost.removeEventListener('scroll', handleHostNativeScroll, true)
    }
  }

  function workerPoolOptions(): WorkerPoolOptions {
    return {
      workerFactory: () => new DiffsWorker(),
      poolSize: workerPoolSize(),
      totalASTLRUCacheSize: 240,
    }
  }

  function workerRenderOptions(): WorkerInitializationRenderOptions {
    return {
      theme: resolvePierreDiffTheme(appearanceSettings),
      useTokenTransformer: viewerSettings.syntaxMode === 'shiki',
      lineDiffType: viewerSettings.lineDiffType,
      maxLineDiffLength: viewerSettings.maxLineDiffLength,
      tokenizeMaxLineLength: viewerSettings.tokenizeMaxLineLength,
      preferredHighlighter: viewerSettings.preferredHighlighter,
    }
  }

  function workerOptionsKey() {
    const options = workerRenderOptions()
    const theme =
      typeof options.theme === 'string'
        ? options.theme
        : `${options.theme?.light ?? ''}:${options.theme?.dark ?? ''}`

    return [
      theme,
      options.useTokenTransformer ? '1' : '0',
      options.lineDiffType,
      options.maxLineDiffLength,
      options.tokenizeMaxLineLength,
      options.preferredHighlighter,
    ].join('\u0000')
  }

  function getWorkerPool() {
    if (!workerPool) {
      lastWorkerOptionsKey = workerOptionsKey()
      workerPool = new WorkerPoolManager(workerPoolOptions(), workerRenderOptions())
    }

    return workerPool
  }

  function syncWorkerRenderOptions() {
    const nextKey = workerOptionsKey()
    const manager = getWorkerPool()
    if (nextKey === lastWorkerOptionsKey) {
      return
    }

    lastWorkerOptionsKey = nextKey
    void manager.setRenderOptions(workerRenderOptions()).catch((error) => {
      console.error('Unable to update Pierre diff worker options', error)
    })
  }

  function setInteractionMessage(message: string) {
    interactionMessage = message

    if (interactionMessageTimer !== null) {
      window.clearTimeout(interactionMessageTimer)
    }

    interactionMessageTimer = window.setTimeout(() => {
      interactionMessage = ''
      interactionMessageTimer = null
    }, 2200)
  }

  function applyControlledSelection(selection: CodeViewLineSelection | null) {
    selectedLineSelection = selection

    if (viewerSettings.controlledSelection) {
      codeView?.setSelectedLines(selection, { notify: false })
    }
  }

  function handleSelectedLinesChange(selection: CodeViewLineSelection | null) {
    applyControlledSelection(selection)
  }

  function handleLineSelected(range: SelectedLineRange | null, context: CodeViewItemContext) {
    const id = context.item?.id
    applyControlledSelection(id && range ? { id, range } : null)
  }

  function annotationsFor(itemId: string) {
    return commentAnnotations.get(itemId) ?? emptyAnnotations
  }

  function updateAnnotations(
    itemId: string,
    nextAnnotations: Array<DiffLineAnnotation<DifflyCommentAnnotation>>,
  ) {
    const next = new Map(commentAnnotations)
    next.set(itemId, nextAnnotations)
    commentAnnotations = next
  }

  function persistComments() {
    persistCommentAnnotations(compareKey, commentAnnotations)
  }

  function loadStoredComments() {
    const stored = loadStoredCommentAnnotations(compareKey, commentId)
    commentAnnotations = stored.annotations
    commentId = stored.commentId
  }

  function handleGutterUtilityClick(range: SelectedLineRange, context: CodeViewItemContext) {
    const itemId = context.item?.id ?? selectedLineSelection?.id ?? ''
    if (!itemId) {
      return
    }

    applyControlledSelection({ id: itemId, range })
    const side = range.endSide ?? range.side ?? 'additions'
    const lineNumber = range.end
    updateAnnotations(itemId, [
      ...annotationsFor(itemId),
      {
        side,
        lineNumber,
        metadata: {
          id: `comment-${commentId += 1}-${Math.random().toString(36).slice(2, 8)}`,
          text: '',
        },
      },
    ])
  }

  function renderCommentAnnotation(
    annotation: DiffLineAnnotation<DifflyCommentAnnotation> | LineAnnotation<DifflyCommentAnnotation>,
  ) {
    return renderCommentAnnotationElement(annotation, {
      onDelete: (target) => {
        const result = removeCommentAnnotation(commentAnnotations, target)
        if (!result.removed) {
          return
        }

        commentAnnotations = result.annotations
        persistComments()
        setInteractionMessage('Comment deleted.')
      },
      onSave: () => {
        persistComments()
        setInteractionMessage('Comment saved.')
      },
    })
  }

  function renderCollapseButton(...args: unknown[]) {
    return renderDirectoryCollapseButton(args, {
      collapsedPaths,
      entryByPath,
      schedulePlaceholderEntryRequest,
      toggleEntry,
    })
  }

  function renderHeaderMetadata(...args: unknown[]) {
    return renderDirectoryHeaderMetadata(args, entryByPath)
  }

  function handlePostRender(...args: unknown[]) {
    applyDirectoryItemPostRender(args, {
      entryByPath,
      loadingPaths,
      placeholderPaths,
      schedulePlaceholderEntryRequest,
      scheduleVisibleEntryRequest,
    })
  }

  function buildOptions(): CodeViewOptions<DifflyCommentAnnotation> {
    return {
      theme: resolvePierreDiffTheme(appearanceSettings),
      themeType: resolvedThemeMode,
      // The virtualizer estimates off-screen row heights from this metric
      // (default 20px) and corrects the scroll position once rows are measured.
      // We override the rendered line-height via unsafeCSS to codeFontSize + 5,
      // so without a matching metric every scroll re-anchors — which feels like
      // an extra scroll being appended after yours. Keep in sync with
      // --diffs-line-height in buildPierreDiffUnsafeCss.
      itemMetrics: { lineHeight: appearanceSettings.codeFontSize + 5 },
      diffStyle: viewMode === 'unified' ? 'unified' : viewerSettings.diffStyle,
      overflow: viewerSettings.codeOverflow,
      diffIndicators: viewerSettings.diffIndicators,
      lineDiffType: viewerSettings.lineDiffType,
      hunkSeparators: viewerSettings.hunkSeparators,
      expandUnchanged: viewerSettings.expandUnchanged,
      collapsedContextThreshold: viewerSettings.collapsedContextThreshold,
      expansionLineCount: viewerSettings.expansionLineCount,
      disableLineNumbers: viewerSettings.disableLineNumbers,
      disableFileHeader: false,
      disableBackground: viewerSettings.disableBackground,
      disableVirtualizationBuffers: viewerSettings.disableVirtualizationBuffers,
      stickyHeaders: viewerSettings.stickyHeader,
      preferredHighlighter: viewerSettings.preferredHighlighter,
      useCSSClasses: viewerSettings.useCSSClasses,
      useTokenTransformer: viewerSettings.syntaxMode === 'shiki',
      tokenizeMaxLineLength: viewerSettings.tokenizeMaxLineLength,
      tokenizeMaxLength: viewerSettings.tokenizeMaxLength,
      maxLineDiffLength: viewerSettings.maxLineDiffLength,
      lineHoverHighlight: viewerSettings.lineHoverHighlight,
      enableTokenInteractionsOnWhitespace: viewerSettings.enableTokenInteractionsOnWhitespace,
      enableGutterUtility: viewerSettings.enableGutterUtility,
      controlledSelection: viewerSettings.controlledSelection,
      enableLineSelection:
        viewerSettings.enableLineSelection ||
        viewerSettings.controlledSelection ||
        viewerSettings.enableGutterUtility,
      onGutterUtilityClick: handleGutterUtilityClick,
      onLineSelected: handleLineSelected,
      onLineSelectionEnd: handleLineSelected,
      onSelectedLinesChange: handleSelectedLinesChange,
      renderAnnotation: renderCommentAnnotation,
      renderHeaderPrefix: renderCollapseButton as CodeViewOptions<DifflyCommentAnnotation>['renderHeaderPrefix'],
      renderHeaderMetadata: renderHeaderMetadata as CodeViewOptions<DifflyCommentAnnotation>['renderHeaderMetadata'],
      onPostRender: handlePostRender as CodeViewOptions<DifflyCommentAnnotation>['onPostRender'],
      // Providing token handlers auto-enables Pierre's token transformer, so we
      // only attach them when the feature is on. tokenHover is part of
      // optionsKey() below so toggling actually re-renders the CodeView.
      ...(viewerSettings.tokenHover
        ? {
            onTokenEnter: handleTokenEnter as CodeViewOptions<DifflyCommentAnnotation>['onTokenEnter'],
            onTokenLeave: handleTokenLeave as CodeViewOptions<DifflyCommentAnnotation>['onTokenLeave'],
          }
        : {}),
      layout: {
        paddingTop: 8,
        paddingBottom: 8,
        gap: 8,
      },
      unsafeCSS: buildPierreDiffUnsafeCss(appearanceSettings) + `
        :host([data-diffly-placeholder]) [data-metadata] > [data-deletions-count],
        :host([data-diffly-placeholder]) [data-metadata] > [data-additions-count] {
          display: none;
        }
      `,
    }
  }

  function optionsKey() {
    const theme = resolvePierreDiffTheme(appearanceSettings)
    const themeKey = typeof theme === 'string' ? theme : `${theme.light}:${theme.dark}`

    return [
      themeKey,
      resolvedThemeMode,
      viewMode,
      viewerSettings.diffStyle,
      viewerSettings.codeOverflow,
      viewerSettings.diffIndicators,
      viewerSettings.lineDiffType,
      viewerSettings.hunkSeparators,
      viewerSettings.expandUnchanged ? '1' : '0',
      viewerSettings.collapsedContextThreshold,
      viewerSettings.expansionLineCount,
      viewerSettings.disableLineNumbers ? '1' : '0',
      viewerSettings.disableBackground ? '1' : '0',
      viewerSettings.disableVirtualizationBuffers ? '1' : '0',
      viewerSettings.stickyHeader ? '1' : '0',
      viewerSettings.syntaxMode,
      viewerSettings.preferredHighlighter,
      viewerSettings.useCSSClasses ? '1' : '0',
      viewerSettings.tokenizeMaxLineLength,
      viewerSettings.tokenizeMaxLength,
      viewerSettings.maxLineDiffLength,
      viewerSettings.lineHoverHighlight,
      viewerSettings.enableTokenInteractionsOnWhitespace ? '1' : '0',
      viewerSettings.enableGutterUtility ? '1' : '0',
      viewerSettings.enableLineSelection ? '1' : '0',
      viewerSettings.controlledSelection ? '1' : '0',
      viewerSettings.tokenHover ? '1' : '0',
    ].join('\u0000')
  }

  function diffSignature(entry: DirectoryEntryResult, text: TextDiffPayload) {
    return [
      entry.relativePath,
      text.leftCacheKey ?? text.leftSha256 ?? text.leftText.length,
      text.rightCacheKey ?? text.rightSha256 ?? text.rightText.length,
      text.leftText.length,
      text.rightText.length,
    ].join('\u0000')
  }

  function annotationKey(annotations: Array<DiffLineAnnotation<DifflyCommentAnnotation>>) {
    return annotations
      .map((annotation) => [
        annotation.side,
        annotation.lineNumber,
        annotation.metadata.id,
        annotation.metadata.text,
      ].join(':'))
      .join('\u0001')
  }

  function placeholderKey(loadedEntry: LoadedDirectoryDiff) {
    const { entry } = loadedEntry
    return [
      entry.relativePath,
      entry.status,
      entry.leftPath ?? '',
      entry.rightPath ?? '',
      entry.leftSize ?? '',
      entry.rightSize ?? '',
      loadedEntry.error,
      loadedEntry.diff?.text ? 'ready' : 'loading',
      estimatePlaceholderLineCount(entry),
      collapsedPaths.has(entry.relativePath) ? '1' : '0',
    ].join('\u0000')
  }

  function placeholderItem(loadedEntry: LoadedDirectoryDiff) {
    const path = loadedEntry.entry.relativePath
    const key = placeholderKey(loadedEntry)
    const cached = placeholderItems.get(path)

    if (cached?.key === key) {
      return cached
    }

    const version = (cached?.version ?? 0) + 1
    const file = buildPlaceholderFile(
      {
        entry: loadedEntry.entry,
        error: loadedEntry.error,
        hasTextDiff: Boolean(loadedEntry.diff?.text),
      },
      key,
      placeholderBlankLineSuffixes,
    )
    const item = { file, key, version }
    placeholderItems.set(path, item)
    return item
  }

  function codeViewItemFor(
    loadedEntry: LoadedDirectoryDiff,
  ): CodeViewItem<DifflyCommentAnnotation> | null {
    const { entry, diff } = loadedEntry
    const collapsed = collapsedPaths.has(entry.relativePath)

    if (!diff?.text || !diffRenderPaths.has(entry.relativePath)) {
      const placeholder = placeholderItem(loadedEntry)
      return {
        id: entry.relativePath,
        type: 'file',
        file: placeholder.file,
        collapsed,
        version: placeholder.version,
      }
    }

    const signature = diffSignature(entry, diff.text)
    const annotations = annotationsFor(entry.relativePath)
    const annotationsKey = annotationKey(annotations)
    const cached = parsedDiffs.get(entry.relativePath)

    try {
      const nextCached =
        cached && cached.signature === signature
          ? cached
          : {
              annotations,
              collapsed,
              fileDiff: parseDiffFromFile(
                buildDirectoryCodeViewFile(entry, 'left', diff.text),
                buildDirectoryCodeViewFile(entry, 'right', diff.text),
                undefined,
                true,
              ),
              signature,
              version: (cached?.version ?? 0) + 1,
            }

      nextCached.fileDiff.cacheKey = signature

      if (nextCached === cached) {
        const previousAnnotationsKey = annotationKey(cached.annotations)
        if (
          cached.collapsed !== collapsed ||
          cached.annotations !== annotations ||
          previousAnnotationsKey !== annotationsKey
        ) {
          cached.collapsed = collapsed
          cached.annotations = annotations
          cached.version += 1
        }
      } else {
        parsedDiffs.set(entry.relativePath, nextCached)
      }

      return {
        id: entry.relativePath,
        type: 'diff',
        fileDiff: nextCached.fileDiff,
        annotations,
        collapsed,
        version: nextCached.version,
      }
    } catch (error) {
      console.error('Unable to parse directory diff item', entry.relativePath, error)
      return null
    }
  }

  function codeViewItemKey(item: CodeViewItem<DifflyCommentAnnotation>) {
    return `${item.id}:${item.type}:${item.version ?? 0}`
  }

  function pruneItemCaches(activePaths: Set<string>) {
    for (const path of parsedDiffs.keys()) {
      if (!activePaths.has(path)) {
        parsedDiffs.delete(path)
      }
    }

    for (const path of placeholderItems.keys()) {
      if (!activePaths.has(path)) {
        placeholderItems.delete(path)
      }
    }

    for (const path of diffRenderPaths) {
      if (!activePaths.has(path)) {
        diffRenderPaths.delete(path)
      }
    }
  }

  function seedInitialDiffRenderPaths() {
    if (entries.length === 0) {
      return
    }

    let changed = false
    const nextDiffRenderPaths = new Set(diffRenderPaths)
    const addPath = (path: string) => {
      const loadedEntry = entries.find((candidate) => candidate.entry.relativePath === path)
      if (!loadedEntry?.diff?.text || nextDiffRenderPaths.has(path)) {
        return
      }

      nextDiffRenderPaths.add(path)
      changed = true
    }

    if (selectedRelativePath && nextDiffRenderPaths.size === 0) {
      addPath(selectedRelativePath)
    }

    for (
      let index = 0;
      index < entries.length && nextDiffRenderPaths.size < DIRECTORY_CODE_VIEW_INITIAL_PARSED_DIFF_COUNT;
      index += 1
    ) {
      const loadedEntry = entries[index]
      if (loadedEntry.diff?.text) {
        addPath(loadedEntry.entry.relativePath)
      }
    }

    if (changed) {
      diffRenderPaths = nextDiffRenderPaths
      diffRenderPathRevision += 1
    }
  }

  function promoteRenderedDiffPaths(paths: string[]) {
    if (paths.length === 0) {
      return false
    }

    let changed = false
    const nextDiffRenderPaths = new Set(diffRenderPaths)
    let promotedCount = 0
    for (const path of paths) {
      if (promotedCount >= DIRECTORY_CODE_VIEW_VISIBLE_PARSE_BATCH) {
        break
      }

      const loadedEntry = entryByPath.get(path)
      if (loadedEntry?.diff?.text && !nextDiffRenderPaths.has(path)) {
        nextDiffRenderPaths.add(path)
        changed = true
        promotedCount += 1
      }
    }

    if (!changed) {
      return false
    }

    diffRenderPaths = nextDiffRenderPaths
    diffRenderPathRevision += 1
    return true
  }

  function buildItems() {
    const items: Array<CodeViewItem<DifflyCommentAnnotation>> = []
    const nextItemIndexByPath = new Map<string, number>()
    const nextItemInputIndexByPath = new Map<string, number>()
    const nextItemKeyByPath = new Map<string, string>()
    const nextEntryByPath = new Map<string, LoadedDirectoryDiff>()
    const nextPlaceholderPaths = new Set<string>()
    const nextLoadingPaths = new Set<string>()
    const activePaths = new Set<string>()

    for (const [entryInputIndex, loadedEntry] of entries.entries()) {
      const { entry, diff, loading } = loadedEntry
      activePaths.add(entry.relativePath)
      nextEntryByPath.set(entry.relativePath, loadedEntry)
      nextItemInputIndexByPath.set(entry.relativePath, entryInputIndex)

      if (!diff?.text || !diffRenderPaths.has(entry.relativePath)) {
        nextPlaceholderPaths.add(entry.relativePath)
      }

      if (loading) {
        nextLoadingPaths.add(entry.relativePath)
      }

      const item = codeViewItemFor(loadedEntry)
      if (item) {
        const itemKey = codeViewItemKey(item)
        nextItemIndexByPath.set(entry.relativePath, items.length)
        nextItemKeyByPath.set(entry.relativePath, itemKey)
        items.push(item)
      }
    }

    pruneItemCaches(activePaths)
    entryByPath = nextEntryByPath
    placeholderPaths = nextPlaceholderPaths
    loadingPaths = nextLoadingPaths
    renderedItems = items
    itemIndexByPath = nextItemIndexByPath
    itemInputIndexByPath = nextItemInputIndexByPath
    itemKeyByPath = nextItemKeyByPath

    return items
  }

  function syncChangedItems(paths: string[]) {
    if (!codeView || paths.length === 0 || renderedItems.length === 0) {
      return false
    }

    let nextRenderedItems = renderedItems
    let nextEntryByPath = entryByPath
    let nextPlaceholderPaths = placeholderPaths
    let nextLoadingPaths = loadingPaths
    let nextItemKeyByPath = itemKeyByPath
    let changed = false

    const ensureCollections = () => {
      if (nextRenderedItems === renderedItems) {
        nextRenderedItems = [...renderedItems]
        nextEntryByPath = new Map(entryByPath)
        nextPlaceholderPaths = new Set(placeholderPaths)
        nextLoadingPaths = new Set(loadingPaths)
        nextItemKeyByPath = new Map(itemKeyByPath)
      }
    }

    const uniquePaths = paths.length === 1 ? paths : Array.from(new Set(paths))
    const shouldBatchCodeViewUpdate =
      uniquePaths.length >= DIRECTORY_CODE_VIEW_BATCH_UPDATE_THRESHOLD

    for (const path of uniquePaths) {
      const itemIndex = itemIndexByPath.get(path)
      const inputIndex = itemInputIndexByPath.get(path)

      if (itemIndex === undefined || inputIndex === undefined) {
        return false
      }

      const loadedEntry = entries[inputIndex]
      if (!loadedEntry || loadedEntry.entry.relativePath !== path) {
        return false
      }

      ensureCollections()
      nextEntryByPath.set(path, loadedEntry)

      if (loadedEntry.diff?.text && diffRenderPaths.has(path)) {
        nextPlaceholderPaths.delete(path)
      } else {
        nextPlaceholderPaths.add(path)
      }

      if (loadedEntry.loading) {
        nextLoadingPaths.add(path)
      } else {
        nextLoadingPaths.delete(path)
      }

      const item = codeViewItemFor(loadedEntry)
      if (!item) {
        return false
      }

      const itemKey = codeViewItemKey(item)
      if (itemKey === nextItemKeyByPath.get(path)) {
        continue
      }

      if (!shouldBatchCodeViewUpdate && !codeView.updateItem(item)) {
        return false
      }

      nextRenderedItems[itemIndex] = item
      nextItemKeyByPath.set(path, itemKey)
      changed = true
    }

    if (!changed) {
      entryByPath = nextEntryByPath
      placeholderPaths = nextPlaceholderPaths
      loadingPaths = nextLoadingPaths
      return true
    }

    renderedItems = nextRenderedItems
    entryByPath = nextEntryByPath
    placeholderPaths = nextPlaceholderPaths
    loadingPaths = nextLoadingPaths
    itemKeyByPath = nextItemKeyByPath

    if (shouldBatchCodeViewUpdate) {
      codeView.setItems(nextRenderedItems)
    }

    return true
  }

  function scheduleVisibleEntryRequest(delayMs = DIRECTORY_CODE_VIEW_VISIBLE_LOAD_IDLE_MS) {
    if (visibleRequestTimer !== null) {
      window.clearTimeout(visibleRequestTimer)
    }

    visibleRequestTimer = window.setTimeout(() => {
      visibleRequestTimer = null
      requestRenderedEntries(codeView)
    }, delayMs)
  }

  function requestRenderedEntries(view: CodeView<DifflyCommentAnnotation> | null) {
    if (!view) {
      return
    }

    const paths = collectRenderedEntryPaths(view)
    if (paths.length === 0) {
      return
    }

    const key = paths.join('\u0000')
    const hasPendingVisiblePlaceholder = paths.some((path) => {
      const entry = entryByPath.get(path)
      return entry && !entry.error && (!entry.diff?.text || !diffRenderPaths.has(path))
    })

    if (promoteRenderedDiffPaths(paths)) {
      void syncCodeView()
      return
    }

    if (key === lastRequestedVisibleKey && !hasPendingVisiblePlaceholder) {
      return
    }

    lastRequestedVisibleKey = key
    requestVisibleEntries(paths)
  }

  function collectRenderedEntryPaths(view: CodeView<DifflyCommentAnnotation>) {
    const paths: string[] = []
    const seenPaths = new Set<string>()
    const addPath = (path: string | undefined) => {
      if (!path || seenPaths.has(path)) {
        return
      }

      seenPaths.add(path)
      paths.push(path)
    }

    for (const item of view.getRenderedItems()) {
      addPath(item.id)
    }

    if (paths.length > 0 || !host) {
      return paths
    }

    host
      .querySelectorAll<HTMLElement>('[data-diffly-entry-path]')
      .forEach((element) => {
        addPath(element.dataset.difflyEntryPath)
      })

    host.querySelectorAll<HTMLElement>('diffs-container').forEach((element) => {
      element.shadowRoot
        ?.querySelectorAll<HTMLElement>('[data-diffly-entry-path]')
        .forEach((shadowElement) => {
          addPath(shadowElement.dataset.difflyEntryPath)
        })
    })

    return paths
  }

  function schedulePlaceholderEntryRequest(path: string) {
    pendingPlaceholderRequestPaths.add(path)

    if (placeholderRequestTimer !== null) {
      window.clearTimeout(placeholderRequestTimer)
    }

    placeholderRequestTimer = window.setTimeout(() => {
      placeholderRequestTimer = null
      const paths = Array.from(pendingPlaceholderRequestPaths)
      pendingPlaceholderRequestPaths = new Set()

      if (paths.length > 0) {
        requestVisibleEntries(paths)
      }
    }, DIRECTORY_CODE_VIEW_VISIBLE_LOAD_IDLE_MS)
  }

  function syncScrollSubscription() {
    if (!codeView || unsubscribeScroll) {
      return
    }

    unsubscribeScroll = codeView.subscribeToScroll(() => {
      scheduleVisibleEntryRequest()
    })
  }

  function scheduleLayoutRetry() {
    if (layoutRetryFrame !== null) {
      return
    }

    layoutRetryFrame = window.requestAnimationFrame(() => {
      layoutRetryFrame = null
      void syncCodeView()
    })
  }

  async function waitForHostLayout(currentRevision: number) {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      if (currentRevision !== renderRevision || !host) {
        return false
      }

      if (host.clientWidth > 0 && host.clientHeight > 0) {
        return true
      }

      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve())
      })
    }

    return false
  }

  async function syncCodeView() {
    const currentRevision = ++renderRevision
    await tick()

    if (!host || currentRevision !== renderRevision) {
      return
    }

    const hasLayout = await waitForHostLayout(currentRevision)

    if (!host || currentRevision !== renderRevision) {
      return
    }

    if (!hasLayout) {
      scheduleLayoutRetry()
      return
    }

    syncWorkerRenderOptions()
    const nextOptionsKey = optionsKey()
    const options = buildOptions()
    const optionsChanged = nextOptionsKey !== lastOptionsKey
    const structureChanged = entryStructureRevision !== lastEntryStructureRevision
    const collapsedChanged = collapsedPaths !== lastCollapsedPaths
    const annotationsChanged = commentAnnotations !== lastCommentAnnotations
    seedInitialDiffRenderPaths()
    const diffRenderPathsChanged = diffRenderPathRevision !== lastDiffRenderPathRevision
    const canPatchChangedItems =
      codeView &&
      !structureChanged &&
      !collapsedChanged &&
      !annotationsChanged &&
      !diffRenderPathsChanged &&
      changedEntryRevision !== lastChangedEntryRevision &&
      changedEntryPaths.length > 0

    if (!codeView) {
      codeView = new CodeView<DifflyCommentAnnotation>(options, getWorkerPool())
      syncCodeViewVirtualization(codeView)
      codeView.setup(host)
      lastOptionsKey = nextOptionsKey
      syncScrollSubscription()
    } else if (optionsChanged) {
      syncCodeViewVirtualization(codeView)
      lastOptionsKey = nextOptionsKey
      codeView.setOptions(options)
      lastRequestedVisibleKey = ''
    } else {
      syncCodeViewVirtualization(codeView)
    }

    if (canPatchChangedItems && syncChangedItems(changedEntryPaths)) {
      lastChangedEntryRevision = changedEntryRevision
      scheduleVisibleEntryRequest()
      if (viewerSettings.controlledSelection) {
        codeView.setSelectedLines(selectedLineSelection, { notify: false })
      }
      return
    }

    const shouldSetItems =
      !hasRenderedItems ||
      structureChanged ||
      collapsedChanged ||
      annotationsChanged ||
      diffRenderPathsChanged ||
      changedEntryRevision !== lastChangedEntryRevision
    const items = buildItems()
    lastEntryStructureRevision = entryStructureRevision
    lastChangedEntryRevision = changedEntryRevision
    lastDiffRenderPathRevision = diffRenderPathRevision
    lastCollapsedPaths = collapsedPaths
    lastCommentAnnotations = commentAnnotations

    if (shouldSetItems) {
      hasRenderedItems = true
      lastRequestedVisibleKey = ''
      codeView.setItems(items)
    }

    scheduleVisibleEntryRequest()

    if (viewerSettings.controlledSelection) {
      codeView.setSelectedLines(selectedLineSelection, { notify: false })
    }
  }

  async function scrollToSelectedEntry() {
    const targetRevision = scrollTargetRevision
    const targetPath = selectedRelativePath

    if (targetRevision <= 0 || targetRevision === appliedScrollTargetRevision || !targetPath) {
      return
    }

    await tick()

    if (targetRevision !== scrollTargetRevision || targetPath !== selectedRelativePath) {
      return
    }

    if (codeView?.getItem(targetPath)) {
      appliedScrollTargetRevision = targetRevision
      codeView.scrollTo({
        type: 'item',
        id: targetPath,
        align: 'start',
        behavior: 'instant',
      })
      scheduleVisibleEntryRequest()
    }
  }

  $: host,
    syncNativeScrollHandling()

  // Load any saved comments whenever the active comparison changes so they
  // survive reloads and re-opening the same compare.
  $: compareKey, loadStoredComments()

  $: host,
    entries,
    collapsedPaths,
    viewerSettings,
    appearanceSettings,
    resolvedThemeMode,
    viewMode,
    commentAnnotations,
    void syncCodeView()

  $: scrollTargetRevision, void scrollToSelectedEntry()

  onDestroy(() => {
    renderRevision += 1

    if (interactionMessageTimer !== null) {
      window.clearTimeout(interactionMessageTimer)
    }

    if (visibleRequestTimer !== null) {
      window.clearTimeout(visibleRequestTimer)
      visibleRequestTimer = null
    }

    if (placeholderRequestTimer !== null) {
      window.clearTimeout(placeholderRequestTimer)
      placeholderRequestTimer = null
    }

    if (layoutRetryFrame !== null) {
      window.cancelAnimationFrame(layoutRetryFrame)
      layoutRetryFrame = null
    }

    unsubscribeScroll?.()
    unsubscribeScroll = null
    unsubscribeNativeScroll?.()
    unsubscribeNativeScroll = null
    codeView?.cleanUp()
    codeView = null
    hasRenderedItems = false
    workerPool?.terminate()
    workerPool = null
    tokenHoverController.destroy()
  })
</script>

<div class="directory-code-view-host" bind:this={host}></div>
{#if interactionMessage}
  <div class="pierre-diff-feedback" role="status">{interactionMessage}</div>
{/if}
