import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'
import { DocumentController } from './document-controller'
import { documentWorkspace, workspaceDocumentId } from './document-store'
import type { DocumentTarget, EditableDocument } from '../workspace-types'

const target = (entryId: string): DocumentTarget => ({ kind: 'local', sessionId: 'test', entryId, side: 'right' })
function documentFor(target: DocumentTarget): EditableDocument {
  return {
    target, name: 'file.ts', displayPath: 'file.ts', contents: 'original',
    cacheKey: workspaceDocumentId(target), readOnly: false,
    revision: { sha256: 'hash', size: 8, modifiedNs: null, gitOid: null, indexOid: null },
    format: { encoding: 'utf8', lineEnding: 'lf', hasTrailingNewline: false, mode: null },
  }
}
function controllerWithPendingReads() {
  const pending = new Map<string, () => void>()
  const api = {
    open: (target: DocumentTarget) => new Promise<EditableDocument>(resolve =>
      pending.set(workspaceDocumentId(target), () => resolve(documentFor(target)))),
  } as ConstructorParameters<typeof DocumentController>[0]
  return { controller: new DocumentController(api), finish: (target: DocumentTarget) => pending.get(workspaceDocumentId(target))!() }
}
beforeEach(() => documentWorkspace.set({
  mode: 'review', activeDocumentId: null, documents: new Map(), recoveredDrafts: [], loading: false,
}))
afterEach(() => vi.unstubAllGlobals())
describe('document switching', () => {
  it('preserves edits made while a save is in flight', async () => {
    vi.stubGlobal('window', { setTimeout, clearTimeout })
    let completeSave!: () => void
    const document = documentFor(target('first'))
    const api = {
      open: async () => document,
      save: (request: { contents: string }) => new Promise(resolve => {
        completeSave = () => resolve({ ok: true, value: { document: { ...document, contents: request.contents } } })
      }),
      saveDraft: async () => {}, deleteDraft: async () => {},
    } as unknown as ConstructorParameters<typeof DocumentController>[0]
    const controller = new DocumentController(api)
    const state = await controller.open(document.target)
    controller.updateContents(state.id, 'saved draft')
    const saving = controller.save(state.id)
    controller.updateContents(state.id, 'newer unsaved draft')
    completeSave()
    await saving
    expect(get(documentWorkspace).documents.get(state.id)).toMatchObject({
      contents: 'newer unsaved draft', dirty: true, saving: false,
      document: { contents: 'saved draft' },
    })
    controller.dispose()
  })
  it('keeps the most recently selected file active when reads finish out of order', async () => {
    const { controller, finish } = controllerWithPendingReads()
    const first = controller.open(target('first'))
    const second = controller.open(target('second'))
    finish(target('second')); await second
    finish(target('first')); await first
    expect(get(documentWorkspace).activeDocumentId).toBe(workspaceDocumentId(target('second')))
    expect(get(documentWorkspace).documents.size).toBe(2)
    controller.dispose()
  })
  it('does not return to edit mode after the user turns editing off', async () => {
    const { controller, finish } = controllerWithPendingReads()
    const opening = controller.open(target('first'))
    controller.cancelPendingOpen()
    finish(target('first')); await opening
    expect(get(documentWorkspace).mode).toBe('review')
    expect(get(documentWorkspace).activeDocumentId).toBeNull()
    controller.dispose()
  })
})
