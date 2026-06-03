import { performance } from 'node:perf_hooks'

const ITERATIONS = Number.parseInt(process.env.DIFFLY_PERF_ITERATIONS ?? '80', 10)
const WARMUPS = Number.parseInt(process.env.DIFFLY_PERF_WARMUPS ?? '20', 10)
const FILE_COUNT = Number.parseInt(process.env.DIFFLY_PERF_FILE_COUNT ?? '50000', 10)
const CHANGE_EVERY = Number.parseInt(process.env.DIFFLY_PERF_CHANGE_EVERY ?? '10', 10)
const PAIR_COUNT = Number.parseInt(process.env.DIFFLY_PERF_PAIR_COUNT ?? '1', 10)

function makeEntry(pairIndex, index) {
  const relativePath = `group-${String(index % 100).padStart(3, '0')}/file-${String(index).padStart(6, '0')}.txt`
  return {
    relativePath,
    status: 'modified',
    leftPath: `left-${pairIndex}/${relativePath}`,
    rightPath: `right-${pairIndex}/${relativePath}`,
    leftSize: 480,
    rightSize: 488,
  }
}

function makeFixtures() {
  const pairs = Array.from({ length: PAIR_COUNT }, (_, index) => ({
    id: `pair-${index}`,
    label: `pair-${index}`,
  }))
  const pairSlots = []
  const pairChangedIndices = []

  for (let pairIndex = 0; pairIndex < PAIR_COUNT; pairIndex += 1) {
    const slots = new Array(FILE_COUNT)
    const changedIndices = []

    for (let index = 0; index < FILE_COUNT; index += CHANGE_EVERY) {
      slots[index] = makeEntry(pairIndex, index)
      changedIndices.push(index)
    }

    pairSlots.push(slots)
    pairChangedIndices.push(changedIndices)
  }

  return { pairs, pairSlots, pairChangedIndices }
}

function prefixedRelativePathFor(pair, relativePath) {
  return `${pair.label}/${relativePath}`
}

function aggregateSparseSlots({ pairs, pairSlots }) {
  const isMulti = pairs.length > 1
  const aggregated = []

  for (const [pairIndex, slots] of pairSlots.entries()) {
    const pair = pairs[pairIndex]
    if (!pair) {
      continue
    }

    for (const entry of slots) {
      if (!entry) {
        continue
      }

      aggregated.push(isMulti
        ? {
            ...entry,
            relativePath: prefixedRelativePathFor(pair, entry.relativePath),
          }
        : entry)
    }
  }

  return aggregated
}

function aggregateChangedIndices({ pairs, pairSlots, pairChangedIndices }) {
  const isMulti = pairs.length > 1
  const aggregated = []

  for (const [pairIndex, changedIndices] of pairChangedIndices.entries()) {
    const slots = pairSlots[pairIndex]
    const pair = pairs[pairIndex]
    if (!slots || !pair) {
      continue
    }

    for (const index of changedIndices) {
      const entry = slots[index]
      if (!entry) {
        continue
      }

      aggregated.push(isMulti
        ? {
            ...entry,
            relativePath: prefixedRelativePathFor(pair, entry.relativePath),
          }
        : entry)
    }
  }

  return aggregated
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

function measure(name, fixtures, fn) {
  for (let index = 0; index < WARMUPS; index += 1) {
    fn(fixtures)
  }

  const samples = []
  let resultCount = 0
  for (let index = 0; index < ITERATIONS; index += 1) {
    const started = performance.now()
    resultCount = fn(fixtures).length
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
  return `${value.toFixed(3)} ms`
}

function printResult(result) {
  console.log([
    result.name.padEnd(26),
    `entries ${result.resultCount}`.padStart(14),
    `min ${formatMs(result.min)}`.padStart(16),
    `median ${formatMs(result.median)}`.padStart(20),
    `p95 ${formatMs(result.p95)}`.padStart(16),
    `max ${formatMs(result.max)}`.padStart(16),
  ].join('  '))
}

const fixtures = makeFixtures()
const sparseResult = measure('sparse slot scan', fixtures, aggregateSparseSlots)
const indexedResult = measure('changed index aggregation', fixtures, aggregateChangedIndices)

console.log(`fixtures: ${PAIR_COUNT} pair(s), ${FILE_COUNT} sparse slots per pair, every ${CHANGE_EVERY}th file changed, ${ITERATIONS} measured iterations, ${WARMUPS} warmups`)
printResult(sparseResult)
printResult(indexedResult)
