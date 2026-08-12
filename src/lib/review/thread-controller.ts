import { get } from 'svelte/store'
import {
  createReviewThread,
  deleteReviewComment,
  editReviewComment,
  exportReviewBundle,
  getReviewProfile,
  importReviewBundle,
  listReviewDrafts,
  listReviewThreads,
  reopenReviewThread,
  reattachReviewThread,
  replyReviewThread,
  resolveReviewThread,
  saveReviewDraft,
  saveReviewProfile,
  deleteReviewDraft,
} from '../api'
import type { ReviewBundle, ReviewThread } from '../review-types'
import { reviewThreads, type ReviewThreadFilter } from './thread-store'

export class ThreadController {
  private generation = 0
  private draftTimers = new Map<string, number>()

  async load(sessionId: string, entryId?: string) {
    const generation = ++this.generation
    reviewThreads.update((state) => ({
      ...state,
      sessionId,
      entryId: entryId ?? null,
      loading: true,
      error: null,
    }))
    try {
      const [threads, author, drafts] = await Promise.all([
        listReviewThreads(sessionId, entryId),
        getReviewProfile(),
        listReviewDrafts(sessionId),
      ])
      if (generation !== this.generation) return
      reviewThreads.update((state) => ({
        ...state,
        threads,
        author,
        drafts: new Map(drafts.map((draft) => [draft.key, draft])),
        loading: false,
        selectedThreadId: threads.some((thread) => thread.id === state.selectedThreadId)
          ? state.selectedThreadId
          : threads[0]?.id ?? null,
      }))
    } catch (error) {
      if (generation !== this.generation) return
      reviewThreads.update((state) => ({ ...state, loading: false, error: message(error) }))
    }
  }

  setFilter(filter: ReviewThreadFilter) {
    reviewThreads.update((state) => ({ ...state, filter }))
  }

  setAuthor(name: string, avatar: string | null) {
    const author = { ...get(reviewThreads).author, name: name.trim() || 'Local reviewer', avatar }
    reviewThreads.update((state) => ({
      ...state,
      author,
    }))
    void saveReviewProfile(author).catch((error) => {
      reviewThreads.update((state) => ({ ...state, error: message(error) }))
    })
  }

  saveDraft(key: string, body: string) {
    const sessionId = get(reviewThreads).sessionId
    if (!sessionId) return
    const pending = this.draftTimers.get(key)
    if (pending !== undefined) window.clearTimeout(pending)
    this.draftTimers.set(key, window.setTimeout(() => {
      this.draftTimers.delete(key)
      void saveReviewDraft(sessionId, key, body).then((draft) => {
        reviewThreads.update((state) => {
          const drafts = new Map(state.drafts)
          drafts.set(key, draft)
          return { ...state, drafts }
        })
      }).catch((error) => reviewThreads.update((state) => ({ ...state, error: message(error) })))
    }, 400))
  }

  deleteDraft(key: string) {
    const sessionId = get(reviewThreads).sessionId
    if (!sessionId) return
    const pending = this.draftTimers.get(key)
    if (pending !== undefined) window.clearTimeout(pending)
    this.draftTimers.delete(key)
    reviewThreads.update((state) => {
      const drafts = new Map(state.drafts)
      drafts.delete(key)
      return { ...state, drafts }
    })
    void deleteReviewDraft(sessionId, key).catch((error) => {
      reviewThreads.update((state) => ({ ...state, error: message(error) }))
    })
  }

  select(threadId: string) {
    reviewThreads.update((state) => ({ ...state, selectedThreadId: threadId }))
  }

  navigate(direction: 1 | -1) {
    const state = get(reviewThreads)
    const visible = state.filter === 'all'
      ? state.threads
      : state.threads.filter((thread) => thread.state === state.filter)
    if (visible.length === 0) return
    const index = Math.max(0, visible.findIndex((thread) => thread.id === state.selectedThreadId))
    this.select(visible[(index + direction + visible.length) % visible.length]!.id)
  }

