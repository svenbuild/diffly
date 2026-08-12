import { randomBytes } from 'node:crypto'
import { chmod, lstat, mkdir, open, readFile, rm } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import type {
  ConflictDocument,
  ConflictRevision,
  ConflictSide,
  DocumentFormat,
  ResolveConflictRequest,
} from '../../../src/lib/types'
import type { DiffSessionService } from '../diff/diff-session-service'
import { replaceFile } from '../atomic-file'
import { encodeDocument, readMemoryDocument } from '../documents/document-reader'
import { readGitObjectByOid } from '../git/git-object-store'
import { runGit } from '../git/git-service'
import { OperationJournal } from '../review/operation-journal'
import { inferConflictKind, readUnmergedStages, type UnmergedStage } from './conflict-index'

interface LoadedStage extends UnmergedStage {
  bytes: Uint8Array
  side: ConflictSide
}

interface ConflictUndoData {
  stages: UnmergedStage[]
  working: { exists: boolean; bytes: string; mode: number | null }
  repositoryRoot: string
  path: string
}

export class ConflictService {
  private readonly sessions: DiffSessionService
  private readonly journal: OperationJournal

  constructor(sessions: DiffSessionService, journal: OperationJournal) {
    this.sessions = sessions
    this.journal = journal
  }

  async open(sessionId: string, entryId: string): Promise<ConflictDocument> {
    const entry = this.sessions.getProviderEntry(sessionId, entryId)
    if (entry.kind !== 'gitWorkingTree' || entry.status !== 'conflicted') {
      throw new Error('NO_LONGER_CONFLICTED')
    }
    const stages = await readUnmergedStages(entry.repositoryRoot, entry.path)
    if (stages.length === 0) throw new Error('NO_LONGER_CONFLICTED')
    const loaded = await Promise.all(stages.map((stage) => loadStage(entry.repositoryRoot, entry.path, stage)))
    const target = { kind: 'gitWorktree' as const, sessionId, entryId }
    const workingFile = await this.sessions.openDocument(target).catch(() => null)
    const markerContents = workingFile && hasConflictMarkers(workingFile.contents)
      ? workingFile.contents
      : null
    const stage = (number: 1 | 2 | 3) => loaded.find((item) => item.stage === number) ?? null
    const base = stage(1)
    const current = stage(2)
    const incoming = stage(3)
    return {
      entryId,
      path: entry.path,
      conflictKind: entry.conflictKind ?? inferConflictKind(stages),
      base: base?.side ?? null,
      current: current?.side ?? null,
      incoming: incoming?.side ?? null,
      workingFile,
      markerContents,
      binary: loaded.some((item) => item.side.contents === null),
      submodule: stages.some((item) => item.mode === 0o160000),
      revision: {
        baseOid: base?.oid ?? null,
        currentOid: current?.oid ?? null,
        incomingOid: incoming?.oid ?? null,
        workingRevision: workingFile?.revision ?? null,
      },
    }
  }

  async resolve(request: ResolveConflictRequest) {
    const entry = this.sessions.getProviderEntry(request.sessionId, request.entryId)
    if (entry.kind !== 'gitWorkingTree' || entry.status !== 'conflicted') {
      throw new Error('NO_LONGER_CONFLICTED')
    }
    const document = await this.open(request.sessionId, request.entryId)
    if (!conflictRevisionsEqual(document.revision, request.expectedRevision)) {
      throw new Error('STALE_DOCUMENT')
    }
    const stages = await readUnmergedStages(entry.repositoryRoot, entry.path)
    const path = repositoryPath(entry.repositoryRoot, entry.path)
    const undo: ConflictUndoData = {
      stages,
      working: await readWorkingSnapshot(path),
      repositoryRoot: entry.repositoryRoot,
      path: entry.path,
    }
    const journalId = await this.journal.start({
      kind: 'conflictResolution',
      sessionId: request.sessionId,
      entryId: request.entryId,
    })

    try {
      const chosen = request.resolution.kind === 'side'
        ? request.resolution.side === 'current' ? document.current : document.incoming
        : null
      if (document.submodule) {
        if (request.resolution.kind !== 'side' || !chosen) {
          throw new Error('Submodule conflicts require choosing Current or Incoming.')
        }
        await runGit(entry.repositoryRoot, [
          'update-index', '--add', '--cacheinfo', chosen.mode.toString(8), chosen.oid, entry.path,
        ])
      } else if (request.resolution.kind === 'delete' || (request.resolution.kind === 'side' && !chosen)) {
        await rm(path, { force: true })
        await runGit(entry.repositoryRoot, ['rm', '--', entry.path])
      } else {
        const stage = request.resolution.kind === 'side'
          ? stages.find((item) => item.oid === chosen?.oid)
          : null
        const bytes = request.resolution.kind === 'side'
          ? await readBlobBytes(entry.repositoryRoot, chosen!.oid)
          : encodeDocument(request.resolution.contents, {
              ...(document.workingFile?.format ?? chosen?.format ?? defaultFormat(stage?.mode ?? null)),
              ...request.resolution.format,
              hasTrailingNewline: request.resolution.format?.hasTrailingNewline ?? /(?:\r\n|\r|\n)$/.test(request.resolution.contents),
            })
        await writeAtomic(path, bytes, document.workingFile?.format.mode ?? stage?.mode ?? chosen?.mode ?? 0o100644)
        await runGit(entry.repositoryRoot, ['add', '--', entry.path])
      }
      if ((await readUnmergedStages(entry.repositoryRoot, entry.path)).length > 0) {
        throw new Error('Git still reports the file as unmerged.')
      }
      await this.journal.complete(journalId, undo)
      return this.sessions.refresh(request.sessionId)
    } catch (error) {
      await restoreConflict(undo).catch(() => undefined)
      await this.journal.fail(journalId).catch(() => undefined)
      throw error
    }
  }

