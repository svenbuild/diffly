import { get } from 'svelte/store'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EntryStatus, TextDiffPayload } from '../types'
import {
  reviewActionsForSource,
  reviewEntryInfoFromEntry,
  reviewEntryInfoFromText,
  reviewModeEnabled,
  runReviewAction,
  type ReviewActionContext,
  type ReviewActionItem,
  type ReviewEntryInfo,
} from './review-mode'

function entryInfo(overrides: Partial<ReviewEntryInfo> = {}): ReviewEntryInfo {
  return {
    status: 'modified',
    binary: false,
    hasTextDiff: true,
    ...overrides,
  }
}

function ids(actions: ReviewActionItem[]) {
  return actions.map((action) => action.id)
}

function textPayload(overrides: Partial<TextDiffPayload> = {}): TextDiffPayload {
  return {
    leftText: 'a\n',
    rightText: 'b\n',
    leftExists: true,
    rightExists: true,
    leftCacheKey: null,
    rightCacheKey: null,
    leftSha256: null,
    rightSha256: null,
    leftLineEnding: 'lf',
    rightLineEnding: 'lf',
    leftHasTrailingNewline: true,
    rightHasTrailingNewline: true,
    ...overrides,
  }
}

function actionContext(overrides: Partial<ReviewActionContext> = {}): ReviewActionContext {
  return {
    displayPath: 'src/app.ts',
    leftPath: 'C:\\left\\src\\app.ts',
    rightPath: 'C:\\right\\src\\app.ts',
    leftBase: 'C:\\left',
    rightBase: 'C:\\right',
    text: textPayload(),
    refresh: vi.fn(),
    notify: vi.fn(),
    confirmAction: vi.fn(() => true),
    ...overrides,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('reviewModeEnabled', () => {
  it('defaults to off', () => {
    expect(get(reviewModeEnabled)).toBe(false)
  })
})

describe('reviewActionsForSource', () => {
  it('offers accept, open, and copy patch for local compares', () => {
    expect(ids(reviewActionsForSource('local', entryInfo()))).toEqual([
      'acceptLeft',
      'acceptRight',
      'openExternal',
      'copyPatch',
    ])
  })

  it('enables accept only for modify-modify entries', () => {
    const actions = reviewActionsForSource('local', entryInfo())
    expect(actions.find((action) => action.id === 'acceptLeft')?.enabled).toBe(true)
    expect(actions.find((action) => action.id === 'acceptRight')?.enabled).toBe(true)

    const disabledStatuses: EntryStatus[] = ['leftOnly', 'rightOnly', 'unsupported', 'unchanged']
    for (const status of disabledStatuses) {
      const gated = reviewActionsForSource('local', entryInfo({ status }))
      expect(gated.find((action) => action.id === 'acceptLeft')?.enabled).toBe(false)
      expect(gated.find((action) => action.id === 'acceptRight')?.enabled).toBe(false)
      expect(gated.find((action) => action.id === 'acceptLeft')?.tooltip).toContain(
        'Only modify-modify files can be accepted for now',
      )
    }
  })

  it('marks both accept directions as mutating and dangerous', () => {
    const actions = reviewActionsForSource('local', entryInfo())
    for (const id of ['acceptLeft', 'acceptRight'] as const) {
      const action = actions.find((candidate) => candidate.id === id)
      expect(action?.mutating).toBe(true)
      expect(action?.danger).toBe(true)
    }
  })

  it('renders git working tree actions disabled with a coming-soon tooltip', () => {
    const actions = reviewActionsForSource('gitWorkingTree', entryInfo())
    expect(ids(actions)).toEqual([
      'stageFile',
      'unstageFile',
      'discardFile',
      'openExternal',
      'copyPatch',
    ])
    for (const id of ['stageFile', 'unstageFile', 'discardFile'] as const) {
      const action = actions.find((candidate) => candidate.id === id)
      expect(action?.enabled).toBe(false)
      expect(action?.tooltip).toBe('Git review actions coming soon')
    }
  })

  it('offers only copyPatch for read-only sources', () => {
    for (const sourceKind of ['gitRefRange', 'gitCommit', 'github'] as const) {
      const actions = reviewActionsForSource(sourceKind, entryInfo())
      expect(ids(actions)).toEqual(['copyPatch'])
      expect(actions.some((action) => action.mutating)).toBe(false)
    }
  })

  it('disables copyPatch without a loaded text diff', () => {
    const actions = reviewActionsForSource('github', entryInfo({ hasTextDiff: false }))
    expect(actions.find((action) => action.id === 'copyPatch')?.enabled).toBe(false)
  })
})

describe('reviewEntryInfo helpers', () => {
  it('derives entry info from a directory entry', () => {
    const info = reviewEntryInfoFromEntry(
      {
        relativePath: 'src/app.ts',
        status: 'modified',
        leftPath: 'C:\\left\\src\\app.ts',
        rightPath: 'C:\\right\\src\\app.ts',
        leftSize: 1,
        rightSize: 2,
        binary: true,
      },
      false,
    )
    expect(info).toEqual({ status: 'modified', binary: true, hasTextDiff: false })
  })

  it('derives modify/add/delete status from a text payload', () => {
    expect(reviewEntryInfoFromText(textPayload()).status).toBe('modified')
    expect(reviewEntryInfoFromText(textPayload({ rightExists: false })).status).toBe('leftOnly')
    expect(reviewEntryInfoFromText(textPayload({ leftExists: false })).status).toBe('rightOnly')
  })
})

describe('runReviewAction', () => {
  const acceptLeft = () =>
    reviewActionsForSource('local', entryInfo()).find(
      (action) => action.id === 'acceptLeft',
    ) as ReviewActionItem

  function stubBridge(applyFileChange = vi.fn(() => Promise.resolve())) {
    vi.stubGlobal('window', { diffly: { applyFileChange } })
    return applyFileChange
  }

  it('does nothing for disabled actions', async () => {
    const applyFileChange = stubBridge()
    const context = actionContext()
    await runReviewAction({ ...acceptLeft(), enabled: false }, context)
    expect(applyFileChange).not.toHaveBeenCalled()
    expect(context.notify).not.toHaveBeenCalled()
  })

  it('requires confirmation before accepting', async () => {
    const applyFileChange = stubBridge()
    const context = actionContext({ confirmAction: vi.fn(() => false) })
    await runReviewAction(acceptLeft(), context)
    expect(context.confirmAction).toHaveBeenCalled()
    expect(applyFileChange).not.toHaveBeenCalled()
    expect(context.refresh).not.toHaveBeenCalled()
  })

  it('applies the change and refreshes after confirmation', async () => {
    const applyFileChange = stubBridge()
    const context = actionContext()
    await runReviewAction(acceptLeft(), context)
    expect(applyFileChange).toHaveBeenCalledWith({
      sourcePath: 'C:\\left\\src\\app.ts',
      targetPath: 'C:\\right\\src\\app.ts',
      leftBase: 'C:\\left',
      rightBase: 'C:\\right',
    })
    expect(context.refresh).toHaveBeenCalled()
    expect(context.notify).toHaveBeenCalledWith('Accepted left file.')
  })

  it('surfaces backend errors without refreshing', async () => {
    stubBridge(vi.fn(() => Promise.reject(new Error('Cannot overwrite a directory.'))))
    const context = actionContext()
    await runReviewAction(acceptLeft(), context)
    expect(context.notify).toHaveBeenCalledWith('Cannot overwrite a directory.')
    expect(context.refresh).not.toHaveBeenCalled()
  })

  it('reports when the apply bridge is unavailable', async () => {
    vi.stubGlobal('window', { diffly: {} })
    const context = actionContext()
    await runReviewAction(acceptLeft(), context)
    expect(context.notify).toHaveBeenCalledWith('Accepting files is unavailable in this build.')
    expect(context.refresh).not.toHaveBeenCalled()
  })

  it('copies a unified patch to the clipboard', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const context = actionContext()
    const copyPatch = reviewActionsForSource('github', entryInfo()).find(
      (action) => action.id === 'copyPatch',
    ) as ReviewActionItem

    await runReviewAction(copyPatch, context)
    expect(writeText).toHaveBeenCalledTimes(1)
    const patch = writeText.mock.calls[0][0]
    expect(patch).toContain('--- a/src/app.ts')
    expect(patch).toContain('+++ b/src/app.ts')
    expect(patch).toContain('-a')
    expect(patch).toContain('+b')
    expect(context.notify).toHaveBeenCalledWith('Patch copied to clipboard.')
  })

  it('refuses to copy oversized patches', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const context = actionContext({
      text: textPayload({ leftText: 'x'.repeat(3 * 1024 * 1024), rightText: 'y'.repeat(2 * 1024 * 1024) }),
    })
    const copyPatch = reviewActionsForSource('github', entryInfo()).find(
      (action) => action.id === 'copyPatch',
    ) as ReviewActionItem

    await runReviewAction(copyPatch, context)
    expect(writeText).not.toHaveBeenCalled()
    expect(context.notify).toHaveBeenCalledWith('File too large to copy as patch.')
  })
})
