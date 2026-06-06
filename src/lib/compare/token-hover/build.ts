import type { TokenDictionary, TokenHoverEntry, TokenKind } from './types'

/**
 * A single dictionary row: token text, kind chip, description, and an optional
 * reference slug when it differs from the token text. Non-CSS languages share
 * the same card layout but only carry name + kind + description + footer link
 * (no syntax / baseline rows), so this compact tuple is all they need.
 */
export type TokenRow = [name: string, kind: TokenKind, description: string, slug?: string]

/**
 * Builds a dictionary from rows, deriving each entry's footer reference from a
 * per-language URL factory. The factory receives the slug (token text by
 * default) so each language can point at its own documentation site.
 */
export function buildDictionary(
  referenceLabel: string,
  referenceUrl: (slug: string) => string,
  rows: TokenRow[],
): TokenDictionary {
  const dictionary: TokenDictionary = {}
  for (const [name, kind, description, slug] of rows) {
    const entry: TokenHoverEntry = {
      name,
      kind,
      description,
      reference: { label: referenceLabel, url: referenceUrl(slug ?? name) },
    }
    dictionary[name] = entry
  }
  return dictionary
}
