import { describe, expect, it } from 'vitest'
import { applySelectedHunks, applySelectedHunksBoth, buildSelectedPatch, parseSingleFilePatch } from './hunk-patch'

const patch = [
  'diff --git a/file.txt b/file.txt',
  '--- a/file.txt',
  '+++ b/file.txt',
  '@@ -1,5 +1,5 @@',
  ' one',
  '-old-a',
  '+new-a',
  ' middle',
  '-old-b',
  '+new-b',
  ' tail',
  '',
].join('\n')

describe('hunk patch operations', () => {
  it('creates stable content fingerprints', () => {
    const first = parseSingleFilePatch(patch).hunks[0]
    const second = parseSingleFilePatch(patch).hunks[0]
    expect(first?.fingerprint).toEqual(second?.fingerprint)
    expect(first?.fingerprint.contextHash).toHaveLength(64)
    expect(first?.fingerprint.changeHash).toHaveLength(64)
  })

  it('applies a whole hunk forward and reverse', () => {
    const fingerprint = parseSingleFilePatch(patch).hunks[0]!.fingerprint
    const oldText = 'one\nold-a\nmiddle\nold-b\ntail\n'
    const newText = 'one\nnew-a\nmiddle\nnew-b\ntail\n'
    expect(applySelectedHunks(oldText, patch, [{ fingerprint }], 'forward')).toBe(newText)
    expect(applySelectedHunks(newText, patch, [{ fingerprint }], 'reverse')).toBe(oldText)
  })

  it('isolates an individual change block with corrected hunk counts', () => {
    const fingerprint = parseSingleFilePatch(patch).hunks[0]!.fingerprint
    const selection = [{ fingerprint, changeIndex: 1 }]
    expect(applySelectedHunks(
      'one\nold-a\nmiddle\nold-b\ntail\n',
      patch,
      selection,
      'forward',
    )).toBe('one\nold-a\nmiddle\nnew-b\ntail\n')
    const selectedPatch = buildSelectedPatch(patch, selection)
    expect(selectedPatch).toContain('-old-b\n+new-b')
    expect(selectedPatch).not.toContain('-old-a')
    expect(selectedPatch).toContain(' old-a')
  })

  it('keeps both versions on either target side without duplicating context', () => {
    const fingerprint = parseSingleFilePatch(patch).hunks[0]!.fingerprint
    const combined = 'one\nold-a\nnew-a\nmiddle\nold-b\nnew-b\ntail\n'
    expect(applySelectedHunksBoth(
      'one\nold-a\nmiddle\nold-b\ntail\n', patch, [{ fingerprint }], 'left',
    )).toBe(combined)
    expect(applySelectedHunksBoth(
      'one\nnew-a\nmiddle\nnew-b\ntail\n', patch, [{ fingerprint }], 'right',
    )).toBe(combined)
  })

  it('rejects stale fingerprints and non-applicable contents', () => {
    const fingerprint = parseSingleFilePatch(patch).hunks[0]!.fingerprint
    expect(() => buildSelectedPatch(patch, [{ fingerprint: { ...fingerprint, oldStart: 99 } }])).toThrow('PATCH_DOES_NOT_APPLY')
    expect(() => applySelectedHunks('external\n', patch, [{ fingerprint }], 'forward')).toThrow('PATCH_DOES_NOT_APPLY')
  })
})
