import type {
  CompareMode,
  ContextLinesSetting,
  DirectoryEntryResult,
  FileDiffResult,
  SideBySideRow,
  UnifiedLine,
} from '../types'
import type { DiffHunkRange, SideBySideRenderItem, UnifiedRenderItem } from '../ui-types'

interface CachedDiffRenderState {
  sideBySideHunks: Map<ContextLinesSetting, DiffHunkRange[]>
  unifiedHunks: Map<ContextLinesSetting, DiffHunkRange[]>
  sideBySideItems: Map<string, SideBySideRenderItem[]>
  unifiedItems: Map<string, UnifiedRenderItem[]>
}

interface DiffCacheDependencies {
  buildSideBySideHunkRanges: (
    rows: SideBySideRow[],
    contextLines: ContextLinesSetting,
  ) => DiffHunkRange[]
  buildUnifiedHunkRanges: (
    rows: UnifiedLine[],
    contextLines: ContextLinesSetting,
  ) => DiffHunkRange[]
  buildSideBySideRenderItems: (
    rows: SideBySideRow[],
    hunks: DiffHunkRange[],
    includeFullFile: boolean,
  ) => SideBySideRenderItem[]
  buildUnifiedRenderItems: (
    rows: UnifiedLine[],
    hunks: DiffHunkRange[],
    includeFullFile: boolean,
  ) => UnifiedRenderItem[]
  openCompareItem: (
    leftPath: string,
    rightPath: string,
    relativePath: string,
    options: { ignoreWhitespace: boolean; ignoreCase: boolean },
  ) => Promise<FileDiffResult>
}

interface DetailCacheContext {
  revision: number
  leftPath: string
  rightPath: string
  relativePath: string
  ignoreWhitespace: boolean
  ignoreCase: boolean
}

interface PrefetchContext {
  centerRelativePath: string
  revision: number
  activeRevision: number
  screen: 'setup' | 'compare' | 'settings'
  mode: CompareMode
  leftPath: string
  rightPath: string
  filteredDirectoryEntries: DirectoryEntryResult[]
  ignoreWhitespace: boolean
  ignoreCase: boolean
  prefetchRadius: number
  prefetchDelayMs: number
}

