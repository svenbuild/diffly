import { describe, expect, it } from 'vitest'
import type { ReviewThread } from '../review-types'
import { reviewThreadsToAnnotations } from './directory-code-view-comments'

function thread(state: ReviewThread['state']): ReviewThread {
  return {
    id: `thread-${state}`,
    compareIdentity: 'compare',
    entryIdentity: 'entry',
    anchor: {
      side: 'additions',
      lineNumber: 12,
      revision: 'revision',
      lineHash: 'line',
      contextBefore: ['before'],
      contextAfter: ['after'],
    },
    state,
    comments: [
      {
        id: 'first',
        author: { id: 'reviewer', name: 'Reviewer', avatar: null },
        body: 'First',
        createdAt: '2026-01-01T00:00:00.000Z',
        editedAt: null,
      },
      {
        id: 'reply',
        author: { id: 'reviewer', name: 'Reviewer', avatar: null },
        body: 'Reply',
        createdAt: '2026-01-01T00:01:00.000Z',
        editedAt: null,
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:01:00.000Z',
  }
}

describe('reviewThreadsToAnnotations', () => {
  it('hydrates persisted thread replies into one stable Pierre annotation', () => {
    expect(reviewThreadsToAnnotations([thread('open')])).toEqual([
      expect.objectContaining({
        side: 'additions',
        lineNumber: 12,
        metadata: expect.objectContaining({
          id: 'thread-thread-open',
          threadId: 'thread-open',
          commentId: 'first',
          text: 'First\n\nReply',
          state: 'open',
        }),
      }),
    ])
  })

  it('does not attach outdated threads to an uncertain line', () => {
    expect(reviewThreadsToAnnotations([thread('outdated')])).toEqual([])
  })
})
