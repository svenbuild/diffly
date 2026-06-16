import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest'
import { LocalProvider } from './local-provider'

const tempDirs: string[] = []

describe('LocalProvider', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ))
  })

  it('opens changed Windows-1252 text files from directory compares as text diffs', async () => {
    const root = await createTempDir()
    const leftRoot = join(root, 'left')
    const rightRoot = join(root, 'right')
    await mkdir(leftRoot)
    await mkdir(rightRoot)
    await writeFile(join(leftRoot, 'legacy.txt'), Buffer.from([0x47, 0x72, 0xfc, 0x6e, 0x0a]))
    await writeFile(join(rightRoot, 'legacy.txt'), Buffer.from([0x47, 0x72, 0xfc, 0x6e, 0x65, 0x0a]))

    const provider = new LocalProvider()
    const compare = await provider.comparePaths(leftRoot, rightRoot, 'directory', defaultOptions())

    if (compare.kind !== 'directory') {
      throw new Error('Expected a directory compare result.')
    }

    expect(compare.entries).toEqual([
      expect.objectContaining({
        relativePath: 'legacy.txt',
        status: 'modified',
      }),
    ])

    const diff = await provider.openCompareItem(
      leftRoot,
      rightRoot,
      'legacy.txt',
      defaultOptions(),
    )

    expect(diff.contentKind).toBe('text')
    expect(diff.unsupported).toBeNull()
    expect(diff.text?.leftText).toBe('Grün\n')
    expect(diff.text?.rightText).toBe('Grüne\n')
  })
})

function defaultOptions() {
  return {
    ignoreWhitespace: false,
    ignoreCase: false,
  }
}

async function createTempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'diffly-local-provider-'))
  tempDirs.push(dir)
  return dir
}
