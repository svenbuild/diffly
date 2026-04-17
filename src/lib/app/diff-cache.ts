import type {
  CompareMode,
  ContextLinesSetting,
  DirectoryEntryResult,
  FileDiffResult,
  SideBySideRow,
  UnifiedLine,
} from '../types'
import type { DiffHunkRange, SideBySideRenderItem, UnifiedRenderItem } from '../ui-types'
import type { MinimapRow } from '../minimap-render'

interface CachedDiffRenderState {
  sideBySideHunks: Map<ContextLinesSetting, DiffHunkRange[]>
  unifiedHunks: Map<ContextLinesSetting, DiffHunkRange[]>
  sideBySideItems: Map<string, SideBySideRenderItem[]>
  unifiedItems: Map<string, UnifiedRenderItem[]>
  sideBySideFullMinimapRows?: MinimapRow[]
  unifiedFullMinimapRows?: MinimapRow[]
  sideBySideItemMinimapRows: Map<string, MinimapRow[]>
  unifiedItemMinimapRows: Map<string, MinimapRow[]>
  maxLineNumber?: number
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
  sideBySideMinimapRows: (rows: SideBySideRow[]) => MinimapRow[]
  unifiedMinimapRows: (rows: UnifiedLine[]) => MinimapRow[]
  sideBySideItemMinimapRows: (items: SideBySideRenderItem[]) => MinimapRow[]
  unifiedItemMinimapRows: (items: UnifiedRenderItem[]) => MinimapRow[]
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
  warmDetailDiff?: (diff: FileDiffResult) => void
}

// Preload radius covers a generous window around the current file so "jump to
// a distant file" is still hot after a short warmup. Preload is generation-
// gated and cheap to re-run, so a wide radius doesn't cost anything when the
// user settles on a spot.
const BACKGROUND_PRELOAD_RADIUS = 200
// Bounded LRU cap. Prevents unbounded accumulation of large FileDiffResult
// payloads (text rows + binary byte arrays) when the user browses many files.
// Chosen >= BACKGROUND_PRELOAD_RADIUS so the full preload window fits, plus a
// small buffer for recently-visited files outside the window.
const DETAIL_DIFF_CACHE_LIMIT = 256