  async undoResolution(sessionId: string) {
    const entry = await this.journal.latest(sessionId, 'conflictResolution')
    if (!entry) throw new Error('There is no conflict resolution to undo.')
    const payload = entry.payload as { state?: unknown; data?: unknown }
    if (payload.state !== 'complete' || !isConflictUndoData(payload.data)) {
      throw new Error('Conflict operation journal is invalid.')
    }
    await restoreConflict(payload.data)
    await this.journal.remove(entry.id)
    return this.sessions.refresh(sessionId)
  }
}

async function loadStage(repositoryRoot: string, path: string, stage: UnmergedStage): Promise<LoadedStage> {
  const bytes = await readBlobBytes(repositoryRoot, stage.oid)
  let side: ConflictSide
  try {
    const document = readMemoryDocument({
      bytes,
      target: { kind: 'scratch', sourceSessionId: 'conflict', sourceEntryId: path, sourceSide: 'left' },
      displayPath: path,
      readOnly: true,
      gitOid: stage.oid,
      mode: stage.mode,
    })
    side = { oid: stage.oid, mode: stage.mode, contents: document.contents, format: document.format }
  } catch {
    side = { oid: stage.oid, mode: stage.mode, contents: null, format: null }
  }
  return { ...stage, bytes, side }
}

async function readBlobBytes(repositoryRoot: string, oid: string) {
  const object = await readGitObjectByOid(repositoryRoot, oid)
  if (object.kind !== 'object') throw new Error('Conflict object is missing.')
  return object.bytes
}

function hasConflictMarkers(contents: string) {
  return /^<<<<<<< .+$/m.test(contents) && /^=======$/m.test(contents) && /^>>>>>>> .+$/m.test(contents)
}

function conflictRevisionsEqual(left: ConflictRevision, right: ConflictRevision) {
  return left.baseOid === right.baseOid && left.currentOid === right.currentOid &&
    left.incomingOid === right.incomingOid &&
    JSON.stringify(left.workingRevision) === JSON.stringify(right.workingRevision)
}

async function readWorkingSnapshot(path: string): Promise<ConflictUndoData['working']> {
  try {
    const info = await lstat(path)
    if (info.isSymbolicLink() || !info.isFile()) throw new Error('Conflict path is not a regular file.')
    return { exists: true, bytes: (await readFile(path)).toString('base64'), mode: info.mode }
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return { exists: false, bytes: '', mode: null }
    }
    throw error
  }
}

async function restoreConflict(data: ConflictUndoData) {
  await runGit(data.repositoryRoot, ['update-index', '--force-remove', '--', data.path], { allowNonZeroExit: true })
  const indexInfo = data.stages.map((stage) =>
    `${stage.mode.toString(8)} ${stage.oid} ${stage.stage}\t${data.path}\n`
  ).join('')
  await runGit(data.repositoryRoot, ['update-index', '--index-info'], { stdin: indexInfo })
  const path = repositoryPath(data.repositoryRoot, data.path)
  if (data.working.exists) {
    await writeAtomic(path, Buffer.from(data.working.bytes, 'base64'), data.working.mode ?? 0o100644)
  } else {
    await rm(path, { force: true })
  }
}

async function writeAtomic(path: string, bytes: Uint8Array, mode: number) {
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.diffly-conflict-${randomBytes(8).toString('hex')}.tmp`
  let handle: Awaited<ReturnType<typeof open>> | null = null
  try {
    handle = await open(temp, 'wx', mode & 0o7777)
    await handle.writeFile(bytes)
    await handle.sync()
    await handle.close()
    handle = null
    await chmod(temp, mode & 0o7777)
    await replaceFile(temp, path)
  } catch (error) {
    await handle?.close().catch(() => undefined)
    await rm(temp, { force: true }).catch(() => undefined)
    throw error
  }
}

function repositoryPath(root: string, path: string) {
  if (!path || path.includes('\0')) throw new Error('Invalid conflict path.')
  const target = resolve(root, path)
  const rel = relative(root, target)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error('Conflict path is outside the repository.')
  }
  return target
}

function defaultFormat(mode: number | null): DocumentFormat {
  return { encoding: 'utf8', lineEnding: 'lf', hasTrailingNewline: true, mode }
}

function isConflictUndoData(value: unknown): value is ConflictUndoData {
  return typeof value === 'object' && value !== null && 'stages' in value && Array.isArray(value.stages) &&
    'working' in value && typeof value.working === 'object' && value.working !== null &&
    'repositoryRoot' in value && typeof value.repositoryRoot === 'string' &&
    'path' in value && typeof value.path === 'string'
}
