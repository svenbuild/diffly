<script lang="ts">
  import { onDestroy, tick } from 'svelte'
  import {
    CodeView,
    getFiletypeFromFileName,
    parseDiffFromFile,
    preloadHighlighter,
  } from '@pierre/diffs'
  import type {
    CodeViewItem,
    CodeViewLineSelection,
    CodeViewOptions,
    DiffsThemeNames,
    DiffLineAnnotation,
    DiffTokenEventBaseProps,
    FileContents,
    FileDiffMetadata,
    LineAnnotation,
    SelectedLineRange,
    SupportedLanguages,
  } from '@pierre/diffs'
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
  }

  type CodeViewItemContext = {
    item?: {
      id?: string
    }
  }

  interface CachedCodeViewDiff {
    annotations: Array<DiffLineAnnotation<DifflyCommentAnnotation>>
    collapsed: boolean
    fileDiff: FileDiffMetadata
    signature: string
    version: number
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
  let unsubscribeScroll: (() => void) | null = null
  let visibleRequestFrame: number | null = null
  let layoutRetryFrame: number | null = null
  let lastRequestedVisibleKey = ''
  let lastRenderedItemListKey = ''
  let renderRevision = 0
  let selectedLineSelection: CodeViewLineSelection | null = null
  let commentId = 0
  let commentAnnotations = new Map<string, Array<DiffLineAnnotation<DifflyCommentAnnotation>>>()
  const parsedDiffs = new Map<string, CachedCodeViewDiff>()
  const lastRenderedCollapsed = new Map<string, boolean>()
  const emptyAnnotations: Array<DiffLineAnnotation<DifflyCommentAnnotation>> = []
  let entryByPath = new Map<string, LoadedDirectoryDiff>()
  let placeholderPaths = new Set<string>()
  let loadingPaths = new Set<string>()
  let highlighterReady = false
  let highlighterPreloadKey = ''
  let highlighterPreloadGeneration = 0
  let interactionMessage = ''
  let interactionMessageTimer: number | null = null

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
    }
  }

  function getContext(args: unknown[]) {
    const context = args[args.length - 1] as CodeViewItemContext | undefined
    return typeof context?.item?.id === 'string' ? context : null
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

  function updateAnnotations(
    itemId: string,
    nextAnnotations: Array<DiffLineAnnotation<DifflyCommentAnnotation>>,
  ) {
    const next = new Map(commentAnnotations)
    next.set(itemId, nextAnnotations)
    commentAnnotations = next
  }

  function annotationsFor(itemId: string) {
    return commentAnnotations.get(itemId) ?? emptyAnnotations
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
    setInteractionMessage(`Token "${tokenText}" on ${describeSide(token.side)} line ${token.lineNumber}.`)
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
    if (!itemId || !placeholderPaths.has(itemId)) {
      return null
    }

    const loadedEntry = entryByPath.get(itemId)
    const metadata = document.createElement('span')
    metadata.className = 'diffly-codeview-status-metadata'
    if (loadedEntry?.error) {
      metadata.textContent = 'Error'
      metadata.title = loadedEntry.error
    } else {
      metadata.textContent = loadedEntry?.loading ? 'Loading...' : statusLabel(loadedEntry?.entry.status)
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

  function scheduleVisibleEntryRequest() {
    if (visibleRequestFrame !== null) {
      return
    }

    visibleRequestFrame = window.requestAnimationFrame(() => {
      visibleRequestFrame = null
      if (!codeView) {
        return
      }

      const paths = codeView.getRenderedItems().map((item) => item.id)
      if (paths.length === 0) {
        return
      }

      const key = paths.join('\u0000')
      if (key === lastRequestedVisibleKey) {
        return
      }

      lastRequestedVisibleKey = key
      requestVisibleEntries(paths)
    })
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
      useTokenTransformer: viewerSettings.syntaxMode === 'shiki' && highlighterReady,
      tokenizeMaxLineLength: viewerSettings.tokenizeMaxLineLength,
      tokenizeMaxLength: viewerSettings.tokenizeMaxLength,
      maxLineDiffLength: viewerSettings.maxLineDiffLength,
      lineHoverHighlight: viewerSettings.lineHoverHighlight,
      enableTokenInteractionsOnWhitespace: viewerSettings.enableTokenInteractionsOnWhitespace,
      enableGutterUtility: viewerSettings.enableGutterUtility,
      onGutterUtilityClick: handleGutterUtilityClick,
      renderAnnotation: renderCommentAnnotation,
      renderHeaderPrefix: renderCollapseButton as CodeViewOptions<DifflyCommentAnnotation>['renderHeaderPrefix'],
      renderHeaderMetadata: renderHeaderMetadata as CodeViewOptions<DifflyCommentAnnotation>['renderHeaderMetadata'],
      onPostRender: handlePostRender as CodeViewOptions<DifflyCommentAnnotation>['onPostRender'],
      onTokenClick: handleTokenClick,
      enableLineSelection:
        viewerSettings.enableLineSelection ||
        viewerSettings.controlledSelection ||
        viewerSettings.enableGutterUtility,
      controlledSelection: viewerSettings.controlledSelection,
      onLineSelected: handleLineSelected,
      onLineSelectionEnd: handleLineSelected,
      onSelectedLinesChange: handleSelectedLinesChange,
      layout: {
        paddingTop: 0,
        paddingBottom: 0,
        gap: 0,
      },
      unsafeCSS: buildPierreDiffUnsafeCss(appearanceSettings) + `
        :host([data-diffly-placeholder]) [data-metadata] > [data-deletions-count],
        :host([data-diffly-placeholder]) [data-metadata] > [data-additions-count] {
          display: none;
        }
      `,
    }
  }

  function resolvePreloadThemes() {
    const theme = resolvePierreDiffTheme(appearanceSettings)
    const themes = typeof theme === 'string' ? [theme] : [theme.light, theme.dark]
    return Array.from(new Set(themes)) as DiffsThemeNames[]
  }

  function resolvePreloadLanguages() {
    const languages = new Set<SupportedLanguages>()

    for (const { entry, diff } of entries) {
      if (!diff?.text) {
        continue
      }

      languages.add(getFiletypeFromFileName(entry.relativePath))
    }

    return Array.from(languages)
  }

  function scheduleHighlighterPreload() {
    const themes = resolvePreloadThemes()
    const languages = resolvePreloadLanguages()
    const key = [
      viewerSettings.syntaxMode,
      viewerSettings.preferredHighlighter,
      themes.join(','),
      languages.join(','),
    ].join('|')

    if (key === highlighterPreloadKey) {
      return
    }

    highlighterPreloadKey = key
    highlighterReady = viewerSettings.syntaxMode !== 'shiki'

    if (viewerSettings.syntaxMode !== 'shiki') {
      return
    }

    const generation = highlighterPreloadGeneration += 1
    window.setTimeout(() => {
      void preloadHighlighter({
        themes,
        langs: languages,
        preferredHighlighter: viewerSettings.preferredHighlighter,
      })
        .then(() => {
          if (generation === highlighterPreloadGeneration) {
            highlighterReady = true
          }
        })
        .catch((error) => {
          console.error('Unable to preload Pierre highlighter', error)
        })
    }, 0)
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

  function buildPlaceholderFile(loadedEntry: LoadedDirectoryDiff): FileContents {
    const { entry } = loadedEntry
    const contents = loadedEntry.error || (loadedEntry.loading ? 'Loading diff...' : '')

    return {
      name: entry.relativePath,
      contents,
      cacheKey: [
        'placeholder',
        entry.relativePath,
        entry.status,
        entry.leftSize ?? '',
        entry.rightSize ?? '',
        contents,
      ].join('\u0000'),
    }
  }

  function placeholderVersion(loadedEntry: LoadedDirectoryDiff) {
    if (loadedEntry.loading) {
      return 1
    }

    if (loadedEntry.error) {
      return 2
    }

    return loadedEntry.diff ? 3 : 0
  }

  function codeViewItemFor(
    loadedEntry: LoadedDirectoryDiff,
  ): CodeViewItem<DifflyCommentAnnotation> | null {
    const { entry, diff } = loadedEntry
    if (!diff?.text) {
      return {
        id: entry.relativePath,
        type: 'file',
        file: buildPlaceholderFile(loadedEntry),
        collapsed: collapsedPaths.has(entry.relativePath),
        version: placeholderVersion(loadedEntry),
      }
    }

    const signature = diff?.text
      ? diffSignature(entry, diff.text)
      : `placeholder:${entry.relativePath}:${entry.status}:${entry.leftSize ?? ''}:${entry.rightSize ?? ''}`
    const collapsed = collapsedPaths.has(entry.relativePath)
    const annotations = annotationsFor(entry.relativePath)
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

      if (nextCached === cached) {
        if (cached.collapsed !== collapsed || cached.annotations !== annotations) {
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

  function pruneItemCache() {
    const activePaths = new Set(entries.map(({ entry }) => entry.relativePath))

    for (const path of parsedDiffs.keys()) {
      if (!activePaths.has(path)) {
        parsedDiffs.delete(path)
        lastRenderedCollapsed.delete(path)
      }
    }
  }

  function buildItems() {
    pruneItemCache()
    const items: Array<CodeViewItem<DifflyCommentAnnotation>> = []
    const nextEntryByPath = new Map<string, LoadedDirectoryDiff>()
    const nextPlaceholderPaths = new Set<string>()
    const nextLoadingPaths = new Set<string>()

    for (const loadedEntry of entries) {
      const { entry, diff, loading } = loadedEntry
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
      }
    }

    entryByPath = nextEntryByPath
    placeholderPaths = nextPlaceholderPaths
    loadingPaths = nextLoadingPaths
    return items
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

    const options = buildOptions()
    const items = buildItems()
    const itemListKey = items.map((item) => `${item.id}:${item.version ?? ''}`).join('\u0000')

    if (itemListKey !== lastRenderedItemListKey) {
      lastRenderedItemListKey = itemListKey
      lastRequestedVisibleKey = ''
    }

    if (!codeView) {
      codeView = new CodeView<DifflyCommentAnnotation>(options)
      codeView.setup(host)
      syncScrollSubscription()
    } else {
      codeView.setOptions(options)
    }

    codeView.setItems(items)
    syncCollapsedSnapshot()
    scheduleVisibleEntryRequest()

    if (viewerSettings.controlledSelection) {
      codeView.setSelectedLines(selectedLineSelection, { notify: false })
    }
  }

  function syncCollapsedSnapshot() {
    lastRenderedCollapsed.clear()
    for (const { entry } of entries) {
      lastRenderedCollapsed.set(entry.relativePath, collapsedPaths.has(entry.relativePath))
    }
  }

  function syncCollapsedItems() {
    if (!codeView) {
      return
    }

    for (const loadedEntry of entries) {
      const { entry } = loadedEntry
      const collapsed = collapsedPaths.has(entry.relativePath)
      if (lastRenderedCollapsed.get(entry.relativePath) === collapsed) {
        continue
      }

      const item = codeViewItemFor(loadedEntry)
      if (item && codeView.updateItem(item)) {
        lastRenderedCollapsed.set(entry.relativePath, collapsed)
      }
    }
  }

  async function scrollToSelectedEntry() {
    await tick()

    if (selectedRelativePath && codeView?.getItem(selectedRelativePath)) {
      codeView.scrollTo({
        type: 'item',
        id: selectedRelativePath,
        align: 'start',
        behavior: 'instant',
      })
      scheduleVisibleEntryRequest()
    }
  }

  $: host,
    entries,
    viewerSettings,
    appearanceSettings,
    resolvedThemeMode,
    viewMode,
    highlighterReady,
    commentAnnotations,
    void syncCodeView()

  $: collapsedPaths, syncCollapsedItems()
  $: selectedRelativePath, scrollTargetRevision, void scrollToSelectedEntry()
  $: entries, viewerSettings, appearanceSettings, scheduleHighlighterPreload()

  onDestroy(() => {
    highlighterPreloadGeneration += 1

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
    codeView?.cleanUp()
    codeView = null
  })
</script>

<div class="directory-code-view-host" bind:this={host}></div>
{#if interactionMessage}
  <div class="pierre-diff-feedback" role="status">{interactionMessage}</div>
{/if}
