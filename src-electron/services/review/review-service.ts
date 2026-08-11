import { createHash, randomUUID } from 'node:crypto'
import type {
  CreateReviewThreadRequest,
  ReplyReviewThreadRequest,
  ReviewAuthor,
  ReviewBundle,
  ReviewComment,
  ReviewThread,
  HunkFingerprint,
  ReviewDecisionStatus,
} from '../../../src/lib/review-types'
import type { DiffSessionService } from '../diff/diff-session-service'
import { createReviewAnchor, relocateReviewAnchor } from './review-anchor'
import { ReviewStore } from './review-store'
import type { ReviewPreferencesStore } from './review-preferences-store'

export class ReviewService {
  private readonly sessions: DiffSessionService
  private readonly store: ReviewStore
  private readonly preferences: ReviewPreferencesStore | null

  constructor(sessions: DiffSessionService, store: ReviewStore, preferences: ReviewPreferencesStore | null = null) {
    this.sessions = sessions
    this.store = store
    this.preferences = preferences
  }

  async listThreads(sessionId: string, entryId?: string) {
    const compareIdentity = this.compareIdentity(sessionId)
    const file = await this.store.read(compareIdentity)
    if (!entryId) return file.threads
    const entryIdentity = this.entryIdentity(sessionId, entryId)
    const threads = file.threads.filter((thread) => thread.entryIdentity === entryIdentity)
    if (threads.length === 0) return threads
    const diff = await this.sessions.openEntryForSearch(sessionId, entryId)
    const changed = relocateThreads(threads, diff)
    if (changed) {
      await this.store.update(compareIdentity, (allThreads) => {
        const updates = new Map(threads.map((thread) => [thread.id, thread]))
        return allThreads.map((thread) => updates.get(thread.id) ?? thread)
      })
    }
    return threads
  }

  async createThread(request: CreateReviewThreadRequest) {
    validateBody(request.body)
    validateAuthor(request.author)
    const diff = await this.sessions.openEntryForSearch(request.sessionId, request.entryId)
    const side = reviewSide(diff, request.side)
    const now = new Date().toISOString()
    const thread: ReviewThread = {
      id: randomUUID(),
      compareIdentity: this.compareIdentity(request.sessionId),
      entryIdentity: this.entryIdentity(request.sessionId, request.entryId),
      anchor: createReviewAnchor({
        contents: side.contents,
        side: request.side,
        lineNumber: request.lineNumber,
        revision: side.revision,
      }),
      state: 'open',
      comments: [createComment(request.author, request.body, now)],
      createdAt: now,
      updatedAt: now,
    }
    await this.store.update(thread.compareIdentity, (threads) => {
      threads.push(thread)
    })
    return thread
  }

  async reply(request: ReplyReviewThreadRequest) {
    validateBody(request.body)
    validateAuthor(request.author)
    return this.mutateThread(request.sessionId, request.threadId, (thread) => {
      const now = new Date().toISOString()
      thread.comments.push(createComment(request.author, request.body, now))
      thread.updatedAt = now
    })
  }

  editComment(sessionId: string, threadId: string, commentId: string, body: string) {
    validateBody(body)
    return this.mutateThread(sessionId, threadId, (thread) => {
      const comment = thread.comments.find((item) => item.id === commentId)
      if (!comment) throw new Error('Review comment was not found.')
      comment.body = body
      comment.editedAt = new Date().toISOString()
      thread.updatedAt = comment.editedAt
    })
  }

  async deleteComment(sessionId: string, threadId: string, commentId: string) {
    const compareIdentity = this.compareIdentity(sessionId)
    let result: ReviewThread | null = null
    await this.store.update(compareIdentity, (threads) => {
      const thread = threads.find((item) => item.id === threadId)
      if (!thread) throw new Error('Review thread was not found.')
      thread.comments = thread.comments.filter((comment) => comment.id !== commentId)
      if (thread.comments.length === 0) return threads.filter((item) => item.id !== threadId)
      thread.updatedAt = new Date().toISOString()
      result = thread
    })
    return result
  }

  setThreadState(sessionId: string, threadId: string, state: 'open' | 'resolved') {
    return this.mutateThread(sessionId, threadId, (thread) => {
      thread.state = state
      thread.updatedAt = new Date().toISOString()
    })
  }

  async export(sessionId: string) {
    const compareIdentity = this.compareIdentity(sessionId)
    const file = await this.store.read(compareIdentity)
    const decisions = this.preferences ? await this.preferences.listDecisions(compareIdentity) : []
    const bundle: ReviewBundle = {
      schemaVersion: 1,
      compareIdentity,
      threads: file.threads,
      decisions,
      exportedAt: new Date().toISOString(),
    }
    return { json: JSON.stringify(bundle, null, 2), markdown: renderMarkdown(bundle), bundle }
  }

  async import(sessionId: string, bundle: ReviewBundle) {
    if (bundle.schemaVersion !== 1 || bundle.compareIdentity !== this.compareIdentity(sessionId)) {
      throw new Error('Review bundle belongs to a different comparison.')
    }
    await this.store.import(bundle)
    if (this.preferences) await this.preferences.saveDecisions(bundle.compareIdentity, bundle.decisions)
    return this.listThreads(sessionId)
  }

  getProfile() {
    return this.requirePreferences().getProfile()
  }

  saveProfile(author: ReviewAuthor) {
    validateAuthor(author)
    return this.requirePreferences().saveProfile(author)
  }

  listDrafts(sessionId: string) {
    return this.requirePreferences().listDrafts(this.compareIdentity(sessionId))
  }

