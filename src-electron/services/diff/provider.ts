import type {
  CompareOptions,
  DiffEntry,
  DiffSource,
  DiffEntryStatus,
  FileDiffResult,
  GitWorkingTreeScope,
} from '../../../src/lib/types'

export interface DiffSessionProvider {
  create(source: DiffSource, options: CompareOptions): Promise<ProviderSessionData>
  openEntry(
    session: DiffSessionRecordLike,
    entryId: string,
    options: CompareOptions,
  ): Promise<FileDiffResult>
  refresh(session: DiffSessionRecordLike): Promise<ProviderSessionData>
  dispose?(session: DiffSessionRecordLike): void
}

export interface ProviderSessionData {
  entries: DiffEntry[]
  entryData: Map<string, ProviderEntryData>
}

export interface DiffSessionRecordLike {
  source: DiffSource
  options: CompareOptions
  entryData: Map<string, ProviderEntryData>
}

export type ProviderEntryData =
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
  | {
      kind: 'gitWorkingTree'
      repoPath: string
      repositoryRoot: string
      scope: GitWorkingTreeScope
      path: string
      oldPath: string | null
      status: DiffEntryStatus
    }
