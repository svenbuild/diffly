import { randomBytes } from 'node:crypto'
import { chmod, lstat, open, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type {
  DocumentFormat,
  DocumentRevision,
} from '../../../src/lib/workspace-types'
import { replaceFile } from '../atomic-file'
import { encodeDocument, hasTrailingNewline, readLocalDocument } from './document-reader'
import { revisionsEqual } from './document-revision'

export class StaleDocumentError extends Error {
  readonly currentRevision: DocumentRevision

  constructor(currentRevision: DocumentRevision) {
    super('The document changed outside Diffly.')
    this.currentRevision = currentRevision
  }
}

export async function writeLocalDocument(input: {
  path: string
  target: Parameters<typeof readLocalDocument>[0]['target']
  displayPath?: string
  contents: string
  expectedRevision: DocumentRevision
  originalFormat: DocumentFormat
  format?: Partial<Pick<DocumentFormat, 'encoding' | 'lineEnding' | 'hasTrailingNewline'>>
  overwrite?: boolean
  gitOid?: string | null
  indexOid?: string | null
}) {
  const current = await readLocalDocument({
    path: input.path,
    target: input.target,
    displayPath: input.displayPath,
    gitOid: input.gitOid,
    indexOid: input.indexOid,
  })
  if (!input.overwrite && !revisionsEqual(current.revision, input.expectedRevision)) {
    throw new StaleDocumentError(current.revision)
  }

  const format: DocumentFormat = {
    ...input.originalFormat,
    ...input.format,
    hasTrailingNewline: input.format?.hasTrailingNewline ?? hasTrailingNewline(input.contents),
  }
  const bytes = encodeDocument(input.contents, format)
  const tempPath = join(
    dirname(input.path),
    `.diffly-save-${process.pid}-${randomBytes(8).toString('hex')}.tmp`,
  )
  let handle: Awaited<ReturnType<typeof open>> | null = null

  try {
    handle = await open(tempPath, 'wx', current.format.mode ?? 0o666)
    await handle.writeFile(bytes)
    await handle.sync()
    await handle.close()
    handle = null
    if (current.format.mode !== null) {
      await chmod(tempPath, current.format.mode)
    }
    await replaceFile(tempPath, input.path)
  } catch (error) {
    await handle?.close().catch(() => undefined)
    await rm(tempPath, { force: true }).catch(() => undefined)
    throw error
  }

  const saved = await readLocalDocument({
    path: input.path,
    target: input.target,
    displayPath: input.displayPath,
    gitOid: input.gitOid,
    indexOid: input.indexOid,
  })
  saved.format = { ...saved.format, ...format }
  return saved
}

export async function assertRegularNonSymlink(path: string) {
  const info = await lstat(path)
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new Error('Only regular files can be saved.')
  }
}