  saveDraft(sessionId: string, key: string, body: string) {
    return this.requirePreferences().saveDraft(this.compareIdentity(sessionId), key, body)
  }

  removeDraft(sessionId: string, key: string) {
    return this.requirePreferences().removeDraft(this.compareIdentity(sessionId), key)
  }

  async listDecisions(sessionId: string, entryId: string) {
    const entryIdentity = this.entryIdentity(sessionId, entryId)
    return (await this.requirePreferences().listDecisions(this.compareIdentity(sessionId)))
      .filter((decision) => decision.entryIdentity === entryIdentity)
  }

  async setDecision(
    sessionId: string,
    entryId: string,
    fingerprint: HunkFingerprint,
    changeIndex: number | null,
    status: ReviewDecisionStatus | null,
  ) {
    const compareIdentity = this.compareIdentity(sessionId)
    const entryIdentity = this.entryIdentity(sessionId, entryId)
    const all = await this.requirePreferences().listDecisions(compareIdentity)
    const key = decisionKey(entryIdentity, fingerprint, changeIndex)
    const next = all.filter((decision) => decisionKey(decision.entryIdentity, decision.fingerprint, decision.changeIndex) !== key)
    if (status) next.push({ entryIdentity, fingerprint, changeIndex, status, updatedAt: new Date().toISOString() })
    await this.requirePreferences().saveDecisions(compareIdentity, next)
    return next.filter((decision) => decision.entryIdentity === entryIdentity)
  }

  async resetDecisions(sessionId: string, entryId: string) {
    const compareIdentity = this.compareIdentity(sessionId)
    const entryIdentity = this.entryIdentity(sessionId, entryId)
    const all = await this.requirePreferences().listDecisions(compareIdentity)
    await this.requirePreferences().saveDecisions(
      compareIdentity,
      all.filter((decision) => decision.entryIdentity !== entryIdentity),
    )
  }

  private async mutateThread(
    sessionId: string,
    threadId: string,
    mutate: (thread: ReviewThread) => void,
  ) {
    const compareIdentity = this.compareIdentity(sessionId)
    let result: ReviewThread | null = null
    await this.store.update(compareIdentity, (threads) => {
      const thread = threads.find((item) => item.id === threadId)
      if (!thread) throw new Error('Review thread was not found.')
      mutate(thread)
      result = thread
    })
    return result!
  }

  private compareIdentity(sessionId: string) {
    return hash(JSON.stringify(this.sessions.getSource(sessionId)))
  }

  private entryIdentity(sessionId: string, entryId: string) {
    const entry = this.sessions.getEntry(sessionId, entryId)
    return hash(JSON.stringify({ path: entry.path, oldPath: entry.oldPath ?? null }))
  }

  private requirePreferences() {
    if (!this.preferences) throw new Error('Review preferences are unavailable.')
    return this.preferences
  }
}

function relocateThreads(
  threads: ReviewThread[],
  diff: Awaited<ReturnType<DiffSessionService['openEntryForSearch']>>,
) {
  let changed = false
  for (const thread of threads) {
    const side = reviewSide(diff, thread.anchor.side)
    const result = relocateReviewAnchor(thread.anchor, side.contents, side.revision)
    if (result.state === 'relocated') {
      thread.anchor = result.anchor
      if (thread.state === 'outdated') thread.state = 'open'
      thread.updatedAt = new Date().toISOString()
      changed = true
    } else if (result.state === 'outdated' && thread.state !== 'outdated') {
      thread.state = 'outdated'
      thread.updatedAt = new Date().toISOString()
      changed = true
    }
  }
  return changed
}

function reviewSide(
  diff: Awaited<ReturnType<DiffSessionService['openEntryForSearch']>>,
  side: 'deletions' | 'additions',
) {
  const text = diff.text
  if (!text) throw new Error('Review comments require a text diff.')
  return side === 'deletions'
    ? { contents: text.leftText, revision: text.leftSha256 ?? text.leftCacheKey ?? hash(text.leftText) }
    : { contents: text.rightText, revision: text.rightSha256 ?? text.rightCacheKey ?? hash(text.rightText) }
}

function createComment(author: ReviewAuthor, body: string, createdAt: string): ReviewComment {
  return { id: randomUUID(), author, body, createdAt, editedAt: null }
}

function validateBody(body: string) {
  if (typeof body !== 'string' || !body.trim() || Buffer.byteLength(body) > 256 * 1024) {
    throw new Error('Review comment must contain 1–262144 bytes.')
  }
}

function validateAuthor(author: ReviewAuthor) {
  if (!author || typeof author.id !== 'string' || !author.id || typeof author.name !== 'string' || !author.name.trim()) {
    throw new Error('Invalid review author.')
  }
}

function renderMarkdown(bundle: ReviewBundle) {
  const lines = ['# Diffly review', '']
  for (const decision of bundle.decisions) {
    lines.push(`- **${decision.status}** · hunk ${decision.fingerprint.changeHash.slice(0, 12)}${decision.changeIndex === null ? '' : ` block ${decision.changeIndex + 1}`}`)
  }
  if (bundle.decisions.length > 0) lines.push('')
  for (const thread of bundle.threads) {
    lines.push(`## ${thread.state.toUpperCase()} · ${thread.anchor.side} line ${thread.anchor.lineNumber}`, '')
    for (const comment of thread.comments) {
      lines.push(`**${comment.author.name}** · ${comment.createdAt}`, '', comment.body, '')
    }
  }
  return lines.join('\n')
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function decisionKey(entryIdentity: string, fingerprint: HunkFingerprint, changeIndex: number | null) {
  return `${entryIdentity}:${fingerprint.changeHash}:${changeIndex ?? 'hunk'}`
}
