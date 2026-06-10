import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

// One long-lived `git cat-file --batch` process per repository root. Requests
// are written as `<oid>\n` and answered strictly in FIFO order, which removes
// the per-file `git show` spawn cost when loading git diff entries.

const IDLE_TIMEOUT_MS = 30_000
const MAX_HEADER_BYTES = 4096
const MAX_OBJECT_BYTES = 64 * 1024 * 1024
const BLOB_CACHE_MAX_ENTRIES = 256
const BLOB_CACHE_MAX_BYTES = 64 * 1024 * 1024
const BLOB_CACHE_MAX_ENTRY_BYTES = 8 * 1024 * 1024

const FULL_OID_PATTERN = /^[0-9a-f]{40}$/
const ZERO_OID = '0'.repeat(40)
const LINE_FEED = 0x0a

export type GitObjectResult =
  | { kind: 'object'; type: string; bytes: Uint8Array }
  | { kind: 'missing' }

// True only for full, non-zero object ids that are safe to send to cat-file.
// All-zero oids mean "not in the object store" (e.g. working tree side).
export function isUsableGitOid(oid: string | null | undefined): oid is string {
  return typeof oid === 'string' && FULL_OID_PATTERN.test(oid) && oid !== ZERO_OID
}

export interface BatchChildLike {
  stdin: {
    write(data: string): void
  }
  stdout: {
    on(event: 'data', listener: (chunk: Buffer) => void): void
  }
  on(event: 'error', listener: (error: Error) => void): void
  on(event: 'close', listener: () => void): void
  kill(): void
}

interface PendingRequest {
  oid: string
  resolve(result: GitObjectResult): void
  reject(error: Error): void
}

interface PartialObject {
  type: string
  size: number
}

// Wraps one cat-file --batch child. Parses the response stream incrementally:
// chunk boundaries never align with response boundaries, so headers and bodies
// are consumed from an accumulated buffer. Exported for unit tests via a fake
// child factory.
export class GitObjectBatchProcess {
  private readonly pending: PendingRequest[] = []
  private buffered: Buffer = Buffer.alloc(0)
  private partial: PartialObject | null = null
  private child: BatchChildLike | null = null
  private destroyed = false
  private readonly spawnChild: () => BatchChildLike

  constructor(spawnChild: () => BatchChildLike) {
    this.spawnChild = spawnChild
  }

  get pendingCount() {
    return this.pending.length
  }

  get isDestroyed() {
    return this.destroyed
  }

  request(oid: string): Promise<GitObjectResult> {
    if (this.destroyed) {
      return Promise.reject(new Error('Git object batch process is no longer available.'))
    }
    if (!isUsableGitOid(oid)) {
      return Promise.reject(new Error('Refusing to request an invalid git object id.'))
    }

    return new Promise<GitObjectResult>((resolveRequest, rejectRequest) => {
      try {
        const child = this.ensureChild()
        this.pending.push({ oid, resolve: resolveRequest, reject: rejectRequest })
        child.stdin.write(`${oid}\n`)
      } catch (error) {
        rejectRequest(error instanceof Error ? error : new Error(String(error)))
        this.fail(new Error('Failed to write to git cat-file process.'))
      }
    })
  }

  destroy(reason = 'Git object batch process was disposed.') {
    this.fail(new Error(reason))
  }

  private ensureChild(): BatchChildLike {
    if (this.child) {
      return this.child
    }

    const child = this.spawnChild()
    this.child = child

    child.stdout.on('data', (chunk: Buffer) => {
      if (this.destroyed || this.child !== child) {
        return
      }
      this.buffered = this.buffered.byteLength === 0
        ? chunk
        : Buffer.concat([this.buffered, chunk])
      this.drainBuffer()
    })

    child.on('error', (error: Error) => {
      if (this.child === child) {
        this.fail(new Error(`Git cat-file process failed: ${error.message}`))
      }
    })

    child.on('close', () => {
      if (this.child === child) {
        this.fail(new Error('Git cat-file process exited unexpectedly.'))
      }
    })

    return child
  }

