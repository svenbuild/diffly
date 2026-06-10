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
          srcOid: null,
          dstOid: null,
        },
        {
          status: 'modified',
          oldPath: null,
          path: 'src/icon.png',
          srcOid: null,
          dstOid: null,
        },
      ],
      binaryPaths: new Set(['src/icon.png']),
    })
  })

  it('captures full src and dst oids from --full-index raw headers', () => {
    const srcOid = 'a'.repeat(40)
    const dstOid = 'b'.repeat(40)
    expect(parseGitRawNumstatOutput([
      `:100644 100644 ${srcOid} ${dstOid} M`,
      'src/file.ts',
      '1\t1\tsrc/file.ts',
      '',
    ].join('\0'))).toEqual({
      entries: [
        {
          status: 'modified',
          oldPath: null,
          path: 'src/file.ts',
          srcOid,
          dstOid,
        },
      ],
      binaryPaths: new Set(),
    })
  })

  it('maps all-zero and abbreviated oids to null', () => {
    const srcOid = 'c'.repeat(40)
    expect(parseGitRawNumstatOutput([
      `:100644 100644 ${srcOid} ${'0'.repeat(40)} M`,
      'src/dirty.ts',
      ':100644 100644 69e982b 0123456 M',
      'src/abbrev.ts',
      '1\t1\tsrc/dirty.ts',
      '1\t1\tsrc/abbrev.ts',
      '',
    ].join('\0'))).toEqual({
      entries: [
        {
          status: 'modified',
          oldPath: null,
          path: 'src/dirty.ts',
          srcOid,
          dstOid: null,
        },
        {
          status: 'modified',
          oldPath: null,
          path: 'src/abbrev.ts',
          srcOid: null,
          dstOid: null,
        },
      ],
      binaryPaths: new Set(),
    })
  })

  it('captures oids on renamed entries', () => {
    const srcOid = 'd'.repeat(40)
    const dstOid = 'e'.repeat(40)
    expect(parseGitRawNumstatOutput([
      `:100644 100644 ${srcOid} ${dstOid} R100`,
      'old.ts',
      'new.ts',
      '0\t0\t',
      'old.ts',
      'new.ts',
      '',
    ].join('\0'))).toEqual({
      entries: [
        {
          status: 'renamed',
          score: 100,
          oldPath: 'old.ts',
          path: 'new.ts',
          srcOid,
          dstOid,
        },
      ],
      binaryPaths: new Set(),
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
          srcOid: null,
          dstOid: null,
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
