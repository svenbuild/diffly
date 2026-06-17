import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const trials = readIntegerArg('--trials', 5)
const timeoutMs = readIntegerArg('--timeout-ms', 15000)
const interTrialDelayMs = readIntegerArg('--inter-trial-delay-ms', 0)
const keepProfiles = process.argv.includes('--keep-profiles')
const reuseProfile = process.argv.includes('--reuse-profile')
const directMain = process.argv.includes('--direct-main')
const useDevtools = process.argv.includes('--devtools')

if (useDevtools && typeof WebSocket === 'undefined') {
  throw new Error('This script requires a Node.js runtime with global WebSocket support.')
}

const keepAlive = setInterval(() => undefined, 1000)

Promise.race([
  main(),
  delay(timeoutMs * trials + 10000).then(() => {
    throw new Error('Overall startup measurement timeout expired.')
  }),
])
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error))
    process.exitCode = 1
  })
  .finally(() => {
    clearInterval(keepAlive)
  })

async function main() {
  const results = []
  const sharedProfileRoot = reuseProfile
    ? join(tmpdir(), `diffly-startup-${process.pid}-shared`)
    : null

  try {
    for (let index = 0; index < trials; index += 1) {
      results.push(await measureTrial(index + 1, sharedProfileRoot))
      if (interTrialDelayMs > 0 && index < trials - 1) {
        await delay(interTrialDelayMs)
      }
    }
  } finally {
    if (sharedProfileRoot && !keepProfiles) {
      await rm(sharedProfileRoot, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  const sortedTotals = results.map((result) => result.processToReadyMs).sort((a, b) => a - b)
  const medianTotal = sortedTotals[Math.floor(sortedTotals.length / 2)] ?? 0
  const bestTotal = sortedTotals[0] ?? 0
  const worstTotal = sortedTotals[sortedTotals.length - 1] ?? 0
  const averageTotal =
    results.reduce((sum, result) => sum + result.processToReadyMs, 0) / Math.max(1, results.length)
  const medianResult =
    results
      .slice()
      .sort((a, b) =>
        Math.abs(a.processToReadyMs - medianTotal) - Math.abs(b.processToReadyMs - medianTotal),
      )[0] ?? null

  console.log(JSON.stringify({
    summary: {
      trials: results.length,
      bestMs: Math.round(bestTotal),
      medianMs: Math.round(medianTotal),
      averageMs: Math.round(averageTotal),
      worstMs: Math.round(worstTotal),
    },
    slowestMainPhases: medianResult
      ? topMainDeltas(medianResult.mainProfileMarks, medianResult.startedWallAt, 8)
      : [],
    slowestRendererPhases: medianResult ? topDeltas(medianResult.profile.marks, 8) : [],
    trials: results.map((result) => ({
      mainPhaseCount: result.mainProfileMarks.length,
      trial: result.trial,
      processToReadyMs: Math.round(result.processToReadyMs),
      rendererReadyMs: Math.round(result.profile.readyAtMs ?? 0),
      readyLabel: result.profile.readyLabel,
      slowestMainPhase: topMainDeltas(result.mainProfileMarks, result.startedWallAt, 1)[0] ?? null,
      slowestRendererPhase: topDeltas(result.profile.marks, 1)[0] ?? null,
    })),
  }, null, 2))
}

async function measureTrial(trial, sharedProfileRoot = null) {
  const port = useDevtools ? await getFreePort() : null
  if (port) {
    debug(`trial ${trial}: using port ${port}`)
  }
  const profileRoot = sharedProfileRoot ?? join(tmpdir(), `diffly-startup-${process.pid}-${trial}`)
  await mkdir(profileRoot, { recursive: true })
  await mkdir(join(profileRoot, 'LocalAppData'), { recursive: true })
  await mkdir(join(profileRoot, 'UserData'), { recursive: true })
  debug(`trial ${trial}: profile ${profileRoot}`)

  const startedAt = performance.now()
  const startedWallAt = Date.now()
  debug(`trial ${trial}: spawning electron`)
  const child = spawn(electronExecutable(), electronArgs(), {
    cwd: rootDir,
    env: removeUndefined({
      ...process.env,
      ELECTRON_RUN_AS_NODE: undefined,
      APPDATA: profileRoot,
      LOCALAPPDATA: join(profileRoot, 'LocalAppData'),
      DIFFLY_USER_DATA_DIR: join(profileRoot, 'UserData'),
      DIFFLY_REMOTE_DEBUGGING_PORT: port ? String(port) : undefined,
      DIFFLY_STARTUP_PROFILE: '1',
      DIFFLY_STARTUP_PROFILE_EXIT: '1',
      ELECTRON_ENABLE_LOGGING: '1',
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  let stdout = ''
  let stderr = ''
  let mainProfileBuffer = ''
  let rendererProfileBuffer = ''
  const mainProfileMarks = []
  let resolveRendererProfile
  const rendererProfile = new Promise((resolveProfile) => {
    resolveRendererProfile = resolveProfile
  })
  const spawnError = new Promise((_, rejectSpawn) => {
    child.once('error', rejectSpawn)
  })
  child.stdout?.on('data', (chunk) => {
    const text = String(chunk)
    stdout += text
    mainProfileBuffer = collectMainProfileText(text, mainProfileBuffer, mainProfileMarks)
    rendererProfileBuffer = collectRendererProfileText(
      text,
      rendererProfileBuffer,
      resolveRendererProfile,
    )
  })
  child.stderr?.on('data', (chunk) => {
    const text = String(chunk)
    stderr += text
    mainProfileBuffer = collectMainProfileText(text, mainProfileBuffer, mainProfileMarks)
    rendererProfileBuffer = collectRendererProfileText(
      text,
      rendererProfileBuffer,
      resolveRendererProfile,
    )
  })

  try {
    const profile = useDevtools
      ? await readStartupProfileFromDevtools(port, spawnError)
      : await Promise.race([
          rendererProfile,
          spawnError,
          delay(timeoutMs).then(() => {
            throw new Error(`Timed out after ${timeoutMs}ms waiting for setup readiness.`)
          }),
        ])
    const processToReadyMs = profile.wallReadyAtMs
      ? profile.wallReadyAtMs - startedWallAt
      : performance.now() - startedAt

    await waitForExit(child, 5000).catch(() => {
      child.kill()
      return waitForExit(child, 3000).catch(() => undefined)
    })
    collectMainProfileText('\n', mainProfileBuffer, mainProfileMarks)

    return {
      mainProfileMarks,
      profile,
      processToReadyMs,
      startedWallAt,
      trial,
    }
  } catch (error) {
    child.kill()
    throw new Error([
      `Startup measurement trial ${trial} failed: ${error instanceof Error ? error.message : String(error)}`,
      stdout.trim() ? `stdout:\n${stdout.trim()}` : '',
      stderr.trim() ? `stderr:\n${stderr.trim()}` : '',
    ].filter(Boolean).join('\n'))
  } finally {
    if (!keepProfiles && !sharedProfileRoot) {
      await rm(profileRoot, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}

async function readStartupProfileFromDevtools(port, spawnError) {
  debug('waiting for page target')
  const target = await Promise.race([
    waitForPageTarget(port, timeoutMs),
    spawnError,
  ])
  debug('connecting devtools')
  const client = await connectDevtools(target.webSocketDebuggerUrl)

  try {
    await client.send('Runtime.enable', {}, 10000)
    debug('waiting for startup profile')
    return await waitForStartupProfile(client, timeoutMs)
  } finally {
    await closeBrowser(client).catch(() => undefined)
    client.close()
  }
}

async function waitForStartupProfile(client, timeout) {
  const deadline = performance.now() + timeout

  while (performance.now() < deadline) {
    const result = await client.send('Runtime.evaluate', {
      expression: 'window.__difflyStartupProfile ?? null',
      returnByValue: true,
    })
    const profile = result.result?.value
    if (profile?.ready) {
      return profile
    }
    await delay(50)
  }

  throw new Error(`Timed out after ${timeout}ms waiting for setup readiness.`)
}

async function waitForPageTarget(port, timeout) {
  const deadline = performance.now() + timeout

  while (performance.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
        signal: AbortSignal.timeout(500),
      })
      const targets = await response.json()
      const page = targets.find((target) =>
        target.type === 'page' &&
        typeof target.webSocketDebuggerUrl === 'string' &&
        (target.url.includes('index.html') || target.title.includes('Diffly')),
      )
      if (page) {
        return page
      }
    } catch {
      // Electron may not have opened the debugging endpoint yet.
    }
    await delay(50)
  }

  throw new Error(`Timed out after ${timeout}ms waiting for the Electron page target.`)
}

function connectDevtools(url) {
  const socket = new WebSocket(url)
  let nextId = 1
  const pending = new Map()

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (!message.id) {
      return
    }

    const request = pending.get(message.id)
    if (!request) {
      return
    }

    pending.delete(message.id)
    if (message.error) {
      request.reject(new Error(message.error.message))
    } else {
      request.resolve(message.result ?? {})
    }
  })

  return new Promise((resolveConnection, rejectConnection) => {
    socket.addEventListener('open', () => {
      resolveConnection({
        close: () => socket.close(),
        send: (method, params = {}, timeout = 2000) => {
          if (socket.readyState !== WebSocket.OPEN) {
            return Promise.reject(new Error('DevTools socket is closed.'))
          }

          const id = nextId
          nextId += 1
          const payload = JSON.stringify({ id, method, params })
          socket.send(payload)

          return new Promise((resolveRequest, rejectRequest) => {
            const timer = setTimeout(() => {
              pending.delete(id)
              rejectRequest(new Error(`DevTools request timed out: ${method}`))
            }, timeout)
            pending.set(id, {
              resolve: (value) => {
                clearTimeout(timer)
                resolveRequest(value)
              },
              reject: (error) => {
                clearTimeout(timer)
                rejectRequest(error)
              },
            })
          })
        },
      })
    }, { once: true })

    socket.addEventListener('error', () => {
      rejectConnection(new Error('Could not connect to DevTools socket.'))
    }, { once: true })
  })
}

async function closeBrowser(client) {
  await client.send('Browser.close')
}

function electronExecutable() {
  const executable = process.platform === 'win32'
    ? join(rootDir, 'node_modules', 'electron', 'dist', 'electron.exe')
    : join(rootDir, 'node_modules', 'electron', 'dist', 'electron')
  return executable
}

function electronArgs() {
  return directMain ? [join(rootDir, 'out', 'main', 'main.cjs')] : ['.']
}

function topDeltas(marks, count) {
  return marks
    .slice()
    .sort((a, b) => b.deltaMs - a.deltaMs)
    .slice(0, count)
    .map((mark) => ({
      name: mark.name,
      deltaMs: Math.round(mark.deltaMs),
      elapsedMs: Math.round(mark.elapsedMs),
      detail: mark.detail,
    }))
}

function topMainDeltas(marks, startedWallAt, count) {
  let previousWallMs = startedWallAt

  return marks
    .map((mark) => {
      const deltaMs = mark.wallMs - previousWallMs
      previousWallMs = mark.wallMs
      return {
        ...mark,
        deltaMs,
      }
    })
    .sort((a, b) => b.deltaMs - a.deltaMs)
    .slice(0, count)
    .map((mark) => ({
      name: mark.name,
      deltaMs: Math.round(mark.deltaMs),
      elapsedMs: Math.round(mark.elapsedMs),
      detail: mark.detail,
    }))
}

function collectMainProfileText(text, previousBuffer, marks) {
  const content = previousBuffer + text
  const lines = content.split(/\r?\n/)
  const nextBuffer = lines.pop() ?? ''

  for (const line of lines) {
    const marker = '[diffly-startup-main] '
    const index = line.indexOf(marker)
    if (index === -1) {
      continue
    }

    try {
      marks.push(JSON.parse(line.slice(index + marker.length)))
    } catch {
      // Ignore malformed logging lines; profiling is best-effort.
    }
  }

  return nextBuffer
}

function collectRendererProfileText(text, previousBuffer, onProfile) {
  const content = previousBuffer + text
  const lines = content.split(/\r?\n/)
  const nextBuffer = lines.pop() ?? ''

  for (const line of lines) {
    const marker = '[diffly-startup-renderer] '
    const index = line.indexOf(marker)
    if (index === -1) {
      continue
    }

    const payload = line.slice(index + marker.length)
    const start = payload.indexOf('{')
    const end = payload.lastIndexOf('}')

    if (start === -1 || end === -1 || end <= start) {
      continue
    }

    try {
      onProfile(JSON.parse(payload.slice(start, end + 1)))
    } catch {
      // Ignore malformed logging lines; profiling is best-effort.
    }
  }

  return nextBuffer
}

function readIntegerArg(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index === -1) {
    return fallback
  }

  const value = Number(process.argv[index + 1])
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback
}

function getFreePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close()
        rejectPort(new Error('Could not allocate a local port.'))
        return
      }
      const port = address.port
      server.close()
      resolvePort(port)
    })
    server.on('error', rejectPort)
  })
}

function waitForExit(child, timeout) {
  return new Promise((resolveExit, rejectExit) => {
    const timer = setTimeout(() => {
      rejectExit(new Error('Timed out waiting for Electron to exit.'))
    }, timeout)

    child.once('exit', () => {
      clearTimeout(timer)
      resolveExit()
    })
  })
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
}

function removeUndefined(value) {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined),
  )
}

function debug(message) {
  if (process.env.DIFFLY_MEASURE_DEBUG === '1') {
    console.error(`[measure-startup] ${message}`)
  }
}
