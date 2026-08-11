import { get } from 'svelte/store'
import {
  deleteDocumentDraft,
  listDocumentDrafts,
  openEditableDocument,
  saveDocumentDraft,
  saveEditableDocument,
  saveEditableDocuments,
} from '../api'
import type {
  DocumentDraft,
  DocumentTarget,
  EditableDocument,
  MutationResult,
  SaveDocumentResult,
} from '../workspace-types'
import {
  documentWorkspace,
  workspaceDocumentId,
  type WorkspaceDocumentState,
} from './document-store'
import { DraftController } from './draft-controller'

interface DocumentApi {
  open(target: DocumentTarget): Promise<EditableDocument>
  save(request: Parameters<typeof saveEditableDocument>[0]): ReturnType<typeof saveEditableDocument>
  saveAll(request: Parameters<typeof saveEditableDocuments>[0]): ReturnType<typeof saveEditableDocuments>
  listDrafts: typeof listDocumentDrafts
  saveDraft: typeof saveDocumentDraft
  deleteDraft: typeof deleteDocumentDraft
}

const defaultApi: DocumentApi = {
  open: openEditableDocument,
  save: saveEditableDocument,
  saveAll: saveEditableDocuments,
  listDrafts: listDocumentDrafts,
  saveDraft: saveDocumentDraft,
  deleteDraft: deleteDocumentDraft,
}

export class DocumentController {
  private readonly api: DocumentApi
  private readonly drafts: DraftController

  constructor(api: DocumentApi = defaultApi) {
    this.api = api
    this.drafts = new DraftController(api)
  }

  async open(target: DocumentTarget) {
    const id = workspaceDocumentId(target)
    const existing = get(documentWorkspace).documents.get(id)
    if (existing) {
      documentWorkspace.update((state) => ({ ...state, activeDocumentId: id, mode: 'edit' }))
      return existing
    }

    documentWorkspace.update((state) => ({ ...state, loading: true }))
    try {
      const document = await this.api.open(target)
      const item = workspaceStateFromDocument(document)
      documentWorkspace.update((state) => {
        const documents = new Map(state.documents)
        documents.set(id, item)
        return { ...state, documents, activeDocumentId: id, loading: false, mode: 'edit' }
      })
      return item
    } catch (error) {
      documentWorkspace.update((state) => ({ ...state, loading: false }))
      throw error
    }
  }

  updateContents(id: string, contents: string, editorState?: {
    selections?: DocumentDraft['selections']
    scrollTop?: number
  }) {
    let updated: WorkspaceDocumentState | null = null
    documentWorkspace.update((state) => {
      const current = state.documents.get(id)
      if (!current) return state
      updated = {
        ...current,
        contents,
        dirty: contents !== current.document.contents,
        error: null,
        selections: editorState?.selections ?? current.selections,
        scrollTop: editorState?.scrollTop ?? current.scrollTop,
      }
      const documents = new Map(state.documents)
      documents.set(id, updated)
      return { ...state, documents }
    })
    if (updated) this.drafts.schedule(updated)
  }

  async save(id: string) {
    const current = get(documentWorkspace).documents.get(id)
    if (!current || !current.dirty) return null
    this.patch(id, { saving: true, error: null })
    let result: MutationResult<SaveDocumentResult>
    try {
      result = await this.api.save({
        target: current.document.target,
        contents: current.contents,
        expectedRevision: current.document.revision,
      })
    } catch (error) {
      this.patch(id, { saving: false, error: message(error) })
      throw error
    }
    if (!result.ok) {
      this.patch(id, { saving: false, error: result.error.code })
      return result
    }
    this.replaceSaved(id, result.value.document)
    return result
  }

  async saveAll() {
    const dirty = Array.from(get(documentWorkspace).documents.values()).filter((item) => item.dirty)
    if (dirty.length === 0) return null
    for (const item of dirty) this.patch(item.id, { saving: true, error: null })
    const result = await this.api.saveAll({
      documents: dirty.map((item) => ({
        target: item.document.target,
        contents: item.contents,
        expectedRevision: item.document.revision,
      })),
    })
    if (!result.ok) {
      for (const item of dirty) this.patch(item.id, { saving: false, error: result.error.code })
      return result
    }
    result.value.forEach((document, index) => {
      const item = dirty[index]
      if (item) this.replaceSaved(item.id, document)
    })
    return result
  }

  async loadRecoveryIndex() {
    const recoveredDrafts = await this.api.listDrafts()
    documentWorkspace.update((state) => ({ ...state, recoveredDrafts }))
    return recoveredDrafts
  }

  markExternalChange(id: string) {
    this.patch(id, { externalChanged: true })
  }

  focusMatch(target: DocumentTarget, lineNumber: number, startColumn: number, endColumn: number) {
    const id = workspaceDocumentId(target)
    documentWorkspace.update((state) => {
      const current = state.documents.get(id)
      if (!current) return state
      const documents = new Map(state.documents)
      documents.set(id, {
        ...current,
        selections: [{
          start: { line: Math.max(0, lineNumber - 1), character: startColumn },
          end: { line: Math.max(0, lineNumber - 1), character: endColumn },
          direction: 1,
        }],
        focusRevision: current.focusRevision + 1,
      })
      return { ...state, documents, activeDocumentId: id, mode: 'edit' }
    })
  }

  close(id: string, discard = false) {
    const current = get(documentWorkspace).documents.get(id)
    if (!current || (current.dirty && !discard)) return false
    this.drafts.cancel(id)
    documentWorkspace.update((state) => {
      const documents = new Map(state.documents)
      documents.delete(id)
      return {
        ...state,
        documents,
        activeDocumentId: state.activeDocumentId === id
          ? documents.keys().next().value ?? null
          : state.activeDocumentId,
      }
    })
    return true
  }

  dispose() {
    this.drafts.dispose()
  }

  private replaceSaved(id: string, document: EditableDocument) {
    this.drafts.cancel(id)
    documentWorkspace.update((state) => {
      const current = state.documents.get(id)
      if (!current) return state
      const documents = new Map(state.documents)
      documents.set(id, {
        ...current,
        document,
        contents: document.contents,
        dirty: false,
        saving: false,
        externalChanged: false,
        error: null,
      })
      return { ...state, documents }
    })
  }

  private patch(id: string, patch: Partial<WorkspaceDocumentState>) {
    documentWorkspace.update((state) => {
      const current = state.documents.get(id)
      if (!current) return state
      const documents = new Map(state.documents)
      documents.set(id, { ...current, ...patch })
      return { ...state, documents }
    })
  }
}

function workspaceStateFromDocument(document: EditableDocument): WorkspaceDocumentState {
  return {
    id: workspaceDocumentId(document.target),
    document,
    contents: document.contents,
    dirty: false,
    saving: false,
    externalChanged: false,
    error: null,
    selections: [],
    scrollTop: 0,
    focusRevision: 0,
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export const workspaceDocumentController = new DocumentController()
