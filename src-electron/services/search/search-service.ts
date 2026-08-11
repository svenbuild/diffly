import { randomUUID } from 'node:crypto'
import type {
  ApplyComparisonReplaceRequest,
  ComparisonSearchQuery,
  PreviewComparisonReplaceRequest,
  ReplaceAllPreview,
  SearchMatch,
  StartComparisonSearchRequest,
} from '../../../src/lib/search-types'
import type { DiffSessionService, SearchDocumentDescriptor } from '../diff/diff-session-service'
import type { DocumentService } from '../documents/document-service'
import { revisionsEqual } from '../documents/document-revision'
import type { OperationJournal } from '../review/operation-journal'
import { SearchJobStore, type SearchJob } from './search-job-store'
import { createSearchMatcher, pathMatchesFilter, replaceSearchMatches } from './search-matcher'

const SEARCH_CONCURRENCY = 4

export class SearchService {
  private readonly sessions: DiffSessionService
  private readonly documents: DocumentService | null
  private readonly journal: OperationJournal | null
  private readonly jobs = new SearchJobStore()

  constructor(sessions: DiffSessionService, documents: DocumentService | null = null, journal: OperationJournal | null = null) {
    this.sessions = sessions
    this.documents = documents
    this.journal = journal
  }

  start(request: StartComparisonSearchRequest) {
    const matcher = createSearchMatcher(request.query)
    const documents = this.sessions
      .listSearchDocuments(request.sessionId)
      .filter((document) => pathMatchesFilter(document.path, request.query.pathFilter))
      .filter((document) => sideMatchesScope(document.side, request.query.scope))
    const jobId = randomUUID()
    const job = this.jobs.add(jobId, documents.length)
    void this.run(job, request.sessionId, request.query, documents, matcher)
    return { jobId }
  }

  poll(jobId: string) {
    return this.jobs.poll(jobId)
  }

  cancel(jobId: string) {
    this.jobs.cancel(jobId)
  }

  async previewReplace(request: PreviewComparisonReplaceRequest): Promise<ReplaceAllPreview> {
    createSearchMatcher(request.query)
    const descriptors = writableSearchDocuments(this.sessions, request)
    const lineScopes = new Map<string, Promise<LineScopes>>()
    const files = []
    let totalMatches = 0
    for (const descriptor of descriptors) {
      const document = await this.sessions.openDocument(descriptor.target)
      if (document.readOnly || descriptor.target.kind === 'scratch') continue
      const allowed = request.query.scope === 'all'
        ? null
        : await getLineScopes(this.sessions, lineScopes, request.sessionId, descriptor.entryId)
      const result = replaceDocument(document.contents, request.query, request.replacement, descriptor.side, allowed)
      if (result.count === 0) continue
      totalMatches += result.count
      files.push({
        target: descriptor.target,
        path: descriptor.path,
        revision: document.revision,
        matchCount: result.count,
        before: document.contents,
        after: result.contents,
      })
    }
    return { files, totalMatches }
  }

  async replaceAll(request: ApplyComparisonReplaceRequest) {
    if (!this.documents || !this.journal) throw new Error('Workspace replace is unavailable.')
    const preview = await this.previewReplace(request)
    const selected = new Map(request.documents.map((item) => [targetKey(item.target), item]))
    const files = preview.files.filter((file) => selected.has(targetKey(file.target)))
    if (files.length !== selected.size) throw new Error('One or more replace targets are stale or no longer match.')
    for (const file of files) {
      const expected = selected.get(targetKey(file.target))!.expectedRevision
      if (!revisionsEqual(file.revision, expected)) throw new Error('STALE_DOCUMENT')
    }
    const journalId = await this.journal.start({
      kind: 'replaceAll', sessionId: request.sessionId, entryId: null,
    })
    try {
      const result = await this.documents.saveAll({
        documents: files.map((file) => ({
          target: file.target, contents: file.after, expectedRevision: file.revision,
        })),
      })
      if (!result.ok) {
        await this.journal.fail(journalId)
        return result
      }
      await this.journal.complete(journalId, {
        type: 'documents',
        documents: files.map((file, index) => ({
          target: file.target,
          contents: file.before,
          format: result.value[index]!.format,
          afterRevision: result.value[index]!.revision,
        })),
      })
      await this.sessions.refresh(request.sessionId)
      return result
    } catch (error) {
      await this.journal.fail(journalId).catch(() => undefined)
      throw error
    }
  }