export function createDiffCacheController(dependencies: DiffCacheDependencies) {
  // Using Map preserves insertion order — we promote on access to get LRU.
  const detailDiffCache = new Map<string, Promise<FileDiffResult>>()
  const diffRenderCache = new WeakMap<FileDiffResult, CachedDiffRenderState>()
  let backgroundPreloadTimer: number | null = null
  let backgroundPreloadGeneration = 0
  let activePreloadWorkerCount = 0

  function touchDetailDiffEntry(cacheKey: string, value: Promise<FileDiffResult>) {
    // Delete-then-set moves the entry to the end (most-recent) of the Map.
    detailDiffCache.delete(cacheKey)
    detailDiffCache.set(cacheKey, value)
  }

  function evictOldestDetailDiffEntries() {
    while (detailDiffCache.size > DETAIL_DIFF_CACHE_LIMIT) {
      const oldestKey = detailDiffCache.keys().next().value
      if (oldestKey === undefined) return
      detailDiffCache.delete(oldestKey)
    }
  }

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
      sideBySideItemMinimapRows: new Map(),
      unifiedItemMinimapRows: new Map(),
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

    getCachedSideBySideFullMinimapRows(diff: FileDiffResult) {
      const state = getCachedDiffRenderState(diff)
      if (!state.sideBySideFullMinimapRows) {
        state.sideBySideFullMinimapRows = dependencies.sideBySideMinimapRows(diff.sideBySide)
      }
      return state.sideBySideFullMinimapRows
    },

    getCachedUnifiedFullMinimapRows(diff: FileDiffResult) {
      const state = getCachedDiffRenderState(diff)
      if (!state.unifiedFullMinimapRows) {
        state.unifiedFullMinimapRows = dependencies.unifiedMinimapRows(diff.unified)
      }
      return state.unifiedFullMinimapRows
    },

    getCachedSideBySideItemMinimapRows(
      diff: FileDiffResult,
      includeFullFile: boolean,
      nextContextLines: ContextLinesSetting,
    ) {
      const state = getCachedDiffRenderState(diff)
      const cacheKey = getRenderItemsCacheKey(nextContextLines, includeFullFile)
      const cached = state.sideBySideItemMinimapRows.get(cacheKey)
      if (cached) return cached
      const items = controller.getCachedSideBySideRenderItems(
        diff,
        includeFullFile,
        nextContextLines,
      )
      const rows = dependencies.sideBySideItemMinimapRows(items)
      state.sideBySideItemMinimapRows.set(cacheKey, rows)
      return rows
    },

    getCachedUnifiedItemMinimapRows(
      diff: FileDiffResult,
      includeFullFile: boolean,
      nextContextLines: ContextLinesSetting,
    ) {
      const state = getCachedDiffRenderState(diff)
      const cacheKey = getRenderItemsCacheKey(nextContextLines, includeFullFile)
      const cached = state.unifiedItemMinimapRows.get(cacheKey)
      if (cached) return cached
      const items = controller.getCachedUnifiedRenderItems(
        diff,
        includeFullFile,
        nextContextLines,
      )
      const rows = dependencies.unifiedItemMinimapRows(items)
      state.unifiedItemMinimapRows.set(cacheKey, rows)
      return rows
    },

    getCachedMaxLineNumber(diff: FileDiffResult) {
      const state = getCachedDiffRenderState(diff)
      if (state.maxLineNumber !== undefined) return state.maxLineNumber
      let maxValue = 0
      const rows = diff.sideBySide
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index]
        const leftLineNumber = row.left?.lineNumber ?? 0
        const rightLineNumber = row.right?.lineNumber ?? 0
        if (leftLineNumber > maxValue) maxValue = leftLineNumber
        if (rightLineNumber > maxValue) maxValue = rightLineNumber
      }
      state.maxLineNumber = maxValue
      return maxValue
    },

    getOrCreateDetailDiffPromise(context: DetailCacheContext) {
      if (!context.leftPath || !context.rightPath) {
        throw new Error('No active compare is available.')
      }

      const cacheKey = buildDetailCacheKey(context)
      const existingPromise = detailDiffCache.get(cacheKey)

      if (existingPromise) {
        touchDetailDiffEntry(cacheKey, existingPromise)
        return existingPromise
      }

      const resultPromise = dependencies
        .openCompareItem(context.leftPath, context.rightPath, context.relativePath, {
          ignoreWhitespace: context.ignoreWhitespace,
          ignoreCase: context.ignoreCase,
        })
        .catch((error) => {
          detailDiffCache.delete(cacheKey)
          throw error
        })

      detailDiffCache.set(cacheKey, resultPromise)
      evictOldestDetailDiffEntries()
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

        const desiredWorkers = Math.max(
          1,
          Math.min(context.preloadConcurrency, queue.length),
        )
        // Only spawn as many workers as needed to reach the concurrency cap.
        // Existing workers from a prior preload generation are still awaiting
        // their in-flight IPCs; once they resolve they will exit because the
        // generation changed. Counting them here prevents piling up workers
        // when the user clicks rapidly.
        const workerCount = Math.max(
          0,
          desiredWorkers - activePreloadWorkerCount,
        )

        const runNext = async () => {
          activePreloadWorkerCount += 1
          try {
            while (backgroundPreloadGeneration === activeGeneration) {
              const relativePath = queue.shift()

              if (typeof relativePath !== 'string') {
                return
              }

              try {
                const diff = await controller.getOrCreateDetailDiffPromise({
                  revision: context.revision,
                  leftPath: context.leftPath,
                  rightPath: context.rightPath,
                  relativePath,
                  ignoreWhitespace: context.ignoreWhitespace,
                  ignoreCase: context.ignoreCase,
                })

                // Warm per-diff derived state (hunks, render items) while the
                // main thread is idle, so the next file switch doesn't pay the
                // cost.
                if (
                  backgroundPreloadGeneration === activeGeneration &&
                  context.warmDetailDiff
                ) {
                  context.warmDetailDiff(diff)
                }
              } catch {
                // Leave errors to the on-demand selection flow instead of surfacing them from preload.
              }
            }
          } finally {
            activePreloadWorkerCount -= 1
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
