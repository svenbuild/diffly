import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { DiffSource } from '../../../src/lib/types'
import { DiffSessionService } from '../diff/diff-session-service'
import { DocumentService } from '../documents/document-service'
import { LocalProvider } from '../providers/local-provider'
import { OperationJournal } from '../review/operation-journal'
import { PartialApplyService } from '../review/partial-apply-service'
import { parsePatchLineScopes, SearchService } from './search-service'

let cleanup: string | null = null
afterEach(async () => {
  if (cleanup) await rm(cleanup, { recursive: true, force: true })
  cleanup = null
})

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

  it('previews, atomically applies, and safely undoes workspace replacements', async () => {
    cleanup = await mkdtemp(join(tmpdir(), 'diffly-replace-all-'))
    const left = join(cleanup, 'left.txt')
    const right = join(cleanup, 'right.txt')
    await writeFile(left, 'auth left\n')
    await writeFile(right, 'auth right\nauth again\n')
    const sessions = new DiffSessionService({ localProvider: new LocalProvider() })
    const source: DiffSource = { kind: 'local', compareMode: 'file', leftPath: left, rightPath: right }
    const session = await sessions.create(source, { ignoreCase: false, ignoreWhitespace: false })
    const documents = new DocumentService(sessions)
    const journal = new OperationJournal(join(cleanup, 'journal'))
    const search = new SearchService(sessions, documents, journal)
    const request = {
      sessionId: session.sessionId,
      query: { text: 'auth', caseSensitive: false, wholeWord: false, regex: false, scope: 'all' as const, pathFilter: '' },
      replacement: 'login',
    }

    const preview = await search.previewReplace(request)
    const rightPreview = preview.files.find((file) => file.target.kind === 'local' && file.target.side === 'right')!
    expect(rightPreview.matchCount).toBe(2)
    const result = await search.replaceAll({
      ...request,
      documents: [{ target: rightPreview.target, expectedRevision: rightPreview.revision }],
    })
    expect(result.ok).toBe(true)
    expect(await readFile(right, 'utf8')).toBe('login right\nlogin again\n')
    expect(await readFile(left, 'utf8')).toBe('auth left\n')

    await new PartialApplyService(sessions, journal).undoLast(session.sessionId)
    expect(await readFile(right, 'utf8')).toBe('auth right\nauth again\n')
  })
})
