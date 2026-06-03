import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'
import * as esbuild from 'esbuild'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WORK_ROOT = join(tmpdir(), 'diffly-perf-explorer')
const BUNDLE_PATH = join(WORK_ROOT, `backend-explorer-${process.pid}.mjs`)
const LISTING_ROOT = join(WORK_ROOT, 'listing')
const ITERATIONS = Number.parseInt(process.env.DIFFLY_PERF_ITERATIONS ?? '12', 10)
const WARMUPS = Number.parseInt(process.env.DIFFLY_PERF_WARMUPS ?? '3', 10)
const DIRECTORY_COUNT = Number.parseInt(process.env.DIFFLY_PERF_DIRECTORY_COUNT ?? '1200', 10)
const FILE_COUNT = Number.parseInt(process.env.DIFFLY_PERF_FILE_COUNT ?? '4800', 10)

function electronStubPlugin() {
  return {
    name: 'electron-stub',
    setup(build) {
      build.onResolve({ filter: /^electron$/ }, () => ({
        path: 'electron-stub',
        namespace: 'electron-stub',
      }))
      build.onLoad({ filter: /.*/, namespace: 'electron-stub' }, () => ({
        loader: 'js',
        contents: `
          export const app = {
            getPath: () => ${JSON.stringify(WORK_ROOT)},
            getVersion: () => '0.0.0',
            isPackaged: false
          };
          export const dialog = { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) };
          export const ipcMain = { handle: () => undefined };
        `,
      }))
    },
  }
}

async function bundleBackend() {
  await mkdir(WORK_ROOT, { recursive: true })
  await esbuild.build({
    entryPoints: [join(ROOT, 'src-electron', 'services', 'backend.ts')],
    outfile: BUNDLE_PATH,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    external: ['electron-updater'],
    logLevel: 'silent',
    plugins: [electronStubPlugin()],
  })
}

function mixedName(prefix, index) {
  const bucket = index % 7
  const name = `${prefix}-${String(index).padStart(5, '0')}`
  return bucket === 0
    ? name.toUpperCase()
    : bucket === 1
      ? name.replace(prefix, `${prefix}-Alpha`)
      : name
}

async function generateListingFixture() {
  await rm(LISTING_ROOT, { recursive: true, force: true })
  await mkdir(LISTING_ROOT, { recursive: true })

  for (let index = 0; index < DIRECTORY_COUNT; index += 1) {
    await mkdir(join(LISTING_ROOT, mixedName('folder', index)), { recursive: true })
  }

  const writes = []
  for (let index = 0; index < FILE_COUNT; index += 1) {
    writes.push(writeFile(
      join(LISTING_ROOT, `${mixedName('file', index)}.txt`),
      `explorer listing fixture ${index}\n`,
      'utf8',
    ))
  }
  await Promise.all(writes)
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

async function measure(name, iterations, fn) {
  for (let index = 0; index < WARMUPS; index += 1) {
    await fn()
  }

  const samples = []
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now()
    const result = await fn()
    const elapsed = performance.now() - started
    samples.push(elapsed)
    if (index === 0 && result) {
      console.log(`${name} result: ${result}`)
    }
  }

  return {
    name,
    samples,
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
    result.name.padEnd(24),
    `min ${formatMs(result.min)}`.padStart(14),
    `median ${formatMs(result.median)}`.padStart(18),
    `p95 ${formatMs(result.p95)}`.padStart(14),
    `max ${formatMs(result.max)}`.padStart(14),
  ].join('  '))
}

async function main() {
  await bundleBackend()
  await generateListingFixture()

  const backend = await import(`${pathToFileURL(BUNDLE_PATH).href}?v=${Date.now()}`)
  const coldListingResult = await measure('large folder cold', ITERATIONS, async () => {
    backend.clearDirectoryListingCache()
    const listing = await backend.listDirectory(LISTING_ROOT)
    return `${listing.directories.length} directories, ${listing.files.length} files`
  })
  const cachedListingResult = await measure('large folder cached', ITERATIONS, async () => {
    const listing = await backend.listDirectory(LISTING_ROOT)
    return `${listing.directories.length} directories, ${listing.files.length} files`
  })

  console.log(`fixtures: ${DIRECTORY_COUNT} directories, ${FILE_COUNT} files, ${ITERATIONS} measured iterations, ${WARMUPS} warmups`)
  printResult(coldListingResult)
  printResult(cachedListingResult)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
