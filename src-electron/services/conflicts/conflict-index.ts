import type { ConflictKind } from '../../../src/lib/conflict-types'
import { runGit } from '../git/git-service'

export interface UnmergedStage {
  stage: 1 | 2 | 3
  mode: number
  oid: string
}

export async function readUnmergedStages(repositoryRoot: string, path: string) {
  const result = await runGit(repositoryRoot, ['ls-files', '--unmerged', '-z', '--', path])
  const stages: UnmergedStage[] = []
  for (const record of result.stdout.split('\0').filter(Boolean)) {
    const match = /^(\d{6}) ([0-9a-f]{40}) ([123])\t([\s\S]+)$/i.exec(record)
    if (!match || match[4] !== path) throw new Error('Git returned malformed unmerged index data.')
    stages.push({
      mode: Number.parseInt(match[1], 8),
      oid: match[2],
      stage: Number(match[3]) as 1 | 2 | 3,
    })
  }
  return stages
}

export function inferConflictKind(stages: UnmergedStage[]): ConflictKind {
  const present = new Set(stages.map((stage) => stage.stage))
  if (present.has(1) && present.has(2) && present.has(3)) return 'UU'
  if (!present.has(1) && present.has(2) && present.has(3)) return 'AA'
  if (present.has(1) && present.has(2) && !present.has(3)) return 'UD'
  if (present.has(1) && !present.has(2) && present.has(3)) return 'DU'
  if (!present.has(1) && present.has(2) && !present.has(3)) return 'AU'
  if (!present.has(1) && !present.has(2) && present.has(3)) return 'UA'
  if (present.has(1) && !present.has(2) && !present.has(3)) return 'DD'
  throw new Error('Unsupported or incomplete Git conflict stages.')
}
