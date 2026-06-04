import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { get } from 'node:http'
import net from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const leftRoot = process.env.DIFFLY_E2E_LEFT ??
  'C:\\Users\\uid216\\AppData\\Local\\Temp\\diffly-perf-b526f6854a5343eb90e4d4a2df9bbc4f\\left'
const rightRoot = process.env.DIFFLY_E2E_RIGHT ??
  'C:\\Users\\uid216\\AppData\\Local\\Temp\\diffly-perf-b526f6854a5343eb90e4d4a2df9bbc4f\\right'
const rendererFile = resolve(repoRoot, 'out', 'renderer', 'index.html')
const mainFile = resolve(repoRoot, 'out', 'main', 'main.cjs')
const port = Number.parseInt(process.env.DIFFLY_E2E_CDP_PORT ?? '9339', 10)

if (!existsSync(leftRoot) || !existsSync(rightRoot)) {
  throw new Error('E2E fixture folders are missing.')
}

if (!existsSync(rendererFile) || !existsSync(mainFile)) {
  throw new Error('Build output is missing. Run npm run build before verify:electron-scroll.')
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

function fetchJson(url) {
  return new Promise((resolveFetch, reject) => {
    const request = get(url, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        body += chunk
      })
      response.on('end', () => {
        try {
          resolveFetch(JSON.parse(body))
        } catch (error) {
          reject(error)
        }
      })
    })
    request.on('error', reject)
    request.setTimeout(1000, () => {
      request.destroy(new Error(`Timed out fetching ${url}`))
    })
  })
}

async function waitForDevToolsTarget() {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try {
      const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`)
      const target = targets.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl)
      if (target) {
        return target
      }
    } catch {
      // Electron may still be starting.
    }
    await sleep(150)
  }
  throw new Error('Unable to find Electron DevTools target.')
}

function encodeFrame(text) {
  const payload = Buffer.from(text)
  const length = payload.length
  const headerLength = length < 126 ? 6 : length <= 0xffff ? 8 : 14
  const frame = Buffer.allocUnsafe(headerLength + length)
  frame[0] = 0x81

  if (length < 126) {
    frame[1] = 0x80 | length
    randomBytes(4).copy(frame, 2)
    const maskOffset = 2
    const payloadOffset = 6
    for (let index = 0; index < length; index += 1) {
      frame[payloadOffset + index] = payload[index] ^ frame[maskOffset + (index % 4)]
    }
    return frame
  }

  if (length <= 0xffff) {
    frame[1] = 0x80 | 126
    frame.writeUInt16BE(length, 2)
    randomBytes(4).copy(frame, 4)
    const maskOffset = 4
    const payloadOffset = 8
    for (let index = 0; index < length; index += 1) {
      frame[payloadOffset + index] = payload[index] ^ frame[maskOffset + (index % 4)]
    }
    return frame
  }

  frame[1] = 0x80 | 127
  frame.writeBigUInt64BE(BigInt(length), 2)
  randomBytes(4).copy(frame, 10)
  const maskOffset = 10
  const payloadOffset = 14
  for (let index = 0; index < length; index += 1) {
    frame[payloadOffset + index] = payload[index] ^ frame[maskOffset + (index % 4)]
  }
  return frame
}

function decodeFrames(buffer) {
  const messages = []
  let offset = 0

  while (buffer.length - offset >= 2) {
    const first = buffer[offset]
    const second = buffer[offset + 1]
    const opcode = first & 0x0f
    let length = second & 0x7f
    let headerLength = 2

    if (length === 126) {
      if (buffer.length - offset < 4) {
        break
      }
      length = buffer.readUInt16BE(offset + 2)
      headerLength = 4
    } else if (length === 127) {
      if (buffer.length - offset < 10) {
        break
      }
      length = Number(buffer.readBigUInt64BE(offset + 2))
      headerLength = 10
    }

    const masked = Boolean(second & 0x80)
    const maskLength = masked ? 4 : 0
    const frameLength = headerLength + maskLength + length
    if (buffer.length - offset < frameLength) {
      break
    }

    const payloadOffset = offset + headerLength + maskLength
    const payload = Buffer.from(buffer.subarray(payloadOffset, payloadOffset + length))
    if (masked) {
      const maskOffset = offset + headerLength
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= buffer[maskOffset + (index % 4)]
      }
    }

    if (opcode === 0x1) {
      messages.push(payload.toString('utf8'))
    }

    offset += frameLength
  }

  return {
    messages,
    rest: buffer.subarray(offset),
  }
}

function connectWebSocket(urlValue) {
  const url = new URL(urlValue)
  const socket = net.createConnection(Number(url.port), url.hostname)
  const key = randomBytes(16).toString('base64')
  const accept = createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64')
  let buffer = Buffer.alloc(0)
  const pendingMessages = []
  const messageWaiters = []

  const nextMessage = () => {
    const message = pendingMessages.shift()
    if (message !== undefined) {
      return Promise.resolve(message)
    }
    return new Promise((resolveMessage) => {
      messageWaiters.push(resolveMessage)
    })
  }

  return new Promise((resolveSocket, reject) => {
    socket.once('connect', () => {
      socket.write([
        `GET ${url.pathname}${url.search} HTTP/1.1`,
        `Host: ${url.host}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        '',
        '',
      ].join('\r\n'))
    })

    socket.once('error', reject)
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])

      if (!socket.handshakeDone) {
        const headerEnd = buffer.indexOf('\r\n\r\n')
        if (headerEnd < 0) {
          return
        }

        const header = buffer.subarray(0, headerEnd).toString('utf8')
        const normalizedHeader = header.toLowerCase()
        if (
          !normalizedHeader.startsWith('http/1.1 101') ||
          !normalizedHeader.includes(accept.toLowerCase())
        ) {
          reject(new Error(`WebSocket handshake failed: ${header.split('\r\n')[0]}`))
          return
        }

        socket.handshakeDone = true
        buffer = buffer.subarray(headerEnd + 4)
        socket.removeAllListeners('error')
        socket.on('error', () => undefined)
        resolveSocket({
          close: () => socket.end(),
          nextMessage,
          send: (message) => socket.write(encodeFrame(message)),
        })
      }

      const decoded = decodeFrames(buffer)
      buffer = decoded.rest
      for (const message of decoded.messages) {
        const waiter = messageWaiters.shift()
        if (waiter) {
          waiter(message)
        } else {
          pendingMessages.push(message)
        }
      }
    })
  })
}

