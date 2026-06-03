import { performance } from 'node:perf_hooks'

const FILE_COUNT = Number.parseInt(process.env.DIFFLY_PERF_FILE_COUNT ?? '5000', 10)
const UPDATE_COUNT = Number.parseInt(process.env.DIFFLY_PERF_UPDATE_COUNT ?? '200', 10)
const ITERATIONS = Number.parseInt(process.env.DIFFLY_PERF_ITERATIONS ?? '8', 10)
const WARMUPS = Number.parseInt(process.env.DIFFLY_PERF_WARMUPS ?? '2', 10)

function makeEntries() {
  return Array.from({ length: FILE_COUNT }, (_, index) => {
    const relativePath = `group-${String(index % 100).padStart(3, '0')}/file-${String(index).padStart(6, '0')}.txt`
    return {
      relativePath,
      status: 'modified',
      leftPath: `left/${relativePath}`,
      rightPath: `right/${relativePath}`,
      leftSize: 560,
      rightSize: 584,
    }
  })
}

function makeState(index) {
  return {
    diff: {
      contentKind: 'text',
      summary: 'Comparison ready.',
      leftLabel: `file-${index}.txt`,
      rightLabel: `file-${index}.txt`,
      text: {
        leftText: `left ${index}\n`,
        rightText: `right ${index}\n`,
        leftExists: true,
        rightExists: true,
        leftCacheKey: `left:${index}`,
        rightCacheKey: `right:${index}`,
        leftSha256: null,
        rightSha256: null,
        leftLineEnding: 'lf',
        rightLineEnding: 'lf',
        leftHasTrailingNewline: true,
        rightHasTrailingNewline: true,
      },
      unsupported: null,
    },
    error: '',
    generation: 1,
    loading: false,
    revision: 1,
  }
}

function buildLoadedEntryRenderKey(entry, state) {
  const diff = state?.diff
  const text = diff?.text
  return [
    1,
    entry.relativePath,
    entry.status,
    entry.leftPath ?? '',
    entry.rightPath ?? '',
    entry.leftSize ?? '',
    entry.rightSize ?? '',
    state?.loading ? 'loading' : 'idle',
    state?.error ?? '',
    diff?.contentKind ?? '',
    text?.leftCacheKey ?? text?.leftSha256 ?? text?.leftText.length ?? '',
    text?.rightCacheKey ?? text?.rightSha256 ?? text?.rightText.length ?? '',
  ].join('\0')
}

function buildLoadedEntry(entry, state, cached) {
  const renderKey = buildLoadedEntryRenderKey(entry, state)
  if (cached?.renderKey === renderKey) {
    return cached
  }

  if (state?.diff?.contentKind === 'text' && state.diff.text) {
    return {
      entry,
      diff: state.diff,
      error: '',
      loading: state.loading,
      renderKey,
    }
  }

  return {
    entry,
    diff: null,
    error: '',
    loading: state?.loading ?? false,
    renderKey,
  }
}

function rebuildAll(entries, states, loadedEntryCache) {
  const textEntries = []
  const nextLoadedEntryCache = new Map()

  for (const entry of entries) {
    const loadedEntry = buildLoadedEntry(
      entry,
      states.get(entry.relativePath) ?? null,
      loadedEntryCache.get(entry.relativePath),
    )
    nextLoadedEntryCache.set(entry.relativePath, loadedEntry)
    textEntries.push(loadedEntry)
  }

  return { loadedEntryCache: nextLoadedEntryCache, textEntries }
}

function runFullRebuildScenario(entries, updatePaths) {
  let loadedEntryCache = new Map()
  let textEntries = []
  const states = new Map()

  for (const [index, path] of updatePaths.entries()) {
    states.set(path, makeState(index))
    const result = rebuildAll(entries, states, loadedEntryCache)
    loadedEntryCache = result.loadedEntryCache
    textEntries = result.textEntries
  }

  return textEntries.length
}

function runIncrementalScenario(entries, updatePaths) {
  const entryByPath = new Map(entries.map((entry) => [entry.relativePath, entry]))
  const entryIndexByPath = new Map(entries.map((entry, index) => [entry.relativePath, index]))
  const states = new Map()
  let { loadedEntryCache, textEntries } = rebuildAll(entries, states, new Map())

  for (const [index, path] of updatePaths.entries()) {
    const entry = entryByPath.get(path)
    const entryIndex = entryIndexByPath.get(path)
    if (!entry || entryIndex === undefined) {
      continue
    }

    const state = makeState(index)
    states.set(path, state)
    const loadedEntry = buildLoadedEntry(entry, state, loadedEntryCache.get(path))
    loadedEntryCache = new Map(loadedEntryCache)
    loadedEntryCache.set(path, loadedEntry)
    textEntries = [...textEntries]
    textEntries[entryIndex] = loadedEntry
  }

  return textEntries.length
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function percentile(values, percentileValue) {
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1)
  return sorted[index] ?? 0
}

function measure(name, entries, updatePaths, fn) {
  for (let index = 0; index < WARMUPS; index += 1) {
    fn(entries, updatePaths)
  }

  const samples = []
  let resultCount = 0
  for (let index = 0; index < ITERATIONS; index += 1) {
    const started = performance.now()
    resultCount = fn(entries, updatePaths)
    samples.push(performance.now() - started)
  }

  return {
    name,
    resultCount,
    min: Math.min(...samples),
    median: median(samples),
    p95: percentile(samples, 95),
    max: Math.max(...samples),
  }
}

function formatMs(value) {
  return `${value.toFixed(2)} ms`
}

function printResult(result) {
  console.log([
    result.name.padEnd(28),
    `entries ${result.resultCount}`.padStart(16),
    `min ${formatMs(result.min)}`.padStart(14),
    `median ${formatMs(result.median)}`.padStart(18),
    `p95 ${formatMs(result.p95)}`.padStart(14),
    `max ${formatMs(result.max)}`.padStart(14),
  ].join('  '))
}

const entries = makeEntries()
const updatePaths = entries.slice(0, UPDATE_COUNT).map((entry) => entry.relativePath)
const fullRebuildResult = measure('full list rebuild', entries, updatePaths, runFullRebuildScenario)
const incrementalResult = measure('incremental entry patch', entries, updatePaths, runIncrementalScenario)

console.log(`fixtures: ${FILE_COUNT} directory entries, ${UPDATE_COUNT} loaded diff updates, ${ITERATIONS} measured iterations, ${WARMUPS} warmups`)
printResult(fullRebuildResult)
printResult(incrementalResult)
