<script lang="ts">
  import { loadInlineHunks } from "../review/inline-hunks"
  import { onDestroy, onMount, tick } from 'svelte'
  import {
    FileDiff,
    areOptionsEqual,
    getFiletypeFromFileName,
    processFile,
  } from '@pierre/diffs'
  import {
    WorkerPoolManager,
    type WorkerInitializationRenderOptions,
    type WorkerPoolOptions,
    type WorkerStats,
  } from '@pierre/diffs/worker'
  import DiffsWorker from '@pierre/diffs/worker/worker.js?worker'
  import type {
    DiffLineAnnotation,
    DiffTokenEventBaseProps,
    FileContents,
    FileDiffMetadata,
    FileDiffOptions,
    SelectedLineRange,
  } from '@pierre/diffs'
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
  import type {
    CompareViewerSettings,
    SystemMonitorSnapshot,
    TextDiffPayload,
    ViewMode,
  } from '../types'
  import {
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
    renderDiffHeaderMetadata,
    renderDiffHeaderMetadataWithActions,
    renderDiffHeaderPrefix,
    renderReviewActionButtons,
  } from './diff-header-renderers'
  import type { CompareSourceKind } from '../actions/compare-actions'
  import { resolveDiffWorkerPoolSize } from './diff-concurrency'
  import {
    reviewActionsForSource,
    reviewEntryInfoFromText,
    runReviewAction,
    type ReviewActionItem,
  } from './review-mode'
  import { createTokenHoverController } from './token-hover/controller'

  export let text: TextDiffPayload
  export let leftLabel: string
  export let rightLabel: string
  export let viewerSettings: CompareViewerSettings
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark'
  export let viewMode: ViewMode
  export let collapsed = false
  export let onSystemMonitorChange: (stats: SystemMonitorSnapshot) => void = () => {}
  export let reviewModeEnabled = false
  export let reviewSourceKind: CompareSourceKind = 'local'
  /** Absolute on-disk side paths; empty for session-backed sources. */
  export let reviewLeftPath = ''
  export let reviewRightPath = ''
  export let reviewSessionId: string | null = null
  export let reviewEntryId = 'file'
  export let onReviewRefresh: () => Promise<void> | void = () => {}

  let host: HTMLDivElement | null = null
  let fileDiff: FileDiff<DifflyCommentAnnotation> | null = null
  let workerPool: WorkerPoolManager | null = null
  let unsubscribeWorkerStats: (() => void) | null = null
  let renderedOptions: FileDiffOptions<DifflyCommentAnnotation> | null = null
  let parsedPatchCache: { key: string; fileDiff: FileDiffMetadata | null } | null = null
  let renderedDiffInputKey = ''
  let renderVersion = 0
  let selectedLineRange: SelectedLineRange | null = null
  let commentId = 0
  let commentAnnotations: Array<DiffLineAnnotation<DifflyCommentAnnotation>> = []
  let interactionMessage = ''
  let interactionMessageTimer: number | null = null
  let renderedTextKey = ''
  let renderedAnnotationsKey = ''
  let lastWorkerOptionsKey = ''
  let leftFileCache: { key: string; file: FileContents } | null = null
  let rightFileCache: { key: string; file: FileContents } | null = null
  let reviewHydrationKey = ''

  const tokenHoverController = createTokenHoverController()
  const DIFF_RENDER_CACHE_SIZE = 100
  let tokenHoverLanguage = ''

  function handleTokenEnter(props: DiffTokenEventBaseProps, event: PointerEvent) {
    tokenHoverController.handleEnter(props, event, tokenHoverLanguage)
  }

  function handleTokenLeave() {
    tokenHoverController.handleLeave()
  }

  function workerPoolSize() {
    return resolveDiffWorkerPoolSize()
  }

  function fileName(label: string) {
    return label.split(/[\\/]/).pop() || label || 'file.txt'
  }

  function textKey() {
    return [
      text.leftCacheKey ?? text.leftSha256 ?? text.leftText.length,
      text.rightCacheKey ?? text.rightSha256 ?? text.rightText.length,
      text.patchCacheKey ?? text.patchText?.length ?? '',
      text.leftText.length,
      text.rightText.length,
    ].join(':')
  }

  function diffInputKey() {
    return [
      text.patchCacheKey ?? text.patchText?.length ?? '',
      leftLabel,
      rightLabel,
      text.leftCacheKey ?? text.leftSha256 ?? text.leftText.length,
      text.rightCacheKey ?? text.rightSha256 ?? text.rightText.length,
      text.leftText.length,
      text.rightText.length,
    ].join(':')
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

  function applyControlledSelection(range: SelectedLineRange | null) {
    selectedLineRange = range

    if (viewerSettings.controlledSelection) {
      fileDiff?.setSelectedLines(range, { notify: false })
    }
  }

  function handleLineSelected(range: SelectedLineRange | null) {
    applyControlledSelection(range)
  }

  function handleGutterUtilityClick(range: SelectedLineRange) {
    applyControlledSelection(range)
    const side = range.endSide ?? range.side ?? 'additions'
    const openDraft = findOpenDraft(commentAnnotations, side, range.end)
    if (openDraft) {
      focusDraftEditor(openDraft.metadata.id)
      return
    }

    commentAnnotations = [
      ...commentAnnotations,
      {
        side,
        lineNumber: range.end,
        metadata: {
          id: `comment-${commentId += 1}-${Math.random().toString(36).slice(2, 8)}`,
          text: '',
          draft: true,
        },
      },
    ]
  }

  async function hydrateReviewAnnotations(key: string) {
    if (!reviewSessionId) return
    try {
      const [threads, hunks] = await Promise.all([
        listReviewThreads(reviewSessionId, reviewEntryId),
        loadInlineHunks(reviewSessionId, reviewEntryId, reviewSourceKind, null, onReviewRefresh),
      ])
      if (`${reviewSessionId}:${reviewEntryId}:${textKey()}` !== key) return
      commentAnnotations = [...hunks, ...reviewThreadsToAnnotations(threads, reviewSessionId, reviewEntryId, commentAnnotations), ...commentAnnotations.filter(item => item.metadata.draft)]
    } catch (error) {
      setInteractionMessage(error instanceof Error ? error.message : 'Unable to load review threads.')
    }
  }

  function handleReviewChanged(event: Event) {
    const detail = (event as CustomEvent<{ sessionId?: string; entryId?: string | null }>).detail
    if (!reviewSessionId || detail?.sessionId !== reviewSessionId || detail.entryId !== reviewEntryId) return
    const key = `${reviewSessionId}:${reviewEntryId}:${textKey()}`
    reviewHydrationKey = key
    void hydrateReviewAnnotations(key)
  }

  function applyCollapsedState() {
    const container = host?.querySelector('diffs-container') as HTMLElement | null

    if (container) {
      container.toggleAttribute('data-diffly-collapsed', collapsed)
      // Pierre themes via themeType but never reflects it as a host attribute,
      // so our :host([data-theme='light']) overrides (header/host text color)
      // never apply. Mirror the resolved mode onto the host ourselves.
      container.setAttribute('data-theme', resolvedThemeMode)
      container.style.colorScheme = resolvedThemeMode
    }

  }

  function handlePostRender() {
    applyCollapsedState()
    finishFirstRenderedDiff()
  }

  function finishFirstRenderedDiff() {
    if (!host || !hasRenderedDiffContent(host)) {
      return
    }

    finishCompareTimingOnNextFrame('first-pierre-diff-rendered', {
      path: rightLabel || leftLabel,
    })
  }

  function hasRenderedDiffContent(root: HTMLElement) {
    const containers = root.querySelectorAll<HTMLElement>('diffs-container')
    for (const container of containers) {
      const shadowRoot = container.shadowRoot
      if (!shadowRoot) {
        continue
      }

      if (shadowRoot.querySelector('[data-error-wrapper]')) {
        return true
      }

      if (
        shadowRoot.querySelector(
          'pre code[data-unified], pre code[data-deletions], pre code[data-additions]',
        )
      ) {
        return true
      }
    }

    return false
  }

  function headerDirectory(label: string) {
    const normalized = label.replace(/[\\/]+$/, '')
    const separatorIndex = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
    return separatorIndex > 0 ? normalized.slice(0, separatorIndex) : ''
  }

  function renderFileHeaderPrefix(fileDiff: FileDiffMetadata) {
    // File mode has no collapse toggle wired to the header, so render the
    // file-type icon only — no dead chevron control.
    return renderDiffHeaderPrefix(fileDiff.name)
  }

  function renderFileHeaderMetadata() {
    const label = rightLabel || leftLabel
    const directory = headerDirectory(label)
    const metadata = directory
      ? renderDiffHeaderMetadata({ text: directory, title: label })
      : null

    if (!reviewModeEnabled) {
      return metadata
    }

    const actions = reviewActionsForSource(reviewSourceKind, reviewEntryInfoFromText(text))
    const buttons = renderReviewActionButtons(actions, (action) => {
      void runFileReviewAction(action)
    })
    return renderDiffHeaderMetadataWithActions(metadata, buttons)
  }

  async function runFileReviewAction(action: ReviewActionItem) {
    await runReviewAction(action, {
      displayPath: fileName(rightLabel || leftLabel),
      leftPath: text.leftExists && reviewLeftPath ? reviewLeftPath : null,
      rightPath: text.rightExists && reviewRightPath ? reviewRightPath : null,
      // Single-file compares: the compared files are the compare roots.
      leftBase: reviewLeftPath,
      rightBase: reviewRightPath,
      text,
      refresh: onReviewRefresh,
      notify: setInteractionMessage,
    })
  }

  function renderCommentAnnotation(annotation: DiffLineAnnotation<DifflyCommentAnnotation>) {
    return renderCommentAnnotationElement(annotation, {
      onSave: async (target) => {
        if (!reviewSessionId) throw new Error('Review persistence is unavailable for this comparison.')
        const anchored = target as DiffLineAnnotation<DifflyCommentAnnotation>
        const author = await getReviewProfile()
        const thread = await createReviewThread({
          sessionId: reviewSessionId,
          entryId: reviewEntryId,
          side: anchored.side,
          lineNumber: anchored.lineNumber,
          body: target.metadata.text,
          author,
        })
        const comment = thread.comments[0]!
        target.metadata.sessionId = reviewSessionId
        target.metadata.entryId = reviewEntryId
        target.metadata.savedAt = thread.updatedAt
        target.metadata.comments = thread.comments
        target.metadata.draft = false
        target.metadata.threadId = thread.id
        target.metadata.commentId = comment.id
        target.metadata.author = comment.author
        target.metadata.state = thread.state
        window.dispatchEvent(new CustomEvent('diffly:review-changed', {
          detail: { sessionId: reviewSessionId, entryId: reviewEntryId },
        }))
        setInteractionMessage('Comment saved.')
      },
      onDelete: async (target) => {
        if (reviewSessionId && target.metadata.threadId && target.metadata.commentId) {
          await deleteReviewComment(reviewSessionId, target.metadata.threadId, target.metadata.commentId)
          window.dispatchEvent(new CustomEvent('diffly:review-changed', {
            detail: { sessionId: reviewSessionId, entryId: reviewEntryId },
          }))
        }
        commentAnnotations = commentAnnotations.filter(
          (entry) => entry.metadata.id !== target.metadata.id,
        )
        setInteractionMessage('Comment removed.')
      },
    })
  }

  function buildOptions(): FileDiffOptions<DifflyCommentAnnotation> {
    return {
      theme: resolvePierreDiffTheme(appearanceSettings),
      themeType: resolvedThemeMode,
      collapsed,
      diffStyle: viewMode === 'unified' ? 'unified' : viewerSettings.diffStyle,
      overflow: viewerSettings.codeOverflow,
      diffIndicators: viewerSettings.diffIndicators,
      lineDiffType: viewerSettings.lineDiffType,
      hunkSeparators: viewerSettings.hunkSeparators,
      expandUnchanged: viewerSettings.expandUnchanged,
      collapsedContextThreshold: viewerSettings.collapsedContextThreshold,
      expansionLineCount: viewerSettings.expansionLineCount,
      disableLineNumbers: viewerSettings.disableLineNumbers,
      disableFileHeader: viewerSettings.disableFileHeader,
      disableBackground: viewerSettings.disableBackground,
      disableVirtualizationBuffers: viewerSettings.disableVirtualizationBuffers,
      stickyHeader: viewerSettings.stickyHeader,
      preferredHighlighter: viewerSettings.preferredHighlighter,
      useCSSClasses: viewerSettings.useCSSClasses,
      useTokenTransformer: viewerSettings.syntaxMode === 'shiki',
      tokenizeMaxLineLength: viewerSettings.tokenizeMaxLineLength,
      tokenizeMaxLength: viewerSettings.tokenizeMaxLength,
      maxLineDiffLength: viewerSettings.maxLineDiffLength,
      lineHoverHighlight: viewerSettings.lineHoverHighlight,
      enableTokenInteractionsOnWhitespace: viewerSettings.enableTokenInteractionsOnWhitespace,
      enableGutterUtility: reviewModeEnabled || viewerSettings.enableGutterUtility,
      onGutterUtilityClick: handleGutterUtilityClick,
      renderAnnotation: renderCommentAnnotation,
      enableLineSelection:
        reviewModeEnabled ||
        viewerSettings.enableLineSelection ||
        viewerSettings.controlledSelection ||
        viewerSettings.enableGutterUtility,
      controlledSelection: viewerSettings.controlledSelection,
      onLineSelected: handleLineSelected,
      onLineSelectionEnd: handleLineSelected,
      onPostRender: handlePostRender,
      renderHeaderPrefix: renderFileHeaderPrefix,
      renderHeaderMetadata: renderFileHeaderMetadata,
      // Providing token handlers auto-enables Pierre's token transformer, so we
      // only attach them when the feature is on. Toggling changes the options
      // identity, which areOptionsEqual/setOptions detects and re-renders.
      ...(viewerSettings.tokenHover
        ? { onTokenEnter: handleTokenEnter, onTokenLeave: handleTokenLeave }
        : {}),
      unsafeCSS: buildPierreDiffUnsafeCss(appearanceSettings) + DIFF_HEADER_UNSAFE_CSS,
    }
  }

  function buildFile(
    side: 'left' | 'right',
    label: string,
    contents: string,
    cacheKey: string | null,
    sha256: string | null,
  ): FileContents {
    const lang: 'text' | undefined = viewerSettings.syntaxMode === 'shiki' ? undefined : 'text'
    const key = [
      label,
      cacheKey ?? sha256 ?? '',
      contents.length,
      lang ?? 'auto',
    ].join('\u0000')
    const cache = side === 'left' ? leftFileCache : rightFileCache

    if (cache?.key === key && cache.file.contents === contents) {
      return cache.file
    }

    const file: FileContents = {
      name: fileName(label),
      contents,
      cacheKey: cacheKey ?? sha256 ?? `${label}:${contents.length}`,
      lang,
    }

    if (side === 'left') {
      leftFileCache = { key, file }
    } else {
      rightFileCache = { key, file }
    }

    return file
  }

  function buildPatchFileDiff(oldFile: FileContents, newFile: FileContents) {
    if (!text.patchText) {
      return undefined
    }

    const patchCacheKey = text.patchCacheKey ?? textKey()
    const parsedCacheKey = [
      patchCacheKey,
      oldFile.cacheKey,
      newFile.cacheKey,
      oldFile.lang ?? 'auto',
      newFile.lang ?? 'auto',
    ].join('\u0000')

    if (parsedPatchCache?.key === parsedCacheKey) {
      return parsedPatchCache.fileDiff ?? undefined
    }

    try {
      const fileDiff = processFile(text.patchText, {
        cacheKey: patchCacheKey,
        isGitDiff: true,
        oldFile,
        newFile,
        throwOnError: true,
      }) ?? null

      if (fileDiff && newFile.lang) {
        fileDiff.lang = newFile.lang
      }
      parsedPatchCache = { key: parsedCacheKey, fileDiff }
      return fileDiff ?? undefined
    } catch (error) {
      console.error('Unable to parse prepared file diff', error)
      parsedPatchCache = { key: parsedCacheKey, fileDiff: null }
      return undefined
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

  function publishWorkerStats(stats: WorkerStats) {
    onSystemMonitorChange({
      busyWorkers: stats.busyWorkers,
      totalWorkers: stats.totalWorkers,
      taskQueue: stats.queuedTasks,
      renderingDiffs: stats.activeTasks,
      preparedDiffs: 0,
      diffCache: stats.diffCacheSize,
    })
  }

  function subscribeWorkerStats(manager: WorkerPoolManager) {
    unsubscribeWorkerStats?.()
    unsubscribeWorkerStats = manager.subscribeToStatChanges(publishWorkerStats)
    publishWorkerStats(manager.getStats())
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

  async function renderDiff() {
    if (!host) {
      return
    }

    const version = ++renderVersion
    await tick()

    if (!host || version !== renderVersion) {
      return
    }

    syncWorkerRenderOptions()
    const nextOptions = buildOptions()
    const nextTextKey = textKey()
    const nextDiffInputKey = diffInputKey()
    const textChanged = nextTextKey !== renderedTextKey
    const diffInputChanged = nextDiffInputKey !== renderedDiffInputKey
    if (textChanged) {
      renderedTextKey = nextTextKey
      renderedAnnotationsKey = ''
      selectedLineRange = null
      commentAnnotations = []
      interactionMessage = ''
    }

    const forceRender =
      !renderedOptions || !areOptionsEqual(renderedOptions, nextOptions) || diffInputChanged
    const nextAnnotationsKey = annotationKey(commentAnnotations)
    const annotationsChanged = nextAnnotationsKey !== renderedAnnotationsKey

    if (!fileDiff) {
      fileDiff = new FileDiff<DifflyCommentAnnotation>(nextOptions, getWorkerPool())
    } else if (forceRender) {
      fileDiff.setOptions(nextOptions)
    }
    renderedOptions = nextOptions
    renderedDiffInputKey = nextDiffInputKey

    if (!forceRender && !annotationsChanged && !textChanged) {
      if (viewerSettings.controlledSelection) {
        fileDiff.setSelectedLines(selectedLineRange, { notify: false })
      }
      applyCollapsedState()
      return
    }

    renderedAnnotationsKey = nextAnnotationsKey

    const oldFile = buildFile('left', leftLabel, text.leftText, text.leftCacheKey, text.leftSha256)
    const newFile = buildFile('right', rightLabel, text.rightText, text.rightCacheKey, text.rightSha256)
    markCompareTimingOnce('first-pierre-parse-start', {
      path: rightLabel || leftLabel,
    })
    const patchFileDiff = buildPatchFileDiff(oldFile, newFile)
    markCompareTimingOnce('first-pierre-parse-end', {
      path: rightLabel || leftLabel,
    })
    fileDiff.render({
      oldFile,
      newFile,
      fileDiff: patchFileDiff,
      containerWrapper: host,
      forceRender,
      lineAnnotations: commentAnnotations,
    })

    if (viewerSettings.controlledSelection) {
      fileDiff.setSelectedLines(selectedLineRange, { notify: false })
    }

    applyCollapsedState()
    finishFirstRenderedDiff()
  }

  $: tokenHoverLanguage = getFiletypeFromFileName(fileName(rightLabel || leftLabel))

  $: {
    const key = reviewSessionId ? `${reviewSessionId}:${reviewEntryId}:${textKey()}` : ''
    if (key && reviewHydrationKey !== key) {
      reviewHydrationKey = key
      void hydrateReviewAnnotations(key)
    }
  }

  onMount(() => {
    window.addEventListener('diffly:review-changed', handleReviewChanged)
    return () => window.removeEventListener('diffly:review-changed', handleReviewChanged)
  })

  $: host, text, leftLabel, rightLabel, viewerSettings, appearanceSettings, resolvedThemeMode, viewMode, collapsed, commentAnnotations, void renderDiff()

  // Header renderers are stable function references, so toggling review mode
  // never changes the options identity. Drop the rendered-options cache to
  // force a full re-render with the new header content.
  let lastReviewRenderKey = ''
  $: {
    const reviewRenderKey = `${reviewModeEnabled ? '1' : '0'}:${reviewSourceKind}`
    if (reviewRenderKey !== lastReviewRenderKey) {
      const isInitial = lastReviewRenderKey === ''
      lastReviewRenderKey = reviewRenderKey
      if (!isInitial) {
        renderedOptions = null
        void renderDiff()
      }
    }
  }

  onDestroy(() => {
    if (interactionMessageTimer !== null) {
      window.clearTimeout(interactionMessageTimer)
    }
    fileDiff?.cleanUp()
    fileDiff = null
    unsubscribeWorkerStats?.()
    unsubscribeWorkerStats = null
    workerPool?.terminate()
    workerPool = null
    renderedOptions = null
    tokenHoverController.destroy()
  })
</script>

<div class="pierre-diff-host" bind:this={host}></div>
{#if interactionMessage}
  <div class="pierre-diff-feedback" role="status">{interactionMessage}</div>
{/if}
