import { get } from 'svelte/store'
import { openConflict, resolveConflict, saveDocumentDraft, undoConflictResolution } from '../api'
import { conflictStore } from './conflict-store'

export class ConflictController {
  async open(sessionId: string, entryId: string) {
    conflictStore.set({ document: null, draft: '', renderRevision: 0, loading: true, resolving: false, error: null })
    try {
      const document = await openConflict(sessionId, entryId)
      conflictStore.set({
        document,
        draft: document.markerContents ?? document.workingFile?.contents ?? document.current?.contents ?? document.incoming?.contents ?? '',
        renderRevision: 0,
        loading: false,
        resolving: false,
        error: null,
      })
      return document
    } catch (error) {
      conflictStore.update((state) => ({ ...state, loading: false, error: message(error) }))
      throw error
    }
  }

  updateDraft(contents: string) {
    conflictStore.update((state) => ({ ...state, draft: contents, error: null }))
  }

  replaceDraft(contents: string) {
    conflictStore.update((state) => ({
      ...state,
      draft: contents,
      renderRevision: state.renderRevision + 1,
      error: null,
    }))
  }

  resetDraft() {
    conflictStore.update((state) => ({
      ...state,
      draft: state.document?.markerContents ?? state.document?.workingFile?.contents ??
        state.document?.current?.contents ?? state.document?.incoming?.contents ?? '',
      renderRevision: state.renderRevision + 1,
      error: null,
    }))
  }

  async saveDraft() {
    const state = get(conflictStore)
    const working = state.document?.workingFile
    if (!working) throw new Error('This conflict has no working file draft.')
    return saveDocumentDraft({
      target: working.target,
      contents: state.draft,
      originalRevision: working.revision,
      format: working.format,
      selections: [],
      scrollTop: 0,
    })
  }

  async resolve(sessionId: string, entryId: string, resolution?: 'current' | 'incoming' | 'delete') {
    const state = get(conflictStore)
    if (!state.document) throw new Error('Conflict is not loaded.')
    conflictStore.update((value) => ({ ...value, resolving: true, error: null }))
    try {
      const result = await resolveConflict({
        sessionId,
        entryId,
        expectedRevision: state.document.revision,
        resolution: resolution === 'delete'
          ? { kind: 'delete' }
          : resolution
            ? { kind: 'side', side: resolution }
            : { kind: 'contents', contents: state.draft },
      })
      conflictStore.update((value) => ({ ...value, resolving: false }))
      return result
    } catch (error) {
      conflictStore.update((value) => ({ ...value, resolving: false, error: message(error) }))
      throw error
    }
  }

  undo(sessionId: string) {
    return undoConflictResolution(sessionId)
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export const workspaceConflictController = new ConflictController()
