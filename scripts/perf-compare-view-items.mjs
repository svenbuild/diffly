import { performance } from 'node:perf_hooks'

const FILE_COUNT = Number.parseInt(process.env.DIFFLY_PERF_FILE_COUNT ?? '5000', 10)
const UPDATE_COUNT = Number.parseInt(process.env.DIFFLY_PERF_UPDATE_COUNT ?? '120', 10)
const ITERATIONS = Number.parseInt(process.env.DIFFLY_PERF_ITERATIONS ?? '8', 10)
const WARMUPS = Number.parseInt(process.env.DIFFLY_PERF_WARMUPS ?? '2', 10)
const MIN_SPEEDUP = Number.parseFloat(process.env.DIFFLY_PERF_MIN_SPEEDUP ?? '4')

function makeDirectoryEntry(index) {
  const relativePath = `group-${String(index % 120).padStart(3, '0')}/file-${String(index).padStart(6, '0')}.txt`
  return {
    relativePath,
    status: 'modified',
    leftPath: `left/${relativePath}`,
    rightPath: `right/${relativePath}`,
    leftSize: 680,
    rightSize: 704,
  }
}

function makeTextDiff(index) {
  const leftText = [
    `left file ${index}`,
    `stable context ${index % 17}`,
    `old value ${index}`,
  ].join('\n')
  const rightText = [
    `right file ${index}`,
    `stable context ${index % 17}`,
    `new value ${index}`,
  ].join('\n')

  return {
    contentKind: 'text',
    summary: 'Comparison ready.',
    leftLabel: `file-${index}.txt`,
    rightLabel: `file-${index}.txt`,
    text: {
      leftText,
      rightText,
      leftExists: true,
      rightExists: true,
      leftCacheKey: `left:${index}`,
      rightCacheKey: `right:${index}`,
      leftSha256: null,
      rightSha256: null,
      leftLineEnding: 'lf',
      rightLineEnding: 'lf',
      leftHasTrailingNewline: false,
      rightHasTrailingNewline: false,
    },
    unsupported: null,
  }
}

function makeLoadedEntries() {
  return Array.from({ length: FILE_COUNT }, (_, index) => ({
    entry: makeDirectoryEntry(index),
    diff: null,
    error: '',
    loading: false,
    renderKey: `initial:${index}`,
  }))
}

function loadedWithDiff(previous, updateNumber) {
  return {
    ...previous,
    diff: makeTextDiff(updateNumber),
    loading: false,
    renderKey: `loaded:${updateNumber}`,
  }
}

function placeholderLineCount(entry) {
  const maxSize = Math.max(entry.leftSize ?? 0, entry.rightSize ?? 0)
  return Math.max(8, Math.min(240, Math.ceil(maxSize / 31)))
}

function itemFor(loadedEntry, itemCache) {
  const { entry, diff, loading } = loadedEntry
  const path = entry.relativePath

  if (!diff?.text) {
    const lineCount = placeholderLineCount(entry)
    const signature = ['placeholder', path, lineCount, loading ? '1' : '0'].join('\0')
    const cached = itemCache.get(path)
    const version = cached?.signature === signature ? cached.version : (cached?.version ?? 0) + 1
    itemCache.set(path, { signature, version })
    return {
      id: path,
      type: 'file',
      version,
      loading,
      cacheKey: signature,
    }
  }

  const signature = [
    path,
    diff.text.leftCacheKey ?? diff.text.leftText.length,
    diff.text.rightCacheKey ?? diff.text.rightText.length,
  ].join('\0')
  const cached = itemCache.get(path)
  const version = cached?.signature === signature ? cached.version : (cached?.version ?? 0) + 1
  itemCache.set(path, { signature, version })
  return {
    id: path,
    type: 'diff',
    version,
    loading,
    cacheKey: signature,
  }
}

function itemKey(item) {
  return `${item.id}:${item.type}:${item.version ?? 0}`
}

function fullBuildWithJoinedKey(entries, itemCache = new Map()) {
  const items = []
  const itemKeyParts = []
  const entryByPath = new Map()
  const placeholderPaths = new Set()
  const loadingPaths = new Set()

  for (const loadedEntry of entries) {
    const path = loadedEntry.entry.relativePath
    entryByPath.set(path, loadedEntry)

    if (!loadedEntry.diff?.text) {
      placeholderPaths.add(path)
    }

    if (loadedEntry.loading) {
      loadingPaths.add(path)
    }

    const item = itemFor(loadedEntry, itemCache)
    items.push(item)
    itemKeyParts.push(itemKey(item))
  }

  return {
    entryByPath,
    itemListKey: itemKeyParts.join('\0'),
    items,
    loadingPaths,
    placeholderPaths,
  }
}

