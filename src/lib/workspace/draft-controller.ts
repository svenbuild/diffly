import type { WorkspaceDocumentState } from './document-store'
import type { SaveDraftRequest } from '../workspace-types'

interface DraftApi {
  saveDraft(draft: SaveDraftRequest): Promise<unknown>
  deleteDraft(id: string): Promise<void>
}

export class DraftController {
  private readonly timers = new Map<string, number>()
  private readonly api: DraftApi
  private readonly delayMs: number

  constructor(api: DraftApi, delayMs = 750) {
    this.api = api
    this.delayMs = delayMs
  }

  schedule(state: WorkspaceDocumentState) {
    this.cancel(state.id)
    if (!state.dirty) return
    const timer = window.setTimeout(() => {
      this.timers.delete(state.id)
      void this.persist(state)
    }, this.delayMs)
    this.timers.set(state.id, timer)
  }

  persist(state: WorkspaceDocumentState) {
    return this.api.saveDraft({
      target: state.document.target,
      contents: state.contents,
      originalRevision: state.document.revision,
      format: {
        ...state.format,
        hasTrailingNewline: /(?:\r\n|\r|\n)$/.test(state.contents),
      },
      selections: state.selections,
      scrollTop: state.scrollTop,
    })
  }

  async remove(id: string, persistedId?: string) {
    this.cancel(id)
    if (persistedId) await this.api.deleteDraft(persistedId)
  }

  cancel(id: string) {
    const timer = this.timers.get(id)
    if (timer !== undefined) window.clearTimeout(timer)
    this.timers.delete(id)
  }

  dispose() {
    for (const id of this.timers.keys()) this.cancel(id)
  }
}
