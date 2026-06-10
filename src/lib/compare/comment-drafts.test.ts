import { describe, expect, it } from 'vitest'
import type { DiffLineAnnotation } from '@pierre/diffs'
import { findOpenDraft, isOpenDraft, markDraftSaved } from './comment-drafts'
import type { DifflyCommentAnnotation } from './directory-code-view-comments'

function annotation(
  overrides: Omit<Partial<DiffLineAnnotation<DifflyCommentAnnotation>>, 'metadata'> & {
    metadata?: Partial<DifflyCommentAnnotation>
  } = {},
): DiffLineAnnotation<DifflyCommentAnnotation> {
  return {
    side: 'additions',
    lineNumber: 10,
    ...overrides,
    metadata: {
      id: 'comment-1',
      text: '',
      draft: true,
      ...overrides.metadata,
    },
  } as DiffLineAnnotation<DifflyCommentAnnotation>
}

describe('comment drafts', () => {
  it('finds an open draft at the same side and line', () => {
    const draft = annotation()
    expect(findOpenDraft([draft], 'additions', 10)).toBe(draft)
  })

  it('does not match drafts on other lines or sides', () => {
    const draft = annotation()
    expect(findOpenDraft([draft], 'additions', 11)).toBeNull()
    expect(findOpenDraft([draft], 'deletions', 10)).toBeNull()
  })

  it('treats annotations with empty text as open drafts even without flag', () => {
    const legacyDraft = annotation({ metadata: { draft: undefined } })
    expect(isOpenDraft(legacyDraft)).toBe(true)
    expect(findOpenDraft([legacyDraft], 'additions', 10)).toBe(legacyDraft)
  })

  it('saved comments do not block new drafts at the same line', () => {
    const saved = annotation({ metadata: { text: 'looks good', draft: true } })
    markDraftSaved(saved)

    expect(saved.metadata.draft).toBe(false)
    expect(saved.metadata.savedAt).toBeTruthy()
    expect(findOpenDraft([saved], 'additions', 10)).toBeNull()
  })

  it('allows a new draft after the previous one was removed', () => {
    const saved = annotation({ metadata: { id: 'comment-1', text: 'done', draft: false } })
    const next = annotation({ metadata: { id: 'comment-2' } })
    expect(findOpenDraft([saved, next], 'additions', 10)).toBe(next)
  })
})
