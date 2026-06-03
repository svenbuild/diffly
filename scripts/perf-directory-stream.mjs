import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'
import * as esbuild from 'esbuild'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WORK_ROOT = join(tmpdir(), 'diffly-perf-directory-stream')
const BUNDLE_PATH = join(WORK_ROOT, `backend-stream-${process.pid}.mjs`)
const FIXTURE_ROOT = join(WORK_ROOT, 'fixtures')
const LEFT_ROOT = join(FIXTURE_ROOT, 'left')
const RIGHT_ROOT = join(FIXTURE_ROOT, 'right')
const ITERATIONS = Number.parseInt(process.env.DIFFLY_PERF_ITERATIONS ?? '8', 10)
const WARMUPS = Number.parseInt(process.env.DIFFLY_PERF_WARMUPS ?? '2', 10)
const FILE_COUNT = Number.parseInt(process.env.DIFFLY_PERF_FILE_COUNT ?? '5000', 10)
const CHANGE_EVERY = Number.parseInt(process.env.DIFFLY_PERF_CHANGE_EVERY ?? '10', 10)

const compareOptions = {
  ignoreWhitespace: false,
  ignoreCase: false,
}

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

async function writeText(path, text) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text, 'utf8')
}

function textBlock(label, index, lines = 10) {
  const body = []
  for (let line = 0; line < lines; line += 1) {
    body.push(`${label} file ${index} line ${line} keeps stable content for stream payload timing.`)
  }
  return `${body.join('\n')}\n`
}

async function generateFixtures() {
  await rm(FIXTURE_ROOT, { recursive: true, force: true })
  await mkdir(LEFT_ROOT, { recursive: true })
  await mkdir(RIGHT_ROOT, { recursive: true })

  for (let index = 0; index < FILE_COUNT; index += 1) {
    const folder = `group-${String(index % 50).padStart(2, '0')}`
    const relativePath = `${folder}/file-${String(index).padStart(6, '0')}.txt`
    const leftText = textBlock('same', index)
    const rightText = index % CHANGE_EVERY === 0
      ? textBlock('changed', index)
      : leftText

    await Promise.all([
      writeText(join(LEFT_ROOT, relativePath), leftText),
      writeText(join(RIGHT_ROOT, relativePath), rightText),
    ])
  }
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

function delay() {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, 0)
  })
}

async function measureStream(backend) {
  const started = performance.now()
  const { jobId } = await backend.startDirectoryCompare(LEFT_ROOT, RIGHT_ROOT, compareOptions)
  let pollCount = 0
  let updateCount = 0
  let changedUpdateCount = 0
  let payloadBytes = 0
  let done = false
  let totalCount = 0
  let completedCount = 0

  while (!done) {
    await delay()
    const response = backend.pollDirectoryCompare(jobId)
    pollCount += 1
    updateCount += response.updates.length
    changedUpdateCount += response.updates.filter((update) => update.entry !== null).length
    payloadBytes += Buffer.byteLength(JSON.stringify(response.updates), 'utf8')
    totalCount = response.totalCount ?? totalCount
    completedCount = response.completedCount
    done = response.done
  }

  return {
    elapsed: performance.now() - started,
    pollCount,
    updateCount,
    changedUpdateCount,
    payloadBytes,
    totalCount,
    completedCount,
  }
}

async function measure(name, backend, iterations) {
  for (let index = 0; index < WARMUPS; index += 1) {
    await measureStream(backend)
  }

  const samples = []
  const payloads = []
  const polls = []
  let firstResult = null

  for (let index = 0; index < iterations; index += 1) {
    const result = await measureStream(backend)
    firstResult ??= result
    samples.push(result.elapsed)
    payloads.push(result.payloadBytes)
    polls.push(result.pollCount)
  }

  return {
    name,
    firstResult,
    samples,
    payloads,
    polls,
    min: Math.min(...samples),
    median: median(samples),
    p95: percentile(samples, 95),
    max: Math.max(...samples),
    medianPayloadBytes: median(payloads),
    medianPolls: median(polls),
  }
}

function formatMs(value) {
  return `${value.toFixed(2)} ms`
}

function formatBytes(value) {
  return `${(value / 1024).toFixed(1)} KiB`
}

function printResult(result) {
  console.log(`${result.name} result: ${JSON.stringify(result.firstResult)}`)
  console.log([
    result.name.padEnd(24),
    `min ${formatMs(result.min)}`.padStart(14),
    `median ${formatMs(result.median)}`.padStart(18),
    `p95 ${formatMs(result.p95)}`.padStart(14),
    `max ${formatMs(result.max)}`.padStart(14),
    `payload ${formatBytes(result.medianPayloadBytes)}`.padStart(20),
    `polls ${result.medianPolls}`.padStart(10),
  ].join('  '))
}

async function main() {
  await bundleBackend()
  await generateFixtures()

  const backend = await import(`${pathToFileURL(BUNDLE_PATH).href}?v=${Date.now()}`)
  const streamResult = await measure('directory stream', backend, ITERATIONS)

  console.log(`fixtures: ${FILE_COUNT} files per side, every ${CHANGE_EVERY}th file changed, ${ITERATIONS} measured iterations, ${WARMUPS} warmups`)
  printResult(streamResult)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
