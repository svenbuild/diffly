import { createHash } from 'node:crypto'
import type { DocumentRevision } from '../../../src/lib/workspace-types'

export function sha256(bytes: Uint8Array | string) {
  return createHash('sha256').update(bytes).digest('hex')
}

export function createDocumentRevision(input: {
  bytes: Uint8Array
  modifiedNs?: bigint | string | null
  gitOid?: string | null
  indexOid?: string | null
}): DocumentRevision {
  return {
    sha256: sha256(input.bytes),
    size: input.bytes.byteLength,
    modifiedNs: input.modifiedNs === undefined || input.modifiedNs === null
      ? null
      : String(input.modifiedNs),
    gitOid: input.gitOid ?? null,
    indexOid: input.indexOid ?? null,
  }
}

export function revisionsEqual(left: DocumentRevision, right: DocumentRevision) {
  return (
    left.sha256 === right.sha256 &&
    left.size === right.size &&
    left.modifiedNs === right.modifiedNs &&
    left.gitOid === right.gitOid &&
    left.indexOid === right.indexOid
  )
}

export function documentCacheKey(identity: string, revision: DocumentRevision) {
  return [identity, revision.sha256, revision.size, revision.modifiedNs ?? '', revision.gitOid ?? '', revision.indexOid ?? ''].join('\u0000')
}
