import { randomUUID } from 'node:crypto'
import type {
  ComparisonSearchQuery,
  SearchMatch,
  StartComparisonSearchRequest,
} from '../../../src/lib/search-types'
import type { DiffSessionService, SearchDocumentDescriptor } from '../diff/diff-session-service'
import { SearchJobStore, type SearchJob } from './search-job-store'
import { createSearchMatcher, pathMatchesFilter } from './search-matcher'

const SEARCH_CONCURRENCY = 4

export class SearchService {
  private readonly sessions: DiffSessionService
  private readonly jobs = new SearchJobStore()

  constructor(sessions: DiffSessionService) {
    this.sessions = sessions
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
