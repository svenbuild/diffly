import type { DiffEntryStatus } from '../../../src/lib/types'

export interface GitStatusBranch {
  headSha: string | null
  currentBranch: string | null
}

export type GitStatusEntry =
  | {
      kind: 'changed'
      xy: string
      path: string
      oldPath: string | null
      headOid: string | null
      indexOid: string | null
      score?: number
      changeKind?: 'renamed' | 'copied'
    }
  | {
      kind: 'conflicted'
      xy: string
      path: string
    }
  | {
      kind: 'untracked'
      path: string
    }

export interface GitStatusSnapshot {
  branch: GitStatusBranch
  entries: GitStatusEntry[]
}

const FULL_OID_PATTERN = /^[0-9a-f]{40}$/i
const ZERO_OID = '0'.repeat(40)

export function parseGitStatusPorcelainV2Output(output: string): GitStatusSnapshot {
  const fields = output === '' ? [] : output.split('\0')
  if (fields[fields.length - 1] === '') {
    fields.pop()
  }

  const snapshot: GitStatusSnapshot = {
    branch: {
      headSha: null,
      currentBranch: null,
    },
    entries: [],
  }

  let index = 0
  while (index < fields.length) {
    const record = fields[index]
    index += 1

    if (!record) {
      throw new Error('Git status output contains an empty record.')
    }

    if (record.startsWith('# ')) {
      parseHeader(record, snapshot.branch)
      continue
    }

    if (record.startsWith('1 ')) {
      snapshot.entries.push(parseOrdinaryRecord(record))
      continue
    }

    if (record.startsWith('2 ')) {
      const origPath = fields[index]
      index += 1
      snapshot.entries.push(parseRenameOrCopyRecord(record, origPath))
      continue
    }

    if (record.startsWith('u ')) {
      snapshot.entries.push(parseUnmergedRecord(record))
      continue
    }

    if (record.startsWith('? ')) {
      snapshot.entries.push({
        kind: 'untracked',
        path: readRecordPath(record.slice(2), '?'),
      })
      continue
    }

    throw new Error(`Unsupported git status record: ${record.slice(0, 32)}`)
  }

  return snapshot
}

export function mapGitStatusCode(code: string): DiffEntryStatus {
  switch (code) {
    case 'M':
      return 'modified'
    case 'A':
      return 'added'
    case 'D':
      return 'deleted'
    case 'R':
      return 'renamed'
    case 'C':
      return 'copied'
    case 'T':
      return 'typeChanged'
    case 'U':
      return 'conflicted'
    default:
      return 'unsupported'
  }
}

function parseHeader(record: string, branch: GitStatusBranch) {
  const valueStart = record.indexOf(' ', 2)
  if (valueStart < 0) {
    return
  }

  const name = record.slice(2, valueStart)
  const value = record.slice(valueStart + 1)
  if (name === 'branch.oid') {
    branch.headSha = value === '(initial)' ? null : readOid(value)
  } else if (name === 'branch.head') {
    branch.currentBranch = value === '(detached)' ? null : value || null
  }
}

function parseOrdinaryRecord(record: string): Extract<GitStatusEntry, { kind: 'changed' }> {
  const parsed = splitFixedFields(record, 8)
  const [kind, xy, , , , , headOid, indexOid] = parsed.fields
  if (kind !== '1') {
    throw new Error('Git status ordinary record has an invalid kind.')
  }
  validateXy(xy)

  return {
    kind: 'changed',
    xy,
    path: readRecordPath(parsed.path, '1'),
    oldPath: null,
    headOid: readOid(headOid),
    indexOid: readOid(indexOid),
  }
}

function parseRenameOrCopyRecord(
  record: string,
  origPath: string | undefined,
): Extract<GitStatusEntry, { kind: 'changed' }> {
  const parsed = splitFixedFields(record, 9)
  const [kind, xy, , , , , headOid, indexOid, scoreToken] = parsed.fields
  if (kind !== '2') {
    throw new Error('Git status rename/copy record has an invalid kind.')
  }
  validateXy(xy)

  const score = parseScore(scoreToken)
  if (origPath === undefined) {
    throw new Error('Git status rename/copy record is missing the original path.')
  }

  return {
    kind: 'changed',
    xy,
    path: readRecordPath(parsed.path, '2'),
    oldPath: readRecordPath(origPath, '2'),
    headOid: readOid(headOid),
    indexOid: readOid(indexOid),
    score: score.score,
    changeKind: score.kind,
  }
}

function parseUnmergedRecord(record: string): Extract<GitStatusEntry, { kind: 'conflicted' }> {
  const parsed = splitFixedFields(record, 10)
  const [kind, xy] = parsed.fields
  if (kind !== 'u') {
    throw new Error('Git status unmerged record has an invalid kind.')
  }
  validateXy(xy)

  return {
    kind: 'conflicted',
    xy,
    path: readRecordPath(parsed.path, 'u'),
  }
}

function splitFixedFields(record: string, fieldCount: number) {
  const fields: string[] = []
  let cursor = 0

  while (fields.length < fieldCount) {
    const spaceIndex = record.indexOf(' ', cursor)
    if (spaceIndex < 0) {
      throw new Error(`Git status record is missing fields: ${record}`)
    }

    fields.push(record.slice(cursor, spaceIndex))
    cursor = spaceIndex + 1
  }

  return {
    fields,
    path: record.slice(cursor),
  }
}

function validateXy(value: string) {
  if (!/^[.MADRCUT?! ][.MADRCUT?! ]$/.test(value)) {
    throw new Error(`Git status record has an invalid XY field: ${value}`)
  }
}

function parseScore(value: string) {
  const code = value[0]
  const suffix = value.slice(1)
  if (code !== 'R' && code !== 'C') {
    throw new Error(`Git status rename/copy record has an invalid score token: ${value}`)
  }
  if (!/^\d+$/.test(suffix)) {
    throw new Error(`Git status rename/copy record has an invalid score: ${value}`)
  }

  return {
    kind: code === 'R' ? 'renamed' as const : 'copied' as const,
    score: Number.parseInt(suffix, 10),
  }
}

function readOid(value: string) {
  if (value === '.' || value === ZERO_OID) {
    return null
  }
  if (!FULL_OID_PATTERN.test(value)) {
    throw new Error(`Git status record has an invalid object id: ${value}`)
  }
  return value
}

function readRecordPath(path: string, recordKind: string) {
  if (path === '') {
    throw new Error(`Git status ${recordKind} record contains an empty path.`)
  }

  return path
}
