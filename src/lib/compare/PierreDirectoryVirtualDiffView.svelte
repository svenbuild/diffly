<script lang="ts">
  import { onDestroy, tick } from 'svelte'
  import {
    Virtualizer,
    getFiletypeFromFileName,
    preloadHighlighter,
    type DiffsThemeNames,
    type SupportedLanguages,
  } from '@pierre/diffs'
  import PierreDirectoryVirtualDiffItem from './PierreDirectoryVirtualDiffItem.svelte'
  import type { AppearanceSettings } from '../theme'
  import { resolvePierreDiffTheme } from '../theme/pierre'
  import type {
    CompareViewerSettings,
    DirectoryEntryResult,
    FileDiffResult,
    ViewMode,
  } from '../types'

  interface LoadedDirectoryDiff {
    entry: DirectoryEntryResult
    diff: FileDiffResult | null
    error: string
    loading: boolean
    renderKey?: string
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
  let virtualizer: Virtualizer | null = null
  let virtualizerHost: HTMLElement | null = null
  let visibleRequestFrame: number | null = null
  let pendingVisiblePaths = new Set<string>()
  let highlighterReady = false
  let highlighterPreloadKey = ''
  let highlighterPreloadGeneration = 0

  function setupVirtualizer() {
    if (!host) {
      return
    }

    if (virtualizer && virtualizerHost === host) {
      return
    }

    virtualizer?.cleanUp()
    virtualizer = new Virtualizer({
      overscrollSize: 600,
      intersectionObserverMargin: 1200,
      resizeDebugging: false,
    })
    virtualizer.setup(host)
    virtualizerHost = host
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

  function requestEntryVisible(relativePath: string) {
    if (!relativePath) {
      return
    }

    pendingVisiblePaths.add(relativePath)
    if (visibleRequestFrame !== null) {
      return
    }

    visibleRequestFrame = window.requestAnimationFrame(() => {
      visibleRequestFrame = null
      const paths = Array.from(pendingVisiblePaths)
      pendingVisiblePaths = new Set()
      if (paths.length > 0) {
        requestVisibleEntries(paths)
      }
    })
  }

  async function scrollToSelectedEntry() {
    await tick()

    if (!host || !selectedRelativePath) {
      return
    }

    const target = Array.from(
      host.querySelectorAll<HTMLElement>('[data-diff-file-path]'),
    ).find((element) => element.dataset.diffFilePath === selectedRelativePath)

    target?.scrollIntoView({
      block: 'start',
      behavior: 'instant',
    })
    requestEntryVisible(selectedRelativePath)
  }

  $: host, setupVirtualizer()
  $: entries, viewerSettings, appearanceSettings, scheduleHighlighterPreload()
  $: selectedRelativePath, scrollTargetRevision, void scrollToSelectedEntry()

  onDestroy(() => {
    highlighterPreloadGeneration += 1

    if (visibleRequestFrame !== null) {
      window.cancelAnimationFrame(visibleRequestFrame)
      visibleRequestFrame = null
    }

    virtualizer?.cleanUp()
    virtualizer = null
    virtualizerHost = null
  })
</script>

<div class="directory-virtual-diff-host" bind:this={host}>
  <div class="directory-virtual-diff-content">
    {#each entries as loadedEntry (loadedEntry.entry.relativePath)}
      <PierreDirectoryVirtualDiffItem
        {loadedEntry}
        collapsed={collapsedPaths.has(loadedEntry.entry.relativePath)}
        {virtualizer}
        scrollRoot={host}
        {viewerSettings}
        {appearanceSettings}
        {resolvedThemeMode}
        {viewMode}
        {highlighterReady}
        {toggleEntry}
        {requestEntryVisible}
      />
    {/each}
  </div>
</div>

<style>
  .directory-virtual-diff-host {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    background: var(--editor-bg);
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
  }

  .directory-virtual-diff-host::-webkit-scrollbar {
    width: 9px;
    height: 9px;
  }

  .directory-virtual-diff-host::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
  }

  .directory-virtual-diff-host::-webkit-scrollbar-thumb {
    border: 2px solid var(--scrollbar-thumb-border);
    border-radius: 999px;
    background: var(--scrollbar-thumb);
  }

  .directory-virtual-diff-content {
    min-width: 0;
    padding-bottom: 8px;
  }
</style>
