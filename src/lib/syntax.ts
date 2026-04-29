import Prism from 'prismjs'
import 'prismjs/components/prism-clike'
import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-markup'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-yaml'

import type { DiffSegment } from './types'

const MAX_SYNTAX_LINE_LENGTH = 2000
const SYNTAX_CACHE_LIMIT = 200

type SyntaxLanguage =
  | 'c'
  | 'cpp'
  | 'rust'
  | 'json'
  | 'javascript'
  | 'jsx'
  | 'typescript'
  | 'tsx'
  | 'markup'
  | 'css'
  | 'bash'
  | 'markdown'
  | 'python'
  | 'yaml'

interface SyntaxPiece {
  text: string
  className: string | null
}

export interface RenderedDiffFragment {
  text: string
  highlighted: boolean
  className: string | null
}

const syntaxCache = new Map<string, SyntaxPiece[]>()

export function detectSyntaxLanguage(path: string) {
  const extension = path.toLowerCase().split('.').pop()

  switch (extension) {
    case 'c':
    case 'h':
      return 'c' satisfies SyntaxLanguage
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'hpp':
    case 'hh':
    case 'hxx':
      return 'cpp' satisfies SyntaxLanguage
    case 'rs':
      return 'rust' satisfies SyntaxLanguage
    case 'json':
      return 'json' satisfies SyntaxLanguage
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'javascript' satisfies SyntaxLanguage
    case 'jsx':
      return 'jsx' satisfies SyntaxLanguage
    case 'ts':
    case 'mts':
    case 'cts':
      return 'typescript' satisfies SyntaxLanguage
    case 'tsx':
      return 'tsx' satisfies SyntaxLanguage
    case 'html':
    case 'htm':
    case 'xml':
    case 'svg':
      return 'markup' satisfies SyntaxLanguage
    case 'css':
    case 'scss':
    case 'less':
      return 'css' satisfies SyntaxLanguage
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'bash' satisfies SyntaxLanguage
    case 'md':
    case 'markdown':
      return 'markdown' satisfies SyntaxLanguage
    case 'py':
      return 'python' satisfies SyntaxLanguage
    case 'yml':
    case 'yaml':
      return 'yaml' satisfies SyntaxLanguage
    default:
      return null
  }
}

export function renderDiffFragments(
  text: string,
  segments: DiffSegment[],
  language: SyntaxLanguage | null,
) {
  const diffSegments = normalizeDiffSegments(text, segments)

  if (!language || !text || text.length > MAX_SYNTAX_LINE_LENGTH) {
    return diffSegments.map((segment) => ({
      text: segment.text,
      highlighted: segment.highlighted,
      className: null,
    })) satisfies RenderedDiffFragment[]
  }

  const syntaxPieces = getSyntaxPieces(text, language)

  return mergeFragments(diffSegments, syntaxPieces)
}

function getSyntaxPieces(text: string, language: SyntaxLanguage) {
  const cacheKey = `${language}\u0000${text}`
  const cached = syntaxCache.get(cacheKey)

  if (cached) {
    syntaxCache.delete(cacheKey)
    syntaxCache.set(cacheKey, cached)
    return cached
  }

  const grammar = Prism.languages[language]

  if (!grammar) {
    const plain = [{ text, className: null }] satisfies SyntaxPiece[]
    cacheSyntaxPieces(cacheKey, plain)
    return plain
  }

  const pieces = flattenSyntaxTokens(Prism.tokenize(text, grammar))

  if (pieces.length === 0) {
    const plain = [{ text, className: null }] satisfies SyntaxPiece[]
    cacheSyntaxPieces(cacheKey, plain)
    return plain
  }

  cacheSyntaxPieces(cacheKey, pieces)
  return pieces
}

function cacheSyntaxPieces(cacheKey: string, pieces: SyntaxPiece[]) {
  syntaxCache.set(cacheKey, pieces)

  while (syntaxCache.size > SYNTAX_CACHE_LIMIT) {
    const oldestKey = syntaxCache.keys().next().value
    if (oldestKey === undefined) {
      return
    }

    syntaxCache.delete(oldestKey)
  }
}

function flattenSyntaxTokens(
  tokens: Array<string | Prism.Token>,
  activeClasses: string[] = [],
): SyntaxPiece[] {
  const pieces: SyntaxPiece[] = []

  for (const token of tokens) {
    if (typeof token === 'string') {
      if (!token) {
        continue
      }

      pieces.push({
        text: token,
        className: syntaxClassName(activeClasses),
      })
      continue
    }

    const aliases = Array.isArray(token.alias)
      ? token.alias
      : token.alias
        ? [token.alias]
        : []
    const nextClasses = dedupeClasses([...activeClasses, token.type, ...aliases])
    const content = token.content

    if (typeof content === 'string') {
      if (!content) {
        continue
      }

      pieces.push({
        text: content,
        className: syntaxClassName(nextClasses),
      })
      continue
    }

    const nestedTokens = Array.isArray(content) ? content : [content]
    pieces.push(...flattenSyntaxTokens(nestedTokens, nextClasses))
  }

  return pieces
}

function syntaxClassName(classes: string[]) {
  if (classes.length === 0) {
    return null
  }

  return ['syntax-token', ...classes].join(' ')
}

function dedupeClasses(classes: string[]) {
  return [...new Set(classes.filter(Boolean))]
}

function normalizeDiffSegments(text: string, segments: DiffSegment[]) {
  const normalized = segments.filter((segment) => segment.text.length > 0)

  if (normalized.length === 0) {
    return [{ text, highlighted: false }] satisfies DiffSegment[]
  }

  if (normalized.map((segment) => segment.text).join('') !== text) {
    return [
      {
        text,
        highlighted: normalized.some((segment) => segment.highlighted),
      },
    ] satisfies DiffSegment[]
  }

  return normalized
}

function mergeFragments(diffSegments: DiffSegment[], syntaxPieces: SyntaxPiece[]) {
  const rendered: RenderedDiffFragment[] = []
  let diffIndex = 0
  let syntaxIndex = 0
  let diffOffset = 0
  let syntaxOffset = 0

  while (diffIndex < diffSegments.length && syntaxIndex < syntaxPieces.length) {
    const diffSegment = diffSegments[diffIndex]
    const syntaxPiece = syntaxPieces[syntaxIndex]
    const diffText = diffSegment.text.slice(diffOffset)
    const syntaxText = syntaxPiece.text.slice(syntaxOffset)
    const nextLength = Math.min(diffText.length, syntaxText.length)
    const text = diffText.slice(0, nextLength)

    pushRenderedFragment(rendered, {
      text,
      highlighted: diffSegment.highlighted,
      className: syntaxPiece.className,
    })

    diffOffset += nextLength
    syntaxOffset += nextLength

    if (diffOffset >= diffSegment.text.length) {
      diffIndex += 1
      diffOffset = 0
    }

    if (syntaxOffset >= syntaxPiece.text.length) {
      syntaxIndex += 1
      syntaxOffset = 0
    }
  }

  return rendered
}

function pushRenderedFragment(
  rendered: RenderedDiffFragment[],
  fragment: RenderedDiffFragment,
) {
  if (!fragment.text) {
    return
  }

  const previous = rendered.at(-1)

  if (
    previous &&
    previous.highlighted === fragment.highlighted &&
    previous.className === fragment.className
  ) {
    previous.text += fragment.text
    return
  }

  rendered.push(fragment)
}
