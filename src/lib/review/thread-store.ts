import { derived, writable } from 'svelte/store'
import type { ReviewAuthor, ReviewCommentDraft, ReviewThread } from '../review-types'

export type ReviewThreadFilter = 'open' | 'resolved' | 'outdated' | 'all'

export interface ReviewThreadState {
  sessionId: string | null
  entryId: string | null
  threads: ReviewThread[]
  filter: ReviewThreadFilter
  selectedThreadId: string | null
  loading: boolean
  saving: boolean
  error: string | null
  author: ReviewAuthor
  drafts: Map<string, ReviewCommentDraft>
}

const initialState: ReviewThreadState = {
  sessionId: null,
  entryId: null,
  threads: [],
  filter: 'open',
  selectedThreadId: null,
  loading: false,
  saving: false,
  error: null,
  author: { id: 'local-reviewer', name: 'Local reviewer', avatar: null },
  drafts: new Map(),
}

export const reviewThreads = writable<ReviewThreadState>(initialState)

export const visibleReviewThreads = derived(reviewThreads, ($state) =>
  $state.filter === 'all'
    ? $state.threads
    : $state.threads.filter((thread) => thread.state === $state.filter),
)

export function resetReviewThreads() {
  reviewThreads.set({ ...initialState, drafts: new Map() })
}
