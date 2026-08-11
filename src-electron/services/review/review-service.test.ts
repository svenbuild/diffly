import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DiffSource, ReviewAuthor } from '../../../src/lib/types'
import { DiffSessionService } from '../diff/diff-session-service'
import { LocalProvider } from '../providers/local-provider'
import { ReviewService } from './review-service'
import { ReviewStore } from './review-store'

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
    const service = new ReviewService(sessions, new ReviewStore(join(root, 'reviews')))

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
    const service = new ReviewService(sessions, new ReviewStore(join(root, 'reviews')))
    const thread = await service.createThread({
      sessionId: session.sessionId, entryId: 'file', side: 'additions', lineNumber: 1, body: 'Review', author,
    })
    expect((await service.setThreadState(session.sessionId, thread.id, 'resolved')).state).toBe('resolved')
    expect((await service.setThreadState(session.sessionId, thread.id, 'open')).state).toBe('open')
    const exported = await service.export(session.sessionId)
    expect(exported.bundle.schemaVersion).toBe(1)
    expect(exported.markdown).toContain('Reviewer')
  })
})
