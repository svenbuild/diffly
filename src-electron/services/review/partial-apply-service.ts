import type {
  ApplyPartialChangeRequest,
  DocumentTarget,
  EditableDocument,
  OperationJournalEntry,
} from '../../../src/lib/types'
import type { DiffSessionService } from '../diff/diff-session-service'
import { revisionsEqual } from '../documents/document-revision'
import { runGit } from '../git/git-service'
import { applySelectedHunks, buildSelectedPatch, parseSingleFilePatch } from './hunk-patch'
import { OperationJournal } from './operation-journal'

const GIT_OPTIONS = {
  maxStdoutBytes: 8 * 1024 * 1024,
  maxStderrBytes: 1024 * 1024,
}

interface FileUndoData {
  type: 'file'
  target: DocumentTarget
  contents: string
  format: EditableDocument['format']
  afterRevision: EditableDocument['revision']
}

interface IndexUndoData {
  type: 'index'
  repositoryRoot: string
  path: string
  before: { oid: string; mode: number } | null
  afterOid: string | null
}

interface DocumentsUndoData {
  type: 'documents'
  documents: FileUndoData[]
}

export class PartialApplyService {
  private readonly sessions: DiffSessionService
  private readonly journal: OperationJournal

  constructor(sessions: DiffSessionService, journal: OperationJournal) {
    this.sessions = sessions
    this.journal = journal
  }

  async apply(request: ApplyPartialChangeRequest) {
    const diff = await this.sessions.openEntryForSearch(request.sessionId, request.entryId)
    const patch = diff.text?.patchText
    if (!patch) throw new Error('PATCH_DOES_NOT_APPLY')
    const entry = this.sessions.getProviderEntry(request.sessionId, request.entryId)
    const journalId = await this.journal.start({
      kind: 'partialChange',
      sessionId: request.sessionId,
      entryId: request.entryId,
    })
    try {
      if (entry.kind === 'localFile' || entry.kind === 'localDirectory') {
        await this.applyLocal(request, patch, journalId)
      } else if (entry.kind === 'gitWorkingTree') {
        await this.applyGit(request, patch, entry, journalId)
      } else {
        throw new Error('Partial mutations are unavailable for this source.')
      }
      return await this.sessions.refresh(request.sessionId)
    } catch (error) {
      await this.journal.fail(journalId).catch(() => undefined)
      throw error
    }
  }

  async listHunks(sessionId: string, entryId: string) {
    const diff = await this.sessions.openEntryForSearch(sessionId, entryId)
    const patch = diff.text?.patchText
    if (!patch) return []
    return parseSingleFilePatch(patch).hunks.map((hunk, index) => ({
      index,
      header: hunk.header,
      fingerprint: hunk.fingerprint,
      changeCount: countChangeBlocks(hunk.lines),
    }))
  }

  async undoLast(sessionId: string) {
    const entry = await this.journal.latest(sessionId)
    if (!entry) throw new Error('There is no operation to undo.')
    const data = readUndoData(entry)
    if (data.type === 'documents') {
      for (const document of data.documents) {
        const current = await this.sessions.openDocument(document.target)
        if (!revisionsEqual(current.revision, document.afterRevision)) {
          throw new Error('A document changed after Replace All and cannot be undone safely.')
        }
      }
      for (const document of data.documents) {
        await this.sessions.saveDocument({
          target: document.target,
          contents: document.contents,
          expectedRevision: document.afterRevision,
          format: document.format,
        })
      }
    } else if (data.type === 'file') {
      const current = await this.sessions.openDocument(data.target)
      if (!revisionsEqual(current.revision, data.afterRevision)) {
        throw new Error('The document changed after the operation and cannot be undone safely.')
      }
      await this.sessions.saveDocument({
        target: data.target,
        contents: data.contents,
        expectedRevision: data.afterRevision,
        format: data.format,
      })
    } else {
      const current = await readIndexEntry(data.repositoryRoot, data.path)
      if ((current?.oid ?? null) !== data.afterOid) {
        throw new Error('The Git index changed after the operation and cannot be undone safely.')
      }
      if (data.before) {
        await runGit(data.repositoryRoot, [
          'update-index', '--add', '--cacheinfo', data.before.mode.toString(8), data.before.oid, data.path,
        ], GIT_OPTIONS)
      } else {
        await runGit(data.repositoryRoot, ['rm', '--cached', '--ignore-unmatch', '--', data.path], GIT_OPTIONS)
      }
    }
    await this.journal.remove(entry.id)
    return this.sessions.refresh(sessionId)
  }

