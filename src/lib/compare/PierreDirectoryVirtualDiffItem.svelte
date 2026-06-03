<script lang="ts">
  import { onDestroy, tick } from 'svelte'
  import {
    DIFFS_TAG_NAME,
    VirtualizedFileDiff,
    areOptionsEqual,
    getFiletypeFromFileName,
    parseDiffFromFile,
    type DiffLineAnnotation,
    type DiffTokenEventBaseProps,
    type FileContents,
    type FileDiffMetadata,
    type FileDiffOptions,
    type LineAnnotation,
    type SelectedLineRange,
    type Virtualizer,
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
    renderKey?: string
  }

  export let loadedEntry: LoadedDirectoryDiff
  export let collapsed = false
  export let virtualizer: Virtualizer | null = null
  export let viewerSettings: CompareViewerSettings
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark'
  export let viewMode: ViewMode
  export let highlighterReady = false
  export let scrollRoot: HTMLElement | null = null
  export let toggleEntry: (relativePath: string) => void = () => {}
  export let requestEntryVisible: (relativePath: string) => void = () => {}

  let container: HTMLElement | null = null
  let observedNode: HTMLElement | null = null
  let intersectionObserver: IntersectionObserver | null = null
  let fileDiff: VirtualizedFileDiff<DifflyCommentAnnotation> | null = null
  let renderedOptions: FileDiffOptions<DifflyCommentAnnotation> | null = null
  let renderedSignature = ''
  let parsedSignature = ''
  let parsedDiff: FileDiffMetadata | null = null
  let renderRevision = 0
  let commentId = 0
  let commentAnnotations: Array<DiffLineAnnotation<DifflyCommentAnnotation>> = []

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

  function describeSide(side: string | undefined) {
    return side === 'additions' ? 'right' : 'left'
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
    })

    form.append(avatar, input, submit)
    wrapper.appendChild(form)

    return wrapper
  }

  function renderCollapseButton() {
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
      toggleEntry(loadedEntry.entry.relativePath)
    })

    return button
  }

  function renderHeaderMetadata() {
    const metadata = document.createElement('span')
    metadata.className = 'diffly-codeview-status-metadata'
    metadata.textContent = statusLabel(loadedEntry.entry.status)
    return metadata
  }

  function handleGutterUtilityClick(range: SelectedLineRange) {
    const side = range.endSide ?? range.side ?? 'additions'
    const lineNumber = range.end
    commentAnnotations = [
      ...commentAnnotations,
      {
        side,
        lineNumber,
        metadata: {
          id: `comment-${commentId += 1}`,
          text: '',
        },
      },
    ]
  }

  function buildOptions(): FileDiffOptions<DifflyCommentAnnotation> {
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
      preferredHighlighter: viewerSettings.preferredHighlighter,
      useCSSClasses: viewerSettings.useCSSClasses,
      useTokenTransformer: viewerSettings.syntaxMode === 'shiki' && highlighterReady,
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
      collapsed,
      renderAnnotation: renderCommentAnnotation,
      renderHeaderPrefix: renderCollapseButton,
      renderHeaderMetadata,
      onGutterUtilityClick: handleGutterUtilityClick,
      onTokenClick: handleTokenClick,
      unsafeCSS: buildPierreDiffUnsafeCss(appearanceSettings),
    }
  }

  function getParsedDiff() {
    const { entry, diff } = loadedEntry
    if (!diff?.text) {
      parsedSignature = ''
      parsedDiff = null
      return null
    }

    const signature = diffSignature(entry, diff.text)
    if (signature !== parsedSignature) {
      parsedSignature = signature
      parsedDiff = parseDiffFromFile(
        buildFile(entry, 'left', diff.text),
        buildFile(entry, 'right', diff.text),
        undefined,
        true,
      )
    }

    return parsedDiff
  }

  function resetDiffInstance() {
    fileDiff?.cleanUp()
    fileDiff = null
    renderedOptions = null
    renderedSignature = ''
  }

  function syncVisibilityObserver() {
    intersectionObserver?.disconnect()
    intersectionObserver = null

    if (!observedNode || !scrollRoot) {
      return
    }

    const path = loadedEntry.entry.relativePath
    intersectionObserver = new IntersectionObserver(
      (records) => {
        if (records.some((record) => record.isIntersecting)) {
          requestEntryVisible(path)
        }
      },
      {
        root: scrollRoot,
        rootMargin: '1200px 0px',
      },
    )
    intersectionObserver.observe(observedNode)
  }

  function visibleAction(node: HTMLElement) {
    observedNode = node
    syncVisibilityObserver()

    return {
      destroy() {
        if (observedNode === node) {
          observedNode = null
        }
        syncVisibilityObserver()
      },
    }
  }

  async function syncDiff() {
    const currentRevision = ++renderRevision
    await tick()

    if (!container || !virtualizer || currentRevision !== renderRevision) {
      return
    }

    const nextParsedDiff = getParsedDiff()
    if (!nextParsedDiff) {
      resetDiffInstance()
      return
    }

    const nextOptions = buildOptions()
    const signature = parsedSignature
    const needsNewInstance = !fileDiff || renderedSignature !== signature

    if (needsNewInstance) {
      resetDiffInstance()
      fileDiff = new VirtualizedFileDiff<DifflyCommentAnnotation>(
        nextOptions,
        virtualizer,
        undefined,
        undefined,
        true,
      )
    } else {
      const forceRender = !renderedOptions || !areOptionsEqual(renderedOptions, nextOptions)
      const instance = fileDiff
      if (!instance) {
        return
      }
      instance.setOptions(nextOptions)
      renderedOptions = nextOptions
      instance.render({
        fileContainer: container,
        fileDiff: nextParsedDiff,
        forceRender,
        lineAnnotations: commentAnnotations,
      })
      return
    }

    renderedOptions = nextOptions
    renderedSignature = signature
    fileDiff.render({
      fileContainer: container,
      fileDiff: nextParsedDiff,
      forceRender: true,
      lineAnnotations: commentAnnotations,
    })
  }

  $: loadedEntry.renderKey,
    collapsed,
    virtualizer,
    viewerSettings,
    appearanceSettings,
    resolvedThemeMode,
    viewMode,
    highlighterReady,
    commentAnnotations,
    void syncDiff()

  $: scrollRoot, loadedEntry.entry.relativePath, syncVisibilityObserver()

  onDestroy(() => {
    renderRevision += 1
    intersectionObserver?.disconnect()
    intersectionObserver = null
    resetDiffInstance()
  })
