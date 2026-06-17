function normalizedCoreCount(coreCount?: number | null) {
  const fallbackCoreCount = 4
  const cores = Number.isFinite(coreCount) && coreCount ? Math.floor(coreCount) : fallbackCoreCount

  return Math.max(1, cores)
}

function browserCoreCount() {
  return normalizedCoreCount(globalThis.navigator?.hardwareConcurrency)
}

export function resolveDiffWorkerPoolSize(coreCount = browserCoreCount()) {
  const cores = normalizedCoreCount(coreCount)

  return Math.max(2, Math.min(6, Math.floor(cores / 2)))
}

export function resolveDirectoryDiffLoadConcurrency(coreCount = browserCoreCount()) {
  const cores = normalizedCoreCount(coreCount)

  return Math.max(2, Math.min(4, Math.floor(cores / 2)))
}
