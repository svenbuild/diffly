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
    type DiffTokenEventBaseProps,
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
  import type { AppearanceSettings } from '../theme'
  import {
    buildPierreDiffUnsafeCss,
    resolvePierreDiffTheme,
  } from '../theme/pierre'
  import type {
    CompareViewerSettings,
    DirectoryEntryResult,
    FileDiffResult,
    TextDiffPayload,
    ViewMode,
  } from '../types'

  interface DifflyCommentAnnotation {
    id: string
    text: string
  }

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
    key: string
    version: number
  }

  type CodeViewItemContext = {
    item?: {
      id?: string
    }
  }

  type CodeViewScrollFixPatch = {
    __difflyOriginalApplyScrollFix?: (
      targetScrollTop: number,
      syncedScrollTop: number,
      windowSpecs?: unknown,
    ) => void
    __difflyOriginalSetItems?: (items: readonly CodeViewItem<DifflyCommentAnnotation>[]) => void
    __difflyScrollGuardInstalled?: boolean
    applyScrollFix?: (
      targetScrollTop: number,
      syncedScrollTop: number,
      windowSpecs?: unknown,
    ) => void
    pendingLayoutAnchor?: unknown
    pendingScrollTarget?: unknown
    renderState?: {
      scrollTop: number
    }
    scrollAnimation?: unknown
    scrollDirty?: boolean
    scrollPageOffset?: number
    scrollTop?: number
    setItems?: (items: readonly CodeViewItem<DifflyCommentAnnotation>[]) => void
  }

  export let entries: LoadedDirectoryDiff[] = []
  export let collapsedPaths = new Set<string>()
  export let selectedRelativePath = ''
  export let viewerSettings: CompareViewerSettings
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark'
  export let viewMode: ViewMode
  export let scrollTargetRevision = 0
  export let toggleEntry: (relativePath: string) => void = () => {}
  export let requestVisibleEntries: (relativePaths: string[]) => void = () => {}

  let host: HTMLDivElement | null = null
  let codeView: CodeView<DifflyCommentAnnotation> | null = null
  let workerPool: WorkerPoolManager | null = null
  let unsubscribeScroll: (() => void) | null = null
  let visibleRequestFrame: number | null = null
  let layoutRetryFrame: number | null = null
  let lastRequestedVisibleKey = ''
  let lastRenderedItemListKey = ''
  let lastOptionsKey = ''
  let lastWorkerOptionsKey = ''
  let appliedScrollTargetRevision = 0
  let userScrollCorrectionSuppressedUntil = 0
  let programmaticScrollAllowedUntil = 0
  let renderRevision = 0
  let selectedLineSelection: CodeViewLineSelection | null = null
  let commentId = 0
  let commentAnnotations = new Map<string, Array<DiffLineAnnotation<DifflyCommentAnnotation>>>()
  let entryByPath = new Map<string, LoadedDirectoryDiff>()
  let placeholderPaths = new Set<string>()
  let loadingPaths = new Set<string>()
  let interactionMessage = ''
  let interactionMessageTimer: number | null = null

  const parsedDiffs = new Map<string, CachedCodeViewDiff>()
  const placeholderItems = new Map<string, CachedPlaceholderItem>()
  const emptyAnnotations: Array<DiffLineAnnotation<DifflyCommentAnnotation>> = []
  const DIRECTORY_CODE_VIEW_MIN_OVERSCROLL_PX = 4200
  const DIRECTORY_CODE_VIEW_MAX_OVERSCROLL_PX = 9000
  const DIRECTORY_CODE_VIEW_OVERSCROLL_VIEWPORTS = 5
  const DIRECTORY_CODE_VIEW_IMMEDIATE_RENDER_MARGIN_PX = 420
  const DIRECTORY_CODE_VIEW_USER_SCROLL_SETTLE_MS = 9000
  const DIRECTORY_CODE_VIEW_PROGRAMMATIC_SCROLL_MS = 900
  const DIRECTORY_PLACEHOLDER_BYTES_PER_LINE = 56
  const DIRECTORY_PLACEHOLDER_MIN_LINES = 8
  const DIRECTORY_PLACEHOLDER_MODIFIED_MAX_LINES = 240
  const DIRECTORY_PLACEHOLDER_FULL_FILE_MAX_LINES = 1200

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
    installScrollCorrectionGuard(view)

    const overscrollSize = directoryCodeViewOverscrollSize()
    if (view.config.overscrollSize !== overscrollSize) {
      view.config.overscrollSize = overscrollSize
      lastRequestedVisibleKey = ''
    }

    if (view.config.intersectionObserverMargin < overscrollSize) {
      view.config.intersectionObserverMargin = overscrollSize
    }
  }

  function clearManualScrollTargets(view: CodeViewScrollFixPatch) {
    view.pendingLayoutAnchor = undefined
    view.pendingScrollTarget = undefined
    view.scrollAnimation = undefined
  }

  function markUserScroll(view: CodeView<DifflyCommentAnnotation>) {
    const now = performance.now()
    if (now < programmaticScrollAllowedUntil) {
      return
    }

    clearManualScrollTargets(view as unknown as CodeViewScrollFixPatch)
    userScrollCorrectionSuppressedUntil =
      now + DIRECTORY_CODE_VIEW_USER_SCROLL_SETTLE_MS
  }

  function extendManualScrollStabilityWindow() {
    const now = performance.now()
    if (now >= userScrollCorrectionSuppressedUntil || now < programmaticScrollAllowedUntil) {
      return
    }

    userScrollCorrectionSuppressedUntil =
      now + DIRECTORY_CODE_VIEW_USER_SCROLL_SETTLE_MS
  }

  function allowProgrammaticScroll() {
    programmaticScrollAllowedUntil = Math.max(
      programmaticScrollAllowedUntil,
      performance.now() + DIRECTORY_CODE_VIEW_PROGRAMMATIC_SCROLL_MS,
    )
  }

  function shouldSuppressScrollCorrection(
    view: CodeViewScrollFixPatch,
    targetScrollTop: number,
    syncedScrollTop: number,
  ) {
    const now = performance.now()
    if (now >= userScrollCorrectionSuppressedUntil || now < programmaticScrollAllowedUntil) {
      return false
    }

    const delta = Math.abs(targetScrollTop - syncedScrollTop)
    return delta > 0.5
  }

  function currentLogicalScrollTop(view: CodeViewScrollFixPatch) {
    const pageOffset = typeof view.scrollPageOffset === 'number'
      ? view.scrollPageOffset
      : 0

    return (host?.scrollTop ?? 0) + pageOffset
  }

  function installScrollCorrectionGuard(view: CodeView<DifflyCommentAnnotation>) {
    const patched = view as unknown as CodeViewScrollFixPatch
    if (patched.__difflyScrollGuardInstalled || !patched.applyScrollFix || !patched.setItems) {
      return
    }

    const originalApplyScrollFix = patched.applyScrollFix.bind(view)
    const originalSetItems = patched.setItems.bind(view)
    patched.__difflyOriginalApplyScrollFix = originalApplyScrollFix
    patched.__difflyOriginalSetItems = originalSetItems
    patched.__difflyScrollGuardInstalled = true

    patched.setItems = (items: readonly CodeViewItem<DifflyCommentAnnotation>[]) => {
      const now = performance.now()
      extendManualScrollStabilityWindow()
      if (now < userScrollCorrectionSuppressedUntil && now >= programmaticScrollAllowedUntil) {
        clearManualScrollTargets(patched)
      }
      originalSetItems(items)
    }

    patched.applyScrollFix = (
      targetScrollTop: number,
      syncedScrollTop: number,
      windowSpecs?: unknown,
    ) => {
      if (shouldSuppressScrollCorrection(patched, targetScrollTop, syncedScrollTop)) {
        const scrollTop = currentLogicalScrollTop(patched)
        clearManualScrollTargets(patched)
        patched.scrollDirty = false
        patched.scrollTop = scrollTop
        if (patched.renderState) {
          patched.renderState.scrollTop = scrollTop
        }
        return
      }

      originalApplyScrollFix(targetScrollTop, syncedScrollTop, windowSpecs)
    }
  }

  function restoreScrollCorrectionGuard() {
    const patched = codeView as unknown as CodeViewScrollFixPatch | null
    if (!patched?.__difflyOriginalApplyScrollFix) {
      return
    }

    patched.applyScrollFix = patched.__difflyOriginalApplyScrollFix
    patched.setItems = patched.__difflyOriginalSetItems
    patched.__difflyOriginalApplyScrollFix = undefined
    patched.__difflyOriginalSetItems = undefined
    patched.__difflyScrollGuardInstalled = false
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

  function buildFile(
    entry: DirectoryEntryResult,
    side: 'left' | 'right',
    text: TextDiffPayload,
  ): FileContents {
    const contents = side === 'left' ? text.leftText : text.rightText
    const cacheKey =
      side === 'left'
        ? text.leftCacheKey ?? text.leftSha256
        : text.rightCacheKey ?? text.rightSha256

    return {
      name: entry.relativePath,
      contents,
      cacheKey: cacheKey ?? `${entry.relativePath}:${side}:${contents.length}`,
      lang: getFiletypeFromFileName(entry.relativePath),
    }
  }

  function getContext(args: unknown[]) {
    const context = args[args.length - 1] as CodeViewItemContext | undefined
    return typeof context?.item?.id === 'string' ? context : null
  }

  function statusLabel(status: DirectoryEntryResult['status'] | undefined) {
    switch (status) {
      case 'leftOnly':
        return 'Left only'
      case 'rightOnly':
        return 'Right only'
      case 'unsupported':
        return 'Unsupported'
      case 'modified':
      default:
        return 'Modified'
    }
  }

  function describeSide(side: string | undefined) {
    return side === 'additions' ? 'right' : 'left'
  }

  function describeRange(range: SelectedLineRange) {
    const startSide = describeSide(range.side)
    const endSide = describeSide(range.endSide ?? range.side)

    if (range.start === range.end && startSide === endSide) {
      return `${startSide} line ${range.start}`
    }

    return `${startSide} line ${range.start} to ${endSide} line ${range.end}`
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

    if (selection) {
      setInteractionMessage(`Selected ${describeRange(selection.range)}.`)
    }
  }

  function handleLineSelected(range: SelectedLineRange | null, context: CodeViewItemContext) {
    const id = context.item?.id
    applyControlledSelection(id && range ? { id, range } : null)

    if (range) {
      setInteractionMessage(`Selected ${describeRange(range)}.`)
    }
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
          id: `comment-${commentId += 1}`,
          text: '',
        },
      },
    ])
    setInteractionMessage(`Comment opened for ${describeRange(range)}.`)
  }

  function handleTokenClick(token: DiffTokenEventBaseProps | { tokenText: string; lineNumber: number; side?: string }) {
    const tokenText = token.tokenText.trim() || 'whitespace'
    console.debug(`Diff token "${tokenText}" on ${describeSide(token.side)} line ${token.lineNumber}.`)
  }

  function renderCommentAnnotation(
    annotation: DiffLineAnnotation<DifflyCommentAnnotation> | LineAnnotation<DifflyCommentAnnotation>,
  ) {
    const wrapper = document.createElement('div')
    const form = document.createElement('form')
    const avatar = document.createElement('div')
    const input = document.createElement('input')
    const submit = document.createElement('button')
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')

    wrapper.className = 'diffly-comment-annotation'
    form.className = 'diffly-comment-composer'
    avatar.className = 'diffly-comment-avatar'
    avatar.textContent = 'D'
    input.type = 'text'
    input.placeholder = 'Add a comment...'
    input.value = annotation.metadata.text
    submit.type = 'submit'
    submit.className = 'diffly-comment-submit'
    submit.setAttribute('aria-label', 'Save comment')
    icon.setAttribute('viewBox', '0 0 16 16')
    icon.setAttribute('aria-hidden', 'true')
    path.setAttribute('d', 'M8 13V3m0 0L4.5 6.5M8 3l3.5 3.5')
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', 'currentColor')
    path.setAttribute('stroke-linecap', 'round')
    path.setAttribute('stroke-linejoin', 'round')
    path.setAttribute('stroke-width', '1.8')
    icon.appendChild(path)
    submit.appendChild(icon)

    input.addEventListener('input', () => {
      annotation.metadata.text = input.value
    })
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      annotation.metadata.text = input.value.trim()
      setInteractionMessage('Comment saved locally.')
    })

    form.append(avatar, input, submit)
    wrapper.appendChild(form)

    return wrapper
  }

  function renderCollapseButton(...args: unknown[]) {
    const context = getContext(args)
    const itemId = context?.item?.id
    if (!itemId) {
      return null
    }

    const collapsed = collapsedPaths.has(itemId)
    const button = document.createElement('button')
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')

    button.type = 'button'
    button.className = 'diffly-codeview-collapse-button'
    button.dataset.collapsed = collapsed ? 'true' : 'false'
    button.setAttribute('aria-label', collapsed ? 'Expand file diff' : 'Collapse file diff')
    button.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
    button.title = collapsed ? 'Expand file diff' : 'Collapse file diff'
    icon.setAttribute('viewBox', '0 0 16 16')
    icon.setAttribute('aria-hidden', 'true')
    path.setAttribute('d', 'M5.75 3.5 10.25 8l-4.5 4.5')
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', 'currentColor')
    path.setAttribute('stroke-linecap', 'round')
    path.setAttribute('stroke-linejoin', 'round')
    path.setAttribute('stroke-width', '1.8')
    icon.appendChild(path)
    button.appendChild(icon)
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      toggleEntry(itemId)
    })

    return button
  }

  function renderHeaderMetadata(...args: unknown[]) {
    const context = getContext(args)
    const itemId = context?.item?.id
    if (!itemId) {
      return null
    }

    const loadedEntry = entryByPath.get(itemId)
    if (!loadedEntry || loadedEntry.diff?.text) {
      return null
    }

    const metadata = document.createElement('span')
    metadata.className = 'diffly-codeview-status-metadata'
    if (loadedEntry.error) {
      metadata.textContent = 'Error'
      metadata.title = loadedEntry.error
    } else {
      metadata.textContent = loadedEntry.loading
        ? 'Loading...'
        : statusLabel(loadedEntry.entry.status)
    }
    return metadata
  }

  function handlePostRender(...args: unknown[]) {
    const node = args[0]
    const context = getContext(args)
    const itemId = context?.item?.id
    if (!(node instanceof HTMLElement) || !itemId) {
      return
    }

    node.toggleAttribute('data-diffly-placeholder', placeholderPaths.has(itemId))
    node.toggleAttribute('data-diffly-loading', loadingPaths.has(itemId))
    node.toggleAttribute('data-diffly-error', Boolean(entryByPath.get(itemId)?.error))
    scheduleVisibleEntryRequest()
  }

  function buildOptions(): CodeViewOptions<DifflyCommentAnnotation> {
    return {
      theme: resolvePierreDiffTheme(appearanceSettings),
      themeType: resolvedThemeMode,
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
      onTokenClick: handleTokenClick,
      renderAnnotation: renderCommentAnnotation,
      renderHeaderPrefix: renderCollapseButton as CodeViewOptions<DifflyCommentAnnotation>['renderHeaderPrefix'],
      renderHeaderMetadata: renderHeaderMetadata as CodeViewOptions<DifflyCommentAnnotation>['renderHeaderMetadata'],
      onPostRender: handlePostRender as CodeViewOptions<DifflyCommentAnnotation>['onPostRender'],
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
      loadedEntry.loading ? '1' : '0',
      loadedEntry.error,
      estimatePlaceholderLineCount(entry),
      collapsedPaths.has(entry.relativePath) ? '1' : '0',
    ].join('\u0000')
  }

  function placeholderVersion(loadedEntry: LoadedDirectoryDiff) {
    const path = loadedEntry.entry.relativePath
    const key = placeholderKey(loadedEntry)
    const cached = placeholderItems.get(path)

    if (cached?.key === key) {
      return cached.version
    }

    const version = (cached?.version ?? 0) + 1
    placeholderItems.set(path, { key, version })
    return version
  }

  function clampPlaceholderLineCount(value: number, max: number) {
    if (!Number.isFinite(value) || value <= 0) {
      return 1
    }

    return Math.max(
      DIRECTORY_PLACEHOLDER_MIN_LINES,
      Math.min(max, Math.ceil(value)),
    )
  }

  function estimatePlaceholderLineCount(entry: DirectoryEntryResult) {
    const maxSize = Math.max(entry.leftSize ?? 0, entry.rightSize ?? 0)
    if (maxSize <= 0) {
      return 1
    }

    const estimatedLines = maxSize / DIRECTORY_PLACEHOLDER_BYTES_PER_LINE
    const maxLines =
      entry.status === 'modified'
        ? DIRECTORY_PLACEHOLDER_MODIFIED_MAX_LINES
        : DIRECTORY_PLACEHOLDER_FULL_FILE_MAX_LINES

    return clampPlaceholderLineCount(estimatedLines, maxLines)
  }

  function buildPlaceholderContents(label: string, lineCount: number) {
    if (lineCount <= 1) {
      return label
    }

    return [label, ...Array.from({ length: lineCount - 1 }, () => '')].join('\n')
  }

  function buildPlaceholderFile(loadedEntry: LoadedDirectoryDiff): FileContents {
    const { entry } = loadedEntry
    const label = loadedEntry.error || (loadedEntry.loading ? 'Loading diff...' : 'Queued diff...')
    const lineCount = loadedEntry.error ? 1 : estimatePlaceholderLineCount(entry)
    const contents = buildPlaceholderContents(label, lineCount)

    return {
      name: entry.relativePath,
      contents,
      cacheKey: ['placeholder', placeholderKey(loadedEntry), contents].join('\u0000'),
      lang: 'text',
    }
  }

  function codeViewItemFor(
    loadedEntry: LoadedDirectoryDiff,
  ): CodeViewItem<DifflyCommentAnnotation> | null {
    const { entry, diff } = loadedEntry
    const collapsed = collapsedPaths.has(entry.relativePath)

    if (!diff?.text) {
      return {
        id: entry.relativePath,
        type: 'file',
        file: buildPlaceholderFile(loadedEntry),
        collapsed,
        version: placeholderVersion(loadedEntry),
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
                buildFile(entry, 'left', diff.text),
                buildFile(entry, 'right', diff.text),
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
  }

  function buildItems() {
    const items: Array<CodeViewItem<DifflyCommentAnnotation>> = []
    const itemKeyParts: string[] = []
    const nextEntryByPath = new Map<string, LoadedDirectoryDiff>()
    const nextPlaceholderPaths = new Set<string>()
    const nextLoadingPaths = new Set<string>()
    const activePaths = new Set<string>()

    for (const loadedEntry of entries) {
      const { entry, diff, loading } = loadedEntry
      activePaths.add(entry.relativePath)
      nextEntryByPath.set(entry.relativePath, loadedEntry)

      if (!diff?.text) {
        nextPlaceholderPaths.add(entry.relativePath)
      }

      if (loading) {
        nextLoadingPaths.add(entry.relativePath)
      }

      const item = codeViewItemFor(loadedEntry)
      if (item) {
        items.push(item)
        itemKeyParts.push(`${item.id}:${item.type}:${item.version ?? 0}`)
      }
    }

    pruneItemCaches(activePaths)
    entryByPath = nextEntryByPath
    placeholderPaths = nextPlaceholderPaths
    loadingPaths = nextLoadingPaths

    return {
      itemListKey: itemKeyParts.join('\u0000'),
      items,
    }
  }

  function scheduleVisibleEntryRequest() {
    if (visibleRequestFrame !== null) {
      return
    }

    visibleRequestFrame = window.requestAnimationFrame(() => {
      visibleRequestFrame = null
      requestRenderedEntries(codeView)
    })
  }

  function requestRenderedEntries(view: CodeView<DifflyCommentAnnotation> | null) {
    if (!view) {
      return
    }

    const paths = view.getRenderedItems().map((item) => item.id)
    if (paths.length === 0) {
      return
    }

    const key = paths.join('\u0000')
    if (key === lastRequestedVisibleKey) {
      return
    }

    lastRequestedVisibleKey = key
    requestVisibleEntries(paths)
  }

  function shouldRenderScrollImmediately(
    scrollTop: number,
    view: CodeView<DifflyCommentAnnotation>,
  ) {
    const height = host?.clientHeight ?? window.innerHeight ?? 0
    if (height <= 0) {
      return false
    }

    const { top, bottom } = view.getWindowSpecs()
    if (bottom <= top) {
      return true
    }

    const margin = Math.max(
      DIRECTORY_CODE_VIEW_IMMEDIATE_RENDER_MARGIN_PX,
      Math.min(directoryCodeViewOverscrollSize() * 0.35, height),
    )
    const viewportBottom = scrollTop + height

    return scrollTop < top + margin || viewportBottom > bottom - margin
  }

  function syncScrollSubscription() {
    if (!codeView || unsubscribeScroll) {
      return
    }

    unsubscribeScroll = codeView.subscribeToScroll((scrollTop, view) => {
      markUserScroll(view)

      if (shouldRenderScrollImmediately(scrollTop, view)) {
        view.render(true)
        requestRenderedEntries(view)
        return
      }

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
    const { itemListKey, items } = buildItems()

    if (!codeView) {
      codeView = new CodeView<DifflyCommentAnnotation>(options, getWorkerPool())
      syncCodeViewVirtualization(codeView)
      codeView.setup(host)
      lastOptionsKey = nextOptionsKey
      syncScrollSubscription()
    } else if (nextOptionsKey !== lastOptionsKey) {
      syncCodeViewVirtualization(codeView)
      lastOptionsKey = nextOptionsKey
      codeView.setOptions(options)
      lastRequestedVisibleKey = ''
    } else {
      syncCodeViewVirtualization(codeView)
    }

    if (itemListKey !== lastRenderedItemListKey) {
      lastRenderedItemListKey = itemListKey
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

    appliedScrollTargetRevision = targetRevision
    await tick()

    if (targetRevision !== scrollTargetRevision || targetPath !== selectedRelativePath) {
      return
    }

    if (codeView?.getItem(targetPath)) {
      allowProgrammaticScroll()
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

    if (visibleRequestFrame !== null) {
      window.cancelAnimationFrame(visibleRequestFrame)
      visibleRequestFrame = null
    }

    if (layoutRetryFrame !== null) {
      window.cancelAnimationFrame(layoutRetryFrame)
      layoutRetryFrame = null
    }

    unsubscribeScroll?.()
    unsubscribeScroll = null
    restoreScrollCorrectionGuard()
    codeView?.cleanUp()
    codeView = null
    workerPool?.terminate()
    workerPool = null
  })
</script>

<div class="directory-code-view-host" bind:this={host}></div>
{#if interactionMessage}
  <div class="pierre-diff-feedback" role="status">{interactionMessage}</div>
{/if}
