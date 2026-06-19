import { randomUUID } from 'node:crypto'
import type {
  CompareOptions,
  CreateDiffSessionResponse,
  DiffEntry,
  DiffEntryFilter,
  DiffSource,
  FileDiffResult,
  GitWorkingTreeReviewAction,
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

  openEntry(
    sessionId: string,
    entryId: string,
    options: CompareOptions,
  ): Promise<FileDiffResult> {
    const session = this.getSession(sessionId)
    return session.provider.openEntry(session, entryId, options)
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
