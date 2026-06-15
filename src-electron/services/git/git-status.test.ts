import { describe, expect, it } from 'vitest'
import { parseGitStatusPorcelainV2Output } from './git-status'

const HEAD_OID = 'a'.repeat(40)
const INDEX_OID = 'b'.repeat(40)
const OTHER_OID = 'c'.repeat(40)

describe('parseGitStatusPorcelainV2Output', () => {
  it('parses branch headers', () => {
    expect(parseGitStatusPorcelainV2Output([
      `# branch.oid ${HEAD_OID}`,
      '# branch.head feature/status-snapshot',
      '',
    ].join('\0'))).toEqual({
      branch: {
        headSha: HEAD_OID,
        currentBranch: 'feature/status-snapshot',
      },
      entries: [],
    })
  })

  it('parses initial and detached branch headers as null', () => {
    expect(parseGitStatusPorcelainV2Output([
      '# branch.oid (initial)',
      '# branch.head (detached)',
      '',
    ].join('\0')).branch).toEqual({
      headSha: null,
      currentBranch: null,
    })
  })

  it('parses ordinary changed records', () => {
    expect(parseGitStatusPorcelainV2Output([
      `1 M. N... 100644 100644 100644 ${HEAD_OID} ${INDEX_OID} src/file.ts`,
      '',
    ].join('\0')).entries).toEqual([
      {
        kind: 'changed',
        xy: 'M.',
        path: 'src/file.ts',
        oldPath: null,
        headOid: HEAD_OID,
        indexOid: INDEX_OID,
      },
    ])
  })

  it('parses rename and copy records', () => {
    expect(parseGitStatusPorcelainV2Output([
      `2 R. N... 100644 100644 100644 ${HEAD_OID} ${INDEX_OID} R100 new name.txt`,
      'old name.txt',
      `2 C. N... 100644 100644 100644 ${HEAD_OID} ${OTHER_OID} C87 copied name.txt`,
      'source name.txt',
      '',
    ].join('\0')).entries).toEqual([
      {
        kind: 'changed',
        xy: 'R.',
        path: 'new name.txt',
        oldPath: 'old name.txt',
        headOid: HEAD_OID,
        indexOid: INDEX_OID,
        score: 100,
        changeKind: 'renamed',
      },
      {
        kind: 'changed',
        xy: 'C.',
        path: 'copied name.txt',
        oldPath: 'source name.txt',
        headOid: HEAD_OID,
        indexOid: OTHER_OID,
        score: 87,
        changeKind: 'copied',
      },
    ])
  })

  it('parses untracked records', () => {
    expect(parseGitStatusPorcelainV2Output('? new file.txt\0').entries).toEqual([
      {
        kind: 'untracked',
        path: 'new file.txt',
      },
    ])
  })

  it('parses conflict records', () => {
    expect(parseGitStatusPorcelainV2Output([
      `u UU N... 100644 100644 100644 100644 ${HEAD_OID} ${INDEX_OID} ${OTHER_OID} conflict.txt`,
      '',
    ].join('\0')).entries).toEqual([
      {
        kind: 'conflicted',
        xy: 'UU',
        path: 'conflict.txt',
      },
    ])
  })

  it('preserves spaces, tabs, and ü in paths', () => {
    const path = 'dir/path with space\tand ü.txt'

    expect(parseGitStatusPorcelainV2Output([
      `1 .M N... 100644 100644 100644 ${HEAD_OID} ${HEAD_OID} ${path}`,
      '',
    ].join('\0')).entries[0]).toMatchObject({
      path,
    })
  })

  it('throws on unsupported records so callers can fall back', () => {
    expect(() => parseGitStatusPorcelainV2Output('! ignored.txt\0')).toThrow(
      'Unsupported git status record',
    )
  })
})