  private async run(
    job: SearchJob,
    sessionId: string,
    query: ComparisonSearchQuery,
    documents: SearchDocumentDescriptor[],
    matcher: ReturnType<typeof createSearchMatcher>,
  ) {
    let cursor = 0
    const lineScopes = new Map<string, Promise<LineScopes>>()
    const worker = async () => {
      while (!job.cancelled) {
        const index = cursor
        cursor += 1
        const descriptor = documents[index]
        if (!descriptor) return
        try {
          const document = await this.sessions.openDocument(descriptor.target)
          const allowed = query.scope === 'all'
            ? null
            : await getLineScopes(this.sessions, lineScopes, sessionId, descriptor.entryId)
          for (const line of iterateLines(document.contents)) {
            if (job.cancelled) return
            if (allowed && !lineAllowed(allowed, descriptor.side, line.lineNumber, query.scope)) continue
            const lineMatches = matcher(line.text)
            for (const match of lineMatches) {
              const result: SearchMatch = {
                id: `${descriptor.entryId}:${descriptor.side}:${line.lineNumber}:${match.startColumn}`,
                entryId: descriptor.entryId,
                path: descriptor.path,
                target: descriptor.target,
                side: descriptor.side,
                lineNumber: line.lineNumber,
                startColumn: match.startColumn,
                endColumn: match.endColumn,
                preview: line.text.slice(0, 1000),
              }
              job.matches.push(result)
              job.totalMatches += 1
              await this.jobs.waitForCapacity(job)
            }
          }
        } catch (error) {
          if (!job.error) job.error = error instanceof Error ? error.message : String(error)
        } finally {
          job.scannedDocuments += 1
        }
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(SEARCH_CONCURRENCY, documents.length) }, worker))
    } finally {
      job.done = true
    }
  }
}

function writableSearchDocuments(sessions: DiffSessionService, request: PreviewComparisonReplaceRequest) {
  const seen = new Set<string>()
  return sessions.listSearchDocuments(request.sessionId)
    .filter((document) => pathMatchesFilter(document.path, request.query.pathFilter))
    .filter((document) => sideMatchesScope(document.side, request.query.scope))
    .filter((document) => {
      const key = targetKey(document.target)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function replaceDocument(
  contents: string,
  query: ComparisonSearchQuery,
  replacement: string,
  side: 'left' | 'right',
  scopes: LineScopes | null,
) {
  const parts = contents.split(/(\r\n|\r|\n)/)
  let lineNumber = 1
  let count = 0
  for (let index = 0; index < parts.length; index += 2) {
    if (!scopes || lineAllowed(scopes, side, lineNumber, query.scope)) {
      const result = replaceSearchMatches(parts[index] ?? '', query, replacement)
      parts[index] = result.contents
      count += result.count
    }
    lineNumber += 1
  }
  return { contents: parts.join(''), count }
}

function targetKey(target: SearchDocumentDescriptor['target']) {
  if (target.kind === 'scratch') return `scratch:${target.sourceSessionId}:${target.sourceEntryId}:${target.sourceSide}`
  return `${target.kind}:${target.sessionId}:${target.entryId}:${target.kind === 'local' ? target.side : ''}`
}

interface LineScopes {
  left: { changed: Set<number>; context: Set<number> }
  right: { changed: Set<number>; context: Set<number> }
}

async function getLineScopes(
  sessions: DiffSessionService,
  cache: Map<string, Promise<LineScopes>>,
  sessionId: string,
  entryId: string,
) {
  let value = cache.get(entryId)
  if (!value) {
    value = sessions.openEntryForSearch(sessionId, entryId).then((diff) =>
      parsePatchLineScopes(diff.text?.patchText ?? ''),
    )
    cache.set(entryId, value)
  }
  return value
}

export function parsePatchLineScopes(patch: string): LineScopes {
  const result: LineScopes = {
    left: { changed: new Set(), context: new Set() },
    right: { changed: new Set(), context: new Set() },
  }
  let oldLine = 0
  let newLine = 0
  let inHunk = false
  for (const line of patch.split(/\r?\n/)) {
    const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (header) {
      oldLine = Number(header[1])
      newLine = Number(header[2])
      inHunk = true
      continue
    }
    if (!inHunk) continue
    if (line.startsWith('diff --git ')) {
      inHunk = false
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      result.right.changed.add(newLine++)
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      result.left.changed.add(oldLine++)
    } else if (line.startsWith(' ')) {
      result.left.context.add(oldLine++)
      result.right.context.add(newLine++)
    }
  }
  return result
}

function lineAllowed(
  scopes: LineScopes,
  side: 'left' | 'right',
  line: number,
  scope: ComparisonSearchQuery['scope'],
) {
  if (scope === 'context') return scopes[side].context.has(line)
  return scopes[side].changed.has(line)
}

function sideMatchesScope(side: 'left' | 'right', scope: ComparisonSearchQuery['scope']) {
  if (scope === 'added') return side === 'right'
  if (scope === 'deleted') return side === 'left'
  return true
}

function* iterateLines(contents: string) {
  let lineNumber = 1
  let start = 0
  for (let index = 0; index <= contents.length; index += 1) {
    if (index !== contents.length && contents[index] !== '\n' && contents[index] !== '\r') continue
    yield { lineNumber, text: contents.slice(start, index) }
    if (contents[index] === '\r' && contents[index + 1] === '\n') index += 1
    start = index + 1
    lineNumber += 1
  }
}