  async create(side: 'deletions' | 'additions', lineNumber: number, body: string) {
    const state = get(reviewThreads)
    if (!state.sessionId || !state.entryId) throw new Error('No review entry is selected.')
    return this.mutate(async () => createReviewThread({
      sessionId: state.sessionId!,
      entryId: state.entryId!,
      side,
      lineNumber,
      body,
      author: state.author,
    }))
  }

  async reply(threadId: string, body: string) {
    const state = get(reviewThreads)
    if (!state.sessionId) throw new Error('No review session is active.')
    return this.mutate(() => replyReviewThread({
      sessionId: state.sessionId!, threadId, body, author: state.author,
    }))
  }

  async edit(threadId: string, commentId: string, body: string) {
    const state = get(reviewThreads)
    if (!state.sessionId) throw new Error('No review session is active.')
    return this.mutate(() => editReviewComment(state.sessionId!, threadId, commentId, body))
  }

  async remove(threadId: string, commentId: string) {
    const state = get(reviewThreads)
    if (!state.sessionId) throw new Error('No review session is active.')
    reviewThreads.update((value) => ({ ...value, saving: true, error: null }))
    try {
      const thread = await deleteReviewComment(state.sessionId, threadId, commentId)
      reviewThreads.update((value) => ({
        ...value,
        saving: false,
        threads: thread
          ? replaceThread(value.threads, thread)
          : value.threads.filter((item) => item.id !== threadId),
      }))
      notifyReviewChanged(state.sessionId, state.entryId)
    } catch (error) {
      reviewThreads.update((value) => ({ ...value, saving: false, error: message(error) }))
      throw error
    }
  }

  async resolve(threadId: string) {
    return this.setState(threadId, true)
  }

  async reopen(threadId: string) {
    return this.setState(threadId, false)
  }

  async reattach(threadId: string, side: 'deletions' | 'additions', lineNumber: number) {
    const state = get(reviewThreads)
    if (!state.sessionId || !state.entryId) throw new Error('No review entry is selected.')
    return this.mutate(() => reattachReviewThread({
      sessionId: state.sessionId!,
      entryId: state.entryId!,
      threadId,
      side,
      lineNumber,
    }))
  }

  async export(format: 'json' | 'markdown') {
    const sessionId = get(reviewThreads).sessionId
    if (!sessionId) throw new Error('No review session is active.')
    const result = await exportReviewBundle(sessionId)
    return format === 'json' ? result.json : result.markdown
  }

  async import(bundle: ReviewBundle) {
    const sessionId = get(reviewThreads).sessionId
    if (!sessionId) throw new Error('No review session is active.')
    const threads = await importReviewBundle(sessionId, bundle)
    reviewThreads.update((state) => ({ ...state, threads, error: null }))
    notifyReviewChanged(sessionId, get(reviewThreads).entryId)
  }

  private async setState(threadId: string, resolved: boolean) {
    const sessionId = get(reviewThreads).sessionId
    if (!sessionId) throw new Error('No review session is active.')
    return this.mutate(() => resolved
      ? resolveReviewThread(sessionId, threadId)
      : reopenReviewThread(sessionId, threadId))
  }

  private async mutate(operation: () => Promise<ReviewThread>) {
    reviewThreads.update((state) => ({ ...state, saving: true, error: null }))
    try {
      const thread = await operation()
      reviewThreads.update((state) => ({
        ...state,
        saving: false,
        threads: replaceThread(state.threads, thread),
        selectedThreadId: thread.id,
      }))
      const state = get(reviewThreads)
      notifyReviewChanged(state.sessionId, state.entryId)
      return thread
    } catch (error) {
      reviewThreads.update((state) => ({ ...state, saving: false, error: message(error) }))
      throw error
    }
  }
}

function replaceThread(threads: ReviewThread[], replacement: ReviewThread) {
  const index = threads.findIndex((thread) => thread.id === replacement.id)
  if (index < 0) return [...threads, replacement]
  const next = threads.slice()
  next[index] = replacement
  return next
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function notifyReviewChanged(sessionId: string | null, entryId: string | null) {
  if (!sessionId || typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('diffly:review-changed', {
    detail: { sessionId, entryId },
  }))
}

export const reviewThreadController = new ThreadController()
