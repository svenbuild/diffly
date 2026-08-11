import { derived, get, writable } from 'svelte/store'
import type {
  DocumentDraft,
  DocumentTarget,
  DraftSummary,
  EditableDocument,
} from '../workspace-types'

export type WorkspaceMode = 'review' | 'edit' | 'resolve'

export interface WorkspaceDocumentState {
  id: string
  document: EditableDocument
  contents: string
  dirty: boolean
  saving: boolean
  externalChanged: boolean
  error: string | null
  selections: DocumentDraft['selections']
  scrollTop: number
  focusRevision: number
}

export interface DocumentWorkspaceState {
  mode: WorkspaceMode
  activeDocumentId: string | null
  documents: Map<string, WorkspaceDocumentState>
  recoveredDrafts: DraftSummary[]
  loading: boolean
}

const initialState: DocumentWorkspaceState = {
  mode: 'review',
  activeDocumentId: null,
  documents: new Map(),
  recoveredDrafts: [],
  loading: false,
}

export const documentWorkspace = writable<DocumentWorkspaceState>(initialState)

export const activeWorkspaceDocument = derived(documentWorkspace, ($workspace) =>
  $workspace.activeDocumentId
    ? $workspace.documents.get($workspace.activeDocumentId) ?? null
    : null,
)

export const dirtyDocumentCount = derived(documentWorkspace, ($workspace) => {
  let count = 0
  for (const item of $workspace.documents.values()) {
    if (item.dirty) count += 1
  }
  return count
})

export function workspaceDocumentId(target: DocumentTarget) {
  switch (target.kind) {
    case 'local':
      return `local:${target.sessionId}:${target.entryId}:${target.side}`
    case 'gitWorktree':
      return `worktree:${target.sessionId}:${target.entryId}`
    case 'gitIndex':
      return `index:${target.sessionId}:${target.entryId}`
    case 'scratch':
      return `scratch:${target.sourceSessionId}:${target.sourceEntryId}:${target.sourceSide}`
  }
}

export function setWorkspaceMode(mode: WorkspaceMode) {
  documentWorkspace.update((state) => ({ ...state, mode }))
}

export function getWorkspaceSnapshot() {
  return get(documentWorkspace)
}

export function resetDocumentWorkspace() {
  documentWorkspace.set({ ...initialState, documents: new Map() })
}
