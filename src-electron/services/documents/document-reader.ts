import { lstat, readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type {
  DocumentEncoding,
  DocumentFormat,
  DocumentTarget,
  EditableDocument,
} from '../../../src/lib/workspace-types'
import { createDocumentRevision, documentCacheKey } from './document-revision'

export const MAX_EDITABLE_DOCUMENT_BYTES = 64 * 1024 * 1024

export class UnsupportedDocumentEncodingError extends Error {}

export async function readLocalDocument(input: {
  path: string
  target: DocumentTarget
  displayPath?: string
  gitOid?: string | null
  indexOid?: string | null
}): Promise<EditableDocument> {
  let info: Awaited<ReturnType<typeof lstat>>
  try {
    info = await lstat(input.path, { bigint: true })
  } catch (error) {
    if (isNotFound(error)) return missingLocalDocument(input)
    throw error
  }
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new Error('Only regular files can be opened for editing.')
  }
  if (info.size > BigInt(MAX_EDITABLE_DOCUMENT_BYTES)) {
    throw new Error('The document is too large to edit safely.')
  }

  const bytes = await readFile(input.path)
  const decoded = decodeDocument(bytes)
  const revision = createDocumentRevision({
    bytes,
    modifiedNs: info.mtimeNs,
    gitOid: input.gitOid,
    indexOid: input.indexOid,
  })
  const displayPath = input.displayPath ?? input.path

  return {
    target: input.target,
    name: basename(displayPath),
    displayPath,
    contents: decoded.contents,
    revision,
    format: {
      encoding: decoded.encoding,
      lineEnding: detectLineEnding(decoded.contents),
      hasTrailingNewline: hasTrailingNewline(decoded.contents),
      mode: Number(info.mode & BigInt(0o7777)),
    },
    readOnly: false,
    cacheKey: documentCacheKey(documentTargetIdentity(input.target), revision),
  }
}

function missingLocalDocument(input: Parameters<typeof readLocalDocument>[0]): EditableDocument {
  const bytes = new Uint8Array()
  const revision = createDocumentRevision({
    bytes,
    modifiedNs: null,
    gitOid: input.gitOid,
    indexOid: input.indexOid,
  })
  const displayPath = input.displayPath ?? input.path
  return {
    target: input.target,
    name: basename(displayPath),
    displayPath,
    contents: '',
    revision,
    format: { encoding: 'utf8', lineEnding: 'lf', hasTrailingNewline: false, mode: null },
    readOnly: false,
    cacheKey: documentCacheKey(documentTargetIdentity(input.target), revision),
  }
}

export function readMemoryDocument(input: {
  bytes: Uint8Array
  target: DocumentTarget
  displayPath: string
  readOnly: boolean
  gitOid?: string | null
  indexOid?: string | null
  mode?: number | null
}): EditableDocument {
  if (input.bytes.byteLength > MAX_EDITABLE_DOCUMENT_BYTES) {
    throw new Error('The document is too large to edit safely.')
  }
  const decoded = decodeDocument(input.bytes)
  const revision = createDocumentRevision({
    bytes: input.bytes,
    gitOid: input.gitOid,
    indexOid: input.indexOid,
  })

  return {
    target: input.target,
    name: basename(input.displayPath),
    displayPath: input.displayPath,
    contents: decoded.contents,
    revision,
    format: {
      encoding: decoded.encoding,
      lineEnding: detectLineEnding(decoded.contents),
      hasTrailingNewline: hasTrailingNewline(decoded.contents),
      mode: input.mode ?? null,
    },
    readOnly: input.readOnly,
    cacheKey: documentCacheKey(documentTargetIdentity(input.target), revision),
  }
}

export function decodeDocument(bytes: Uint8Array): {
  contents: string
  encoding: DocumentEncoding
} {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return {
      contents: decodeUtf8(bytes.subarray(3)),
      encoding: 'utf8-bom',
    }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return {
      contents: decodeUtf16Le(bytes.subarray(2)),
      encoding: 'utf16le',
    }
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const body = bytes.subarray(2)
    const swapped = new Uint8Array(body.byteLength)
    for (let index = 0; index < body.byteLength; index += 2) {
      swapped[index] = body[index + 1] ?? 0
      swapped[index + 1] = body[index] ?? 0
    }
    return {
      contents: decodeUtf16Le(swapped),
      encoding: 'utf16be',
    }
  }

  try {
    return {
      contents: decodeUtf8(bytes),
      encoding: 'utf8',
    }
  } catch {
    throw new UnsupportedDocumentEncodingError('The document encoding is not supported.')
  }
}

export function encodeDocument(contents: string, format: DocumentFormat): Uint8Array {
  const normalized = normalizeLineEndings(
    setTrailingNewline(contents, format.hasTrailingNewline),
    format.lineEnding,
  )

  switch (format.encoding) {
    case 'utf8':
      return Buffer.from(normalized, 'utf8')
    case 'utf8-bom':
      return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(normalized, 'utf8')])
    case 'utf16le':
      return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(normalized, 'utf16le')])
    case 'utf16be': {
      const littleEndian = Buffer.from(normalized, 'utf16le')
      for (let index = 0; index < littleEndian.byteLength; index += 2) {
        const first = littleEndian[index]
        littleEndian[index] = littleEndian[index + 1] ?? 0
        littleEndian[index + 1] = first
      }
      return Buffer.concat([Buffer.from([0xfe, 0xff]), littleEndian])
    }
  }
}

export function detectLineEnding(contents: string): DocumentFormat['lineEnding'] {
  let lf = 0
  let crlf = 0
  let cr = 0
  for (let index = 0; index < contents.length; index += 1) {
    if (contents[index] === '\r') {
      if (contents[index + 1] === '\n') {
        crlf += 1
        index += 1
      } else {
        cr += 1
      }
    } else if (contents[index] === '\n') {
      lf += 1
    }
  }
  if (crlf >= lf && crlf >= cr && crlf > 0) return 'crlf'
  if (cr > lf && cr > 0) return 'cr'
  return 'lf'
}

export function hasTrailingNewline(contents: string) {
  return contents.endsWith('\n') || contents.endsWith('\r')
}

function decodeUtf8(bytes: Uint8Array) {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

function decodeUtf16Le(bytes: Uint8Array) {
  if (bytes.byteLength % 2 !== 0) {
    throw new UnsupportedDocumentEncodingError('The UTF-16 document has an incomplete code unit.')
  }
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('utf16le')
}

function isNotFound(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function normalizeLineEndings(contents: string, lineEnding: DocumentFormat['lineEnding']) {
  const newline = lineEnding === 'crlf' ? '\r\n' : lineEnding === 'cr' ? '\r' : '\n'
  return contents.replace(/\r\n|\r|\n/g, newline)
}

function setTrailingNewline(contents: string, desired: boolean) {
  if (desired) {
    return hasTrailingNewline(contents) ? contents : `${contents}\n`
  }
  return contents.replace(/(?:\r\n|\r|\n)+$/g, '')
}

export function documentTargetIdentity(target: DocumentTarget) {
  switch (target.kind) {
    case 'local':
      return `local:${target.sessionId}:${target.entryId}:${target.side}`
    case 'gitWorktree':
      return `worktree:${target.sessionId}:${target.entryId}`
    case 'gitIndex':
      return `index:${target.sessionId}:${target.entryId}`
    case 'scratch':
      return `scratch:${target.sourceSessionId}:${target.sourceEntryId}:${target.sourceSide}`
  }
}
