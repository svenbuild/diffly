import { performance } from 'node:perf_hooks'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = join(__dirname, '..', 'test-fixtures', 'directories')
const LEFT_ROOT = process.env.DIFFLY_PERF_LEFT ?? join(DEFAULT_ROOT, 'left')
const RIGHT_ROOT = process.env.DIFFLY_PERF_RIGHT ?? join(DEFAULT_ROOT, 'right')
const ITERATIONS = Number.parseInt(process.env.DIFFLY_PERF_ITERATIONS ?? '8', 10)
const WARMUPS = Number.parseInt(process.env.DIFFLY_PERF_WARMUPS ?? '2', 10)
const DETAIL_LOAD_COUNT = Number.parseInt(process.env.DIFFLY_PERF_DETAIL_LOAD_COUNT ?? '64', 10)

async function collectFiles(root) {
  const files = new Map()
  const pending = [root]

  while (pending.length > 0) {
    const current = pending.pop()
    const entries = await readdir(current, { withFileTypes: true })

    for (const entry of entries) {
      const absolutePath = join(current, entry.name)
      if (entry.isDirectory()) {
        pending.push(absolutePath)
      } else if (entry.isFile()) {
        files.set(relative(root, absolutePath).replace(/\\/g, '/'), absolutePath)
      }
    }
  }

  return files
}

async function runDetailLoads(paths, concurrency) {
  let nextIndex = 0
  let bytes = 0

  const runWorker = async () => {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= paths.length) {
        return
      }

      const path = paths[index]
      const leftPath = leftFiles.get(path)
      const rightPath = rightFiles.get(path)
      if (!leftPath || !rightPath) {
        continue
      }

      const [left, right] = await Promise.all([
        readFile(leftPath),
        readFile(rightPath),
      ])
      bytes += left.byteLength + right.byteLength
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, paths.length) }, () => runWorker()),
  )

  return { bytes, oneSided: 0, modified: paths.length, unsupported: 0 }
}

async function measure(name, paths, fn) {
  for (let index = 0; index < WARMUPS; index += 1) {
    await fn(paths)
  }

  const samples = []
  let result = null
  for (let index = 0; index < ITERATIONS; index += 1) {
    const started = performance.now()
    result = await fn(paths)
    samples.push(performance.now() - started)
  }

  samples.sort((left, right) => left - right)
  return {
    max: Math.max(...samples),
    median: samples[Math.floor(samples.length / 2)] ?? 0,
    min: Math.min(...samples),
    name,
    p95: samples[Math.min(samples.length - 1, Math.ceil(samples.length * 0.95) - 1)] ?? 0,
    result,
  }
}

function formatMs(value) {
  return `${value.toFixed(2)} ms`
}

function printResult(result) {
  const counts = result.result
    ? `modified ${result.result.modified}, one-sided ${result.result.oneSided}, unsupported ${result.result.unsupported}`
    : ''
  console.log([
    result.name.padEnd(34),
    counts.padStart(48),
    `min ${formatMs(result.min)}`.padStart(14),
    `median ${formatMs(result.median)}`.padStart(18),
    `p95 ${formatMs(result.p95)}`.padStart(14),
    `max ${formatMs(result.max)}`.padStart(14),
  ].join('  '))
}

const [leftFiles, rightFiles] = await Promise.all([
  collectFiles(LEFT_ROOT),
  collectFiles(RIGHT_ROOT),
])
const paths = Array.from(new Set([...leftFiles.keys(), ...rightFiles.keys()])).sort()
const detailPaths = paths
  .filter((path) => leftFiles.has(path) && rightFiles.has(path))
  .slice(0, Math.min(DETAIL_LOAD_COUNT, paths.length))

const detailConcurrencyOne = await measure('detail loads concurrency 1', detailPaths, (allPaths) =>
  runDetailLoads(allPaths, 1),
)
const detailConcurrencyTwo = await measure('detail loads concurrency 2', detailPaths, (allPaths) =>
  runDetailLoads(allPaths, 2),
)
const detailSpeedup = detailConcurrencyOne.median / Math.max(0.001, detailConcurrencyTwo.median)

console.log(`fixture roots: ${LEFT_ROOT} <-> ${RIGHT_ROOT}`)
console.log(`fixtures: ${paths.length} relative paths, ${ITERATIONS} measured iterations, ${WARMUPS} warmups`)
console.log(`detail fixtures: ${detailPaths.length} paired text loads from visible queue`)
printResult(detailConcurrencyOne)
printResult(detailConcurrencyTwo)
console.log(`median detail-load speedup: ${detailSpeedup.toFixed(1)}x`)
