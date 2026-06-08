import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { basename } from 'node:path'
import type {
  CompareOptions,
  CreateDiffSessionResponse,
  DiffEntry,
  DiffEntryFilter,
  DiffSource,
  DirectoryEntryResult,
  FileDiffResult,
} from '../../../src/lib/types'

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

interface DiffSessionServiceDependencies {
  compareDirectories(
    leftPath: string,
    rightPath: string,
    options: CompareOptions,
  ): Promise<DirectoryEntryResult[]>
  openCompareItem(
    leftBase: string,
    rightBase: string,
    relativePath: string,
    options: CompareOptions,
  ): Promise<FileDiffResult>
  buildFileDiff(
    leftPath: string,
    rightPath: string,
    leftLabel: string,
    rightLabel: string,
    options: CompareOptions,
  ): Promise<FileDiffResult>
}

interface DiffSessionRecord extends DiffSession {
  provider: DiffSessionProvider
  entryData: Map<string, ProviderEntryData>
}

interface DiffSessionProvider {
  create(source: DiffSource, options: CompareOptions): Promise<ProviderSessionData>
  openEntry(
    session: DiffSessionRecord,
    entryId: string,
    options: CompareOptions,
  ): Promise<FileDiffResult>
  refresh(session: DiffSessionRecord): Promise<ProviderSessionData>
  dispose?(session: DiffSessionRecord): void
}

interface ProviderSessionData {
  entries: DiffEntry[]
  entryData: Map<string, ProviderEntryData>
}

type ProviderEntryData =
  | {
      kind: 'localFile'
      leftPath: string
      rightPath: string
      leftLabel: string
      rightLabel: string
    }
  | {
      kind: 'localDirectory'
      relativePath: string
      leftBase: string
      rightBase: string
    }

export class DiffSessionService {
  private readonly sessions = new Map<string, DiffSessionRecord>()
  private readonly localProvider: DiffSessionProvider
  private readonly gitProvider: DiffSessionProvider
  private readonly githubProvider: DiffSessionProvider

  constructor(dependencies: DiffSessionServiceDependencies) {
    this.localProvider = createLocalProvider(dependencies)
    this.gitProvider = createUnsupportedProvider(
      'Diff sessions for git sources are not implemented yet.',
    )
    this.githubProvider = createUnsupportedProvider(
      'Diff sessions for GitHub pull request sources are not implemented yet.',
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

function createLocalProvider(
  dependencies: DiffSessionServiceDependencies,
): DiffSessionProvider {
  const create = (source: DiffSource, options: CompareOptions) =>
    buildLocalProviderSessionData(source, options, dependencies)

  return {
    create,
    openEntry(session, entryId, options) {
      const entry = session.entryData.get(entryId)
      if (!entry) {
        throw new Error('Diff entry was not found.')
      }

      if (entry.kind === 'localFile') {
        return dependencies.buildFileDiff(
          entry.leftPath,
          entry.rightPath,
          entry.leftLabel,
          entry.rightLabel,
          options,
        )
      }

      return dependencies.openCompareItem(
        entry.leftBase,
        entry.rightBase,
        entry.relativePath,
        options,
      )
    },
    refresh(session) {
      return create(session.source, session.options)
    },
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

async function buildLocalProviderSessionData(
  source: DiffSource,
  options: CompareOptions,
  dependencies: DiffSessionServiceDependencies,
): Promise<ProviderSessionData> {
  if (source.kind !== 'local') {
    throw new Error('Expected a local diff source.')
  }
  if (source.compareMode !== 'file' && source.compareMode !== 'directory') {
    throw new Error('Invalid local compare mode.')
  }

  const entryData = new Map<string, ProviderEntryData>()
  const entries: DiffEntry[] = []

  if (source.compareMode === 'file') {
    const displayPath = basename(source.rightPath) || basename(source.leftPath) || 'File'
    const entry: DiffEntry = {
      id: 'file',
      path: displayPath,
      oldPath: null,
      displayPath,
      status: 'modified',
      leftSize: await getFileSize(source.leftPath),
      rightSize: await getFileSize(source.rightPath),
    }
    entries.push(entry)
    entryData.set(entry.id, {
      kind: 'localFile',
      leftPath: source.leftPath,
      rightPath: source.rightPath,
      leftLabel: basename(source.leftPath),
      rightLabel: basename(source.rightPath),
    })
  } else {
    const directoryEntries = await dependencies.compareDirectories(
      source.leftPath,
      source.rightPath,
      options,
    )
    for (const directoryEntry of directoryEntries) {
      const entry = mapDirectoryEntryToDiffEntry(directoryEntry)
      entries.push(entry)
      entryData.set(entry.id, {
        kind: 'localDirectory',
        leftBase: source.leftPath,
        rightBase: source.rightPath,
        relativePath: directoryEntry.relativePath,
      })
    }
  }

  return {
    entries,
    entryData,
  }
}

async function getFileSize(pathValue: string): Promise<number | null> {
  try {
    return (await stat(pathValue)).size
  } catch {
    return null
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

function mapDirectoryEntryToDiffEntry(entry: DirectoryEntryResult): DiffEntry {
  return {
    id: encodeURIComponent(entry.relativePath),
    path: entry.relativePath,
    oldPath: null,
    displayPath: entry.relativePath,
    status: mapDirectoryEntryStatus(entry.status),
    leftSize: entry.leftSize,
    rightSize: entry.rightSize,
    binary: entry.status === 'unsupported' ? true : undefined,
  }
}

function mapDirectoryEntryStatus(status: DirectoryEntryResult['status']): DiffEntry['status'] {
  switch (status) {
    case 'modified':
      return 'modified'
    case 'leftOnly':
      return 'deleted'
    case 'rightOnly':
      return 'added'
    case 'unsupported':
      return 'unsupported'
  }
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
  return kind === 'local' || kind === 'git' || kind === 'githubPullRequest'
}