  private async applyLocal(
    request: ApplyPartialChangeRequest,
    patch: string,
    journalId: string,
  ) {
    if (request.operation !== 'applyRightToLeft' && request.operation !== 'applyLeftToRight') {
      throw new Error('Invalid local partial change operation.')
    }
    const sourceSide = request.operation === 'applyRightToLeft' ? 'right' : 'left'
    const targetSide = sourceSide === 'right' ? 'left' : 'right'
    const sourceTarget: DocumentTarget = {
      kind: 'local', sessionId: request.sessionId, entryId: request.entryId, side: sourceSide,
    }
    const target: DocumentTarget = {
      kind: 'local', sessionId: request.sessionId, entryId: request.entryId, side: targetSide,
    }
    const [source, original] = await Promise.all([
      this.sessions.openDocument(sourceTarget),
      this.sessions.openDocument(target),
    ])
    assertRevision(source, sourceSide === 'left' ? request.leftRevision : request.rightRevision)
    assertRevision(original, targetSide === 'left' ? request.leftRevision : request.rightRevision)
    const contents = applySelectedHunks(
      original.contents,
      patch,
      request.selections,
      request.operation === 'applyRightToLeft' ? 'forward' : 'reverse',
    )
    const saved = await this.sessions.saveDocument({
      target,
      contents,
      expectedRevision: original.revision,
    })
    await this.journal.complete(journalId, {
      type: 'file',
      target,
      contents: original.contents,
      format: original.format,
      afterRevision: saved.revision,
    } satisfies FileUndoData)
  }

  private async applyGit(
    request: ApplyPartialChangeRequest,
    patch: string,
    entry: Extract<ReturnType<DiffSessionService['getProviderEntry']>, { kind: 'gitWorkingTree' }>,
    journalId: string,
  ) {
    if (request.operation === 'discard') {
      const target: DocumentTarget = {
        kind: 'gitWorktree', sessionId: request.sessionId, entryId: request.entryId,
      }
      const original = await this.sessions.openDocument(target)
      assertRevision(original, request.rightRevision)
      const contents = applySelectedHunks(original.contents, patch, request.selections, 'reverse')
      const saved = await this.sessions.saveDocument({ target, contents, expectedRevision: original.revision })
      await this.journal.complete(journalId, {
        type: 'file', target, contents: original.contents, format: original.format, afterRevision: saved.revision,
      } satisfies FileUndoData)
      return
    }
    if (request.operation !== 'stage' && request.operation !== 'unstage') {
      throw new Error('Invalid Git partial change operation.')
    }
    if (entry.scope === 'all') {
      throw new Error('Choose Staged or Unstaged scope before applying partial Git changes.')
    }
    if (request.operation === 'stage') {
      const right: DocumentTarget = {
        kind: 'gitWorktree', sessionId: request.sessionId, entryId: request.entryId,
      }
      assertRevision(await this.sessions.openDocument(right), request.rightRevision)
    } else {
      const right: DocumentTarget = {
        kind: 'gitIndex', sessionId: request.sessionId, entryId: request.entryId,
      }
      assertRevision(await this.sessions.openDocument(right), request.rightRevision)
    }
    const selectedPatch = buildSelectedPatch(patch, request.selections)
    const before = await readIndexEntry(entry.repositoryRoot, entry.path)
    const args = [
      'apply',
      '--cached',
      ...(request.operation === 'unstage' ? ['--reverse'] : []),
      '--whitespace=nowarn',
      '-',
    ]
    const check = await runGit(entry.repositoryRoot, [...args.slice(0, -1), '--check', '-'], {
      ...GIT_OPTIONS,
      allowNonZeroExit: true,
      stdin: selectedPatch,
    })
    if (check.exitCode !== 0) throw new Error('PATCH_DOES_NOT_APPLY')
    await runGit(entry.repositoryRoot, args, { ...GIT_OPTIONS, stdin: selectedPatch })
    const after = await readIndexEntry(entry.repositoryRoot, entry.path)
    await this.journal.complete(journalId, {
      type: 'index',
      repositoryRoot: entry.repositoryRoot,
      path: entry.path,
      before,
      afterOid: after?.oid ?? null,
    } satisfies IndexUndoData)
  }
}

function countChangeBlocks(lines: string[]) {
  let count = 0
  let changed = false
  for (const line of lines) {
    const nextChanged = line.startsWith('+') || line.startsWith('-')
    if (nextChanged && !changed) count += 1
    changed = nextChanged
  }
  return count
}

function assertRevision(document: EditableDocument, expected: EditableDocument['revision'] | null) {
  if (!expected || !revisionsEqual(document.revision, expected)) {
    throw new Error('STALE_DOCUMENT')
  }
}

async function readIndexEntry(repositoryRoot: string, path: string) {
  const result = await runGit(repositoryRoot, ['ls-files', '--stage', '-z', '--', path], GIT_OPTIONS)
  for (const record of result.stdout.split('\0').filter(Boolean)) {
    const match = /^(\d{6}) ([0-9a-f]{40}) 0\t([\s\S]+)$/i.exec(record)
    if (match?.[3] === path) return { mode: Number.parseInt(match[1], 8), oid: match[2] }
  }
  return null
}

function readUndoData(entry: OperationJournalEntry): FileUndoData | IndexUndoData | DocumentsUndoData {
  if (
    typeof entry.payload !== 'object' || entry.payload === null ||
    !('state' in entry.payload) || entry.payload.state !== 'complete' ||
    !('data' in entry.payload) || typeof entry.payload.data !== 'object' || entry.payload.data === null ||
    !('type' in entry.payload.data) ||
    (entry.payload.data.type !== 'file' && entry.payload.data.type !== 'index' && entry.payload.data.type !== 'documents')
  ) {
    throw new Error('Operation journal entry is invalid.')
  }
  return entry.payload.data as FileUndoData | IndexUndoData | DocumentsUndoData
}
