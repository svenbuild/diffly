import { describe, expect, it } from 'vitest'
import type { ComparisonSearchQuery } from '../../../src/lib/search-types'
import { createSearchMatcher, pathMatchesFilter, replaceSearchMatches, validateSafeRegex } from './search-matcher'

const query: ComparisonSearchQuery = {
  text: 'auth',
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  scope: 'all',
  pathFilter: '',
}

describe('workspace search matcher', () => {
  it('supports case insensitive literal matches', () => {
    expect(createSearchMatcher(query)('Auth auth')).toEqual([
      { startColumn: 0, endColumn: 4 },
      { startColumn: 5, endColumn: 9 },
    ])
  })

  it('enforces Unicode-aware whole-word boundaries', () => {
    const matcher = createSearchMatcher({ ...query, text: 'cat', wholeWord: true })
    expect(matcher('cat scatter cat_ cat.')).toEqual([
      { startColumn: 0, endColumn: 3 },
      { startColumn: 17, endColumn: 20 },
    ])
  })

  it('supports regex and rejects high-risk nested repetition', () => {
    const matcher = createSearchMatcher({ ...query, text: 'a(?:b|c)+', regex: true })
    expect(matcher('abcc x')).toEqual([{ startColumn: 0, endColumn: 4 }])
    expect(() => validateSafeRegex('(a+)+$')).toThrow('Nested regex repetition')
    expect(() => validateSafeRegex('(a)\\1')).toThrow('Backreferences')
  })

  it('matches comma-separated glob filters', () => {
    expect(pathMatchesFilter('src/auth/login.ts', 'src/**/*.ts, tests/**')).toBe(true)
    expect(pathMatchesFilter('README.md', 'src/**/*.ts, tests/**')).toBe(false)
  })

  it('expands regex capture groups and treats literal replacement dollars literally', () => {
    expect(replaceSearchMatches('name: Ada', { ...query, text: '(name): (\\w+)', regex: true }, '$2 ($1)')).toEqual({
      contents: 'Ada (name)',
      count: 1,
    })
    expect(replaceSearchMatches('auth', query, '$1')).toEqual({ contents: '$1', count: 1 })
  })
})
