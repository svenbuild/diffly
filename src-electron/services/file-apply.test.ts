import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyFileChange, readApplyFileChangePayload } from './file-apply'

describe('applyFileChange', () => {
  let root: string
  let leftBase: string
  let rightBase: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'diffly-apply-'))
    leftBase = join(root, 'left')
    rightBase = join(root, 'right')
    await mkdir(leftBase)
    await mkdir(rightBase)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  function payload(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      sourcePath: join(leftBase, 'file.txt'),
      targetPath: join(rightBase, 'file.txt'),
      leftBase,
      rightBase,
      ...overrides,
    }
  }

  it('copies the source file over the target', async () => {
    await writeFile(join(leftBase, 'file.txt'), 'left contents')
    await writeFile(join(rightBase, 'file.txt'), 'right contents')

    await applyFileChange(payload())

    expect(await readFile(join(rightBase, 'file.txt'), 'utf8')).toBe('left contents')
    // No temp file left behind.
    expect((await readdir(rightBase)).sort()).toEqual(['file.txt'])
  })

  it('rejects non-record payloads', async () => {
    await expect(applyFileChange(null)).rejects.toThrow('Invalid apply file change payload.')
    await expect(applyFileChange([1])).rejects.toThrow('Invalid apply file change payload.')
  })

  it('rejects relative and protocol-prefixed paths', () => {
    expect(() =>
      readApplyFileChangePayload(payload({ sourcePath: 'relative/file.txt' })),
    ).toThrow('Invalid file path.')
    expect(() =>
      readApplyFileChangePayload(payload({ targetPath: 'file://evil' })),
    ).toThrow('Invalid file path.')
  })

  it('rejects paths containing NUL bytes', () => {
    const poisoned = `${join(rightBase, 'file.txt')}\u0000.txt`
    expect(() => readApplyFileChangePayload(payload({ targetPath: poisoned }))).toThrow(
      'Invalid file path.',
    )
  })

  it('rejects endpoints outside the compare roots', () => {
    expect(() =>
      readApplyFileChangePayload(payload({ targetPath: join(root, 'outside.txt') })),
    ).toThrow('File is outside the compared folders.')
    expect(() =>
      readApplyFileChangePayload(
        payload({ targetPath: join(rightBase, '..', 'outside.txt') }),
      ),
    ).toThrow('File is outside the compared folders.')
  })

  it('rejects identical source and target', () => {
    const samePath = join(leftBase, 'file.txt')
    expect(() =>
      readApplyFileChangePayload(payload({ sourcePath: samePath, targetPath: samePath })),
    ).toThrow('Source and target are the same file.')
  })

  it('accepts a base path itself as endpoint for single-file compares', () => {
    const fileLeft = join(leftBase, 'a.txt')
    const fileRight = join(rightBase, 'b.txt')
    const result = readApplyFileChangePayload({
      sourcePath: fileLeft,
      targetPath: fileRight,
      leftBase: fileLeft,
      rightBase: fileRight,
    })
    expect(result.sourcePath).toBe(fileLeft)
    expect(result.targetPath).toBe(fileRight)
  })

  it('rejects a missing source file', async () => {
    await writeFile(join(rightBase, 'file.txt'), 'right contents')
    await expect(applyFileChange(payload())).rejects.toThrow('Source file no longer exists.')
  })

  it('rejects a missing target file (add/delete case)', async () => {
    await writeFile(join(leftBase, 'file.txt'), 'left contents')
    await expect(applyFileChange(payload())).rejects.toThrow(
      'Only modify-modify files can be accepted for now.',
    )
  })

  it('rejects a directory target', async () => {
    await writeFile(join(leftBase, 'file.txt'), 'left contents')
    await mkdir(join(rightBase, 'file.txt'))
    await expect(applyFileChange(payload())).rejects.toThrow('Cannot overwrite a directory.')
  })

  it('rejects symlink endpoints', async () => {
    await writeFile(join(leftBase, 'file.txt'), 'left contents')
    await writeFile(join(rightBase, 'real.txt'), 'right contents')
    try {
      await symlink(join(rightBase, 'real.txt'), join(rightBase, 'file.txt'))
    } catch {
      // Symlink creation needs elevation on some Windows setups; nothing to
      // assert when the environment cannot create one.
      return
    }

    await expect(applyFileChange(payload())).rejects.toThrow(
      'Only regular files can be accepted.',
    )
    expect(await readFile(join(rightBase, 'real.txt'), 'utf8')).toBe('right contents')
  })
})
