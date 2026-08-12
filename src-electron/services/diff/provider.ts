import type {
  CompareOptions,
  DiffEntry,
  DiffSource,
  DiffEntryStatus,
  FileDiffResult,
  GitWorkingTreeReviewAction,
  GitWorkingTreeReviewCapabilities,
  GitWorkingTreeScope,
  DocumentTarget,
  EditableDocument,
  SaveDocumentRequest,
} from '../../../src/lib/types'

export interface DiffSessionProvider {
  create(source: DiffSource, options: CompareOptions): Promise<ProviderSessionData>
  openEntry(
    session: DiffSessionRecordLike,
    entryId: string,
    options: CompareOptions,
  ): Promise<FileDiffResult>
  refresh(session: DiffSessionRecordLike): Promise<ProviderSessionData>
  openDocument?(
    session: DiffSessionRecordLike,
    target: DocumentTarget,
  ): Promise<EditableDocument>
  saveDocument?(
    session: DiffSessionRecordLike,
    request: SaveDocumentRequest,
  ): Promise<EditableDocument>
  applyGitWorkingTreeAction?(
    session: DiffSessionRecordLike,
    entryId: string,
    action: GitWorkingTreeReviewAction,
  ): Promise<void>
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
      conflictKind?: 'UU' | 'AA' | 'UD' | 'DU' | 'AU' | 'UA' | 'DD'
      gitReviewCapabilities?: GitWorkingTreeReviewCapabilities
      // Full blob oids from the raw diff for this scope; null when unknown.
      // srcOid is the left side of the scope's diff command, dstOid the right.
      srcOid: string | null
      dstOid: string | null
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
      // Full blob oids from the raw diff; null when unknown.
      srcOid: string | null
      dstOid: string | null
    }
  | {
      kind: 'githubPullRequest'
      owner: string
      repo: string
      sourceId: string
      baseSha: string
      headSha: string
      leftLabel: string
      rightLabel: string
      path: string
      oldPath: string | null
      status: DiffEntryStatus
      patch: string | null
    }
