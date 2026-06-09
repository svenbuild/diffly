import {
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import {
  buildFileDiffFromPaths,
  buildFileDiffFromSnapshots,
  clearFileDiffCache,
  type DiffSnapshot,
} from './file-diff'

const tempDirs: string[] = []

describe('file diff snapshots', () => {
  beforeEach(() => {
    clearFileDiffCache()
  })

  afterEach(async () => {
    clearFileDiffCache()
    await Promise.all(tempDirs.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ))
  })

  it('builds a text diff from snapshots without local paths', async () => {
    const result = await buildFileDiffFromSnapshots(
      textSnapshot('left.txt', 'left.txt', 'left\n', 'left-key'),
      textSnapshot('right.txt', 'right.txt', 'right\n', 'right-key'),
      defaultOptions(),
    )

    expect(result.contentKind).toBe('text')
    expect(result.leftLabel).toBe('left.txt')
    expect(result.rightLabel).toBe('right.txt')
    expect(result.text?.leftText).toBe('left\n')
    expect(result.text?.rightText).toBe('right\n')
    expect(result.summary).toBe('Comparison ready.')
  })

  it('builds a text diff when the left snapshot is missing', async () => {
    const result = await buildFileDiffFromSnapshots(
      missingSnapshot('left.txt', 'left.txt', 'left-missing'),
      textSnapshot('right.txt', 'right.txt', 'right\n', 'right-key'),
      defaultOptions(),
    )

    expect(result.contentKind).toBe('text')
    expect(result.summary).toBe('Only the right file exists.')
    expect(result.text?.leftExists).toBe(false)
    expect(result.text?.leftText).toBe('')
    expect(result.text?.rightExists).toBe(true)
    expect(result.text?.rightText).toBe('right\n')
  })

  it('builds a text diff when the right snapshot is missing', async () => {
    const result = await buildFileDiffFromSnapshots(
      textSnapshot('left.txt', 'left.txt', 'left\n', 'left-key'),
      missingSnapshot('right.txt', 'right.txt', 'right-missing'),
      defaultOptions(),
    )

    expect(result.contentKind).toBe('text')
    expect(result.summary).toBe('Only the left file exists.')
    expect(result.text?.leftExists).toBe(true)
    expect(result.text?.rightExists).toBe(false)
    expect(result.text?.rightText).toBe('')
  })

  it('returns unsupported missing when both snapshots are missing', async () => {
    const result = await buildFileDiffFromSnapshots(
      missingSnapshot('left.txt', 'left.txt', 'left-missing'),
      missingSnapshot('right.txt', 'right.txt', 'right-missing'),
      defaultOptions(),
    )

    expect(result.contentKind).toBe('unsupported')
    expect(result.summary).toBe('Neither file exists.')
    expect(result.unsupported?.reason).toBe('missing')
  })

  it.each([
    ['binary', 'binary'],
    ['image', 'image'],
    ['tooLarge', 'tooLarge'],
    ['readError', 'readError'],
  ] as const)('returns unsupported %s snapshots', async (kind, reason) => {
    const result = await buildFileDiffFromSnapshots(
      nonTextSnapshot(kind, 'left.bin', 'left.bin'),
      textSnapshot('right.txt', 'right.txt', 'right\n', 'right-key'),
      defaultOptions(),
    )

    expect(result.contentKind).toBe('unsupported')
    expect(result.unsupported?.reason).toBe(reason)
  })

  it('keeps local file diff working through path snapshots', async () => {
    const dir = await createTempDir()
    const leftPath = join(dir, 'left.txt')
    const rightPath = join(dir, 'right.txt')
    await writeFile(leftPath, 'left\n')
    await writeFile(rightPath, 'right\n')

    const result = await buildFileDiffFromPaths(
      leftPath,
      rightPath,
      'left.txt',
      'right.txt',
      defaultOptions(),
    )

    expect(result.contentKind).toBe('text')
    expect(result.text?.leftText).toBe('left\n')
    expect(result.text?.rightText).toBe('right\n')
  })

  it('detects local CRLF line endings and trailing newlines', async () => {
    const dir = await createTempDir()
    const leftPath = join(dir, 'left.txt')
    const rightPath = join(dir, 'right.txt')
    await writeFile(leftPath, 'left\r\n')
    await writeFile(rightPath, 'right')

    const result = await buildFileDiffFromPaths(
      leftPath,
      rightPath,
      'left.txt',
      'right.txt',
      defaultOptions(),
    )

    expect(result.text?.leftLineEnding).toBe('crlf')
    expect(result.text?.leftHasTrailingNewline).toBe(true)
    expect(result.text?.rightLineEnding).toBe('lf')
    expect(result.text?.rightHasTrailingNewline).toBe(false)
  })

  it('uses snapshot cache keys for file diff caching', async () => {
    const first = await buildFileDiffFromSnapshots(
      textSnapshot('left.txt', 'left.txt', 'left x\n', 'left-a'),
      textSnapshot('right.txt', 'right.txt', 'right x\n', 'right-a'),
      defaultOptions(),
    )
    const cached = await buildFileDiffFromSnapshots(
      textSnapshot('left.txt', 'left.txt', 'left y\n', 'left-a'),
      textSnapshot('right.txt', 'right.txt', 'right y\n', 'right-a'),
      defaultOptions(),
    )
    const changed = await buildFileDiffFromSnapshots(
      textSnapshot('left.txt', 'left.txt', 'left y\n', 'left-b'),
      textSnapshot('right.txt', 'right.txt', 'right y\n', 'right-b'),
      defaultOptions(),
    )

    expect(first.text?.leftText).toBe('left x\n')
    expect(cached.text?.leftText).toBe('left x\n')
    expect(changed.text?.leftText).toBe('left y\n')
  })
})

function defaultOptions() {
  return {
    ignoreWhitespace: false,
    ignoreCase: false,
  }
}

async function createTempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'diffly-file-diff-'))
  tempDirs.push(dir)
  return dir
}

function textSnapshot(
  label: string,
  logicalPath: string,
  text: string,
  cacheKey: string | null,
): DiffSnapshot {
  const bytes = new TextEncoder().encode(text)
  return {
    kind: 'text',
    exists: true,
    label,
    logicalPath,
    cacheKey,
    bytes,
    text,
    size: bytes.byteLength,
    lineEnding: text.includes('\r\n') ? 'crlf' : 'lf',
    hasTrailingNewline: text.endsWith('\n'),
    error: null,
  }
}

function missingSnapshot(
  label: string,
  logicalPath: string,
  cacheKey: string | null,
): DiffSnapshot {
  return {
    kind: 'missing',
    exists: false,
    label,
    logicalPath,
    cacheKey,
    bytes: null,
    text: null,
    size: null,
    lineEnding: null,
    hasTrailingNewline: null,
    error: null,
  }
}

function nonTextSnapshot(
  kind: 'binary' | 'image' | 'tooLarge' | 'readError',
  label: string,
  logicalPath: string,
): DiffSnapshot {
  return {
    kind,
    exists: true,
    label,
    logicalPath,
    cacheKey: `${kind}-key`,
    bytes: null,
    text: null,
    size: 10,
    lineEnding: null,
    hasTrailingNewline: null,
    error: kind === 'readError' ? 'failed' : null,
  }
}
