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

interface BackgroundPreloadContext {
  centerRelativePath: string
  revision: number
  mode: CompareMode
  leftPath: string
  rightPath: string
  directoryEntries: DirectoryEntryResult[]
  ignoreWhitespace: boolean
  ignoreCase: boolean
  preloadConcurrency: number
  preloadDelayMs: number
}

const BACKGROUND_PRELOAD_RADIUS = 20

export function createDiffCacheController(dependencies: DiffCacheDependencies) {
  const detailDiffCache = new Map<string, Promise<FileDiffResult>>()
  const diffRenderCache = new WeakMap<FileDiffResult, CachedDiffRenderState>()
  let backgroundPreloadTimer: number | null = null
  let backgroundPreloadGeneration = 0

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

  function cancelBackgroundPreload() {
    backgroundPreloadGeneration += 1

    if (backgroundPreloadTimer !== null) {
      window.clearTimeout(backgroundPreloadTimer)
      backgroundPreloadTimer = null
    }
  }

  function buildPrioritizedPreloadPaths(
    directoryEntries: DirectoryEntryResult[],
    centerRelativePath: string,
  ) {
    if (directoryEntries.length === 0) {
      return []
    }

    const centerIndex = directoryEntries.findIndex(
      (entry) => entry.relativePath === centerRelativePath,
    )

    if (centerIndex === -1) {
      return directoryEntries
        .slice(0, BACKGROUND_PRELOAD_RADIUS + 1)
        .map((entry) => entry.relativePath)
    }

    const relativePaths: string[] = []
    const seen = new Set<string>()

    const pushEntry = (entry: DirectoryEntryResult | undefined) => {
      if (!entry || seen.has(entry.relativePath)) {
        return
      }

      seen.add(entry.relativePath)
      relativePaths.push(entry.relativePath)
    }

    pushEntry(directoryEntries[centerIndex])

    for (
      let offset = 1;
      offset < directoryEntries.length &&
      relativePaths.length < BACKGROUND_PRELOAD_RADIUS + 1;
      offset += 1
    ) {
      pushEntry(directoryEntries[centerIndex + offset])
      pushEntry(directoryEntries[centerIndex - offset])
    }

    return relativePaths
  }

  const controller = {
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
        controller.getCachedSideBySideHunks(diff, nextContextLines),
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
        controller.getCachedUnifiedHunks(diff, nextContextLines),
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

    cancelBackgroundPreload,

    startBackgroundPreload(context: BackgroundPreloadContext) {
      cancelBackgroundPreload()

      if (
        context.mode !== 'directory' ||
        !context.leftPath ||
        !context.rightPath ||
        context.directoryEntries.length < 2
      ) {
        return
      }

      const queue = buildPrioritizedPreloadPaths(
        context.directoryEntries,
        context.centerRelativePath,
      )

      if (queue.length <= 1) {
        return
      }

      backgroundPreloadGeneration += 1
      const activeGeneration = backgroundPreloadGeneration

      const startWorkers = () => {
        backgroundPreloadTimer = null

        const workerCount = Math.max(
          1,
          Math.min(context.preloadConcurrency, queue.length),
        )

        const runNext = async () => {
          while (backgroundPreloadGeneration === activeGeneration) {
            const relativePath = queue.shift()

            if (typeof relativePath !== 'string') {
              return
            }

            try {
              await controller.getOrCreateDetailDiffPromise({
                revision: context.revision,
                leftPath: context.leftPath,
                rightPath: context.rightPath,
                relativePath,
                ignoreWhitespace: context.ignoreWhitespace,
                ignoreCase: context.ignoreCase,
              })
            } catch {
              // Leave errors to the on-demand selection flow instead of surfacing them from preload.
            }
          }
        }

        for (let index = 0; index < workerCount; index += 1) {
          void runNext()
        }
      }

      if (typeof window === 'undefined' || context.preloadDelayMs <= 0) {
        startWorkers()
        return
      }

      backgroundPreloadTimer = window.setTimeout(() => {
        if (backgroundPreloadGeneration !== activeGeneration) {
          return
        }

        startWorkers()
      }, context.preloadDelayMs)
    },
  }

  return controller
}
