import type {
  EditableDocument,
  MutationError,
  MutationResult,
  SaveDocumentRequest,
  SaveDocumentResult,
  SaveDocumentsRequest,
} from '../../../src/lib/workspace-types'
import type { DiffSessionService } from '../diff/diff-session-service'
import { UnsupportedDocumentEncodingError } from './document-reader'
import { revisionsEqual } from './document-revision'
import { StaleDocumentError } from './document-writer'
import type { DocumentWatchService } from './document-watch-service'

export class DocumentService {
  private mutationQueue: Promise<unknown> = Promise.resolve()
  private readonly diffSessions: DiffSessionService
  private readonly watchers: DocumentWatchService | null

  constructor(diffSessions: DiffSessionService, watchers: DocumentWatchService | null = null) {
    this.diffSessions = diffSessions
    this.watchers = watchers
  }

  watch(id: string, target: SaveDocumentRequest['target'], onChange: (change: {
    target: SaveDocumentRequest['target']
    revision: EditableDocument['revision'] | null
  }) => void) {
    const path = this.diffSessions.resolveWatchPath(target)
    if (!path || !this.watchers) return false
    this.watchers.watch(id, path, () => {
      void this.open(target)
        .then((document) => onChange({ target, revision: document.revision }))
        .catch(() => onChange({ target, revision: null }))
    })
    return true
  }

  unwatch(id: string) {
    this.watchers?.unwatch(id)
  }

  open(target: Parameters<DiffSessionService['openDocument']>[0]) {
    return this.diffSessions.openDocument(target)
  }

  save(request: SaveDocumentRequest): Promise<MutationResult<SaveDocumentResult>> {
    return this.enqueueMutation(async () => {
      try {
        const document = await this.diffSessions.saveDocument(request)
        return { ok: true, value: { document } }
      } catch (error) {
        return { ok: false, error: toMutationError(error) }
      }
    })
  }

  saveAll(request: SaveDocumentsRequest): Promise<MutationResult<EditableDocument[]>> {
    return this.enqueueMutation(async () => {
      const originals: EditableDocument[] = []
      const saved: EditableDocument[] = []
      try {
        for (const item of request.documents) {
          const original = await this.diffSessions.openDocument(item.target)
          if (!item.overwrite && !revisionsEqual(original.revision, item.expectedRevision)) {
            throw new StaleDocumentError(original.revision)
          }
          originals.push(original)
        }

        for (const item of request.documents) {
          saved.push(await this.diffSessions.saveDocument(item))
        }
        return { ok: true, value: saved }
      } catch (error) {
        await this.rollbackSavedDocuments(originals, saved).catch(() => undefined)
        return { ok: false, error: toMutationError(error) }
      }
    })
  }

  private async rollbackSavedDocuments(
    originals: EditableDocument[],
    saved: EditableDocument[],
  ) {
    for (let index = saved.length - 1; index >= 0; index -= 1) {
      const original = originals[index]
      const current = saved[index]
      if (!original || !current || original.target.kind === 'scratch') continue
      await this.diffSessions.saveDocument({
        target: original.target,
        contents: original.contents,
        expectedRevision: current.revision,
        format: original.format,
        overwrite: true,
      })
    }
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation, operation)
    this.mutationQueue = result.catch(() => undefined)
    return result
  }
}

function toMutationError(error: unknown): MutationError {
  if (error instanceof StaleDocumentError) {
    return { code: 'STALE_DOCUMENT', currentRevision: error.currentRevision }
  }
  if (error instanceof UnsupportedDocumentEncodingError) {
    return { code: 'UNSUPPORTED_ENCODING' }
  }
  if (error instanceof Error) {
    if (/read.?only|scratch/i.test(error.message)) return { code: 'READ_ONLY_SOURCE' }
    if (/outside/i.test(error.message)) return { code: 'PATH_OUTSIDE_SESSION' }
  }
  throw error
}
