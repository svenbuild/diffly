import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DocumentDraft } from '../../../src/lib/workspace-types'
import { DocumentDraftStore } from './document-draft-store'

describe('DocumentDraftStore', () => {
  let root: string
  let store: DocumentDraftStore

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'diffly-drafts-'))
    store = new DocumentDraftStore(root)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('persists and removes restart-safe drafts', async () => {
    const summary = await store.save(draft())
    expect((await store.list()).map((item) => item.id)).toEqual([summary.id])
    expect((await new DocumentDraftStore(root).load(summary.id))?.contents).toBe('unsaved')

    await store.remove(summary.id)
    expect(await store.list()).toEqual([])
    expect(await store.load(summary.id)).toBeNull()
  })

  it('serializes concurrent writes without losing manifest entries', async () => {
    await Promise.all([
      store.save(draft('left')),
      store.save({
        ...draft('right'),
        target: {
          kind: 'local',
          sessionId: 'session',
          entryId: 'other',
          side: 'right',
        },
      }),
    ])
    expect(await store.list()).toHaveLength(2)
  })

  it('quarantines a corrupt draft instead of overwriting it', async () => {
    const summary = await store.save(draft())
    const draftPath = join(root, `${summary.id}.draft`)
    const { writeFile } = await import('node:fs/promises')
    await writeFile(draftPath, '{broken')
    await expect(store.load(summary.id)).rejects.toThrow()
    expect((await readdir(root)).some((name) => name.startsWith(`${summary.id}.draft.corrupt-`))).toBe(true)
  })
})

function draft(contents = 'unsaved'): Omit<DocumentDraft, 'schemaVersion' | 'id' | 'updatedAt'> {
  return {
    target: {
      kind: 'local',
      sessionId: 'session',
      entryId: 'entry',
      side: 'left',
    },
    contents,
    originalRevision: {
      sha256: 'a'.repeat(64),
      size: 6,
      modifiedNs: '1',
      gitOid: null,
      indexOid: null,
    },
    format: {
      encoding: 'utf8',
      lineEnding: 'lf',
      hasTrailingNewline: false,
      mode: 0o644,
    },
    selections: [],
    scrollTop: 0,
  }
}
