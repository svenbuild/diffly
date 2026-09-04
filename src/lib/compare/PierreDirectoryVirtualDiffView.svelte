<script lang="ts">
  import { loadInlineHunks } from "../review/inline-hunks"
  import { onDestroy, onMount, tick } from 'svelte'
  import {
    CodeView,
    parseDiffFromFile,
    processFile,
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
    type WorkerStats,
  } from '@pierre/diffs/worker'
  import DiffsWorker from '@pierre/diffs/worker/worker.js?worker'
  import './directory-code-view.css'
  import type { AppearanceSettings } from '../theme'
  import {
    finishCompareTimingOnNextFrame,
    markCompareTimingOnce,
  } from '../app/compare-timing'
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
    removeCommentAnnotation,
    renderCommentAnnotationElement,
    reviewThreadsToAnnotations,
    type DifflyCommentAnnotation,
  } from './directory-code-view-comments'
  import {
    createReviewThread,
    deleteReviewComment,
    getReviewProfile,
    listReviewThreads,
  } from '../api'
  import { findOpenDraft, focusDraftEditor } from './comment-drafts'
  import {
    DIFF_HEADER_UNSAFE_CSS,
    renderDiffHeaderMetadataWithActions,
    renderReviewActionButtons,
  } from './diff-header-renderers'
  import type { CompareSourceKind } from '../actions/compare-actions'
  import { resolveDiffWorkerPoolSize } from './diff-concurrency'
  import {
    reviewActionsForSource,
    reviewEntryInfoFromEntry,
    runReviewAction,
    type ReviewActionItem,
  } from './review-mode'
  import {
    applyDirectoryItemPostRender,
    getCodeViewItemContext,
    renderDirectoryCollapseButton,
    renderDirectoryHeaderMetadata,
    type CodeViewItemContext,
  } from './directory-code-view-renderers'
  import type {
    CompareViewerSettings,
    DirectoryEntryResult,
    FileDiffResult,
    SystemMonitorSnapshot,
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
  export let onSystemMonitorChange: (stats: SystemMonitorSnapshot) => void = () => {}
  export let reviewModeEnabled = false
  export let reviewSourceKind: CompareSourceKind = 'local'
  export let reviewSessionId: string | null = null
  export let onReviewRefresh: () => Promise<void> | void = () => {}
  export let resolveEntryBases: (relativePath: string) => {
    leftBase: string
    rightBase: string
    relativePath: string
  } = (relativePath) => ({ leftBase: '', rightBase: '', relativePath })

  let host: HTMLDivElement | null = null
  let codeView: CodeView<DifflyCommentAnnotation> | null = null
  let workerPool: WorkerPoolManager | null = null
  let unsubscribeWorkerStats: (() => void) | null = null
  let lastWorkerStats: WorkerStats | null = null
  let unsubscribeScroll: (() => void) | null = null
  let unsubscribeNativeScroll: (() => void) | null = null
  let visibleRequestTimer: number | null = null
  let lastVisibleRequestAt = 0
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
  let hydratedReviewEntryKey = ''
  const hydratedReviewItems = new Map<string, string>()

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
  const DIRECTORY_CODE_VIEW_VISIBLE_LOAD_IDLE_MS = 80
  const DIRECTORY_CODE_VIEW_BATCH_UPDATE_THRESHOLD = 32
  const DIRECTORY_CODE_VIEW_INITIAL_PARSED_DIFF_COUNT = 1
  const DIRECTORY_CODE_VIEW_VISIBLE_PARSE_BATCH = 1
  const DIFF_RENDER_CACHE_SIZE = 100
  const placeholderBlankLineSuffixes = new Map<number, string>()

  function workerPoolSize() {
    return resolveDiffWorkerPoolSize()
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
      totalASTLRUCacheSize: DIFF_RENDER_CACHE_SIZE,
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
      subscribeWorkerStats(workerPool)
    }

    return workerPool
  }

  function renderedDiffItemCount() {
    if (!codeView) {
      return 0
    }

    return codeView.getRenderedItems().filter((item) => item.type === 'diff').length
  }

  function publishSystemMonitorStats(stats: WorkerStats | null = lastWorkerStats) {
    onSystemMonitorChange({
      busyWorkers: stats?.busyWorkers ?? 0,
      totalWorkers: stats?.totalWorkers ?? 0,
      taskQueue: stats?.queuedTasks ?? 0,
      renderingDiffs: renderedDiffItemCount(),
      preparedDiffs: parsedDiffs.size,
      diffCache: stats?.diffCacheSize ?? 0,
    })
  }

  function subscribeWorkerStats(manager: WorkerPoolManager) {
    unsubscribeWorkerStats?.()
    unsubscribeWorkerStats = manager.subscribeToStatChanges((stats) => {
      lastWorkerStats = stats
      publishSystemMonitorStats(stats)
    })
    lastWorkerStats = manager.getStats()
    publishSystemMonitorStats(lastWorkerStats)
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

  function resetReviewAnnotations() {
    commentAnnotations = new Map()
    hydratedReviewEntryKey = ''
    hydratedReviewItems.clear()
  }

  function reviewAnnotationKey(itemId: string, entryId: string) {
    const text = entryByPath.get(itemId)?.diff?.text
    return [reviewSessionId, entryId, text?.leftCacheKey, text?.rightCacheKey, text?.patchCacheKey].join(':')
  }

  async function hydrateReviewAnnotations(itemId: string, entryId: string, key: string) {
    if (!reviewSessionId) return
    const comparison = compareKey
    hydratedReviewItems.set(itemId, key)
    try {
      const entry = entryByPath.get(itemId)?.entry
      const mutationEntryId = entry?.diffEntryAliasIds?.length === 1 ? entry.diffEntryAliasIds[0]! : entryId
      const [threads, hunks] = await Promise.all([
        listReviewThreads(reviewSessionId, entryId),
        loadInlineHunks(reviewSessionId, mutationEntryId, reviewSourceKind, entry?.gitReviewCapabilities, onReviewRefresh),
      ])
      if (comparison !== compareKey || reviewAnnotationKey(itemId, entryId) !== key) return
      updateAnnotations(itemId, [...hunks, ...reviewThreadsToAnnotations(threads, reviewSessionId, entryId, annotationsFor(itemId)), ...annotationsFor(itemId).filter(item => item.metadata.draft)])
    } catch (error) {
      setInteractionMessage(error instanceof Error ? error.message : 'Unable to load review threads.')
    }
  }

  async function handleGutterUtilityClick(range: SelectedLineRange, context: CodeViewItemContext) {
    const itemId = context.item?.id ?? selectedLineSelection?.id ?? ''
    if (!itemId) {
      return
    }

    applyControlledSelection({ id: itemId, range })
    const entryId = entryByPath.get(itemId)?.entry.diffEntryId
    if (reviewSessionId && entryId) {
      await hydrateReviewAnnotations(itemId, entryId, reviewAnnotationKey(itemId, entryId))
    }
    const side = range.endSide ?? range.side ?? 'additions'
    const lineNumber = range.end
    const openDraft = findOpenDraft(annotationsFor(itemId), side, lineNumber)
    if (openDraft) {
      focusDraftEditor(openDraft.metadata.id)
      return
    }

    updateAnnotations(itemId, [
      ...annotationsFor(itemId),
      {
        side,
        lineNumber,
        metadata: {
          id: `comment-${commentId += 1}-${Math.random().toString(36).slice(2, 8)}`,
          text: '',
          draft: true,
        },
      },
    ])
  }

  function renderCommentAnnotation(
    annotation: DiffLineAnnotation<DifflyCommentAnnotation> | LineAnnotation<DifflyCommentAnnotation>,
  ) {
    return renderCommentAnnotationElement(annotation, {
      onDelete: async (target) => {
        if (reviewSessionId && target.metadata.threadId && target.metadata.commentId) {
          await deleteReviewComment(reviewSessionId, target.metadata.threadId, target.metadata.commentId)
          const item = [...commentAnnotations].find(([, annotations]) => annotations.includes(target as DiffLineAnnotation<DifflyCommentAnnotation>))
          const entryId = item ? entryByPath.get(item[0])?.entry.diffEntryId : null
          window.dispatchEvent(new CustomEvent('diffly:review-changed', {
            detail: { sessionId: reviewSessionId, entryId },
          }))
        }
        const result = removeCommentAnnotation(commentAnnotations, target)
        if (!result.removed) {
          return
        }

        commentAnnotations = result.annotations
        setInteractionMessage('Comment deleted.')
      },
      onSave: async (target) => {
        if (!reviewSessionId) throw new Error('Review persistence is unavailable for this comparison.')
        const anchored = target as DiffLineAnnotation<DifflyCommentAnnotation>
        const item = [...commentAnnotations].find(([, annotations]) => annotations.includes(target as DiffLineAnnotation<DifflyCommentAnnotation>))
        const entryId = item ? entryByPath.get(item[0])?.entry.diffEntryId : null
        if (!entryId) throw new Error('Review entry is unavailable.')
        const author = await getReviewProfile()
        const thread = await createReviewThread({
          sessionId: reviewSessionId,
          entryId,
          side: anchored.side,
          lineNumber: anchored.lineNumber,
          body: target.metadata.text,
          author,
        })
        const comment = thread.comments[0]!
        target.metadata.sessionId = reviewSessionId
        target.metadata.entryId = entryId
        target.metadata.savedAt = thread.updatedAt
        target.metadata.comments = thread.comments
        target.metadata.draft = false
        target.metadata.threadId = thread.id
        target.metadata.commentId = comment.id
        target.metadata.author = comment.author
        target.metadata.state = thread.state
        window.dispatchEvent(new CustomEvent('diffly:review-changed', {
          detail: { sessionId: reviewSessionId, entryId },
        }))
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
    const metadata = renderDirectoryHeaderMetadata(args, entryByPath)
    if (!reviewModeEnabled) {
      return metadata
    }

    const context = getCodeViewItemContext(args)
    const itemId = context?.item?.id
    const loadedEntry = itemId ? entryByPath.get(itemId) : null
    if (!loadedEntry) {
      return metadata
    }

    const actions = reviewActionsForSource(
      reviewSourceKind,
      reviewEntryInfoFromEntry(loadedEntry.entry, Boolean(loadedEntry.diff?.text)),
    )
    const buttons = renderReviewActionButtons(actions.filter(action => !action.mutating), (action) => {
      void runEntryReviewAction(action, loadedEntry.entry.relativePath)
    })
    return renderDiffHeaderMetadataWithActions(metadata, buttons)
  }

  // Looks the entry up again at click time: the diff may have loaded (or the
  // compare refreshed) since the header was rendered.
  async function runEntryReviewAction(action: ReviewActionItem, relativePath: string) {
    const loadedEntry = entryByPath.get(relativePath)
    if (!loadedEntry) {
      setInteractionMessage('This file is no longer part of the compare.')
      return
    }

    const bases = resolveEntryBases(relativePath)
    await runReviewAction(action, {
      displayPath: relativePath,
      leftPath: loadedEntry.entry.leftPath,
      rightPath: loadedEntry.entry.rightPath,
      leftBase: bases.leftBase,
      rightBase: bases.rightBase,
      text: loadedEntry.diff?.text ?? null,
      refresh: onReviewRefresh,
      notify: setInteractionMessage,
      gitReview: reviewSessionId && loadedEntry.entry.diffEntryId
        ? { sessionId: reviewSessionId, entryId: loadedEntry.entry.diffEntryId }
        : null,
    })
  }

  function handlePostRender(...args: unknown[]) {
    applyDirectoryItemPostRender(args, {
      entryByPath,
      loadingPaths,
      placeholderPaths,
      schedulePlaceholderEntryRequest,
      scheduleVisibleEntryRequest,
    })
    finishFirstRenderedDiff(args)
    if (reviewModeEnabled && reviewSessionId) {
      const itemId = getCodeViewItemContext(args)?.item?.id
      const entryId = itemId ? entryByPath.get(itemId)?.entry.diffEntryId : null
      if (itemId && entryId) {
        const key = reviewAnnotationKey(itemId, entryId)
        if (hydratedReviewItems.get(itemId) !== key) void hydrateReviewAnnotations(itemId, entryId, key)
      }
    }
  }

  function finishFirstRenderedDiff(args: unknown[]) {
    const node = args[0]
    const phase = args[2]
    const context = getCodeViewItemContext(args)
    const itemId = context?.item?.id
    if (
      !(node instanceof HTMLElement) ||
      !itemId ||
      phase === 'unmount' ||
      context?.type !== 'diff' ||
      placeholderPaths.has(itemId) ||
      loadingPaths.has(itemId) ||
      !hasLoadedDiffPayload(entryByPath.get(itemId)) ||
      !hasRenderedDiffContent(node)
    ) {
      return
    }

    finishCompareTimingOnNextFrame('first-pierre-diff-rendered', {
      path: itemId,
      phase: typeof phase === 'string' ? phase : 'render',
    })
  }

  function hasRenderedDiffContent(node: HTMLElement) {
    const shadowRoot = node.shadowRoot
    if (!shadowRoot) {
      return false
    }

    if (shadowRoot.querySelector('[data-error-wrapper]')) {
      return true
    }

    const codeNodes = shadowRoot.querySelectorAll<HTMLElement>(
      'pre code[data-unified], pre code[data-deletions], pre code[data-additions]',
    )
    for (const codeNode of codeNodes) {
      if (codeNode.childElementCount > 0 || codeNode.textContent?.trim()) {
        return true
      }
    }

    return false
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
      diffStyle: effectiveDiffStyle(),
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
      enableGutterUtility: reviewModeEnabled || viewerSettings.enableGutterUtility,
      controlledSelection: viewerSettings.controlledSelection,
      enableLineSelection:
        reviewModeEnabled ||
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
      layout: {
        paddingTop: 8,
        paddingBottom: 8,
        gap: 8,
      },
      unsafeCSS: buildPierreDiffUnsafeCss(appearanceSettings) + DIFF_HEADER_UNSAFE_CSS + `
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
      viewerSettings.lineDiffType,
      viewerSettings.lineHoverHighlight,
      viewerSettings.enableTokenInteractionsOnWhitespace ? '1' : '0',
      viewerSettings.enableGutterUtility ? '1' : '0',
      viewerSettings.enableLineSelection ? '1' : '0',
      viewerSettings.controlledSelection ? '1' : '0',
      reviewModeEnabled ? '1' : '0',
      reviewSourceKind,
    ].join('\u0000')
  }

  function diffSignature(entry: DirectoryEntryResult, text: TextDiffPayload) {
    return [
      entry.relativePath,
      text.leftCacheKey ?? text.leftSha256 ?? text.leftText.length,
      text.rightCacheKey ?? text.rightSha256 ?? text.rightText.length,
      text.patchCacheKey ?? text.patchText?.length ?? '',
      text.leftText.length,
      text.rightText.length,
    ].join('\u0000')
  }

  function nativePatchSignature(entry: DirectoryEntryResult) {
    return [
      entry.relativePath,
      entry.status,
      entry.leftPath ?? '',
      entry.rightPath ?? '',
      entry.diffPatchCacheKey ?? entry.diffPatchText?.length ?? '',
    ].join('\u0000')
  }

  function hasNativePatch(entry: DirectoryEntryResult) {
    return Boolean(entry.diffPatchText && !entry.binary)
  }

  function expectsNativeGitPatch(entry: DirectoryEntryResult) {
    return Boolean(
      entry.diffEntryScope &&
        entry.diffEntryStatus !== 'untracked' &&
        entry.diffEntryStatus !== 'conflicted' &&
        entry.diffEntryStatus !== 'unsupported' &&
        !entry.binary,
    )
  }

  function hasLoadedDiffPayload(loadedEntry: LoadedDirectoryDiff | null | undefined) {
    return Boolean(loadedEntry?.diff?.text || (loadedEntry && hasNativePatch(loadedEntry.entry)))
  }

  function effectiveDiffStyle() {
    return viewMode === 'unified' ? 'unified' : viewerSettings.diffStyle
  }

  function annotationKey(annotations: Array<DiffLineAnnotation<DifflyCommentAnnotation>>) {
    return annotations
      .map((annotation) => [
        annotation.side,
        annotation.lineNumber,
        annotation.metadata.id,
        annotation.metadata.text,
        annotation.metadata.state,
        annotation.metadata.savedAt,
      ].join(':'))
      .join('\u0001')
  }

  function placeholderKey(loadedEntry: LoadedDirectoryDiff) {
    const { entry } = loadedEntry
    const collapsed = collapsedPaths.has(entry.relativePath)
    return [
      entry.relativePath,
      entry.status,
      entry.leftPath ?? '',
      entry.rightPath ?? '',
      entry.leftSize ?? '',
      entry.rightSize ?? '',
      loadedEntry.error,
      loadedEntry.diff?.text ? 'ready' : 'loading',
      loadedEntry.diff?.text?.patchCacheKey ?? loadedEntry.diff?.text?.patchText?.length ?? '',
      collapsed
        ? 0
        : estimatePlaceholderLineCount(entry, loadedEntry.diff?.text ?? null, effectiveDiffStyle()),
      collapsed ? '1' : '0',
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
    const file = collapsedPaths.has(path)
      ? {
          name: loadedEntry.entry.displayPath ?? loadedEntry.entry.relativePath,
          contents: '',
          cacheKey: ['placeholder-collapsed', key].join('\u0000'),
          lang: 'text',
        }
      : buildPlaceholderFile(
          {
            entry: loadedEntry.entry,
            error: loadedEntry.error,
            hasTextDiff: Boolean(loadedEntry.diff?.text),
            text: loadedEntry.diff?.text ?? null,
            viewStyle: effectiveDiffStyle(),
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
    const nativePatchText = hasNativePatch(entry) ? entry.diffPatchText ?? null : null

    if (collapsed) {
      const placeholder = placeholderItem(loadedEntry)
      return {
        id: entry.relativePath,
        type: 'file',
        file: placeholder.file,
        collapsed,
        version: placeholder.version,
      }
    }

    if (!nativePatchText && expectsNativeGitPatch(entry)) {
      const key = `${entry.relativePath}\u0000missing-native-patch`
      const file = buildPlaceholderFile(
        {
          entry,
          error: 'Git patch was not included for this file.',
          hasTextDiff: false,
        },
        key,
        placeholderBlankLineSuffixes,
      )

      return {
        id: entry.relativePath,
        type: 'file',
        file,
        collapsed,
        version: 1,
      }
    }

    if (!nativePatchText && (!diff?.text || !diffRenderPaths.has(entry.relativePath))) {
      const placeholder = placeholderItem(loadedEntry)
      return {
        id: entry.relativePath,
        type: 'file',
        file: placeholder.file,
        collapsed,
        version: placeholder.version,
      }
    }

    const signature = nativePatchText
      ? nativePatchSignature(entry)
      : diffSignature(entry, diff!.text!)
    const annotations = annotationsFor(entry.relativePath)
    const annotationsKey = annotationKey(annotations)
    const cached = parsedDiffs.get(entry.relativePath)

    try {
      const nextCached =
        cached && cached.signature === signature
          ? cached
          : (() => {
              markCompareTimingOnce('first-pierre-parse-start', {
                path: entry.relativePath,
              })
              const text = diff?.text ?? null
              const leftFile = text ? buildDirectoryCodeViewFile(entry, 'left', text) : null
              const rightFile = text ? buildDirectoryCodeViewFile(entry, 'right', text) : null
              let fileDiff: FileDiffMetadata | null = null

              if (nativePatchText) {
                fileDiff = processFile(nativePatchText, {
                  cacheKey: entry.diffPatchCacheKey ?? signature,
                  isGitDiff: true,
                  throwOnError: true,
                }) ?? null
              } else if (text?.patchText) {
                fileDiff = processFile(text.patchText, {
                  cacheKey: text.patchCacheKey ?? signature,
                  isGitDiff: true,
                  oldFile: leftFile ?? undefined,
                  newFile: rightFile ?? undefined,
                  throwOnError: true,
                }) ?? null
              } else if (leftFile && rightFile) {
                fileDiff = parseDiffFromFile(
                  leftFile,
                  rightFile,
                  undefined,
                  true,
                ) ?? null
              }

              if (!fileDiff) {
                throw new Error('Unable to parse directory diff item.')
              }
              if (rightFile?.lang) {
                fileDiff.lang = rightFile.lang
              }
              markCompareTimingOnce('first-pierre-parse-end', {
                path: entry.relativePath,
              })
              return {
                annotations,
                collapsed,
                fileDiff,
                signature,
                version: (cached?.version ?? 0) + 1,
              }
            })()

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
      if (collapsedPaths.has(path)) {
        return
      }

      const loadedEntry = entries.find((candidate) => candidate.entry.relativePath === path)
      if (!loadedEntry?.diff?.text || nextDiffRenderPaths.has(path)) {
        return
      }

      nextDiffRenderPaths.add(path)
      changed = true
    }

    if (selectedRelativePath && nextDiffRenderPaths.size === 0) {
      addPath(selectedRelativePath)
      if (changed) {
        diffRenderPaths = nextDiffRenderPaths
        diffRenderPathRevision += 1
        return
      }
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
    const orderedPaths = selectedRelativePath && paths.includes(selectedRelativePath)
      ? [selectedRelativePath, ...paths.filter((path) => path !== selectedRelativePath)]
      : paths

    for (const path of orderedPaths) {
      if (promotedCount >= DIRECTORY_CODE_VIEW_VISIBLE_PARSE_BATCH) {
        break
      }
      if (collapsedPaths.has(path)) {
        continue
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

      if (
        !collapsedPaths.has(entry.relativePath) &&
        !hasNativePatch(entry) &&
        !expectsNativeGitPatch(entry) &&
        (!diff?.text || !diffRenderPaths.has(entry.relativePath))
      ) {
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
    publishSystemMonitorStats()

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

      if (
        collapsedPaths.has(path) ||
        hasNativePatch(loadedEntry.entry) ||
        expectsNativeGitPatch(loadedEntry.entry) ||
        (loadedEntry.diff?.text && diffRenderPaths.has(path))
      ) {
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

      if (!shouldBatchCodeViewUpdate && (
        codeView.getItem(item.id)?.type !== item.type || !codeView.updateItem(item)
      )) {
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
    publishSystemMonitorStats()

    if (shouldBatchCodeViewUpdate) {
      replaceCodeViewItems(nextRenderedItems)
    }

    return true
  }

  function replaceCodeViewItems(items: Array<CodeViewItem<DifflyCommentAnnotation>>) {
    const view = codeView
    if (!view) return
    // Pierre's update/append paths require an existing id to keep its item type.
    // Loading placeholders and completed diffs intentionally use the same path.
    const compatibleItems = items.filter(item => {
      const previous = view.getItem(item.id)
      return !previous || previous.type === item.type
    })
    if (compatibleItems.length !== items.length) view.setItems(compatibleItems)
    view.setItems(items)
  }

  function scheduleVisibleEntryRequest(delayMs = DIRECTORY_CODE_VIEW_VISIBLE_LOAD_IDLE_MS) {
    const now = performance.now()
    const elapsedMs = now - lastVisibleRequestAt

    if (lastVisibleRequestAt === 0 || elapsedMs >= delayMs) {
      if (visibleRequestTimer !== null) {
        window.clearTimeout(visibleRequestTimer)
        visibleRequestTimer = null
      }
      lastVisibleRequestAt = now
      requestRenderedEntries(codeView)
      return
    }

    if (visibleRequestTimer !== null) {
      return
    }

    const remainingMs = Math.max(0, delayMs - elapsedMs)
    visibleRequestTimer = window.setTimeout(() => {
      visibleRequestTimer = null
      lastVisibleRequestAt = performance.now()
      requestRenderedEntries(codeView)
    }, remainingMs)
  }

  function requestRenderedEntries(view: CodeView<DifflyCommentAnnotation> | null) {
    if (!view) {
      return
    }

    const paths = collectRenderedEntryPaths(view)
    publishSystemMonitorStats()
    if (paths.length === 0) {
      return
    }

    const key = paths.join('\u0000')
    const hasPendingVisiblePlaceholder = paths.some((path) => {
      const entry = entryByPath.get(path)
      return (
        entry &&
        !entry.error &&
        !collapsedPaths.has(path) &&
        !hasNativePatch(entry.entry) &&
        !expectsNativeGitPatch(entry.entry) &&
        (!entry.diff?.text || !diffRenderPaths.has(path))
      )
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

    const hostRect = host?.getBoundingClientRect()
    const visiblePaddingPx = 16
    for (const item of view.getRenderedItems()) {
      if (!hostRect) {
        addPath(item.id)
        continue
      }

      const itemRect = item.element.getBoundingClientRect()
      if (
        itemRect.bottom >= hostRect.top - visiblePaddingPx &&
        itemRect.top <= hostRect.bottom + visiblePaddingPx
      ) {
        addPath(item.id)
      }
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
      if (viewerSettings.controlledSelection) {
        codeView.setSelectedLines(selectedLineSelection, { notify: false })
      }
      if (scrollTargetRevision > appliedScrollTargetRevision) {
        void scrollToSelectedEntry()
      } else {
        scheduleVisibleEntryRequest()
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
      replaceCodeViewItems(items)
    }

    if (viewerSettings.controlledSelection) {
      codeView.setSelectedLines(selectedLineSelection, { notify: false })
    }

    if (scrollTargetRevision > appliedScrollTargetRevision) {
      void scrollToSelectedEntry()
    } else {
      scheduleVisibleEntryRequest()
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

  function handleReviewThreadNavigation(event: Event) {
    const detail = (event as CustomEvent<{
      entryId?: string | null
      side?: 'deletions' | 'additions'
      lineNumber?: number
    }>).detail
    if (!detail || !Number.isSafeInteger(detail.lineNumber) || !detail.side) return
    const item = entries.find((candidate) => candidate.entry.diffEntryId === detail.entryId)
    const id = item?.entry.relativePath ?? selectedRelativePath
    if (!id || !codeView?.getItem(id)) return
    codeView.scrollTo({
      type: 'line',
      id,
      lineNumber: detail.lineNumber!,
      side: detail.side,
      align: 'center',
      behavior: 'smooth-auto',
    })
  }

  function handleReviewChanged(event: Event) {
    const detail = (event as CustomEvent<{ sessionId?: string; entryId?: string | null }>).detail
    if (!reviewSessionId || detail?.sessionId !== reviewSessionId || !detail.entryId) return
    const loaded = entries.find((candidate) => candidate.entry.diffEntryId === detail.entryId)
    if (!loaded) return
    const key = reviewAnnotationKey(loaded.entry.relativePath, detail.entryId)
    if (loaded.entry.relativePath === selectedRelativePath) hydratedReviewEntryKey = key
    void hydrateReviewAnnotations(loaded.entry.relativePath, detail.entryId, key)
  }

  onMount(() => {
    window.addEventListener('diffly:scroll-to-diff-line', handleReviewThreadNavigation)
    window.addEventListener('diffly:review-changed', handleReviewChanged)
    return () => {
      window.removeEventListener('diffly:scroll-to-diff-line', handleReviewThreadNavigation)
      window.removeEventListener('diffly:review-changed', handleReviewChanged)
    }
  })

  $: host,
    syncNativeScrollHandling()

  // Backend-backed annotations are hydrated again for each comparison.
  $: compareKey, resetReviewAnnotations()

  $: {
    const loaded = entryByPath.get(selectedRelativePath)
    const entryId = loaded?.entry.diffEntryId
    const key = reviewSessionId && entryId ? reviewAnnotationKey(selectedRelativePath, entryId) : ''
    if (key && hydratedReviewEntryKey !== key) {
      hydratedReviewEntryKey = key
      void hydrateReviewAnnotations(selectedRelativePath, entryId!, key)
    }
  }

  $: host,
    entries,
    collapsedPaths,
    viewerSettings,
    appearanceSettings,
    resolvedThemeMode,
    viewMode,
    commentAnnotations,
    reviewModeEnabled,
    reviewSourceKind,
    entryStructureRevision,
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
    unsubscribeWorkerStats?.()
    unsubscribeWorkerStats = null
    workerPool?.terminate()
    workerPool = null
    lastWorkerStats = null
  })
</script>

<div class="directory-code-view-host" bind:this={host}></div>
{#if interactionMessage}
  <div class="pierre-diff-feedback" role="status">{interactionMessage}</div>
{/if}
