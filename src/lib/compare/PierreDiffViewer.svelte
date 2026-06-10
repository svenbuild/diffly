<script lang="ts">
  import { onDestroy, tick } from 'svelte'
  import { FileDiff, areOptionsEqual, getFiletypeFromFileName } from '@pierre/diffs'
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
    type DifflyCommentAnnotation,
  } from './directory-code-view-comments'
  import { findOpenDraft, focusDraftEditor } from './comment-drafts'
  import {
    DIFF_HEADER_UNSAFE_CSS,
    renderDiffHeaderMetadata,
    renderDiffHeaderPrefix,
  } from './diff-header-renderers'
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

  let host: HTMLDivElement | null = null
  let fileDiff: FileDiff<DifflyCommentAnnotation> | null = null
  let workerPool: WorkerPoolManager | null = null
  let unsubscribeWorkerStats: (() => void) | null = null
  let renderedOptions: FileDiffOptions<DifflyCommentAnnotation> | null = null
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
    const cores = Math.max(1, window.navigator.hardwareConcurrency || 4)
    return Math.max(2, Math.min(6, Math.floor(cores / 2)))
  }

  function fileName(label: string) {
    return label.split(/[\\/]/).pop() || label || 'file.txt'
  }

  function textKey() {
    return [
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
    return directory ? renderDiffHeaderMetadata({ text: directory, title: label }) : null
  }

  function renderCommentAnnotation(annotation: DiffLineAnnotation<DifflyCommentAnnotation>) {
    return renderCommentAnnotationElement(annotation, {
      onSave: () => setInteractionMessage('Comment saved.'),
      onDelete: (target) => {
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
      enableGutterUtility: viewerSettings.enableGutterUtility,
      onGutterUtilityClick: handleGutterUtilityClick,
      renderAnnotation: renderCommentAnnotation,
      enableLineSelection:
        viewerSettings.enableLineSelection ||
        viewerSettings.controlledSelection ||
        viewerSettings.enableGutterUtility,
      controlledSelection: viewerSettings.controlledSelection,
      onLineSelected: handleLineSelected,
      onLineSelectionEnd: handleLineSelected,
      onPostRender: applyCollapsedState,
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
    const textChanged = nextTextKey !== renderedTextKey
    if (textChanged) {
      renderedTextKey = nextTextKey
      renderedAnnotationsKey = ''
      selectedLineRange = null
      commentAnnotations = []
      interactionMessage = ''
    }

    const forceRender = !renderedOptions || !areOptionsEqual(renderedOptions, nextOptions)
    const nextAnnotationsKey = annotationKey(commentAnnotations)
    const annotationsChanged = nextAnnotationsKey !== renderedAnnotationsKey

    if (!fileDiff) {
      fileDiff = new FileDiff<DifflyCommentAnnotation>(nextOptions, getWorkerPool())
    } else if (forceRender) {
      fileDiff.setOptions(nextOptions)
    }
    renderedOptions = nextOptions

    if (!forceRender && !annotationsChanged && !textChanged) {
      if (viewerSettings.controlledSelection) {
        fileDiff.setSelectedLines(selectedLineRange, { notify: false })
      }
      applyCollapsedState()
      return
    }

    renderedAnnotationsKey = nextAnnotationsKey

    fileDiff.render({
      oldFile: buildFile('left', leftLabel, text.leftText, text.leftCacheKey, text.leftSha256),
      newFile: buildFile('right', rightLabel, text.rightText, text.rightCacheKey, text.rightSha256),
      containerWrapper: host,
      forceRender,
      lineAnnotations: commentAnnotations,
    })

    if (viewerSettings.controlledSelection) {
      fileDiff.setSelectedLines(selectedLineRange, { notify: false })
    }

    applyCollapsedState()
  }

  $: tokenHoverLanguage = getFiletypeFromFileName(fileName(rightLabel || leftLabel))

  $: host, text, leftLabel, rightLabel, viewerSettings, appearanceSettings, resolvedThemeMode, viewMode, collapsed, commentAnnotations, void renderDiff()

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
