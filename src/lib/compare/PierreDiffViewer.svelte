<script lang="ts">
  import { onDestroy, tick } from 'svelte'
  import { FileDiff, areOptionsEqual } from '@pierre/diffs'
  import {
    WorkerPoolManager,
    type WorkerInitializationRenderOptions,
    type WorkerPoolOptions,
  } from '@pierre/diffs/worker'
  import DiffsWorker from '@pierre/diffs/worker/worker.js?worker'
  import type {
    DiffLineAnnotation,
    DiffTokenEventBaseProps,
    FileContents,
    FileDiffOptions,
    SelectedLineRange,
  } from '@pierre/diffs'
  import type { AppearanceSettings } from '../theme'
  import {
    buildPierreDiffUnsafeCss,
    resolvePierreDiffTheme,
  } from '../theme/pierre'
  import type { CompareViewerSettings, TextDiffPayload, ViewMode } from '../types'
  import { pickAvatar } from '../assets/avatars'

  interface DifflyCommentAnnotation {
    id: string
    text: string
    author: string
    saved: boolean
  }

  type CommentSide = DiffLineAnnotation<DifflyCommentAnnotation>['side']

  const SVG_NS = 'http://www.w3.org/2000/svg'

  export let text: TextDiffPayload
  export let leftLabel: string
  export let rightLabel: string
  export let viewerSettings: CompareViewerSettings
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark'
  export let viewMode: ViewMode
  export let collapsed = false

  let host: HTMLDivElement | null = null
  let fileDiff: FileDiff<DifflyCommentAnnotation> | null = null
  let workerPool: WorkerPoolManager | null = null
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

  function describeSide(side: string | undefined) {
    return side === 'additions' ? 'right' : 'left'
  }

  function describeRange(range: SelectedLineRange) {
    const startSide = describeSide(range.side)
    const endSide = describeSide(range.endSide ?? range.side)
    const startLine = range.start
    const endLine = range.end

    if (startLine === endLine && startSide === endSide) {
      return `${startSide} line ${startLine}`
    }

    return `${startSide} line ${startLine} to ${endSide} line ${endLine}`
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

    if (range) {
      setInteractionMessage(`Selected ${describeRange(range)}.`)
    }
  }

  function createSvgIcon(paths: string[], options: { fill?: boolean } = {}): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('viewBox', '0 0 16 16')
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('fill', 'none')
    for (const d of paths) {
      const path = document.createElementNS(SVG_NS, 'path')
      path.setAttribute('d', d)
      if (options.fill) {
        path.setAttribute('fill', 'currentColor')
      } else {
        path.setAttribute('fill', 'none')
        path.setAttribute('stroke', 'currentColor')
        path.setAttribute('stroke-width', '1.6')
        path.setAttribute('stroke-linecap', 'round')
        path.setAttribute('stroke-linejoin', 'round')
      }
      svg.appendChild(path)
    }
    return svg
  }

  // Distinct small icons per action.
  const plusIcon = () => createSvgIcon(['M8 3.4v9.2', 'M3.4 8h9.2'])
  const sendIcon = () => createSvgIcon(['M8 13V4', 'M4.6 7.4 8 4l3.4 3.4'])
  const closeIcon = () => createSvgIcon(['M4.5 4.5l7 7', 'M11.5 4.5l-7 7'])

  // Each comment gets one of the bundled character portraits, chosen
  // deterministically from its id so it stays stable across re-renders.
  function createAvatar(seed: string): HTMLImageElement {
    const img = document.createElement('img')
    img.className = 'diffly-comment-avatar'
    img.src = pickAvatar(seed)
    img.alt = ''
    img.setAttribute('aria-hidden', 'true')
    img.draggable = false
    return img
  }

  function openCommentAt(lineNumber: number, side: CommentSide) {
    commentAnnotations = [
      ...commentAnnotations,
      {
        side,
        lineNumber,
        metadata: {
          id: `comment-${commentId += 1}`,
          text: '',
          author: 'You',
          saved: false,
        },
      },
    ]
    setInteractionMessage(`Comment added on line ${lineNumber}.`)
  }

  function removeComment(id: string) {
    commentAnnotations = commentAnnotations.filter((entry) => entry.metadata.id !== id)
    setInteractionMessage('Comment removed.')
  }

  function renderGutterUtility(
    getHoveredRow: () => { lineNumber: number; side: CommentSide } | undefined,
  ): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'diffly-gutter-utility'
    button.setAttribute('aria-label', 'Add a comment')
    button.title = 'Add a comment'
    button.appendChild(plusIcon())
    button.addEventListener('click', () => {
      const row = getHoveredRow()
      if (!row) {
        return
      }
      openCommentAt(row.lineNumber, row.side)
    })
    return button
  }

  function handleTokenClick(token: DiffTokenEventBaseProps) {
    const tokenText = token.tokenText.trim() || 'whitespace'
    setInteractionMessage(`Token "${tokenText}" on ${describeSide(token.side)} line ${token.lineNumber}.`)
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

  function buildSavedCard(annotation: DiffLineAnnotation<DifflyCommentAnnotation>): HTMLElement {
    const card = document.createElement('div')
    card.className = 'diffly-comment-card'

    const body = document.createElement('div')
    body.className = 'diffly-comment-body'
    const author = document.createElement('strong')
    author.className = 'diffly-comment-author'
    author.textContent = annotation.metadata.author
    const text = document.createElement('p')
    text.className = 'diffly-comment-text'
    text.textContent = annotation.metadata.text
    body.append(author, text)

    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'diffly-comment-delete'
    remove.setAttribute('aria-label', 'Delete comment')
    remove.title = 'Delete comment'
    remove.appendChild(closeIcon())
    remove.addEventListener('click', () => removeComment(annotation.metadata.id))

    card.append(createAvatar(annotation.metadata.id), body, remove)
    return card
  }

  function buildComposer(
    annotation: DiffLineAnnotation<DifflyCommentAnnotation>,
    onSaved: () => void,
  ): HTMLElement {
    const form = document.createElement('form')
    form.className = 'diffly-comment-composer'

    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = 'Add a comment...'
    input.value = annotation.metadata.text

    const submit = document.createElement('button')
    submit.type = 'submit'
    submit.className = 'diffly-comment-submit'
    submit.setAttribute('aria-label', 'Save comment')
    submit.title = 'Save comment'
    submit.appendChild(sendIcon())

    input.addEventListener('input', () => {
      annotation.metadata.text = input.value
    })
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        removeComment(annotation.metadata.id)
      }
    })
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      const value = input.value.trim()
      if (!value) {
        removeComment(annotation.metadata.id)
        return
      }
      annotation.metadata.text = value
      annotation.metadata.saved = true
      setInteractionMessage('Comment saved.')
      onSaved()
    })

    form.append(createAvatar(annotation.metadata.id), input, submit)
    window.requestAnimationFrame(() => input.focus())
    return form
  }

  function renderCommentAnnotation(annotation: DiffLineAnnotation<DifflyCommentAnnotation>) {
    const wrapper = document.createElement('div')
    wrapper.className = 'diffly-comment-annotation'

    // Toggle composer <-> saved card in-place so it does not depend on Pierre
    // re-running renderAnnotation (it caches annotation DOM by id).
    const showSaved = () => wrapper.replaceChildren(buildSavedCard(annotation))
    const showComposer = () => wrapper.replaceChildren(buildComposer(annotation, showSaved))

    if (annotation.metadata.saved && annotation.metadata.text) {
      showSaved()
    } else {
      showComposer()
    }

    return wrapper
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
      renderGutterUtility,
      renderAnnotation: renderCommentAnnotation,
      onTokenClick: handleTokenClick,
      enableLineSelection:
        viewerSettings.enableLineSelection ||
        viewerSettings.controlledSelection ||
        viewerSettings.enableGutterUtility,
      controlledSelection: viewerSettings.controlledSelection,
      onLineSelected: handleLineSelected,
      onLineSelectionEnd: handleLineSelected,
      onPostRender: applyCollapsedState,
      unsafeCSS: buildPierreDiffUnsafeCss(appearanceSettings),
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
      totalASTLRUCacheSize: 160,
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

  $: host, text, leftLabel, rightLabel, viewerSettings, appearanceSettings, resolvedThemeMode, viewMode, collapsed, commentAnnotations, void renderDiff()

  onDestroy(() => {
    if (interactionMessageTimer !== null) {
      window.clearTimeout(interactionMessageTimer)
    }
    fileDiff?.cleanUp()
    fileDiff = null
    workerPool?.terminate()
    workerPool = null
    renderedOptions = null
  })
</script>

<div class="pierre-diff-host" bind:this={host}></div>
{#if interactionMessage}
  <div class="pierre-diff-feedback" role="status">{interactionMessage}</div>
{/if}
