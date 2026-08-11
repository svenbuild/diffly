import { describe, expect, it } from 'vitest'
import { createReviewAnchor, relocateReviewAnchor } from './review-anchor'

describe('review anchor relocation', () => {
  it('relocates a uniquely matching line and context', () => {
    const anchor = createReviewAnchor({
      contents: 'one\ntwo\nanchor\nfour\nfive\n',
      side: 'additions',
      lineNumber: 3,
      revision: 'old',
    })
    const result = relocateReviewAnchor(anchor, 'inserted\none\ntwo\nanchor\nfour\nfive\n', 'new')
    expect(result.state).toBe('relocated')
    expect(result.anchor.lineNumber).toBe(4)
    expect(result.anchor.revision).toBe('new')
  })

  it('marks ambiguous and missing anchors outdated', () => {
    const anchor = createReviewAnchor({
      contents: 'same\n',
      side: 'deletions',
      lineNumber: 1,
      revision: 'old',
    })
    expect(relocateReviewAnchor(anchor, 'same\nsame\n', 'new').state).toBe('outdated')
    expect(relocateReviewAnchor(anchor, 'gone\n', 'new').state).toBe('outdated')
  })
})
