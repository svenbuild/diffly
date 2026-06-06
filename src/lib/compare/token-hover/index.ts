import { cssTokens } from './css'
import { javascriptTokens } from './javascript'
import { typescriptTokens } from './typescript'
import { htmlTokens } from './html'
import { cTokens } from './c'
import { cppTokens } from './cpp'
import { javaTokens } from './java'
import { rustTokens } from './rust'
import { pythonTokens } from './python'
import { goTokens } from './go'
import type { TokenDictionary, TokenHoverEntry } from './types'

export type { TokenHoverEntry, TokenKind, TokenReference } from './types'

// Maps the language id from getFiletypeFromFileName() (plus a few common
// aliases) to its knowledge dictionary. Languages without a dictionary simply
// resolve to undefined and the hover does nothing.
const DICTIONARIES: Record<string, TokenDictionary> = {
  css: cssTokens,
  javascript: javascriptTokens,
  js: javascriptTokens,
  typescript: typescriptTokens,
  ts: typescriptTokens,
  html: htmlTokens,
  c: cTokens,
  cpp: cppTokens,
  java: javaTokens,
  rust: rustTokens,
  rs: rustTokens,
  python: pythonTokens,
  py: pythonTokens,
  go: goTokens,
}

export function hasTokenDictionary(language: string | null | undefined): boolean {
  return Boolean(language && DICTIONARIES[language])
}

export function lookupToken(
  language: string | null | undefined,
  tokenText: string | null | undefined,
): TokenHoverEntry | null {
  if (!language || !tokenText) {
    return null
  }

  const dictionary = DICTIONARIES[language]
  if (!dictionary) {
    return null
  }

  const key = tokenText.trim()
  if (!key) {
    return null
  }

  const direct = dictionary[key]
  if (direct) {
    return direct
  }

  // CSS authors write properties and at-rules in a canonical lowercase form, so
  // fall back to a case-insensitive match there (e.g. `@Media`, `DISPLAY`).
  if (language === 'css') {
    const lower = key.toLowerCase()
    if (lower !== key && dictionary[lower]) {
      return dictionary[lower]
    }
  }

  return null
}
