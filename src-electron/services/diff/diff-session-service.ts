import { randomUUID } from 'node:crypto'
import type {
  CompareOptions,
  CreateDiffSessionResponse,
  DiffEntry,
  DiffEntryFilter,
  DiffSource,
  FileDiffResult,
  GitWorkingTreeReviewAction,
  DocumentTarget,
  EditableDocument,
  SaveDocumentRequest,
} from '../../../src/lib/types'
import type {
  DiffSessionProvider,
  ProviderEntryData,
} from './provider'

export interface DiffSessionMetadata {
  provider: DiffSource['kind']
}

export interface DiffSession {
  id: string
  source: DiffSource
  options: CompareOptions
  createdAt: number
  updatedAt: number
  entries: DiffEntry[]
  metadata: DiffSessionMetadata
}

export interface SearchDocumentDescriptor {
  entryId: string
  path: string
  side: 'left' | 'right'
  target: DocumentTarget
}

interface DiffSessionServiceProviders {
  localProvider: DiffSessionProvider
  gitProvider?: DiffSessionProvider
  githubProvider?: DiffSessionProvider
}

interface DiffSessionRecord extends DiffSession {
  provider: DiffSessionProvider
  entryData: Map<string, ProviderEntryData>
}

export class DiffSessionService {
  private readonly sessions = new Map<string, DiffSessionRecord>()
  private readonly localProvider: DiffSessionProvider
  private readonly gitProvider: DiffSessionProvider
  private readonly githubProvider: DiffSessionProvider

  constructor(providers: DiffSessionServiceProviders) {
    this.localProvider = providers.localProvider
    this.gitProvider = providers.gitProvider ?? createUnsupportedProvider(
      'Diff sessions for git sources are not implemented yet.',
    )
    this.githubProvider = providers.githubProvider ?? createUnsupportedProvider(
      'Diff sessions for GitHub sources are not implemented yet.',
    )
  }

  async create(
    source: DiffSource,
    options: CompareOptions,
  ): Promise<CreateDiffSessionResponse> {
    if (!isDiffSourceLike(source)) {
      throw new Error('Invalid diff source.')
    }

    const provider = this.providerFor(source)
    const providerData = await provider.create(source, options)
    const now = Date.now()
    const session: DiffSessionRecord = {
      id: randomUUID(),
      source,
      options,
      createdAt: now,
      updatedAt: now,
      entries: providerData.entries,
      metadata: {
        provider: source.kind,
      },
      provider,
      entryData: providerData.entryData,
    }

    this.sessions.set(session.id, session)
    return toCreateDiffSessionResponse(session)
  }

  listEntries(sessionId: string, filter?: DiffEntryFilter): DiffEntry[] {
    const session = this.getSession(sessionId)
    return session.entries.filter((entry) => matchesDiffEntryFilter(entry, filter))
  }

  getProviderEntry(sessionId: string, entryId: string) {
    const entry = this.getSession(sessionId).entryData.get(entryId)
    if (!entry) throw new Error('Diff entry was not found.')
    return entry
  }

  getSource(sessionId: string) {
    return this.getSession(sessionId).source
  }

  listSearchDocuments(sessionId: string): SearchDocumentDescriptor[] {
    const session = this.getSession(sessionId)
    const documents: SearchDocumentDescriptor[] = []
    for (const entry of session.entries) {
      if (!entry.capabilities.search || entry.binary) continue
      const sides: Array<'left' | 'right'> = []
      if (entry.status !== 'added' && entry.status !== 'untracked') sides.push('left')
      if (entry.status !== 'deleted') sides.push('right')
      for (const side of sides) {
        documents.push({
          entryId: entry.id,
          path: side === 'left' ? entry.oldPath ?? entry.path : entry.path,
          side,
          target: searchTargetFor(session, entry, side),
        })
      }
    }
    return documents
  }

  openEntry(
    sessionId: string,
    entryId: string,
    options: CompareOptions,
  ): Promise<FileDiffResult> {
    const session = this.getSession(sessionId)
    return session.provider.openEntry(session, entryId, options)
  }

  openEntryForSearch(sessionId: string, entryId: string): Promise<FileDiffResult> {
    const session = this.getSession(sessionId)
    return session.provider.openEntry(session, entryId, session.options)
  }

