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
  | {
      kind: 'gitRef'
      repoPath: string
      repositoryRoot: string
      // Resolved left rev; null means the left side is empty (e.g. root commit).
      leftRef: string | null
      rightRef: string
      // Display refs for diff labels (branch names, short shas).
      leftLabelRef: string
      rightLabelRef: string
      path: string
      oldPath: string | null
      status: DiffEntryStatus
    }
  | {
      kind: 'githubPullRequest'
      owner: string
      repo: string
      sourceId: string
      baseSha: string
      headSha: string
      path: string
      oldPath: string | null
      status: DiffEntryStatus
    }
