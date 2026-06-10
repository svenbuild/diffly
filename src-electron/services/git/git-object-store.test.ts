import { describe, expect, it } from 'vitest'
import {
  GitObjectBatchProcess,
  isUsableGitOid,
  type BatchChildLike,
} from './git-object-store'

const OID_A = 'a'.repeat(40)
const OID_B = 'b'.repeat(40)
const OID_C = 'c'.repeat(40)

class FakeBatchChild implements BatchChildLike {
  writes: string[] = []
  killed = false
  private dataListeners: ((chunk: Buffer) => void)[] = []
  private errorListeners: ((error: Error) => void)[] = []
  private closeListeners: (() => void)[] = []

  stdin = {
    write: (data: string) => {
      this.writes.push(data)
    },
  }

  stdout = {
    on: (event: 'data', listener: (chunk: Buffer) => void) => {
      if (event === 'data') {
        this.dataListeners.push(listener)
      }
    },
  }

  on(event: 'error' | 'close', listener: ((error: Error) => void) | (() => void)) {
    if (event === 'error') {
      this.errorListeners.push(listener as (error: Error) => void)
    } else {
      this.closeListeners.push(listener as () => void)
    }
  }

  kill() {
    this.killed = true
  }

  emitData(chunk: Buffer | string) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk
    for (const listener of this.dataListeners) {
      listener(buffer)
    }
  }

  emitClose() {
    for (const listener of this.closeListeners) {
      listener()
    }
  }

  emitError(error: Error) {
    for (const listener of this.errorListeners) {
      listener(error)
    }
  }
}

function objectResponse(oid: string, type: string, body: string) {
  return Buffer.concat([
    Buffer.from(`${oid} ${type} ${Buffer.byteLength(body, 'utf8')}\n`, 'utf8'),
    Buffer.from(body, 'utf8'),
    Buffer.from('\n', 'utf8'),
  ])
}

function createProcess() {
  const children: FakeBatchChild[] = []
  const process = new GitObjectBatchProcess(() => {
    const child = new FakeBatchChild()
    children.push(child)
    return child
  })
  return { process, children }
}

describe('isUsableGitOid', () => {
  it('accepts full lowercase hex oids', () => {
    expect(isUsableGitOid(OID_A)).toBe(true)
  })

  it('rejects all-zero, abbreviated, and malformed oids', () => {
    expect(isUsableGitOid('0'.repeat(40))).toBe(false)
    expect(isUsableGitOid('abc1234')).toBe(false)
    expect(isUsableGitOid(`${'a'.repeat(39)}G`)).toBe(false)
    expect(isUsableGitOid(null)).toBe(false)
    expect(isUsableGitOid(undefined)).toBe(false)
  })
})