  private drainBuffer() {
    while (true) {
      if (this.partial === null) {
        if (!this.consumeHeader()) {
          return
        }
        if (this.destroyed) {
          return
        }
        continue
      }

      const needed = this.partial.size + 1
      if (this.buffered.byteLength < needed) {
        return
      }

      const body = this.buffered.subarray(0, this.partial.size)
      if (this.buffered[this.partial.size] !== LINE_FEED) {
        this.fail(new Error('Git cat-file response body was not terminated by a newline.'))
        return
      }

      const request = this.pending.shift()
      if (!request) {
        this.fail(new Error('Git cat-file produced output without a pending request.'))
        return
      }

      const type = this.partial.type
      this.partial = null
      // Copy: subarray would pin the whole accumulated buffer in memory.
      const bytes = Uint8Array.prototype.slice.call(body, 0)
      this.consume(needed)
      request.resolve({ kind: 'object', type, bytes })
    }
  }

  // Returns false when more data is required to finish the header line.
  private consumeHeader(): boolean {
    const newlineIndex = this.buffered.indexOf(LINE_FEED)
    if (newlineIndex < 0) {
      if (this.buffered.byteLength > MAX_HEADER_BYTES) {
        this.fail(new Error('Git cat-file header exceeded the size limit.'))
      }
      return false
    }

    const header = this.buffered.subarray(0, newlineIndex).toString('utf8')
    this.consume(newlineIndex + 1)

    const request = this.pending[0]
    if (!request) {
      this.fail(new Error('Git cat-file produced output without a pending request.'))
      return false
    }

    const parts = header.split(' ')
    if (parts.length === 2 && (parts[1] === 'missing' || parts[1] === 'ambiguous')) {
      this.pending.shift()
      request.resolve({ kind: 'missing' })
      return true
    }

    if (parts.length !== 3) {
      this.fail(new Error(`Git cat-file returned a malformed header: ${header}`))
      return false
    }

    const size = Number.parseInt(parts[2], 10)
    if (!Number.isSafeInteger(size) || size < 0 || String(size) !== parts[2]) {
      this.fail(new Error(`Git cat-file returned an invalid object size: ${header}`))
      return false
    }

    if (size > MAX_OBJECT_BYTES) {
      this.fail(new Error('Git object exceeds the supported size limit.'))
      return false
    }

    this.partial = { type: parts[1], size }
    return true
  }

  private consume(byteLength: number) {
    const remaining = this.buffered.byteLength - byteLength
    if (remaining <= 0) {
      this.buffered = Buffer.alloc(0)
      return
    }
    // Copy the leftover so consumed chunks can be garbage collected.
    this.buffered = Buffer.from(this.buffered.subarray(byteLength))
  }

  private fail(error: Error) {
    if (this.destroyed) {
      return
    }
    this.destroyed = true

    const child = this.child
    this.child = null
    this.partial = null
    this.buffered = Buffer.alloc(0)

    const rejected = this.pending.splice(0, this.pending.length)
    for (const request of rejected) {
      request.reject(error)
    }

    if (child) {
      try {
        child.kill()
      } catch {
        // The process may already be gone; nothing else to clean up.
      }
    }
  }
}

interface CachedBlob {
  type: string
  bytes: Uint8Array
}

class GitObjectStore {
  private process: GitObjectBatchProcess | null = null
  private idleTimer: NodeJS.Timeout | null = null
  private readonly blobCache = new Map<string, CachedBlob>()
  private blobCacheBytes = 0
  private readonly repositoryRoot: string

  constructor(repositoryRoot: string) {
    this.repositoryRoot = repositoryRoot
  }

