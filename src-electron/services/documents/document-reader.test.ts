import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { DocumentFormat, DocumentTarget } from '../../../src/lib/workspace-types'
import {
  decodeDocument,
  detectLineEnding,
  encodeDocument,
  readLocalDocument,
  UnsupportedDocumentEncodingError,
} from './document-reader'
import { revisionsEqual } from './document-revision'
import { StaleDocumentError, writeLocalDocument } from './document-writer'

const target: DocumentTarget = {
  kind: 'local',
  sessionId: 'session',
  entryId: 'entry',
  side: 'right',
}

describe('document encoding and revisions', () => {
  const roots: string[] = []

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  })

  for (const encoding of ['utf8', 'utf8-bom', 'utf16le', 'utf16be'] as const) {
    it(`round-trips ${encoding}, BOM, CRLF, and trailing newline`, () => {
      const format: DocumentFormat = {
        encoding,
        lineEnding: 'crlf',
        hasTrailingNewline: true,
        mode: 0o644,
      }
      const bytes = encodeDocument('alpha\nbeta\n', format)
      const decoded = decodeDocument(bytes)
      expect(decoded.encoding).toBe(encoding)
      expect(decoded.contents).toBe('alpha\r\nbeta\r\n')
      expect(detectLineEnding(decoded.contents)).toBe('crlf')
    })
  }

  it('rejects invalid legacy byte sequences instead of corrupting them', () => {
    expect(() => decodeDocument(Uint8Array.from([0xc3, 0x28]))).toThrow(
      UnsupportedDocumentEncodingError,
    )
  })

  it('changes the content-sensitive cache key after a save', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffly-document-'))
    roots.push(root)
    const path = join(root, 'file.txt')
    await writeFile(path, 'before\n')
    const opened = await readLocalDocument({ path, target })
    const saved = await writeLocalDocument({
      path,
      target,
      contents: 'after\n',
      expectedRevision: opened.revision,
      originalFormat: opened.format,
    })

    expect(saved.cacheKey).not.toBe(opened.cacheKey)
    expect(revisionsEqual(saved.revision, opened.revision)).toBe(false)
    expect(await readFile(path, 'utf8')).toBe('after\n')
  })

  it('fails closed with the current revision after an external change', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffly-document-stale-'))
    roots.push(root)
    const path = join(root, 'file.txt')
    await writeFile(path, 'loaded\n')
    const opened = await readLocalDocument({ path, target })
    await writeFile(path, 'external\n')

    const error = await writeLocalDocument({
      path,
      target,
      contents: 'draft\n',
      expectedRevision: opened.revision,
      originalFormat: opened.format,
    }).catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(StaleDocumentError)
    expect((error as StaleDocumentError).currentRevision.sha256).not.toBe(opened.revision.sha256)
    expect(await readFile(path, 'utf8')).toBe('external\n')
  })

  it('creates a missing session target and rejects an externally created replacement', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffly-document-create-'))
    roots.push(root)
    const path = join(root, 'restored.txt')
    const missing = await readLocalDocument({ path, target })
    expect(missing.contents).toBe('')
    expect(missing.revision.modifiedNs).toBeNull()

    const created = await writeLocalDocument({
      path,
      target,
      contents: 'restored\n',
      expectedRevision: missing.revision,
      originalFormat: missing.format,
    })
    expect(await readFile(path, 'utf8')).toBe('restored\n')
    expect(created.revision.modifiedNs).not.toBeNull()

    const secondPath = join(root, 'new.txt')
    const secondMissing = await readLocalDocument({ path: secondPath, target })
    await writeFile(secondPath, 'external\n')
    await expect(writeLocalDocument({
      path: secondPath,
      target,
      contents: 'draft\n',
      expectedRevision: secondMissing.revision,
      originalFormat: secondMissing.format,
    })).rejects.toBeInstanceOf(StaleDocumentError)
    expect(await readFile(secondPath, 'utf8')).toBe('external\n')
  })
})