export function createDiffCacheController(dependencies: DiffCacheDependencies) {
  const detailDiffCache = new Map<string, Promise<FileDiffResult>>()
  const diffRenderCache = new WeakMap<FileDiffResult, CachedDiffRenderState>()
  let detailPrefetchTimer: number | null = null

  function getCachedDiffRenderState(diff: FileDiffResult) {
    const cached = diffRenderCache.get(diff)

    if (cached) {
      return cached
    }

    const state: CachedDiffRenderState = {
      sideBySideHunks: new Map(),
      unifiedHunks: new Map(),
      sideBySideItems: new Map(),
      unifiedItems: new Map(),
    }

    diffRenderCache.set(diff, state)
    return state
  }

  function getRenderItemsCacheKey(
    nextContextLines: ContextLinesSetting,
    includeFullFile: boolean,
  ) {
    return `${nextContextLines}:${includeFullFile ? 'full' : 'hunks'}`
  }

  function buildDetailCacheKey(context: DetailCacheContext) {
    return [
      context.revision,
      context.leftPath,
      context.rightPath,
      context.relativePath,
      context.ignoreWhitespace ? '1' : '0',
      context.ignoreCase ? '1' : '0',
    ].join('\u0000')
  }

  return {
    getCachedSideBySideHunks(diff: FileDiffResult, nextContextLines: ContextLinesSetting) {
      const state = getCachedDiffRenderState(diff)
      const cached = state.sideBySideHunks.get(nextContextLines)

      if (cached) {
        return cached
      }

      const hunks = dependencies.buildSideBySideHunkRanges(diff.sideBySide, nextContextLines)
      state.sideBySideHunks.set(nextContextLines, hunks)
      return hunks
    },

    getCachedUnifiedHunks(diff: FileDiffResult, nextContextLines: ContextLinesSetting) {
      const state = getCachedDiffRenderState(diff)
      const cached = state.unifiedHunks.get(nextContextLines)

      if (cached) {
        return cached
      }

      const hunks = dependencies.buildUnifiedHunkRanges(diff.unified, nextContextLines)
      state.unifiedHunks.set(nextContextLines, hunks)
      return hunks
    },

    getCachedSideBySideRenderItems(
      diff: FileDiffResult,
      includeFullFile: boolean,
      nextContextLines: ContextLinesSetting,
    ) {
      const state = getCachedDiffRenderState(diff)
      const cacheKey = getRenderItemsCacheKey(nextContextLines, includeFullFile)
      const cached = state.sideBySideItems.get(cacheKey)

      if (cached) {
        return cached
      }

      const items = dependencies.buildSideBySideRenderItems(
        diff.sideBySide,
        this.getCachedSideBySideHunks(diff, nextContextLines),
        includeFullFile,
      )

      state.sideBySideItems.set(cacheKey, items)
      return items
    },

    getCachedUnifiedRenderItems(
      diff: FileDiffResult,
      includeFullFile: boolean,
      nextContextLines: ContextLinesSetting,
    ) {
      const state = getCachedDiffRenderState(diff)
      const cacheKey = getRenderItemsCacheKey(nextContextLines, includeFullFile)
      const cached = state.unifiedItems.get(cacheKey)

      if (cached) {
        return cached
      }

      const items = dependencies.buildUnifiedRenderItems(
        diff.unified,
        this.getCachedUnifiedHunks(diff, nextContextLines),
        includeFullFile,
      )

      state.unifiedItems.set(cacheKey, items)
      return items
    },

    getOrCreateDetailDiffPromise(context: DetailCacheContext) {
      if (!context.leftPath || !context.rightPath) {
        throw new Error('No active compare is available.')
      }

      const cacheKey = buildDetailCacheKey(context)
      let resultPromise = detailDiffCache.get(cacheKey)

      if (resultPromise) {
        return resultPromise
      }

      resultPromise = dependencies
        .openCompareItem(context.leftPath, context.rightPath, context.relativePath, {
          ignoreWhitespace: context.ignoreWhitespace,
          ignoreCase: context.ignoreCase,
        })
        .catch((error) => {
          detailDiffCache.delete(cacheKey)
          throw error
        })

      detailDiffCache.set(cacheKey, resultPromise)
      return resultPromise
    },

    clearDetailDiffs() {
      detailDiffCache.clear()
    },

    clearDetailPrefetch() {
      if (detailPrefetchTimer !== null) {
        window.clearTimeout(detailPrefetchTimer)
        detailPrefetchTimer = null
      }
    },

    scheduleAdjacentDiffPrefetch(context: PrefetchContext) {
      this.clearDetailPrefetch()

      if (
        context.screen !== 'compare' ||
        context.mode !== 'directory' ||
        !context.leftPath ||
        !context.rightPath ||
        context.filteredDirectoryEntries.length < 2
      ) {
        return
      }

      const centerIndex = context.filteredDirectoryEntries.findIndex(
        (entry) => entry.relativePath === context.centerRelativePath,
      )

      if (centerIndex === -1) {
        return
      }

      const candidates: DirectoryEntryResult[] = []

      for (let offset = 1; offset <= context.prefetchRadius; offset += 1) {
        const nextEntry = context.filteredDirectoryEntries[centerIndex + offset]
        const previousEntry = context.filteredDirectoryEntries[centerIndex - offset]

        if (nextEntry) {
          candidates.push(nextEntry)
        }

        if (previousEntry) {
          candidates.push(previousEntry)
        }
      }

      if (candidates.length === 0) {
        return
      }

      detailPrefetchTimer = window.setTimeout(() => {
        detailPrefetchTimer = null

        if (
          context.revision !== context.activeRevision ||
          !context.leftPath ||
          !context.rightPath
        ) {
          return
        }

        for (const entry of candidates) {
          void this.getOrCreateDetailDiffPromise({
            revision: context.revision,
            leftPath: context.leftPath,
            rightPath: context.rightPath,
            relativePath: entry.relativePath,
            ignoreWhitespace: context.ignoreWhitespace,
            ignoreCase: context.ignoreCase,
          }).catch(() => undefined)
        }
      }, context.prefetchDelayMs)
    },
  }
}
