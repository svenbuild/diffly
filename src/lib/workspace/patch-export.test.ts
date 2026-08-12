import { describe, expect, it } from 'vitest'
import { createDocumentPatch } from './patch-export'

describe('createDocumentPatch', () => {
  it('exports a complete portable patch and preserves missing-newline markers', () => {
    const patch = createDocumentPatch('src/app.ts', 'old\n', 'new')
    expect(patch).toContain('diff --git a/src/app.ts b/src/app.ts')
    expect(patch).toContain('@@ -1,1 +1,1 @@')
    expect(patch).toContain('-old\n+new\n\\ No newline at end of file')
  })
})
