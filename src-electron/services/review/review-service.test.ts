import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DiffSource, ReviewAuthor } from '../../../src/lib/types'
import { DiffSessionService } from '../diff/diff-session-service'
import { LocalProvider } from '../providers/local-provider'
import { ReviewService } from './review-service'
import { ReviewStore } from './review-store'
import { ReviewPreferencesStore } from './review-preferences-store'

const author: ReviewAuthor = { id: 'local-user', name: 'Reviewer', avatar: null }

describe('ReviewService', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'diffly-review-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('persists thread replies and relocates anchors after refresh', async () => {
    const left = join(root, 'left.txt')
    const right = join(root, 'right.txt')
    await writeFile(left, 'one\ntwo\nanchor\nfour\n')
    await writeFile(right, 'one\ntwo changed\nanchor\nfour\n')
    const source: DiffSource = { kind: 'local', compareMode: 'file', leftPath: left, rightPath: right }
    const sessions = new DiffSessionService({ localProvider: new LocalProvider() })
    const session = await sessions.create(source, { ignoreCase: false, ignoreWhitespace: false })
    const service = new ReviewService(
      sessions,
      new ReviewStore(join(root, 'reviews')),
      new ReviewPreferencesStore(join(root, 'reviews')),
    )

    const thread = await service.createThread({
      sessionId: session.sessionId,
      entryId: 'file',
      side: 'additions',
      lineNumber: 3,
      body: 'Please check this.',
      author,
    })
    await service.reply({
      sessionId: session.sessionId,
      threadId: thread.id,
      body: 'Checked.',
      author,
    })
    await writeFile(right, 'inserted\none\ntwo changed\nanchor\nfour\n')
    await sessions.refresh(session.sessionId)

    const [relocated] = await service.listThreads(session.sessionId, 'file')
    expect(relocated?.anchor.lineNumber).toBe(4)
    expect(relocated?.comments).toHaveLength(2)
    expect(relocated?.state).toBe('open')
  })

  it('resolves, reopens, and exports a versioned bundle', async () => {
    const left = join(root, 'left.txt')
    const right = join(root, 'right.txt')
    await writeFile(left, 'old\n')
    await writeFile(right, 'new\n')
    const sessions = new DiffSessionService({ localProvider: new LocalProvider() })
    const session = await sessions.create(
      { kind: 'local', compareMode: 'file', leftPath: left, rightPath: right },
      { ignoreCase: false, ignoreWhitespace: false },
    )
    const service = new ReviewService(
      sessions,
      new ReviewStore(join(root, 'reviews')),
      new ReviewPreferencesStore(join(root, 'reviews')),
    )
    const thread = await service.createThread({
      sessionId: session.sessionId, entryId: 'file', side: 'additions', lineNumber: 1, body: 'Review', author,
    })
    expect((await service.listThreadCounts(session.sessionId)).file).toEqual({
      open: 1, resolved: 0, outdated: 0, total: 1,
    })
    expect((await service.setThreadState(session.sessionId, thread.id, 'resolved')).state).toBe('resolved')
    expect((await service.listThreadCounts(session.sessionId)).file).toEqual({
      open: 0, resolved: 1, outdated: 0, total: 1,
    })
    expect((await service.setThreadState(session.sessionId, thread.id, 'open')).state).toBe('open')
    await service.setDecision(session.sessionId, 'file', {
      oldStart: 1, oldCount: 1, newStart: 1, newCount: 1,
      contextHash: 'a'.repeat(64), changeHash: 'b'.repeat(64),
    }, null, 'needsChanges')
    const exported = await service.export(session.sessionId)
    expect(exported.bundle.schemaVersion).toBe(1)
    expect(exported.markdown).toContain('Reviewer')
    expect(exported.bundle.decisions).toHaveLength(1)
  })

  it('reattaches an outdated thread only to an explicit current line', async () => {
    const left = join(root, 'left.txt')
    const right = join(root, 'right.txt')
    await writeFile(left, 'old\n')
    await writeFile(right, 'first\nanchor\n')
    const sessions = new DiffSessionService({ localProvider: new LocalProvider() })
    const session = await sessions.create(
      { kind: 'local', compareMode: 'file', leftPath: left, rightPath: right },
      { ignoreCase: false, ignoreWhitespace: false },
    )
    const service = new ReviewService(
      sessions,
      new ReviewStore(join(root, 'reviews')),
      new ReviewPreferencesStore(join(root, 'reviews')),
    )
    const thread = await service.createThread({
      sessionId: session.sessionId, entryId: 'file', side: 'additions', lineNumber: 2, body: 'Move me', author,
    })
    await writeFile(right, 'replacement\n')
    await sessions.refresh(session.sessionId)
    expect((await service.listThreads(session.sessionId, 'file'))[0]?.state).toBe('outdated')

    const reattached = await service.reattachThread({
      sessionId: session.sessionId,
      entryId: 'file',
      threadId: thread.id,
      side: 'additions',
      lineNumber: 1,
    })
    expect(reattached.state).toBe('open')
    expect(reattached.anchor.lineNumber).toBe(1)
    expect(reattached.anchor.lineHash).not.toBe(thread.anchor.lineHash)
  })
})
