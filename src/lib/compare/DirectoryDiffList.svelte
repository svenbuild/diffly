<script lang="ts">
  import PierreDirectoryCodeView from './PierreDirectoryCodeView.svelte'
  import UnsupportedCompareView from './UnsupportedCompareView.svelte'
  import { openCompareItem } from '../api'
  import type { AppearanceSettings } from '../theme'
  import type {
    CompareOptions,
    CompareViewerSettings,
    DirectoryEntryResult,
    FileDiffResult,
    ViewMode,
  } from '../types'

  interface EntryDiffState {
    diff: FileDiffResult | null
    error: string
    generation: number
    loading: boolean
    revision: number
  }

  interface LoadedDirectoryDiff {
    entry: DirectoryEntryResult
    diff: FileDiffResult | null
    error: string
    loading: boolean
  }

  interface SecondaryDirectoryDiff {
    entry: DirectoryEntryResult
    state: EntryDiffState
  }

  export let directoryEntries: DirectoryEntryResult[] = []
  export let selectedRelativePath = ''
  export let loading = false
  export let viewerSettings: CompareViewerSettings
  export let appearanceSettings: AppearanceSettings
  export let resolvedThemeMode: 'light' | 'dark'
  export let viewMode: ViewMode
  export let revision = 0
  export let leftPath = ''
  export let rightPath = ''
  export let compareOptions: CompareOptions = {
    ignoreWhitespace: false,
    ignoreCase: false,
  }
  export let resolveEntryBases: (relativePath: string) => {
    leftBase: string
    rightBase: string
    relativePath: string
  } = (relativePath) => ({
    leftBase: leftPath,
    rightBase: rightPath,
    relativePath,
  })

  const DIRECTORY_DIFF_LOAD_ATTEMPTS = 3
  const DIRECTORY_DIFF_LOAD_TIMEOUT_MS = 30000
  const DIRECTORY_DIFF_AUTO_LOAD_CONCURRENCY = 3
  const statusLabel: Record<DirectoryEntryResult['status'], string> = {
    modified: 'Modified',
    leftOnly: 'Left only',
    rightOnly: 'Right only',
    unsupported: 'Unsupported',
  }

  let entriesSignature = ''
  let loadGeneration = 0
  let collapsedPaths = new Set<string>()
  let entryStates = new Map<string, EntryDiffState>()
  let scrollTargetRevision = 0
  let textEntries: LoadedDirectoryDiff[] = []
  let secondaryEntries: SecondaryDirectoryDiff[] = []
  let pendingEntryCount = 0
  let activeAutoLoadCount = 0
  let queuedAutoLoadKeys = new Set<string>()

  function entryKey(entry: DirectoryEntryResult) {
    return entry.relativePath
  }

  function syncEntryCollections() {
    const nextPaths = new Set(directoryEntries.map((entry) => entryKey(entry)))
    const nextCollapsedPaths = new Set<string>()
    const nextStates = new Map<string, EntryDiffState>()

    for (const entry of directoryEntries) {
      const key = entryKey(entry)

      const state = entryStates.get(key)
      if (
        state?.revision === revision &&
        (!state.loading || state.generation === loadGeneration)
      ) {
        nextStates.set(key, state)
      }
    }

    for (const key of collapsedPaths) {
      if (nextPaths.has(key)) {
        nextCollapsedPaths.add(key)
      }
    }

    collapsedPaths = nextCollapsedPaths
    entryStates = nextStates
  }

  function setEntryState(path: string, state: EntryDiffState) {
    const nextStates = new Map(entryStates)
    nextStates.set(path, state)
    entryStates = nextStates
  }

  function getEntryState(path: string) {
    return entryStates.get(path) ?? null
  }

  function isCollapsed(path: string) {
    return collapsedPaths.has(path)
  }

  function autoLoadKey(path: string, generation = loadGeneration, loadRevision = revision) {
    return `${loadRevision}:${generation}:${path}`
  }

  function shouldAutoLoad(entry: DirectoryEntryResult) {
    if (entry.status === 'unsupported' || isCollapsed(entry.relativePath)) {
      return false
    }

    const state = getEntryState(entry.relativePath)
    if (!state || state.revision !== revision) {
      return true
    }

    return !state.loading && !state.diff && !state.error
  }

  function scheduleOpenEntryLoads() {
    if (directoryEntries.length === 0) {
      queuedAutoLoadKeys = new Set()
      activeAutoLoadCount = 0
      return
    }

    while (activeAutoLoadCount < DIRECTORY_DIFF_AUTO_LOAD_CONCURRENCY) {
      const entry = directoryEntries.find((candidate) => {
        const key = autoLoadKey(candidate.relativePath)
        return shouldAutoLoad(candidate) && !queuedAutoLoadKeys.has(key)
      })

      if (!entry) {
        return
      }

      const generation = loadGeneration
      const loadRevision = revision
      const key = autoLoadKey(entry.relativePath, generation, loadRevision)
      const nextQueuedKeys = new Set(queuedAutoLoadKeys)
      nextQueuedKeys.add(key)
      queuedAutoLoadKeys = nextQueuedKeys
      activeAutoLoadCount += 1

      void ensureLoaded(entry, generation, loadRevision).finally(() => {
        const afterLoadQueuedKeys = new Set(queuedAutoLoadKeys)
        afterLoadQueuedKeys.delete(key)
        queuedAutoLoadKeys = afterLoadQueuedKeys
        activeAutoLoadCount = Math.max(0, activeAutoLoadCount - 1)
        scheduleOpenEntryLoads()
      })
    }
  }

  function setCollapsed(path: string, collapsed: boolean) {
    const nextCollapsedPaths = new Set(collapsedPaths)
    if (collapsed) {
      nextCollapsedPaths.add(path)
    } else {
      nextCollapsedPaths.delete(path)
    }
    collapsedPaths = nextCollapsedPaths
  }

  async function loadEntryDiffWithRetry(entry: DirectoryEntryResult) {
    let lastError: unknown = null

    for (let attempt = 0; attempt < DIRECTORY_DIFF_LOAD_ATTEMPTS; attempt += 1) {
      try {
        const bases = resolveEntryBases(entry.relativePath)
        return await withLoadTimeout(
          openCompareItem(
            bases.leftBase,
            bases.rightBase,
            bases.relativePath,
            compareOptions,
          ),
          DIRECTORY_DIFF_LOAD_TIMEOUT_MS,
        )
      } catch (error) {
        lastError = error
      }
    }

    throw lastError
  }

  async function ensureLoaded(
    entry: DirectoryEntryResult,
    generation = loadGeneration,
    loadRevision = revision,
  ) {
    const path = entryKey(entry)
    const state = getEntryState(path)

    if (state?.diff && state.revision === loadRevision) {
      return
    }

    if (state?.loading && state.revision === loadRevision && state.generation === generation) {
      return
    }

    setEntryState(path, {
      diff: state?.revision === loadRevision ? state.diff : null,
      error: '',
      generation,
      loading: true,
      revision: loadRevision,
    })

    try {
      const diff = await loadEntryDiffWithRetry(entry)
      if (revision !== loadRevision || generation !== loadGeneration) {
        return
      }

      setEntryState(path, {
        diff,
        error: '',
        generation,
        loading: false,
        revision: loadRevision,
      })
    } catch (error) {
      if (revision !== loadRevision || generation !== loadGeneration) {
        return
      }

      setEntryState(path, {
        diff: null,
        error: error instanceof Error ? error.message : 'Unable to open this file diff.',
        generation,
        loading: false,
        revision: loadRevision,
      })
    }
  }

  function scrollToEntry(path: string) {
    if (!path) {
      return
    }

    const entry = directoryEntries.find((candidate) => candidate.relativePath === path)
    if (!entry) {
      return
    }

    scrollTargetRevision += 1
    if (!isCollapsed(entry.relativePath)) {
      void ensureLoaded(entry)
    }
  }

  function toggleEntry(entry: DirectoryEntryResult) {
    const nextCollapsed = !isCollapsed(entry.relativePath)
    setCollapsed(entry.relativePath, nextCollapsed)
    if (!nextCollapsed) {
      void ensureLoaded(entry)
    }
  }

  function toggleEntryByPath(path: string) {
    const entry = directoryEntries.find((candidate) => candidate.relativePath === path)
    if (!entry) {
      return
    }

    toggleEntry(entry)
  }

  function rebuildVisibleEntries() {
    const nextTextEntries: LoadedDirectoryDiff[] = []
    const nextSecondaryEntries: SecondaryDirectoryDiff[] = []
    let nextPendingEntryCount = 0

    for (const entry of directoryEntries) {
      const state = getEntryState(entry.relativePath)

      if (entry.status === 'unsupported') {
        nextSecondaryEntries.push({
          entry,
          state: state ?? {
            diff: null,
            error: '',
            generation: loadGeneration,
            loading: false,
            revision,
          },
        })
      } else if (state?.diff?.contentKind === 'text' && state.diff.text) {
        nextTextEntries.push({
          entry,
          diff: state.diff,
          error: '',
          loading: state.loading,
        })
      } else if (state?.error || (state?.diff && state.diff.contentKind !== 'text')) {
        nextSecondaryEntries.push({ entry, state })
      } else {
        nextTextEntries.push({
          entry,
          diff: null,
          error: '',
          loading: state?.loading ?? false,
        })
        if (state?.loading) {
          nextPendingEntryCount += 1
        }
      }
    }

    textEntries = nextTextEntries
    secondaryEntries = nextSecondaryEntries
    pendingEntryCount = nextPendingEntryCount
  }

  function withLoadTimeout<T>(promise: Promise<T>, timeoutMs: number) {
    let timeoutId: number | null = null
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error('Timed out while loading this file diff.'))
      }, timeoutMs)
    })

    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    })
  }

  $: {
    const nextSignature = `${revision}:${directoryEntries.map((entry) => entry.relativePath).join('\u0000')}`
    if (nextSignature !== entriesSignature) {
      entriesSignature = nextSignature
      loadGeneration += 1
      syncEntryCollections()
    }
  }

  $: {
    directoryEntries
    entryStates
    rebuildVisibleEntries()
  }

  $: directoryEntries, collapsedPaths, entryStates, scheduleOpenEntryLoads()
  $: selectedRelativePath, scrollToEntry(selectedRelativePath)
