import type { DocumentFormat, DocumentRevision, EditableDocument } from './workspace-types'

export type ConflictKind = 'UU' | 'AA' | 'UD' | 'DU' | 'AU' | 'UA' | 'DD'

export interface ConflictSide {
  oid: string
  mode: number
  contents: string | null
  format: DocumentFormat | null
}

export interface ConflictRevision {
  baseOid: string | null
  currentOid: string | null
  incomingOid: string | null
  workingRevision: DocumentRevision | null
}

export interface ConflictDocument {
  entryId: string
  path: string
  conflictKind: ConflictKind
  base: ConflictSide | null
  current: ConflictSide | null
  incoming: ConflictSide | null
  workingFile: EditableDocument | null
  markerContents: string | null
  binary: boolean
  submodule: boolean
  revision: ConflictRevision
}

export type ConflictResolution =
  | { kind: 'contents'; contents: string; format?: Partial<DocumentFormat> }
  | { kind: 'delete' }
  | { kind: 'side'; side: 'current' | 'incoming' }

export interface ResolveConflictRequest {
  sessionId: string
  entryId: string
  expectedRevision: ConflictRevision
  resolution: ConflictResolution
}
