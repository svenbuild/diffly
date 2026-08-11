import { describe, expect, it } from 'vitest'
import { parsePatchLineScopes } from './search-service'

describe('parsePatchLineScopes', () => {
  it('tracks added, deleted, and context line coordinates independently', () => {
    const scopes = parsePatchLineScopes([
      'diff --git a/file.ts b/file.ts',
      '@@ -10,3 +20,3 @@',
      ' context',
      '-old',
      '+new',
      ' tail',
    ].join('\n'))

    expect([...scopes.left.context]).toEqual([10, 12])
    expect([...scopes.right.context]).toEqual([20, 22])
    expect([...scopes.left.changed]).toEqual([11])
    expect([...scopes.right.changed]).toEqual([21])
  })
})