  openDocument(target: DocumentTarget): Promise<EditableDocument> {
    const session = this.getSession(documentTargetSessionId(target))
    if (typeof session.provider.openDocument !== 'function') {
      throw new Error('Documents are unavailable for this source.')
    }
    return session.provider.openDocument(session, target)
  }

  saveDocument(request: SaveDocumentRequest): Promise<EditableDocument> {
    if (request.target.kind === 'scratch') {
      throw new Error('Scratch documents must be saved with Save As.')
    }
    const session = this.getSession(documentTargetSessionId(request.target))
    if (typeof session.provider.saveDocument !== 'function') {
      throw new Error('This source is read-only.')
    }
    return session.provider.saveDocument(session, request)
  }

  async refresh(sessionId: string): Promise<CreateDiffSessionResponse> {
    const existing = this.getSession(sessionId)
    const providerData = await existing.provider.refresh(existing)
    const session: DiffSessionRecord = {
      ...existing,
      updatedAt: Date.now(),
      entries: providerData.entries,
      entryData: providerData.entryData,
    }

    this.sessions.set(session.id, session)
    return toCreateDiffSessionResponse(session)
  }

  async applyGitWorkingTreeAction(
    sessionId: string,
    entryId: string,
    action: GitWorkingTreeReviewAction,
  ): Promise<void> {
    const session = this.getSession(sessionId)
    if (
      session.source.kind !== 'git' ||
      session.source.selection.kind !== 'workingTree' ||
      typeof session.provider.applyGitWorkingTreeAction !== 'function'
    ) {
      throw new Error('Git working tree actions are unavailable for this source.')
    }

    await session.provider.applyGitWorkingTreeAction(session, entryId, action)
  }

  dispose(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.provider.dispose?.(session)
    }
    this.sessions.delete(sessionId)
  }

  private providerFor(source: DiffSource): DiffSessionProvider {
    switch (source.kind) {
      case 'local':
        return this.localProvider
      case 'git':
        return this.gitProvider
      case 'githubPullRequest':
      case 'githubCompare':
      case 'githubCommit':
        return this.githubProvider
    }
  }

  private getSession(sessionId: string): DiffSessionRecord {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error('Diff session was not found.')
    }

    return session
  }
}

function documentTargetSessionId(target: DocumentTarget) {
  return target.kind === 'scratch' ? target.sourceSessionId : target.sessionId
}

function searchTargetFor(
  session: DiffSessionRecord,
  entry: DiffEntry,
  side: 'left' | 'right',
): DocumentTarget {
  if (session.source.kind === 'local') {
    return { kind: 'local', sessionId: session.id, entryId: entry.id, side }
  }
  if (session.source.kind === 'git' && session.source.selection.kind === 'workingTree') {
    if (side === 'right') {
      return entry.scope === 'staged'
        ? { kind: 'gitIndex', sessionId: session.id, entryId: entry.id }
        : { kind: 'gitWorktree', sessionId: session.id, entryId: entry.id }
    }
  }
  return {
    kind: 'scratch',
    sourceSessionId: session.id,
    sourceEntryId: entry.id,
    sourceSide: side,
  }
}

function createUnsupportedProvider(message: string): DiffSessionProvider {
  const throwUnsupported = () => {
    throw new Error(message)
  }

  return {
    create: throwUnsupported,
    openEntry: throwUnsupported,
    refresh: throwUnsupported,
  }
}

function matchesDiffEntryFilter(entry: DiffEntry, filter?: DiffEntryFilter) {
  if (!filter) {
    return true
  }

  if (filter.scope && entry.scope !== filter.scope) {
    return false
  }

  const search = filter.search?.trim().toLowerCase()
  if (!search) {
    return true
  }

  return [
    entry.displayPath,
    entry.path,
    entry.oldPath ?? '',
  ].some((value) => value.toLowerCase().includes(search))
}

function toCreateDiffSessionResponse(session: DiffSessionRecord): CreateDiffSessionResponse {
  return {
    sessionId: session.id,
    source: session.source,
    entries: session.entries,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  }
}

function isDiffSourceLike(source: unknown): source is DiffSource {
  if (!source || typeof source !== 'object' || !('kind' in source)) {
    return false
  }

  const kind = (source as { kind?: unknown }).kind
  return (
    kind === 'local' ||
    kind === 'git' ||
    kind === 'githubPullRequest' ||
    kind === 'githubCompare' ||
    kind === 'githubCommit'
  )
}
