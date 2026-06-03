import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'
import * as esbuild from 'esbuild'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WORK_ROOT = join(tmpdir(), 'diffly-perf-backend')
const BUNDLE_PATH = join(WORK_ROOT, `backend-${process.pid}.mjs`)
const FIXTURE_ROOT = join(WORK_ROOT, 'fixtures')
const LEFT_ROOT = join(FIXTURE_ROOT, 'left')
const RIGHT_ROOT = join(FIXTURE_ROOT, 'right')
const ITERATIONS = Number.parseInt(process.env.DIFFLY_PERF_ITERATIONS ?? '12', 10)
const WARMUPS = Number.parseInt(process.env.DIFFLY_PERF_WARMUPS ?? '3', 10)
const FILE_COUNT = Number.parseInt(process.env.DIFFLY_PERF_FILE_COUNT ?? '900', 10)

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

function textBlock(label, index, lines = 18) {
  const body = []
  for (let line = 0; line < lines; line += 1) {
    body.push(`${label} file ${index} line ${line} keeps a stable wide payload for directory compare timing and diff classification.`)
  }
  return `${body.join('\n')}\n`
}

function binaryBlock(seed, length = 32768) {
  const buffer = Buffer.alloc(length)
  for (let index = 0; index < length; index += 1) {
    buffer[index] = (seed + index * 31) % 251
  }
  return buffer
}

async function generateFixtures() {
  await rm(FIXTURE_ROOT, { recursive: true, force: true })
  await mkdir(LEFT_ROOT, { recursive: true })
  await mkdir(RIGHT_ROOT, { recursive: true })

  for (let index = 0; index < FILE_COUNT; index += 1) {
    const bucket = index % 10
    const folder = `group-${String(index % 18).padStart(2, '0')}`
    const name = `${folder}/file-${String(index).padStart(5, '0')}`

    if (bucket === 0) {
      await writeText(join(LEFT_ROOT, `${name}.txt`), textBlock('left-only', index))
      continue
    }

    if (bucket === 1) {
      await writeText(join(RIGHT_ROOT, `${name}.txt`), textBlock('right-only', index))
      continue
    }

    if (bucket === 2) {
      const left = binaryBlock(index)
      const right = Buffer.from(left)
      right[0] = (right[0] + 17) % 251
      await mkdir(dirname(join(LEFT_ROOT, `${name}.bin`)), { recursive: true })
      await mkdir(dirname(join(RIGHT_ROOT, `${name}.bin`)), { recursive: true })
      await writeFile(join(LEFT_ROOT, `${name}.bin`), left)
      await writeFile(join(RIGHT_ROOT, `${name}.bin`), right)
      continue
    }

    const base = textBlock('same', index)
    await writeText(join(LEFT_ROOT, `${name}.txt`), base)
    await writeText(
      join(RIGHT_ROOT, `${name}.txt`),
      bucket === 3 ? base.replace('stable wide payload', 'changed wide payload') : base,
    )
  }

  const largeLeft = `${'left large payload '.repeat(32000)}\n`
  const largeRight = `${'right large payload '.repeat(32000)}\n`
  await writeText(join(LEFT_ROOT, 'large-file.txt'), largeLeft)
  await writeText(join(RIGHT_ROOT, 'large-file.txt'), largeRight)
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
  await generateFixtures()

  const backend = await import(`${pathToFileURL(BUNDLE_PATH).href}?v=${Date.now()}`)
  const coldDirectoryResult = await measure('directory cold', ITERATIONS, async () => {
    backend.clearDirectoryCompareCache()
    const response = await backend.comparePaths(LEFT_ROOT, RIGHT_ROOT, 'directory', compareOptions)
    return `${response.entries.length} changed entries`
  })
  const directoryResult = await measure('directory compare', ITERATIONS, async () => {
    const response = await backend.comparePaths(LEFT_ROOT, RIGHT_ROOT, 'directory', compareOptions)
    return `${response.entries.length} changed entries`
  })
  const fileColdResult = await measure('large file cold', ITERATIONS, async () => {
    backend.clearFileDiffCache()
    const response = await backend.comparePaths(
      join(LEFT_ROOT, 'large-file.txt'),
      join(RIGHT_ROOT, 'large-file.txt'),
      'file',
      compareOptions,
    )
    return response.result.contentKind
  })
  backend.clearFileDiffCache()
  const fileCachedResult = await measure('large file cached', ITERATIONS, async () => {
    const response = await backend.comparePaths(
      join(LEFT_ROOT, 'large-file.txt'),
      join(RIGHT_ROOT, 'large-file.txt'),
      'file',
      compareOptions,
    )
    return response.result.contentKind
  })

  console.log(`fixtures: ${FILE_COUNT} generated entries per side, ${ITERATIONS} measured iterations, ${WARMUPS} warmups`)
  printResult(coldDirectoryResult)
  printResult(directoryResult)
  printResult(fileColdResult)
  printResult(fileCachedResult)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
