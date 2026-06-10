import { describe, expect, it } from 'vitest'
import {
  addPlannedOperation,
  removePlannedOperation,
  validatePlannedOperation,
  validatePlannedTargetPath,
  type PlannedFileOperation,
} from './file-operation-preview'

function operation(
  overrides: Partial<PlannedFileOperation> = {},
): PlannedFileOperation {
  return {
    id: 'src/a.ts',
    kind: 'rename',
    fromRelativePath: 'src/a.ts',
    toRelativePath: 'src/b.ts',
    ...overrides,
  }
}

describe('addPlannedOperation', () => {
  it('records a rename within the same directory', () => {
    const next = addPlannedOperation([], {
      fromRelativePath: 'src/a.ts',
      toRelativePath: 'src/b.ts',
    })
    expect(next).toEqual([operation()])
  })

  it('records a move when the parent directory changes', () => {
    const next = addPlannedOperation([], {
      fromRelativePath: 'src/a.ts',
      toRelativePath: 'lib/a.ts',
    })
    expect(next).toEqual([
      operation({ kind: 'move', toRelativePath: 'lib/a.ts' }),
    ])
  })

  it('collapses chained operations A->B then B->C into A->C', () => {
    const first = addPlannedOperation([], {
      fromRelativePath: 'src/a.ts',
      toRelativePath: 'src/b.ts',
    })
    const second = addPlannedOperation(first, {
      fromRelativePath: 'src/b.ts',
      toRelativePath: 'src/c.ts',
    })
    expect(second).toEqual([operation({ toRelativePath: 'src/c.ts' })])
  })

  it('removes the plan when a chain returns to the original path', () => {
    const first = addPlannedOperation([], {
      fromRelativePath: 'src/a.ts',
      toRelativePath: 'src/b.ts',
    })
    const second = addPlannedOperation(first, {
      fromRelativePath: 'src/b.ts',
      toRelativePath: 'src/a.ts',
    })
    expect(second).toEqual([])
  })

  it('ignores a direct A->A operation', () => {
    expect(
      addPlannedOperation([], {
        fromRelativePath: 'src/a.ts',
        toRelativePath: 'src/a.ts',
      }),
    ).toEqual([])
  })

  it('derives move kind across a rename-then-move chain', () => {
    const first = addPlannedOperation([], {
      fromRelativePath: 'src/a.ts',
      toRelativePath: 'src/b.ts',
    })
    const second = addPlannedOperation(first, {
      fromRelativePath: 'src/b.ts',
      toRelativePath: 'lib/b.ts',
    })
    expect(second).toEqual([
      operation({ kind: 'move', toRelativePath: 'lib/b.ts' }),
    ])
  })

  it('keeps unrelated plans and preserves list order when collapsing', () => {
    const other = operation({
      id: 'docs/readme.md',
      fromRelativePath: 'docs/readme.md',
      toRelativePath: 'docs/intro.md',
    })
    const next = addPlannedOperation([operation(), other], {
      fromRelativePath: 'src/b.ts',
      toRelativePath: 'src/c.ts',
    })
    expect(next).toEqual([operation({ toRelativePath: 'src/c.ts' }), other])
  })

  it('normalizes backslash separators', () => {
    const next = addPlannedOperation([], {
      fromRelativePath: 'src\\a.ts',
      toRelativePath: 'src\\b.ts',
    })
    expect(next).toEqual([operation()])
  })
})

describe('removePlannedOperation', () => {
  it('removes the matching plan and keeps others', () => {
    const other = operation({ id: 'x', fromRelativePath: 'x', toRelativePath: 'y' })
    expect(removePlannedOperation([operation(), other], 'src/a.ts')).toEqual([
      other,
    ])
  })

  it('leaves the list untouched for unknown ids', () => {
    expect(removePlannedOperation([operation()], 'missing')).toEqual([
      operation(),
    ])
  })
})

describe('validatePlannedTargetPath', () => {
  it('accepts simple relative paths', () => {
    expect(validatePlannedTargetPath('src/b.ts')).toEqual({ ok: true })
    expect(validatePlannedTargetPath('b.ts')).toEqual({ ok: true })
  })

  it('rejects empty targets', () => {
    expect(validatePlannedTargetPath('')).toEqual({
      ok: false,
      reason: 'empty-path',
    })
    expect(validatePlannedTargetPath('   ')).toEqual({
      ok: false,
      reason: 'empty-path',
    })
  })

  it('rejects absolute targets', () => {
    expect(validatePlannedTargetPath('/etc/passwd')).toEqual({
      ok: false,
      reason: 'absolute-path',
    })
    expect(validatePlannedTargetPath('C:\\temp\\a.ts')).toEqual({
      ok: false,
      reason: 'absolute-path',
    })
  })

  it('rejects targets escaping the compare root', () => {
    expect(validatePlannedTargetPath('../outside.ts')).toEqual({
      ok: false,
      reason: 'escapes-root',
    })
    expect(validatePlannedTargetPath('src/../../outside.ts')).toEqual({
      ok: false,
      reason: 'escapes-root',
    })
  })

  it('rejects NUL and invalid Windows characters', () => {
    expect(validatePlannedTargetPath('src/a' + String.fromCharCode(0) + '.ts')).toEqual({
      ok: false,
      reason: 'invalid-characters',
    })
    expect(validatePlannedTargetPath('src/a<b.ts')).toEqual({
      ok: false,
      reason: 'invalid-characters',
    })
    expect(validatePlannedTargetPath('src/a:b.ts')).toEqual({
      ok: false,
      reason: 'invalid-characters',
    })
  })

  it('rejects empty and dot segments', () => {
    expect(validatePlannedTargetPath('src//b.ts')).toEqual({
      ok: false,
      reason: 'invalid-characters',
    })
    expect(validatePlannedTargetPath('src/./b.ts')).toEqual({
      ok: false,
      reason: 'invalid-characters',
    })
  })
})

describe('validatePlannedOperation', () => {
  const occupied = (paths: string[]) => (path: string) => paths.includes(path)

  it('accepts a free target', () => {
    expect(
      validatePlannedOperation(
        { fromRelativePath: 'src/a.ts', toRelativePath: 'src/b.ts' },
        occupied(['src/a.ts']),
      ),
    ).toEqual({ ok: true })
  })

  it('rejects overwriting an existing entry', () => {
    expect(
      validatePlannedOperation(
        { fromRelativePath: 'src/a.ts', toRelativePath: 'src/b.ts' },
        occupied(['src/a.ts', 'src/b.ts']),
      ),
    ).toEqual({ ok: false, reason: 'collision' })
  })

  it('does not report a collision for a no-op back to the same path', () => {
    expect(
      validatePlannedOperation(
        { fromRelativePath: 'src/a.ts', toRelativePath: 'src/a.ts' },
        occupied(['src/a.ts']),
      ),
    ).toEqual({ ok: true })
  })

  it('propagates syntactic rejections', () => {
    expect(
      validatePlannedOperation(
        { fromRelativePath: 'src/a.ts', toRelativePath: '../a.ts' },
        occupied([]),
      ),
    ).toEqual({ ok: false, reason: 'escapes-root' })
  })
})
