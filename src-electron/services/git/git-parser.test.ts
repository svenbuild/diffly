import { describe, expect, it } from 'vitest'
import {
  parseGitNameStatusOutput,
  parseGitRawNumstatOutput,
} from './git-parser'

describe('parseGitNameStatusOutput', () => {
  it('parses modified entries', () => {
    expect(parseGitNameStatusOutput('M\0src/file.ts\0')).toEqual([
      {
        status: 'modified',
        oldPath: null,
        path: 'src/file.ts',
      },
    ])
  })

  it('parses added entries', () => {
    expect(parseGitNameStatusOutput('A\0src/new.ts\0')).toEqual([
      {
        status: 'added',
        oldPath: null,
        path: 'src/new.ts',
      },
    ])
  })

  it('parses deleted entries', () => {
    expect(parseGitNameStatusOutput('D\0src/old.ts\0')).toEqual([
      {
        status: 'deleted',
        oldPath: null,
        path: 'src/old.ts',
      },
    ])
  })

  it('parses renamed entries with scores', () => {
    expect(parseGitNameStatusOutput('R100\0old.ts\0new.ts\0')).toEqual([
      {
        status: 'renamed',
        score: 100,
        oldPath: 'old.ts',
        path: 'new.ts',
      },
    ])
  })

  it('parses copied entries with scores', () => {
    expect(parseGitNameStatusOutput('C87\0old.ts\0copy.ts\0')).toEqual([
      {
        status: 'copied',
        score: 87,
        oldPath: 'old.ts',
        path: 'copy.ts',
      },
    ])
  })

  it('preserves paths with spaces', () => {
    expect(parseGitNameStatusOutput('M\0src/my file.ts\0')).toEqual([
      {
        status: 'modified',
        oldPath: null,
        path: 'src/my file.ts',
      },
    ])
  })

  it('preserves unicode paths', () => {
    expect(parseGitNameStatusOutput('A\0src/\u00fcberblick-\u6771\u4eac.ts\0')).toEqual([
      {
        status: 'added',
        oldPath: null,
        path: 'src/\u00fcberblick-\u6771\u4eac.ts',
      },
    ])
  })

  it('parses multiple entries', () => {
    expect(parseGitNameStatusOutput('M\0src/file.ts\0D\0src/old.ts\0R90\0old.ts\0new.ts\0')).toEqual([
      {
        status: 'modified',
        oldPath: null,
        path: 'src/file.ts',
      },
      {
        status: 'deleted',
        oldPath: null,
        path: 'src/old.ts',
      },
      {
        status: 'renamed',
        score: 90,
        oldPath: 'old.ts',
        path: 'new.ts',
      },
    ])
  })

  it('returns no entries for empty output', () => {
    expect(parseGitNameStatusOutput('')).toEqual([])
  })

  it('accepts complete records without a trailing NUL', () => {
    expect(parseGitNameStatusOutput('M\0src/file.ts')).toEqual([
      {
        status: 'modified',
        oldPath: null,
        path: 'src/file.ts',
      },
    ])
  })

  it('ignores numeric scores for non-rename and non-copy statuses', () => {
    expect(parseGitNameStatusOutput('M100\0src/file.ts\0')).toEqual([
      {
        status: 'modified',
        oldPath: null,
        path: 'src/file.ts',
      },
    ])
  })

  it('maps unknown statuses to unsupported', () => {
    expect(parseGitNameStatusOutput('X\0src/file.ts\0')).toEqual([
      {
        status: 'unsupported',
        oldPath: null,
        path: 'src/file.ts',
      },
    ])
  })

  it('throws for incomplete renames', () => {
    expect(() => parseGitNameStatusOutput('R100\0old.ts\0')).toThrow(
      'missing a path',
    )
  })

  it('throws for missing paths', () => {
    expect(() => parseGitNameStatusOutput('M')).toThrow('missing a path')
  })

  it('throws for empty paths', () => {
    expect(() => parseGitNameStatusOutput('M\0\0')).toThrow('empty path')
  })

  it('throws for invalid rename or copy scores', () => {
    expect(() => parseGitNameStatusOutput('Rabc\0old.ts\0new.ts\0')).toThrow(
      'invalid score',
    )
    expect(() => parseGitNameStatusOutput('Cabc\0old.ts\0copy.ts\0')).toThrow(
      'invalid score',
    )
  })
})

describe('parseGitRawNumstatOutput', () => {
  it('parses raw status entries and numstat binary paths', () => {
    expect(parseGitRawNumstatOutput([
      ':100644 100644 69e982b 0000000 M',
      'package-lock.json',
      ':100644 100644 c0338e7 0000000 M',
      'src/icon.png',
      '10\t0\tpackage-lock.json',
      '-\t-\tsrc/icon.png',
      '',
    ].join('\0'))).toEqual({
      entries: [
        {
          status: 'modified',
          oldPath: null,
          path: 'package-lock.json',
        },
        {
          status: 'modified',
          oldPath: null,
          path: 'src/icon.png',
        },
      ],
      binaryPaths: new Set(['src/icon.png']),
    })
  })

  it('parses renamed raw entries and binary rename numstat records', () => {
    expect(parseGitRawNumstatOutput([
      ':100644 100644 b6fc4c6 b6fc4c6 R100',
      'old name.bin',
      'new name.bin',
      '-\t-\t',
      'old name.bin',
      'new name.bin',
      '',
    ].join('\0'))).toEqual({
      entries: [
        {
          status: 'renamed',
          score: 100,
          oldPath: 'old name.bin',
          path: 'new name.bin',
        },
      ],
      binaryPaths: new Set(['old name.bin', 'new name.bin']),
    })
  })

  it('returns no entries for empty raw numstat output', () => {
    expect(parseGitRawNumstatOutput('')).toEqual({
      entries: [],
      binaryPaths: new Set(),
    })
  })
})