async function createCdpClient(webSocketDebuggerUrl) {
  const ws = await connectWebSocket(webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()

  async function readLoop() {
    while (true) {
      const raw = await ws.nextMessage()
      const message = JSON.parse(raw)
      if (message.id && pending.has(message.id)) {
        const { resolveCommand, rejectCommand } = pending.get(message.id)
        pending.delete(message.id)
        if (message.error) {
          rejectCommand(new Error(message.error.message))
        } else {
          resolveCommand(message.result)
        }
      }
    }
  }

  void readLoop()

  return {
    close: () => ws.close(),
    send(method, params = {}) {
      const commandId = id += 1
      ws.send(JSON.stringify({ id: commandId, method, params }))
      return new Promise((resolveCommand, rejectCommand) => {
        pending.set(commandId, { resolveCommand, rejectCommand })
      })
    },
  }
}

async function evaluate(client, expression, timeoutMs = 30000) {
  const result = await client.send('Runtime.evaluate', {
    awaitPromise: true,
    expression,
    returnByValue: true,
    timeout: timeoutMs,
  })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text)
  }
  return result.result.value
}

async function collectRendererDiagnostics(client) {
  try {
    return await evaluate(client, `(() => {
      const host = document.querySelector('.directory-code-view-host')
      return {
        bodyText: document.body?.innerText?.slice(0, 1200) ?? '',
        hasHarness: Boolean(window.__difflyE2E),
        href: window.location.href,
        host: host
          ? {
              clientHeight: host.clientHeight,
              scrollHeight: host.scrollHeight,
              scrollTop: host.scrollTop,
            }
          : null,
        loadingDiffTextCount: (document.body?.innerText?.match(/Loading diff\\.\\.\\./g) ?? []).length,
        state: window.__difflyE2E?.getState?.() ?? null,
      }
    })()`, 5000)
  } catch (error) {
    return {
      diagnosticsError: error instanceof Error ? error.message : String(error),
    }
  }
}

