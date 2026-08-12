import { describe, expect, it } from 'vitest'
import { inferConflictKind, type UnmergedStage } from './conflict-index'

const stage = (value: 1 | 2 | 3): UnmergedStage => ({
  stage: value,
  mode: 0o100644,
  oid: String(value).repeat(40),
})

describe('inferConflictKind', () => {
  it.each([
    [[1, 2, 3], 'UU'],
    [[2, 3], 'AA'],
    [[1, 2], 'UD'],
    [[1, 3], 'DU'],
    [[2], 'AU'],
    [[3], 'UA'],
    [[1], 'DD'],
  ] as const)('maps stages %j to %s', (stages, expected) => {
    expect(inferConflictKind(stages.map(stage))).toBe(expected)
  })
})
