import { get } from 'svelte/store'
import {
  deleteDocumentDraft,
  listDocumentDrafts,
  loadDocumentDraft,
  openEditableDocument,
  saveDocumentDraft,
  saveEditableDocument,
  saveEditableDocumentAs,
  saveEditableDocuments,
  watchEditableDocument,
  unwatchEditableDocument,
  onEditableDocumentExternalChange,
} from '../api'
import type {
  DocumentDraft,
  DocumentTarget,
  DocumentFormat,
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
  saveAs: typeof saveEditableDocumentAs
  listDrafts: typeof listDocumentDrafts
  saveDraft: typeof saveDocumentDraft
  deleteDraft: typeof deleteDocumentDraft
  loadDraft: typeof loadDocumentDraft
  watch?: typeof watchEditableDocument
  unwatch?: typeof unwatchEditableDocument
  onExternalChange?: typeof onEditableDocumentExternalChange
}

const defaultApi: DocumentApi = {
  open: openEditableDocument,
  save: saveEditableDocument,
  saveAll: saveEditableDocuments,
  saveAs: saveEditableDocumentAs,
  listDrafts: listDocumentDrafts,
  saveDraft: saveDocumentDraft,
  deleteDraft: deleteDocumentDraft,
  loadDraft: loadDocumentDraft,
  watch: watchEditableDocument,
  unwatch: unwatchEditableDocument,
  onExternalChange: onEditableDocumentExternalChange,
}

export class DocumentController {
  private readonly api: DocumentApi
  private readonly drafts: DraftController
  private unsubscribeExternal: (() => void) | null = null

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
      await this.api.watch?.(target).catch(() => false)
      this.ensureExternalSubscription()
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
        dirty: contents !== current.document.contents || !formatsEqual(current.format, current.document.format),
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
        format: current.format,
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
    const writable = dirty.filter((item) => !item.document.readOnly && item.document.target.kind !== 'scratch')
    const copies = dirty.filter((item) => !writable.includes(item))
    const result = writable.length > 0 ? await this.api.saveAll({
      documents: writable.map((item) => ({
        target: item.document.target,
        contents: item.contents,
        expectedRevision: item.document.revision,
        format: item.format,
      })),
    }) : { ok: true as const, value: [] }
    if (!result.ok) {
      for (const item of dirty) this.patch(item.id, { saving: false, error: result.error.code })
      return result
    }
    result.value.forEach((document, index) => {
      const item = writable[index]
      if (item) this.replaceSaved(item.id, document)
    })
    for (const item of copies) {
      const exported = await this.saveAs(item.id)
      if (exported?.canceled) {
        for (const pending of copies) this.patch(pending.id, { saving: false })
        return { ok: false as const, error: { code: 'READ_ONLY_SOURCE' as const } }
      }
    }
    return result
  }

  async saveAs(id: string) {
    const current = get(documentWorkspace).documents.get(id)
    if (!current) return null
    this.patch(id, { saving: true, error: null })
    try {
      const result = await this.api.saveAs({
        target: current.document.target,
        contents: current.contents,
        format: current.format,
        suggestedName: current.document.name,
      })
      if (!result.canceled) {
        this.drafts.cancel(id)
        documentWorkspace.update((state) => {
          const item = state.documents.get(id)
          if (!item) return state
          const documents = new Map(state.documents)
          documents.set(id, {
            ...item,
            document: { ...item.document, contents: item.contents, format: item.format },
            dirty: false,
            saving: false,
          })
          return { ...state, documents }
        })
      } else {
        this.patch(id, { saving: false })
      }
      return result
    } catch (error) {
      this.patch(id, { saving: false, error: message(error) })
      throw error
    }
  }

  async loadRecoveryIndex() {
    const recoveredDrafts = await this.api.listDrafts()
    documentWorkspace.update((state) => ({ ...state, recoveredDrafts }))
    return recoveredDrafts
  }

  updateFormat(id: string, patch: Partial<Pick<DocumentFormat, 'encoding' | 'lineEnding' | 'hasTrailingNewline'>>) {
    documentWorkspace.update((state) => {
      const current = state.documents.get(id)
      if (!current) return state
      const format = { ...current.format, ...patch }
      const documents = new Map(state.documents)
      const item = {
        ...current,
        format,
        dirty: current.contents !== current.document.contents || !formatsEqual(format, current.document.format),
      }
      documents.set(id, item)
      this.drafts.schedule(item)
      return { ...state, documents }
    })
  }

  async restoreDraft(id: string, sessionId: string) {
    const draft = await this.api.loadDraft(id)
    if (!draft) return null
    const target = remapDraftTarget(draft.target, sessionId)
    let document: EditableDocument
    let externalDocument: EditableDocument | null = null
    try {
      document = await this.api.open(target)
      if (!revisionsEqual(document.revision, draft.originalRevision)) externalDocument = document
    } catch {
      document = {
        target,
        name: draftEntryName(target),
        displayPath: draftEntryName(target),
        contents: '',
        revision: draft.originalRevision,
        format: draft.format,
        readOnly: true,
        cacheKey: `recovered:${draft.id}:${draft.originalRevision.sha256}`,
      }
    }
    const item: WorkspaceDocumentState = {
      id: workspaceDocumentId(target),
      document,
      format: draft.format,
      contents: draft.contents,
      dirty: draft.contents !== document.contents || !formatsEqual(draft.format, document.format),
      saving: false,
      externalChanged: externalDocument !== null,
      externalDocument,
      error: null,
      selections: draft.selections,
      scrollTop: draft.scrollTop,
      focusRevision: 0,
    }
    documentWorkspace.update((state) => {
      const documents = new Map(state.documents)
      documents.set(item.id, item)
      return {
        ...state,
        documents,
        activeDocumentId: item.id,
        mode: 'edit',
        recoveredDrafts: state.recoveredDrafts.filter((summary) => summary.id !== id),
      }
    })
    await this.api.deleteDraft(id)
    if (item.dirty) this.drafts.schedule(item)
    await this.api.watch?.(target).catch(() => false)
    this.ensureExternalSubscription()
    return item
  }

  async discardRecoveredDrafts(ids: string[]) {
    await Promise.all(ids.map((id) => this.api.deleteDraft(id)))
    documentWorkspace.update((state) => ({
      ...state,
      recoveredDrafts: state.recoveredDrafts.filter((draft) => !ids.includes(draft.id)),
    }))
  }

  async saveRecoveredDraftCopies(ids: string[]) {
    for (const id of ids) {
      const draft = await this.api.loadDraft(id)
      if (!draft) continue
      const result = await this.api.saveAs({
        target: draft.target,
        contents: draft.contents,
        format: draft.format,
        suggestedName: draftEntryName(draft.target),
      })
      if (result.canceled) return false
      await this.api.deleteDraft(id)
    }
    documentWorkspace.update((state) => ({ ...state, recoveredDrafts: [] }))
    return true
  }

  markExternalChange(id: string) {
    this.patch(id, { externalChanged: true })
  }

  async handleExternalChange(target: DocumentTarget) {
    const id = workspaceDocumentId(target)
    const current = get(documentWorkspace).documents.get(id)
    if (!current) return
    try {
      const externalDocument = await this.api.open(target)
      if (revisionsEqual(externalDocument.revision, current.document.revision)) return
      if (current.dirty) {
        this.patch(id, { externalChanged: true, externalDocument })
      } else {
        this.replaceExternal(id, externalDocument)
      }
    } catch {
      this.patch(id, { externalChanged: true, externalDocument: null })
    }
  }

  async reloadExternal(id: string) {
    const current = get(documentWorkspace).documents.get(id)
    if (!current) return
    const document = current.externalDocument ?? await this.api.open(current.document.target)
    this.drafts.cancel(id)
    this.replaceExternal(id, document)
  }

  keepDraft(id: string) {
    this.patch(id, { externalChanged: false })
  }

  async overwrite(id: string) {
    const current = get(documentWorkspace).documents.get(id)
    if (!current?.externalDocument) return null
    this.patch(id, { saving: true, error: null })
    const result = await this.api.save({
      target: current.document.target,
      contents: current.contents,
      expectedRevision: current.externalDocument.revision,
      overwrite: true,
    })
    if (result.ok) this.replaceSaved(id, result.value.document)
    else this.patch(id, { saving: false, error: result.error.code })
    return result
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
    void this.api.unwatch?.(current.document.target).catch(() => undefined)
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
    this.unsubscribeExternal?.()
    this.unsubscribeExternal = null
    for (const item of get(documentWorkspace).documents.values()) {
      void this.api.unwatch?.(item.document.target).catch(() => undefined)
    }
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
        format: document.format,
        contents: document.contents,
        dirty: false,
        saving: false,
        externalChanged: false,
        externalDocument: null,
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

  private replaceExternal(id: string, document: EditableDocument) {
    documentWorkspace.update((state) => {
      const current = state.documents.get(id)
      if (!current) return state
      const documents = new Map(state.documents)
      documents.set(id, {
        ...current,
        document,
        contents: document.contents,
        format: document.format,
        dirty: false,
        externalChanged: false,
        externalDocument: null,
      })
      return { ...state, documents }
    })
  }

  private ensureExternalSubscription() {
    if (this.unsubscribeExternal || !this.api.onExternalChange) return
    this.unsubscribeExternal = this.api.onExternalChange((change) => {
      void this.handleExternalChange(change.target)
    })
  }
}