function fullBuildRevisionGated(entries, itemCache = new Map()) {
  const items = []
  const entryByPath = new Map()
  const placeholderPaths = new Set()
  const loadingPaths = new Set()

  for (const loadedEntry of entries) {
    const path = loadedEntry.entry.relativePath
    entryByPath.set(path, loadedEntry)

    if (!loadedEntry.diff?.text) {
      placeholderPaths.add(path)
    }

    if (loadedEntry.loading) {
      loadingPaths.add(path)
    }

    items.push(itemFor(loadedEntry, itemCache))
  }

  return {
    entryByPath,
    items,
    loadingPaths,
    placeholderPaths,
  }
}

function runFullRebuildScenario(updatePaths) {
  let entries = makeLoadedEntries()
  let snapshot = fullBuildWithJoinedKey(entries)
  const itemCache = new Map()

  for (const [updateNumber, path] of updatePaths.entries()) {
    const entryIndex = updateNumber
    entries = [...entries]
    entries[entryIndex] = loadedWithDiff(entries[entryIndex], updateNumber)
    snapshot = fullBuildWithJoinedKey(entries, itemCache)

    if (!snapshot.itemListKey.includes(path)) {
      throw new Error(`Full rebuild lost ${path}`)
    }
  }

  return snapshot.items.length
}

function runRevisionGatedRebuildScenario(updatePaths) {
  let entries = makeLoadedEntries()
  let snapshot = fullBuildRevisionGated(entries)
  const itemCache = new Map()

  for (const [updateNumber] of updatePaths.entries()) {
    const entryIndex = updateNumber
    entries = [...entries]
    entries[entryIndex] = loadedWithDiff(entries[entryIndex], updateNumber)
    snapshot = fullBuildRevisionGated(entries, itemCache)
  }

  if (snapshot.entryByPath.size !== FILE_COUNT) {
    throw new Error('Revision-gated rebuild lost entries')
  }

  return snapshot.items.length
}

function runIncrementalPatchScenario(updatePaths) {
  const entries = makeLoadedEntries()
  const itemCache = new Map()
  const snapshot = fullBuildRevisionGated(entries, itemCache)
  const itemIndexByPath = new Map(snapshot.items.map((item, index) => [item.id, index]))
  const inputIndexByPath = new Map(entries.map((loadedEntry, index) => [loadedEntry.entry.relativePath, index]))
  const itemKeyByPath = new Map(snapshot.items.map((item) => [item.id, itemKey(item)]))

  let items = snapshot.items
  let entryByPath = snapshot.entryByPath
  let placeholderPaths = snapshot.placeholderPaths
  let loadingPaths = snapshot.loadingPaths

  for (const [updateNumber, path] of updatePaths.entries()) {
    const inputIndex = inputIndexByPath.get(path)
    const itemIndex = itemIndexByPath.get(path)

    if (inputIndex === undefined || itemIndex === undefined) {
      throw new Error(`Missing index for ${path}`)
    }

    entries[inputIndex] = loadedWithDiff(entries[inputIndex], updateNumber)
    const item = itemFor(entries[inputIndex], itemCache)
    const nextItemKey = itemKey(item)

    if (nextItemKey !== itemKeyByPath.get(path)) {
      items = [...items]
      entryByPath = new Map(entryByPath)
      placeholderPaths = new Set(placeholderPaths)
      loadingPaths = new Set(loadingPaths)
      items[itemIndex] = item
      entryByPath.set(path, entries[inputIndex])
      placeholderPaths.delete(path)
      loadingPaths.delete(path)
      itemKeyByPath.set(path, nextItemKey)
    }
  }

  if (entryByPath.size !== FILE_COUNT) {
    throw new Error('Incremental patch lost entries')
  }

  return items.length
}

function simulateSetItemsReconcile(previousItems, nextItems) {
  const previousById = new Map(previousItems.map((item) => [item.id, item]))
  const nextIdToItem = new Map()
  let changed = 0

  for (const item of nextItems) {
    if (nextIdToItem.has(item.id)) {
      throw new Error(`Duplicate item ${item.id}`)
    }

    const previous = previousById.get(item.id)
    if (!previous || previous.type !== item.type || itemKey(previous) !== itemKey(item)) {
      changed += 1
    }
    nextIdToItem.set(item.id, item)
  }

  return changed
}