async function main() {
  const rendererUrl = new URL(pathToFileURL(rendererFile).href)
  rendererUrl.searchParams.set('difflyE2ELeft', leftRoot)
  rendererUrl.searchParams.set('difflyE2ERight', rightRoot)
  const userDataDir = await mkdtemp(join(tmpdir(), 'diffly-e2e-'))

  const child = spawn(electronPath, [
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    `--user-data-dir=${userDataDir}`,
    resolve(repoRoot, 'out', 'main', 'main.cjs'),
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: rendererUrl.href,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const stderr = []
  child.stderr.on('data', (chunk) => {
    stderr.push(chunk.toString())
  })

  let client
  try {
    const target = await waitForDevToolsTarget()
    client = await createCdpClient(target.webSocketDebuggerUrl)
    await client.send('Runtime.enable')

    let result
    try {
      result = await evaluate(client, `(${rendererScrollTest.toString()})()`, 90000)
    } catch (error) {
      const diagnostics = await collectRendererDiagnostics(client)
      console.error(JSON.stringify({ diagnostics }, null, 2))
      throw error
    }
    console.log(JSON.stringify(result, null, 2))

    assert.equal(result.ready, true)
    assert.equal(result.loadingDiffTextCount, 0)
    assert.equal(result.diffReadyTextCount, 0)
    assert.ok(result.visibleEntryPathCount <= 1, `visible entry path count ${result.visibleEntryPathCount}`)
    assert.equal(result.manualScrollStable, true)
    assert.equal(result.selectedPathVisible, true)
    assert.equal(result.selectedPathStable, true)
    assert.ok(
      result.interactionLongTasksOver50Ms <= 3,
      `interaction long tasks ${result.interactionLongTasksOver50Ms}`,
    )
    assert.ok(result.interactionLongTasksMax <= 150, `interaction long task max ${result.interactionLongTasksMax}`)
    assert.ok(result.loadLongTasksMax <= 250, `load long task max ${result.loadLongTasksMax}`)
    assert.ok(result.manualDelta <= 1, `manual delta ${result.manualDelta}`)
    assert.ok(result.selectionDelta <= 1, `selection delta ${result.selectionDelta}`)
  } finally {
    client?.close()
    child.kill()
    await new Promise((resolveExit) => {
      child.once('exit', resolveExit)
      setTimeout(resolveExit, 2000)
    })
    if (stderr.length > 0 && process.env.DIFFLY_E2E_DEBUG) {
      console.error(stderr.join(''))
    }
    await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

function rendererScrollTest() {
  const sleepInPage = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const waitFor = async (predicate, timeoutMs = 30000) => {
    const deadline = performance.now() + timeoutMs
    while (performance.now() < deadline) {
      const value = predicate()
      if (value) {
        return value
      }
      await sleepInPage(100)
    }
    throw new Error('Timed out waiting for condition.')
  }

  return (async () => {
    const longTasks = []
    const observer = 'PerformanceObserver' in window
      ? new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 50) {
              longTasks.push(entry.duration)
            }
          }
        })
      : null
    try {
      observer?.observe({ entryTypes: ['longtask'] })
    } catch {
      // Long task entries may be unavailable in some Electron builds.
    }

    await waitFor(() => window.__difflyE2E)
    await waitFor(() => {
      const state = window.__difflyE2E.getState()
      if (state.errorMessage) {
        throw new Error(state.errorMessage)
      }
      return state.directoryEntries >= 250
    })
    await waitFor(() => !window.__difflyE2E.getState().loading)
    const host = await waitFor(() => document.querySelector('.directory-code-view-host'))
    await sleepInPage(800)
    const loadingDiffTextCount = (document.body?.innerText?.match(/Loading diff\.\.\./g) ?? []).length
    const diffReadyTextCount = (document.body?.innerText?.match(/Diff ready/g) ?? []).length
    if (loadingDiffTextCount > 0) {
      throw new Error(`Found ${loadingDiffTextCount} visible Loading diff placeholders.`)
    }
    if (diffReadyTextCount > 0) {
      throw new Error(`Found ${diffReadyTextCount} visible Diff ready placeholders.`)
    }
    const loadLongTasks = [...longTasks]
    longTasks.length = 0

    const canManualScroll = host.scrollHeight > host.clientHeight + 10
    const manualTarget = canManualScroll
      ? Math.min(
          Math.max(0, Math.floor(host.scrollHeight * 0.55)),
          host.scrollHeight - host.clientHeight,
        )
      : 0
    if (canManualScroll) {
      host.scrollTop = manualTarget
      host.dispatchEvent(new Event('scroll', { bubbles: false }))
    }
    await sleepInPage(1200)
    const manualAfter = host.scrollTop
    const manualDelta = Math.abs(manualAfter - manualTarget)

    const state = window.__difflyE2E.getState()
    const targetPath = 'pkg03/module-0349.ts'
    const selected = await window.__difflyE2E.selectPath(targetPath)
    if (!selected) {
      throw new Error(`Unable to select ${targetPath}`)
    }
    await waitFor(() => {
      const selectedState = window.__difflyE2E.getState()
      const paths = Array.from(document.querySelectorAll('[data-diffly-entry-path]'))
        .map((element) => element.dataset.difflyEntryPath)
        .filter(Boolean)
      return selectedState.selectedRelativePath === targetPath && paths.includes(targetPath)
    })
    const selectionAfter = host.scrollTop
    await sleepInPage(1200)
    const selectionFinal = host.scrollTop
    const selectionDelta = Math.abs(selectionFinal - selectionAfter)
    const visibleEntryPaths = new Set(
      Array.from(document.querySelectorAll('[data-diffly-entry-path]'))
        .map((element) => element.dataset.difflyEntryPath)
        .filter(Boolean),
    )

    observer?.disconnect()
    return {
      directoryEntries: state.directoryEntries,
      diffReadyTextCount,
      interactionLongTasksMax: longTasks.length > 0 ? Math.max(...longTasks) : 0,
      interactionLongTasksOver50Ms: longTasks.length,
      loadLongTasksMax: loadLongTasks.length > 0 ? Math.max(...loadLongTasks) : 0,
      loadLongTasksOver50Ms: loadLongTasks.length,
      loadingDiffTextCount,
      manualAfter,
      manualDelta,
      manualScrollStable: manualDelta <= 1,
      manualTarget,
      ready: true,
      selectedPath: targetPath,
      selectedPathStable: selectionDelta <= 1,
      selectedPathVisible: visibleEntryPaths.has(targetPath),
      selectionAfter,
      selectionDelta,
      selectionFinal,
      visibleEntryPathCount: visibleEntryPaths.size,
    }
  })()
}

await main()