</script>

{#if loadedEntry.diff?.contentKind === 'text' && loadedEntry.diff.text}
  <svelte:element
    this={DIFFS_TAG_NAME}
    bind:this={container}
    class="diffly-directory-file-diff"
    data-diff-file-path={loadedEntry.entry.relativePath}
    use:visibleAction
  />
{:else}
  <section
    class:collapsed
    class:error={Boolean(loadedEntry.error)}
    class:loading={loadedEntry.loading}
    class="directory-diff-placeholder"
    data-diff-file-path={loadedEntry.entry.relativePath}
    use:visibleAction
  >
    <header>
      <button
        aria-expanded={collapsed ? 'false' : 'true'}
        aria-label={collapsed ? 'Expand file diff' : 'Collapse file diff'}
        class="diffly-codeview-collapse-button"
        data-collapsed={collapsed ? 'true' : 'false'}
        type="button"
        on:click={() => toggleEntry(loadedEntry.entry.relativePath)}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16">
          <path d="M5.75 3.5 10.25 8l-4.5 4.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" />
        </svg>
      </button>
      <strong>{loadedEntry.entry.relativePath}</strong>
      <span>{loadedEntry.error ? 'Error' : loadedEntry.loading ? 'Loading...' : statusLabel(loadedEntry.entry.status)}</span>
    </header>
    {#if !collapsed && (loadedEntry.error || loadedEntry.loading)}
      <p>{loadedEntry.error || 'Loading diff...'}</p>
    {/if}
  </section>
{/if}

<style>
  .diffly-directory-file-diff,
  .directory-diff-placeholder {
    display: block;
    margin: 8px 8px 0;
  }

  .directory-diff-placeholder {
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: color-mix(in srgb, var(--editor-bg) 96%, var(--panel-bg));
    color: var(--text);
  }

  .directory-diff-placeholder header {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 39px;
    padding: 0 10px 0 6px;
    border-bottom: 1px solid transparent;
  }

  .directory-diff-placeholder strong {
    min-width: 0;
    overflow: hidden;
    font-size: 12px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .directory-diff-placeholder span {
    margin-left: auto;
    color: var(--muted);
    font-size: 12px;
    font-weight: 500;
  }

  .directory-diff-placeholder p {
    margin: 0;
    padding: 10px 14px 12px 38px;
    border-top: 1px solid var(--border-subtle);
    color: var(--muted);
    font-size: 12px;
  }

  .directory-diff-placeholder.error p {
    color: var(--danger-text);
    background: color-mix(in srgb, var(--danger-bg) 18%, transparent);
  }

  .directory-diff-placeholder.collapsed p {
    display: none;
  }
</style>
