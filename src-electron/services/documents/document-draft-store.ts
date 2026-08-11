import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DocumentDraft, DraftSummary } from '../../../src/lib/workspace-types'
import { documentTargetIdentity } from './document-reader'
import { replaceFile } from '../atomic-file'

const MAX_DRAFT_BYTES = 64 * 1024 * 1024
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024

interface DraftManifest {
  schemaVersion: 1
  drafts: DraftSummary[]
}

export class DocumentDraftStore {
  private queue: Promise<unknown> = Promise.resolve()
  private readonly directory: string

  constructor(directory: string) {
    this.directory = directory
  }

  list(): Promise<DraftSummary[]> {
    return this.enqueue(async () => (await this.readManifest()).drafts)
  }

  load(id: string): Promise<DocumentDraft | null> {
    return this.enqueue(async () => {
      validateDraftId(id)
      try {
        const path = this.draftPath(id)
        const info = await stat(path)
        if (info.size > MAX_DRAFT_BYTES) {
          throw new Error('Draft is too large to recover safely.')
        }
        return validateDraft(JSON.parse(await readFile(path, 'utf8')))
      } catch (error) {
        if (isNotFound(error)) return null
        await this.quarantine(this.draftPath(id)).catch(() => undefined)
        throw error
      }
    })
  }

  save(draft: Omit<DocumentDraft, 'schemaVersion' | 'id' | 'updatedAt'> & {
    id?: string
    updatedAt?: string
  }): Promise<DraftSummary> {
    return this.enqueue(async () => {
      const id = draft.id ?? draftIdForTarget(documentTargetIdentity(draft.target))
      validateDraftId(id)
      const value: DocumentDraft = {
        ...draft,
        schemaVersion: 1,
        id,
        updatedAt: draft.updatedAt ?? new Date().toISOString(),
      }
      const json = JSON.stringify(value)
      const size = Buffer.byteLength(json)
      if (size > MAX_DRAFT_BYTES) {
        throw new Error('Draft is too large to persist safely.')
      }

      await mkdir(this.directory, { recursive: true })
      await writeAtomic(this.draftPath(id), json)
      const summary: DraftSummary = {
        id,
        target: value.target,
        updatedAt: value.updatedAt,
        size,
      }
      const manifest = await this.readManifest()
      manifest.drafts = manifest.drafts.filter((item) => item.id !== id)
      manifest.drafts.push(summary)
      manifest.drafts.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      await this.writeManifest(manifest)
      return summary
    })
  }

  remove(id: string): Promise<void> {
    return this.enqueue(async () => {
      validateDraftId(id)
      await rm(this.draftPath(id), { force: true })
      const manifest = await this.readManifest()
      const drafts = manifest.drafts.filter((item) => item.id !== id)
      if (drafts.length !== manifest.drafts.length) {
        await this.writeManifest({ ...manifest, drafts })
      }
    })
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation)
    this.queue = result.catch(() => undefined)
    return result
  }

  private async readManifest(): Promise<DraftManifest> {
    try {
      const path = this.manifestPath()
      const info = await stat(path)
      if (info.size > MAX_MANIFEST_BYTES) {
        throw new Error('Draft manifest is too large to load safely.')
      }
      return validateManifest(JSON.parse(await readFile(path, 'utf8')))
    } catch (error) {
      if (isNotFound(error)) return { schemaVersion: 1, drafts: [] }
      await this.quarantine(this.manifestPath()).catch(() => undefined)
      throw error
    }
  }

  private async writeManifest(manifest: DraftManifest) {
    const json = JSON.stringify(manifest)
    if (Buffer.byteLength(json) > MAX_MANIFEST_BYTES) {
      throw new Error('Draft manifest is too large to persist safely.')
    }
    await mkdir(this.directory, { recursive: true })
    await writeAtomic(this.manifestPath(), json)
  }

  private manifestPath() {
    return join(this.directory, 'manifest.json')
  }

  private draftPath(id: string) {
    return join(this.directory, `${id}.draft`)
  }

  private async quarantine(path: string) {
    await rename(path, `${path}.corrupt-${Date.now()}`)
  }
}

export function draftIdForTarget(identity: string) {
  return createHash('sha256').update(identity).digest('hex')
}

async function writeAtomic(path: string, contents: string) {
  const temp = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  try {
    await writeFile(temp, contents, { encoding: 'utf8', flag: 'wx' })
    await replaceFile(temp, path)
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined)
    throw error
  }
}

function validateManifest(value: unknown): DraftManifest {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.drafts)) {
    throw new Error('Draft manifest is corrupt or unsupported.')
  }
  return {
    schemaVersion: 1,
    drafts: value.drafts.map(validateDraftSummary),
  }
}

function validateDraftSummary(value: unknown): DraftSummary {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    typeof value.size !== 'number' ||
    !isRecord(value.target)
  ) {
    throw new Error('Draft manifest contains an invalid entry.')
  }
  validateDraftId(value.id)
  return value as unknown as DraftSummary
}

function validateDraft(value: unknown): DocumentDraft {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.id !== 'string' ||
    typeof value.contents !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    typeof value.scrollTop !== 'number' ||
    !Array.isArray(value.selections) ||
    !isRecord(value.target) ||
    !isRecord(value.originalRevision) ||
    !isRecord(value.format)
  ) {
    throw new Error('Draft is corrupt or unsupported.')
  }
  validateDraftId(value.id)
  return value as unknown as DocumentDraft
}

function validateDraftId(id: string) {
  if (!/^[a-f0-9]{64}$/.test(id)) {
    throw new Error('Invalid draft id.')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNotFound(error: unknown) {
  return isRecord(error) && error.code === 'ENOENT'
}
