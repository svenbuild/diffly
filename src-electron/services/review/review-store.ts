import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ReviewBundle, ReviewThread } from '../../../src/lib/review-types'
import { replaceFile } from '../atomic-file'

const MAX_REVIEW_BYTES = 16 * 1024 * 1024

interface ReviewFile {
  schemaVersion: 1
  compareIdentity: string
  threads: ReviewThread[]
}

export class ReviewStore {
  private queue: Promise<unknown> = Promise.resolve()
  private readonly directory: string

  constructor(directory: string) {
    this.directory = directory
  }

  read(compareIdentity: string) {
    return this.enqueue(() => this.readUnsafe(compareIdentity))
  }

  update(compareIdentity: string, mutate: (threads: ReviewThread[]) => ReviewThread[] | void) {
    return this.enqueue(async () => {
      const file = await this.readUnsafe(compareIdentity)
      const replacement = mutate(file.threads)
      if (replacement) file.threads = replacement
      await this.writeUnsafe(file)
      return file
    })
  }

  import(bundle: ReviewBundle) {
    return this.update(bundle.compareIdentity, (threads) => {
      const byId = new Map(threads.map((thread) => [thread.id, thread]))
      for (const thread of bundle.threads) byId.set(thread.id, thread)
      return Array.from(byId.values())
    })
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation)
    this.queue = result.catch(() => undefined)
    return result
  }

  private async readUnsafe(compareIdentity: string): Promise<ReviewFile> {
    const path = this.path(compareIdentity)
    try {
      const info = await stat(path)
      if (info.size > MAX_REVIEW_BYTES) throw new Error('Review file exceeds its size limit.')
      return validateReviewFile(JSON.parse(await readFile(path, 'utf8')), compareIdentity)
    } catch (error) {
      if (isNotFound(error)) return { schemaVersion: 1, compareIdentity, threads: [] }
      await rename(path, `${path}.corrupt-${Date.now()}`).catch(() => undefined)
      throw error
    }
  }

  private async writeUnsafe(file: ReviewFile) {
    const json = JSON.stringify(file)
    if (Buffer.byteLength(json) > MAX_REVIEW_BYTES) throw new Error('Review exceeds its size limit.')
    await mkdir(this.directory, { recursive: true })
    const path = this.path(file.compareIdentity)
    const temp = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
    try {
      await writeFile(temp, json, { flag: 'wx' })
      await replaceFile(temp, path)
    } catch (error) {
      await rm(temp, { force: true }).catch(() => undefined)
      throw error
    }
  }

  private path(compareIdentity: string) {
    if (!/^[a-f0-9]{64}$/.test(compareIdentity)) throw new Error('Invalid compare identity.')
    return join(this.directory, `${compareIdentity}.json`)
  }
}

function validateReviewFile(value: unknown, compareIdentity: string): ReviewFile {
  if (
    typeof value !== 'object' || value === null ||
    !('schemaVersion' in value) || value.schemaVersion !== 1 ||
    !('compareIdentity' in value) || value.compareIdentity !== compareIdentity ||
    !('threads' in value) || !Array.isArray(value.threads)
  ) {
    throw new Error('Review file is corrupt or unsupported.')
  }
  return value as ReviewFile
}

function isNotFound(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
