import { get } from 'svelte/store'
import { applyPartialChange, listReviewHunks, openEditableDocument, undoWorkspaceOperation } from '../api'
import type { DocumentTarget } from '../workspace-types'
import type { PartialChangeOperation, PartialChangeSelection } from '../review-types'
import { hunkResolution, hunkSelectionKey } from './hunk-resolution-store'

export class HunkController {
  private loadRevision = 0

  async load(sessionId: string, entryId: string) {
    const revision = ++this.loadRevision
    hunkResolution.update((state) => ({ ...state, loadingEntryId: entryId, error: null }))
    try {
      const hunks = await listReviewHunks(sessionId, entryId)
      if (revision !== this.loadRevision) return hunks
      hunkResolution.update((state) => {
        const hunksByEntry = new Map(state.hunksByEntry)
        hunksByEntry.set(entryId, hunks)
        return { ...state, hunksByEntry, loadingEntryId: null }
      })
      return hunks
    } catch (error) {
      if (revision !== this.loadRevision) return []
      hunkResolution.update((state) => ({
        ...state,
        loadingEntryId: null,
        error: error instanceof Error ? error.message : String(error),
      }))
      return []
    }
  }

  plan(entryId: string, operation: PartialChangeOperation, selection: PartialChangeSelection) {
    hunkResolution.update((state) => {
      const planned = new Map(state.planned)
      const key = hunkSelectionKey(entryId, selection)
      const existing = planned.get(key)
      if (existing?.operation === operation) planned.delete(key)
      else {
        for (const [plannedKey, item] of planned) {
          if (item.entryId === entryId && item.operation !== operation) planned.delete(plannedKey)
        }
        planned.set(key, { entryId, operation, selection })
      }
      return { ...state, planned }
    })
  }

  reset(entryId?: string) {
    hunkResolution.update((state) => ({
      ...state,
      planned: entryId
        ? new Map([...state.planned].filter(([, item]) => item.entryId !== entryId))
        : new Map(),
    }))
  }

  async apply(sessionId: string, entryId: string) {
    const planned = Array.from(get(hunkResolution).planned.values()).filter((item) => item.entryId === entryId)
    if (planned.length === 0) return null
    const operations = new Set(planned.map((item) => item.operation))
    if (operations.size !== 1) throw new Error('Apply one operation direction at a time.')
    const operation = planned[0]!.operation
    hunkResolution.update((state) => ({ ...state, applying: true, error: null }))
    try {
      const revisions = await loadRevisions(sessionId, entryId, operation)
      const result = await applyPartialChange({
        sessionId,
        entryId,
        operation,
        selections: planned.map((item) => item.selection),
        ...revisions,
      })
      this.reset(entryId)
      hunkResolution.update((state) => ({ ...state, applying: false }))
      return result
    } catch (error) {
      hunkResolution.update((state) => ({
        ...state,
        applying: false,
        error: error instanceof Error ? error.message : String(error),
      }))
      throw error
    }
  }

  undo(sessionId: string) {
    return undoWorkspaceOperation(sessionId)
  }
}

export async function loadRevisions(
  sessionId: string,
  entryId: string,
  operation: PartialChangeOperation,
) {
  if (operation.startsWith('apply')) {
    const [left, right] = await Promise.all([
      openEditableDocument({ kind: 'local', sessionId, entryId, side: 'left' }),
      openEditableDocument({ kind: 'local', sessionId, entryId, side: 'right' }),
    ])
    return { leftRevision: left.revision, rightRevision: right.revision }
  }
  const target: DocumentTarget = operation === 'unstage'
    ? { kind: 'gitIndex', sessionId, entryId }
    : { kind: 'gitWorktree', sessionId, entryId }
  const document = await openEditableDocument(target)
  return { leftRevision: null, rightRevision: document.revision }
}

export const workspaceHunkController = new HunkController()