  async readObject(oid: string): Promise<GitObjectResult> {
    if (!isUsableGitOid(oid)) {
      throw new Error('Git object id is not usable.')
    }

    const cached = this.blobCache.get(oid)
    if (cached) {
      // Refresh LRU position.
      this.blobCache.delete(oid)
      this.blobCache.set(oid, cached)
      this.resetIdleTimer()
      return { kind: 'object', type: cached.type, bytes: cached.bytes }
    }

    let result: GitObjectResult
    try {
      result = await this.activeProcess().request(oid)
    } catch {
      // Restart the batch process once; persistent failures propagate so the
      // caller can fall back to the spawn-per-file `git show` path.
      this.dropProcess()
      result = await this.activeProcess().request(oid)
    }

    this.resetIdleTimer()
    if (result.kind === 'object') {
      this.cacheBlob(oid, result)
    }
    return result
  }

  dispose() {
    this.dropProcess()
    this.clearIdleTimer()
    this.blobCache.clear()
    this.blobCacheBytes = 0
  }

  private activeProcess(): GitObjectBatchProcess {
    if (this.process && !this.process.isDestroyed) {
      return this.process
    }

    const repositoryRoot = this.repositoryRoot
    this.process = new GitObjectBatchProcess(() => {
      const child = spawn('git', ['cat-file', '--batch'], {
        cwd: repositoryRoot,
        shell: false,
        windowsHide: true,
      })
      child.stdin.on('error', () => {
        // Write errors surface through the request path; swallowing here only
        // prevents an unhandled 'error' event from crashing the process.
      })
      return child as unknown as BatchChildLike
    })
    return this.process
  }

  private dropProcess() {
    this.process?.destroy()
    this.process = null
  }

  private cacheBlob(oid: string, result: Extract<GitObjectResult, { kind: 'object' }>) {
    if (result.bytes.byteLength > BLOB_CACHE_MAX_ENTRY_BYTES) {
      return
    }

    const previous = this.blobCache.get(oid)
    if (previous) {
      this.blobCacheBytes -= previous.bytes.byteLength
      this.blobCache.delete(oid)
    }

    this.blobCache.set(oid, { type: result.type, bytes: result.bytes })
    this.blobCacheBytes += result.bytes.byteLength

    while (
      this.blobCache.size > BLOB_CACHE_MAX_ENTRIES ||
      this.blobCacheBytes > BLOB_CACHE_MAX_BYTES
    ) {
      const oldestKey = this.blobCache.keys().next().value
      if (oldestKey === undefined) {
        return
      }
      const oldest = this.blobCache.get(oldestKey)
      if (oldest) {
        this.blobCacheBytes -= oldest.bytes.byteLength
      }
      this.blobCache.delete(oldestKey)
    }
  }

  private resetIdleTimer() {
    this.clearIdleTimer()
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null
      this.dropProcess()
    }, IDLE_TIMEOUT_MS)
    this.idleTimer.unref?.()
  }

  private clearIdleTimer() {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
  }
}

const stores = new Map<string, GitObjectStore>()

function storeKey(repositoryRoot: string) {
  const resolved = resolve(repositoryRoot)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

export function readGitObjectByOid(
  repositoryRoot: string,
  oid: string,
): Promise<GitObjectResult> {
  const key = storeKey(repositoryRoot)
  let store = stores.get(key)
  if (!store) {
    store = new GitObjectStore(resolve(repositoryRoot))
    stores.set(key, store)
  }
  return store.readObject(oid)
}

// Kills the batch process for a repository. Safe to call while other sessions
// on the same repository are active: the next request lazily respawns it.
export function disposeGitObjectStore(repositoryRoot: string) {
  const key = storeKey(repositoryRoot)
  const store = stores.get(key)
  if (store) {
    store.dispose()
    stores.delete(key)
  }
}

export function disposeAllGitObjectStores() {
  for (const store of stores.values()) {
    store.dispose()
  }
  stores.clear()
}

process.once('exit', disposeAllGitObjectStores)
