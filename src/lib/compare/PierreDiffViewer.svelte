<script lang="ts">
  import { onDestroy, tick } from 'svelte'
  import { FileDiff } from '@pierre/diffs'
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

  interface DifflyCommentAnnotation {
    id: string
    text: string
  }

  export let text: TextDiffPayload
  export let leftLabel: string
  export let rightLabel: string
  export let viewerSettings: CompareViewerSettings
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark'
  export let viewMode: ViewMode
  export let collapsed = false
  export let renderHeaderPrefix: (() => HTMLElement | null) | null = null

  let host: HTMLDivElement | null = null
  let fileDiff: FileDiff<DifflyCommentAnnotation> | null = null
  let renderVersion = 0
  let selectedLineRange: SelectedLineRange | null = null
  let commentId = 0
  let commentAnnotations: Array<DiffLineAnnotation<DifflyCommentAnnotation>> = []
  let interactionMessage = ''
  let interactionMessageTimer: number | null = null
  let renderedTextKey = ''

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

  function handleGutterUtilityClick(range: SelectedLineRange) {
    applyControlledSelection(range)
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
    setInteractionMessage(`Comment opened for ${describeRange(range)}.`)
  }

  function handleTokenClick(token: DiffTokenEventBaseProps) {
    const tokenText = token.tokenText.trim() || 'whitespace'
    setInteractionMessage(`Token "${tokenText}" on ${describeSide(token.side)} line ${token.lineNumber}.`)
  }

  function applyCollapsedState() {
    const container = host?.querySelector('diffs-container') as HTMLElement | null
    const shadowRoot = container?.shadowRoot ?? null

    if (container) {
      container.toggleAttribute('data-diffly-collapsed', collapsed)
    }

    if (!shadowRoot) {
      return
    }

    for (const element of Array.from(shadowRoot.children)) {
      if (!(element instanceof HTMLElement)) {
        continue
      }

      const isHeader = element.hasAttribute('data-diffs-header')
      const isStyle = element.tagName.toLowerCase() === 'style'
      if (!isHeader && !isStyle) {
        element.hidden = collapsed
      }
    }
  }

  function renderCommentAnnotation(annotation: DiffLineAnnotation<DifflyCommentAnnotation>) {
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
      onTokenClick: handleTokenClick,
      enableLineSelection:
        viewerSettings.enableLineSelection ||
        viewerSettings.controlledSelection ||
        viewerSettings.enableGutterUtility,
      controlledSelection: viewerSettings.controlledSelection,
      onLineSelected: handleLineSelected,
      onLineSelectionEnd: handleLineSelected,
      renderHeaderPrefix: renderHeaderPrefix ?? undefined,
      onPostRender: applyCollapsedState,
      unsafeCSS: buildPierreDiffUnsafeCss(appearanceSettings),
    }
  }

  function buildFile(label: string, contents: string, cacheKey: string | null, sha256: string | null): FileContents {
    return {
      name: fileName(label),
      contents,
      cacheKey: cacheKey ?? sha256 ?? `${label}:${contents.length}`,
    }
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

    const nextOptions = buildOptions()
    const nextTextKey = textKey()
    if (nextTextKey !== renderedTextKey) {
      renderedTextKey = nextTextKey
      selectedLineRange = null
      commentAnnotations = []
      interactionMessage = ''
    }

    if (!fileDiff) {
      fileDiff = new FileDiff<DifflyCommentAnnotation>(nextOptions)
    } else {
      fileDiff.setOptions(nextOptions)
    }

    fileDiff.render({
      oldFile: buildFile(leftLabel, text.leftText, text.leftCacheKey, text.leftSha256),
      newFile: buildFile(rightLabel, text.rightText, text.rightCacheKey, text.rightSha256),
      containerWrapper: host,
      forceRender: true,
      lineAnnotations: commentAnnotations,
    })

    if (viewerSettings.controlledSelection) {
      fileDiff.setSelectedLines(selectedLineRange, { notify: false })
    }

    applyCollapsedState()
  }

  $: host, text, leftLabel, rightLabel, viewerSettings, appearanceSettings, resolvedThemeMode, viewMode, collapsed, renderHeaderPrefix, commentAnnotations, void renderDiff()

  onDestroy(() => {
    if (interactionMessageTimer !== null) {
      window.clearTimeout(interactionMessageTimer)
    }
    fileDiff?.cleanUp()
    fileDiff = null
  })
</script>

<div class="pierre-diff-host" bind:this={host}></div>
{#if interactionMessage}
  <div class="pierre-diff-feedback" role="status">{interactionMessage}</div>
{/if}
