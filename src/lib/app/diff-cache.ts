import type { CompareMode, DirectoryEntryResult, FileDiffResult } from '../types'

interface DetailCacheContext {
  revision: number
  leftPath: string
  rightPath: string
  relativePath: string
  ignoreWhitespace: boolean
  ignoreCase: boolean
  force?: boolean
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

interface DiffCacheDependencies {
  openCompareItem: (
    leftPath: string,
    rightPath: string,
    relativePath: string,
    options: { ignoreWhitespace: boolean; ignoreCase: boolean },
  ) => Promise<FileDiffResult>
}

const BACKGROUND_PRELOAD_RADIUS = 0
const DETAIL_DIFF_CACHE_LIMIT = 128

export function createDiffCacheController(dependencies: DiffCacheDependencies) {
  const detailDiffCache = new Map<string, Promise<FileDiffResult>>()
  let backgroundPreloadTimer: number | null = null
  let backgroundPreloadGeneration = 0
  let activePreloadWorkerCount = 0

  function touchDetailDiffEntry(cacheKey: string, value: Promise<FileDiffResult>) {
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
    getOrCreateDetailDiffPromise(context: DetailCacheContext) {
      if (!context.leftPath || !context.rightPath) {
        throw new Error('No active compare is available.')
      }

      const cacheKey = buildDetailCacheKey(context)
      const existingPromise = context.force ? null : detailDiffCache.get(cacheKey)

      if (existingPromise) {
        touchDetailDiffEntry(cacheKey, existingPromise)
        return existingPromise
      }

      if (context.force) {
        detailDiffCache.delete(cacheKey)
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

                if (
                  backgroundPreloadGeneration === activeGeneration &&
                  context.warmDetailDiff
                ) {
                  context.warmDetailDiff(diff)
                }
              } catch {
                // Leave errors to the on-demand selection flow.
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
