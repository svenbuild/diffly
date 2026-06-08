import type { DiffEntryStatus } from '../../../src/lib/types'

export interface GitNameStatusEntry {
  status: DiffEntryStatus
  score?: number
  oldPath: string | null
  path: string
}

export function parseGitNameStatusOutput(output: string): GitNameStatusEntry[] {
  if (output === '') {
    return []
  }

  const fields = output.split('\0')
  if (fields[fields.length - 1] === '') {
    fields.pop()
  }

  const entries: GitNameStatusEntry[] = []
  let index = 0

  while (index < fields.length) {
    const statusToken = fields[index]
    index += 1

    if (!statusToken) {
      throw new Error('Git name-status output contains an empty status field.')
    }

    const parsedStatus = parseStatusToken(statusToken)
    if (parsedStatus.status === 'renamed' || parsedStatus.status === 'copied') {
      const oldPath = readPathField(fields, index, statusToken)
      const path = readPathField(fields, index + 1, statusToken)
      index += 2

      entries.push({
        ...parsedStatus,
        oldPath,
        path,
      })
      continue
    }

    const path = readPathField(fields, index, statusToken)
    index += 1

    entries.push({
      ...parsedStatus,
      oldPath: null,
      path,
    })
  }

  return entries
}

function parseStatusToken(statusToken: string): Pick<GitNameStatusEntry, 'status' | 'score'> {
  const code = statusToken[0]
  const suffix = statusToken.slice(1)
  const status = mapStatusCode(code)

  if (status !== 'renamed' && status !== 'copied') {
    return { status }
  }

  if (suffix === '') {
    return { status }
  }

  if (!/^\d+$/.test(suffix)) {
    throw new Error(`Git ${status} status has an invalid score: ${statusToken}`)
  }

  return {
    status,
    score: Number.parseInt(suffix, 10),
  }
}

function mapStatusCode(code: string | undefined): DiffEntryStatus {
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

function readPathField(fields: string[], index: number, statusToken: string) {
  const path = fields[index]
  if (path === undefined) {
    throw new Error(`Git name-status output is missing a path for status ${statusToken}.`)
  }

  if (path === '') {
    throw new Error(`Git name-status output contains an empty path for status ${statusToken}.`)
  }

  return path
}