function workspaceStateFromDocument(document: EditableDocument): WorkspaceDocumentState {
  return {
    id: workspaceDocumentId(document.target),
    document,
    contents: document.contents,
    format: document.format,
    dirty: false,
    saving: false,
    externalChanged: false,
    externalDocument: null,
    error: null,
    selections: [],
    scrollTop: 0,
    focusRevision: 0,
  }
}

function remapDraftTarget(target: DocumentTarget, sessionId: string): DocumentTarget {
  switch (target.kind) {
    case 'local': return { ...target, sessionId }
    case 'gitWorktree': return { ...target, sessionId }
    case 'gitIndex': return { ...target, sessionId }
    case 'scratch': return { ...target, sourceSessionId: sessionId }
  }
}

function draftEntryName(target: DocumentTarget) {
  return target.kind === 'scratch' ? target.sourceEntryId : target.entryId
}

function revisionsEqual(left: EditableDocument['revision'], right: EditableDocument['revision']) {
  return left.sha256 === right.sha256 && left.size === right.size &&
    left.modifiedNs === right.modifiedNs && left.gitOid === right.gitOid && left.indexOid === right.indexOid
}

function formatsEqual(left: DocumentFormat, right: DocumentFormat) {
  return left.encoding === right.encoding && left.lineEnding === right.lineEnding &&
    left.hasTrailingNewline === right.hasTrailingNewline && left.mode === right.mode
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export const workspaceDocumentController = new DocumentController()
