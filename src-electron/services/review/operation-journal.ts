import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { OperationJournalEntry } from '../../../src/lib/review-types'
import { replaceFile } from '../atomic-file'

const MAX_ENTRIES = 100
const MAX_BYTES = 128 * 1024 * 1024

interface JournalFile {
  schemaVersion: 1
  entries: OperationJournalEntry[]
}

export class OperationJournal {
  private queue: Promise<unknown> = Promise.resolve()
  private readonly path: string

  constructor(directory: string) {
    this.path = join(directory, 'operations.json')
  }

  start(input: Omit<OperationJournalEntry, 'id' | 'createdAt' | 'payload'>) {
    return this.enqueue(async () => {
      const entry: OperationJournalEntry = {
        ...input,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        payload: { state: 'pending' },
      }
      const file = await this.read()
      file.entries.push(entry)
      await this.write(file)
      return entry.id
    })
  }

  complete(id: string, payload: unknown) {
    return this.enqueue(async () => {
      const file = await this.read()
      const entry = file.entries.find((item) => item.id === id)
      if (!entry) throw new Error('Operation journal entry was not found.')
      entry.payload = { state: 'complete', data: payload }
      await this.write(file)
    })
  }

  fail(id: string) {
    return this.enqueue(async () => {
      const file = await this.read()
      file.entries = file.entries.filter((entry) => entry.id !== id)
      await this.write(file)
    })
  }

  latest(sessionId: string) {
    return this.enqueue(async () => {
      const file = await this.read()
      return [...file.entries].reverse().find((entry) =>
        entry.sessionId === sessionId &&
        typeof entry.payload === 'object' &&
        entry.payload !== null &&
        'state' in entry.payload &&
        entry.payload.state === 'complete'
      ) ?? null
    })
  }

  remove(id: string) {
    return this.enqueue(async () => {
      const file = await this.read()
      file.entries = file.entries.filter((entry) => entry.id !== id)
      await this.write(file)
    })
  }

  private enqueue<T>(operation: () => Promise<T>) {
    const result = this.queue.then(operation, operation)
    this.queue = result.catch(() => undefined)
    return result
  }

  private async read(): Promise<JournalFile> {
    try {
      const value = JSON.parse(await readFile(this.path, 'utf8')) as JournalFile
      if (value.schemaVersion !== 1 || !Array.isArray(value.entries)) throw new Error('Operation journal is corrupt.')
      return value
    } catch (error) {
      if (isNotFound(error)) return { schemaVersion: 1, entries: [] }
      throw error
    }
  }

  private async write(file: JournalFile) {
    file.entries = file.entries.slice(-MAX_ENTRIES)
    const json = JSON.stringify(file)
    if (Buffer.byteLength(json) > MAX_BYTES) throw new Error('Operation journal exceeds its size limit.')
    await mkdir(dirname(this.path), { recursive: true })
    const temp = `${this.path}.${process.pid}.${Date.now()}.tmp`
    try {
      await writeFile(temp, json, { flag: 'wx' })
      await replaceFile(temp, this.path)
    } catch (error) {
      await rm(temp, { force: true }).catch(() => undefined)
      throw error
    }
  }
}

function isNotFound(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
