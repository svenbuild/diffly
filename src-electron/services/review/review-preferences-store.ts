import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ReviewAuthor, ReviewCommentDraft, ReviewDecision } from '../../../src/lib/review-types'
import { replaceFile } from '../atomic-file'

const MAX_DRAFT_BYTES = 512 * 1024

export class ReviewPreferencesStore {
  private queue: Promise<unknown> = Promise.resolve()
  private readonly directory: string

  constructor(directory: string) {
    this.directory = directory
  }

  getProfile() {
    return this.enqueue(async () => {
      try {
        return validateAuthor(JSON.parse(await readFile(join(this.directory, 'profile.json'), 'utf8')))
      } catch (error) {
        if (!isNotFound(error) && !(error instanceof SyntaxError)) throw error
        const author = { id: randomUUID(), name: 'Local reviewer', avatar: null }
        await this.writeJson('profile.json', author)
        return author
      }
    })
  }

  saveProfile(author: ReviewAuthor) {
    return this.enqueue(async () => {
      const value = validateAuthor(author)
      await this.writeJson('profile.json', value)
      return value
    })
  }

  listDrafts(compareIdentity: string) {
    return this.enqueue(() => this.readDrafts(compareIdentity))
  }

  saveDraft(compareIdentity: string, key: string, body: string) {
    return this.enqueue(async () => {
      const drafts = await this.readDrafts(compareIdentity)
      const draft = validateDraft({ key, body, updatedAt: new Date().toISOString() })
      const next = [...drafts.filter((item) => item.key !== key), draft]
      await this.writeJson(draftFile(compareIdentity), next)
      return draft
    })
  }

  removeDraft(compareIdentity: string, key: string) {
    return this.enqueue(async () => {
      const next = (await this.readDrafts(compareIdentity)).filter((item) => item.key !== key)
      if (next.length === 0) {
        await rm(join(this.directory, draftFile(compareIdentity)), { force: true })
      } else {
        await this.writeJson(draftFile(compareIdentity), next)
      }
    })
  }

  listDecisions(compareIdentity: string) {
    return this.enqueue(async () => {
      try {
        const value = JSON.parse(await readFile(join(this.directory, decisionFile(compareIdentity)), 'utf8'))
        if (!Array.isArray(value)) throw new Error('Review decisions are corrupt.')
        return value as ReviewDecision[]
      } catch (error) {
        if (isNotFound(error)) return []
        throw error
      }
    })
  }

  saveDecisions(compareIdentity: string, decisions: ReviewDecision[]) {
    return this.enqueue(async () => {
      await this.writeJson(decisionFile(compareIdentity), decisions)
      return decisions
    })
  }

  private async readDrafts(compareIdentity: string): Promise<ReviewCommentDraft[]> {
    try {
      const value = JSON.parse(await readFile(join(this.directory, draftFile(compareIdentity)), 'utf8'))
      if (!Array.isArray(value)) throw new Error('Review drafts are corrupt.')
      return value.map(validateDraft)
    } catch (error) {
      if (isNotFound(error)) return []
      throw error
    }
  }

  private async writeJson(name: string, value: unknown) {
    const json = JSON.stringify(value)
    if (Buffer.byteLength(json) > MAX_DRAFT_BYTES) throw new Error('Review metadata exceeds its size limit.')
    await mkdir(this.directory, { recursive: true })
    const path = join(this.directory, name)
    const temp = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
    try {
      await writeFile(temp, json, { flag: 'wx' })
      await replaceFile(temp, path)
    } catch (error) {
      await rm(temp, { force: true }).catch(() => undefined)
      throw error
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation)
    this.queue = result.catch(() => undefined)
    return result
  }
}

function validateAuthor(value: unknown): ReviewAuthor {
  if (
    typeof value !== 'object' || value === null ||
    !('id' in value) || typeof value.id !== 'string' || !value.id || value.id.length > 256 ||
    !('name' in value) || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 256 ||
    !('avatar' in value) || (value.avatar !== null && (typeof value.avatar !== 'string' || value.avatar.length > 8192))
  ) throw new Error('Invalid review author profile.')
  return { id: value.id, name: value.name.trim(), avatar: value.avatar }
}

function validateDraft(value: unknown): ReviewCommentDraft {
  if (
    typeof value !== 'object' || value === null ||
    !('key' in value) || typeof value.key !== 'string' || !value.key || value.key.length > 4096 ||
    !('body' in value) || typeof value.body !== 'string' || Buffer.byteLength(value.body) > 256 * 1024 ||
    !('updatedAt' in value) || typeof value.updatedAt !== 'string'
  ) throw new Error('Invalid review comment draft.')
  return { key: value.key, body: value.body, updatedAt: value.updatedAt }
}

function draftFile(compareIdentity: string) {
  if (!/^[a-f0-9]{64}$/.test(compareIdentity)) throw new Error('Invalid compare identity.')
  return `${compareIdentity}.drafts.json`
}

function decisionFile(compareIdentity: string) {
  if (!/^[a-f0-9]{64}$/.test(compareIdentity)) throw new Error('Invalid compare identity.')
  return `${compareIdentity}.decisions.json`
}

function isNotFound(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
