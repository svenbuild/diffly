import type { WorkspaceDocumentState } from './document-store'

export interface CloseGuardSummary {
  dirtyCount: number
  dirtyDocuments: WorkspaceDocumentState[]
}

export function summarizeUnsavedDocuments(documents: Iterable<WorkspaceDocumentState>): CloseGuardSummary {
  const dirtyDocuments = Array.from(documents).filter((document) => document.dirty)
  return { dirtyCount: dirtyDocuments.length, dirtyDocuments }
}
