import type { ComparisonSearchQuery } from '../../../src/lib/search-types'

const MAX_REGEX_LENGTH = 256
const MAX_MATCHES_PER_LINE = 10_000

export interface LineMatch {
  startColumn: number
  endColumn: number
}

export function createSearchMatcher(query: ComparisonSearchQuery) {
  if (!query.text) throw new Error('Search text must not be empty.')
  if (query.regex) return createRegexMatcher(query)

  const needle = query.caseSensitive ? query.text : query.text.toLocaleLowerCase()
  return (line: string): LineMatch[] => {
    const haystack = query.caseSensitive ? line : line.toLocaleLowerCase()
    const matches: LineMatch[] = []
    let from = 0
    while (matches.length < MAX_MATCHES_PER_LINE) {
      const index = haystack.indexOf(needle, from)
      if (index < 0) break
      const end = index + needle.length
      if (!query.wholeWord || isWordBoundary(line, index, end)) {
        matches.push({ startColumn: index, endColumn: end })
      }
      from = Math.max(end, index + 1)
    }
    return matches
  }
}

export function replaceSearchMatches(line: string, query: ComparisonSearchQuery, replacement: string) {
  if (query.regex) {
    const expression = createRegex(query)
    let count = 0
    return {
      contents: line.replace(expression, (...args: unknown[]) => {
        count += 1
        return expandReplacement(replacement, args)
      }),
      count,
    }
  }
  const matches = createSearchMatcher(query)(line)
  let contents = line
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index]!
    contents = `${contents.slice(0, match.startColumn)}${replacement}${contents.slice(match.endColumn)}`
  }
  return { contents, count: matches.length }
}

function createRegexMatcher(query: ComparisonSearchQuery) {
  const expression = createRegex(query)
  return (line: string): LineMatch[] => {
    expression.lastIndex = 0
    const matches: LineMatch[] = []
    let match: RegExpExecArray | null
    while ((match = expression.exec(line)) && matches.length < MAX_MATCHES_PER_LINE) {
      matches.push({ startColumn: match.index, endColumn: match.index + match[0].length })
      if (match[0].length === 0) expression.lastIndex += 1
    }
    return matches
  }
}

function createRegex(query: ComparisonSearchQuery) {
  validateSafeRegex(query.text)
  const source = query.wholeWord ? `\\b(?:${query.text})\\b` : query.text
  return new RegExp(source, query.caseSensitive ? 'gu' : 'giu')
}

function expandReplacement(replacement: string, args: unknown[]) {
  const match = String(args[0] ?? '')
  const offsetIndex = args.findIndex((value, index) => index > 0 && typeof value === 'number')
  const input = offsetIndex >= 0 ? String(args[offsetIndex + 1] ?? '') : ''
  const offset = offsetIndex >= 0 ? Number(args[offsetIndex]) : 0
  const groups = offsetIndex > 1 ? args.slice(1, offsetIndex) : []
  const named = typeof args.at(-1) === 'object' && args.at(-1) !== null
    ? args.at(-1) as Record<string, string>
    : null
  return replacement.replace(/\$(\$|&|`|'|<[^>]+>|\d{1,2})/g, (token, reference: string) => {
    if (reference === '$') return '$'
    if (reference === '&') return match
    if (reference === '`') return input.slice(0, offset)
    if (reference === "'") return input.slice(offset + match.length)
    if (reference.startsWith('<')) return named?.[reference.slice(1, -1)] ?? token
    const index = Number(reference)
    return index > 0 && index <= groups.length ? String(groups[index - 1] ?? '') : token
  })
}

export function validateSafeRegex(source: string) {
  if (!source || source.length > MAX_REGEX_LENGTH) {
    throw new Error(`Regular expressions must contain 1–${MAX_REGEX_LENGTH} characters.`)
  }
  if (/\\[1-9]/.test(source) || /\(\?<([=!])/.test(source)) {
    throw new Error('Backreferences and lookbehind are not supported in workspace search.')
  }
  if (/\([^)]*(?:\+|\*|\{\d+,?\d*\})[^)]*\)(?:\+|\*|\{)/.test(source)) {
    throw new Error('Nested regex repetition is not supported in workspace search.')
  }
  try {
    void new RegExp(source, 'u')
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Invalid regular expression.')
  }
}

export function pathMatchesFilter(path: string, filter: string) {
  const patterns = filter.split(',').map((item) => item.trim()).filter(Boolean)
  if (patterns.length === 0) return true
  return patterns.some((pattern) => globToRegExp(pattern).test(path))
}

function globToRegExp(glob: string) {
  let source = '^'
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index]
    if (char === '*' && glob[index + 1] === '*') {
      source += '.*'
      index += 1
    } else if (char === '*') {
      source += '[^/]*'
    } else if (char === '?') {
      source += '[^/]'
    } else {
      source += char?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') ?? ''
    }
  }
  return new RegExp(`${source}$`, 'i')
}

function isWordBoundary(line: string, start: number, end: number) {
  const word = /[\p{L}\p{N}_]/u
  return !word.test(line[start - 1] ?? '') && !word.test(line[end] ?? '')
}
