export type TokenKind =
  | 'property'
  | 'value'
  | 'at-rule'
  | 'pseudo'
  | 'keyword'
  | 'type'
  | 'function'
  | 'constant'
  | 'macro'
  | 'tag'
  | 'attribute'

export interface TokenReference {
  label: string
  url: string
}

export interface TokenHoverEntry {
  name: string
  kind: TokenKind
  description: string
  /** CSS-only: the monospace syntax box (matches the screenshot). */
  syntax?: string
  /** CSS-only: the green "Widely available since …" baseline line. */
  baseline?: string
  /** Footer "Learn more on <label>" link. */
  reference?: TokenReference
}

export type TokenDictionary = Record<string, TokenHoverEntry>