</script>

<section class="directory-diff-list">
  {#if loading && directoryEntries.length === 0}
    <div class="compare-viewer-state">
      <span class="refresh-spinner visible"></span>
      <p>Comparing folders...</p>
    </div>
  {:else if directoryEntries.length === 0}
    <div class="compare-viewer-state">
      <p>No file changes.</p>
    </div>
  {:else}
    {#if textEntries.length > 0}
      <PierreDirectoryCodeView
        entries={textEntries}
        {collapsedPaths}
        {selectedRelativePath}
        {viewerSettings}
        {appearanceSettings}
        {resolvedThemeMode}
        {viewMode}
        {scrollTargetRevision}
        toggleEntry={toggleEntryByPath}
      />
    {:else if pendingEntryCount > 0}
      <div class="compare-viewer-state">
        <span class="refresh-spinner visible"></span>
        <p>Loading diffs...</p>
      </div>
    {/if}

    {#if secondaryEntries.length > 0}
      <div class="directory-diff-secondary-list">
        {#each secondaryEntries as { entry, state } (entry.relativePath)}
          <article class="directory-diff-secondary-row">
            <header>
              <span>{entry.relativePath}</span>
              <strong>{statusLabel[entry.status]}</strong>
            </header>
            {#if state.error}
              <div class="directory-diff-error">{state.error}</div>
            {:else if state.diff}
              <UnsupportedCompareView
                unsupported={state.diff.unsupported ?? null}
                summary={state.diff.summary}
              />
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  {/if}
</section>