function runBatchedPatchScenario(updatePaths) {
  const entries = makeLoadedEntries()
  const itemCache = new Map()
  const snapshot = fullBuildRevisionGated(entries, itemCache)
  const itemIndexByPath = new Map(snapshot.items.map((item, index) => [item.id, index]))
  const inputIndexByPath = new Map(entries.map((loadedEntry, index) => [loadedEntry.entry.relativePath, index]))
  const itemKeyByPath = new Map(snapshot.items.map((item) => [item.id, itemKey(item)]))

  let items = snapshot.items
  let entryByPath = snapshot.entryByPath
  let placeholderPaths = snapshot.placeholderPaths
  let loadingPaths = snapshot.loadingPaths
  let nextItems = items
  let nextEntryByPath = entryByPath
  let nextPlaceholderPaths = placeholderPaths
  let nextLoadingPaths = loadingPaths
  let copied = false

  const ensureCopies = () => {
    if (copied) {
      return
    }

    nextItems = [...items]
    nextEntryByPath = new Map(entryByPath)
    nextPlaceholderPaths = new Set(placeholderPaths)
    nextLoadingPaths = new Set(loadingPaths)
    copied = true
  }

  for (const [updateNumber, path] of updatePaths.entries()) {
    const inputIndex = inputIndexByPath.get(path)
    const itemIndex = itemIndexByPath.get(path)

    if (inputIndex === undefined || itemIndex === undefined) {
      throw new Error(`Missing index for ${path}`)
    }

    entries[inputIndex] = loadedWithDiff(entries[inputIndex], updateNumber)
    const item = itemFor(entries[inputIndex], itemCache)
    const nextItemKey = itemKey(item)

    if (nextItemKey === itemKeyByPath.get(path)) {
      continue
    }

    ensureCopies()
    nextItems[itemIndex] = item
    nextEntryByPath.set(path, entries[inputIndex])
    nextPlaceholderPaths.delete(path)
    nextLoadingPaths.delete(path)
    itemKeyByPath.set(path, nextItemKey)
  }

  if (copied) {
    const reconciled = simulateSetItemsReconcile(items, nextItems)
    if (reconciled === 0) {
      throw new Error('Batched patch did not reconcile any item changes')
    }
    items = nextItems
    entryByPath = nextEntryByPath
    placeholderPaths = nextPlaceholderPaths
    loadingPaths = nextLoadingPaths
  }

  if (entryByPath.size !== FILE_COUNT) {
    throw new Error('Batched patch lost entries')
  }

  return items.length
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

function measure(name, updatePaths, fn) {
  for (let index = 0; index < WARMUPS; index += 1) {
    fn(updatePaths)
  }

  const samples = []
  let resultCount = 0
  for (let index = 0; index < ITERATIONS; index += 1) {
    const started = performance.now()
    resultCount = fn(updatePaths)
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
    result.name.padEnd(30),
    `items ${result.resultCount}`.padStart(16),
    `min ${formatMs(result.min)}`.padStart(14),
    `median ${formatMs(result.median)}`.padStart(18),
    `p95 ${formatMs(result.p95)}`.padStart(14),
    `max ${formatMs(result.max)}`.padStart(14),
  ].join('  '))
}

const initialEntries = makeLoadedEntries()
const updatePaths = initialEntries
  .slice(0, Math.min(UPDATE_COUNT, initialEntries.length))
  .map((loadedEntry) => loadedEntry.entry.relativePath)
const fullRebuild = measure('legacy joined-key rebuild', updatePaths, runFullRebuildScenario)
const revisionGatedRebuild = measure('revision-gated rebuild', updatePaths, runRevisionGatedRebuildScenario)
const incrementalPatch = measure('per-update CodeView patch', updatePaths, runIncrementalPatchScenario)
const batchedPatch = measure('batched CodeView patch', updatePaths, runBatchedPatchScenario)
const speedup = fullRebuild.median / Math.max(0.001, batchedPatch.median)
const rebuildSpeedup = fullRebuild.median / Math.max(0.001, revisionGatedRebuild.median)
const patchSpeedup = incrementalPatch.median / Math.max(0.001, batchedPatch.median)

console.log(`fixtures: ${FILE_COUNT} directory entries, ${updatePaths.length} loaded diff updates, ${ITERATIONS} measured iterations, ${WARMUPS} warmups`)
printResult(fullRebuild)
printResult(revisionGatedRebuild)
printResult(incrementalPatch)
printResult(batchedPatch)
console.log(`median rebuild speedup: ${rebuildSpeedup.toFixed(1)}x`)
console.log(`median patch batching speedup: ${patchSpeedup.toFixed(1)}x`)
console.log(`median end-to-end speedup: ${speedup.toFixed(1)}x`)

if (speedup < MIN_SPEEDUP) {
  console.error(`Expected at least ${MIN_SPEEDUP.toFixed(1)}x median speedup.`)
  process.exitCode = 1
}
