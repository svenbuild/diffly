<script lang="ts">
  import { onDestroy, tick } from 'svelte'
  import { FileDiff } from '@pierre/diffs'
  import type { FileContents, FileDiffOptions } from '@pierre/diffs'
  import type { AppearanceSettings } from '../theme'
  import {
    buildPierreDiffUnsafeCss,
    resolvePierreDiffTheme,
  } from '../theme/pierre'
  import type { CompareViewerSettings, TextDiffPayload, ViewMode } from '../types'

  export let text: TextDiffPayload
  export let leftLabel: string
  export let rightLabel: string
  export let viewerSettings: CompareViewerSettings
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark'
  export let viewMode: ViewMode

  let host: HTMLDivElement | null = null
  let fileDiff: FileDiff | null = null
  let renderVersion = 0

  function fileName(label: string) {
    return label.split(/[\\/]/).pop() || label || 'file.txt'
  }

  function buildOptions(): FileDiffOptions<undefined> {
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
      useTokenTransformer: viewerSettings.syntaxMode === 'shiki',
      tokenizeMaxLineLength: viewerSettings.tokenizeMaxLineLength,
      tokenizeMaxLength: viewerSettings.tokenizeMaxLength,
      maxLineDiffLength: viewerSettings.maxLineDiffLength,
      lineHoverHighlight: viewerSettings.lineHoverHighlight,
      enableLineSelection: viewerSettings.enableLineSelection,
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

    if (!fileDiff) {
      fileDiff = new FileDiff(nextOptions)
    } else {
      fileDiff.setOptions(nextOptions)
    }

    fileDiff.render({
      oldFile: buildFile(leftLabel, text.leftText, text.leftCacheKey, text.leftSha256),
      newFile: buildFile(rightLabel, text.rightText, text.rightCacheKey, text.rightSha256),
      containerWrapper: host,
      forceRender: true,
    })
  }

  $: host, text, leftLabel, rightLabel, viewerSettings, appearanceSettings, resolvedThemeMode, viewMode, void renderDiff()

  onDestroy(() => {
    fileDiff?.cleanUp()
    fileDiff = null
  })
</script>

<div class="pierre-diff-host" bind:this={host}></div>