describe('GitObjectBatchProcess', () => {
  it('resolves a blob response delivered in one chunk', async () => {
    const { process, children } = createProcess()
    const pending = process.request(OID_A)
    expect(children[0].writes).toEqual([`${OID_A}\n`])

    children[0].emitData(objectResponse(OID_A, 'blob', 'hello world\n'))

    const result = await pending
    expect(result.kind).toBe('object')
    if (result.kind === 'object') {
      expect(result.type).toBe('blob')
      expect(Buffer.from(result.bytes).toString('utf8')).toBe('hello world\n')
    }
  })

  it('parses responses split across arbitrary chunk boundaries', async () => {
    const { process, children } = createProcess()
    const pending = process.request(OID_A)

    const response = objectResponse(OID_A, 'blob', 'chunked body content')
    // Split inside the header, inside the body, and before the trailing newline.
    children[0].emitData(response.subarray(0, 10))
    children[0].emitData(response.subarray(10, 15))
    children[0].emitData(response.subarray(15, response.byteLength - 1))
    children[0].emitData(response.subarray(response.byteLength - 1))

    const result = await pending
    expect(result.kind).toBe('object')
    if (result.kind === 'object') {
      expect(Buffer.from(result.bytes).toString('utf8')).toBe('chunked body content')
    }
  })

  it('matches pipelined responses to requests in FIFO order', async () => {
    const { process, children } = createProcess()
    const first = process.request(OID_A)
    const second = process.request(OID_B)
    expect(children[0].writes).toEqual([`${OID_A}\n`, `${OID_B}\n`])

    children[0].emitData(Buffer.concat([
      objectResponse(OID_A, 'blob', 'first'),
      objectResponse(OID_B, 'blob', 'second'),
    ]))

    const [firstResult, secondResult] = await Promise.all([first, second])
    expect(firstResult.kind === 'object' && Buffer.from(firstResult.bytes).toString('utf8')).toBe('first')
    expect(secondResult.kind === 'object' && Buffer.from(secondResult.bytes).toString('utf8')).toBe('second')
  })

  it('resolves missing objects without failing the process', async () => {
    const { process, children } = createProcess()
    const missing = process.request(OID_A)
    const present = process.request(OID_B)

    children[0].emitData(Buffer.concat([
      Buffer.from(`${OID_A} missing\n`, 'utf8'),
      objectResponse(OID_B, 'blob', 'still alive'),
    ]))

    expect(await missing).toEqual({ kind: 'missing' })
    const result = await present
    expect(result.kind).toBe('object')
    expect(process.isDestroyed).toBe(false)
  })

  it('handles empty blobs', async () => {
    const { process, children } = createProcess()
    const pending = process.request(OID_A)
    children[0].emitData(objectResponse(OID_A, 'blob', ''))

    const result = await pending
    expect(result.kind === 'object' && result.bytes.byteLength).toBe(0)
  })

  it('rejects in-flight requests when the process dies mid-response', async () => {
    const { process, children } = createProcess()
    const first = process.request(OID_A)
    const second = process.request(OID_B)

    const response = objectResponse(OID_A, 'blob', 'partial body that never finishes')
    children[0].emitData(response.subarray(0, 20))
    children[0].emitClose()

    await expect(first).rejects.toThrow('exited unexpectedly')
    await expect(second).rejects.toThrow('exited unexpectedly')
    expect(process.isDestroyed).toBe(true)
    expect(children[0].killed).toBe(true)
    await expect(process.request(OID_C)).rejects.toThrow('no longer available')
  })

  it('rejects all pending requests on a malformed header', async () => {
    const { process, children } = createProcess()
    const first = process.request(OID_A)
    const second = process.request(OID_B)

    children[0].emitData('not a valid header line\n')

    await expect(first).rejects.toThrow('malformed header')
    await expect(second).rejects.toThrow('malformed header')
    expect(children[0].killed).toBe(true)
  })

  it('rejects on invalid sizes and bodies missing the trailing newline', async () => {
    {
      const { process, children } = createProcess()
      const pending = process.request(OID_A)
      children[0].emitData(`${OID_A} blob -5\n`)
      await expect(pending).rejects.toThrow('invalid object size')
    }
    {
      const { process, children } = createProcess()
      const pending = process.request(OID_A)
      children[0].emitData(`${OID_A} blob abc\n`)
      await expect(pending).rejects.toThrow('invalid object size')
    }
    {
      const { process, children } = createProcess()
      const pending = process.request(OID_A)
      children[0].emitData(Buffer.concat([
        Buffer.from(`${OID_A} blob 2\n`, 'utf8'),
        Buffer.from('abX', 'utf8'),
      ]))
      await expect(pending).rejects.toThrow('not terminated by a newline')
    }
  })

  it('fails when output arrives without a pending request', async () => {
    const { process, children } = createProcess()
    const pending = process.request(OID_A)
    children[0].emitData(Buffer.concat([
      objectResponse(OID_A, 'blob', 'expected'),
      objectResponse(OID_B, 'blob', 'unexpected extra response'),
    ]))

    const result = await pending
    expect(result.kind).toBe('object')
    expect(process.isDestroyed).toBe(true)
  })

  it('rejects oversized objects instead of buffering them', async () => {
    const { process, children } = createProcess()
    const pending = process.request(OID_A)
    children[0].emitData(`${OID_A} blob ${1024 * 1024 * 1024}\n`)
    await expect(pending).rejects.toThrow('size limit')
    expect(children[0].killed).toBe(true)
  })

  it('rejects requests for unusable oids without touching the child', async () => {
    const { process, children } = createProcess()
    await expect(process.request('0'.repeat(40))).rejects.toThrow('invalid git object id')
    await expect(process.request('abc')).rejects.toThrow('invalid git object id')
    expect(children).toHaveLength(0)
  })

  it('reports spawn errors to in-flight requests', async () => {
    const { process, children } = createProcess()
    const pending = process.request(OID_A)
    children[0].emitError(new Error('ENOENT'))
    await expect(pending).rejects.toThrow('Git cat-file process failed')
  })
})
