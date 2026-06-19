import { get } from 'svelte/store'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EntryStatus, GitWorkingTreeReviewCapabilities, TextDiffPayload } from '../types'
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
    gitReview: { sessionId: 'session-1', entryId: 'git:all::src%2Fapp.ts' },
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

  it('enables git working tree actions from capabilities', () => {
    const actions = reviewActionsForSource('gitWorkingTree', entryInfo({
      gitReviewCapabilities: {
        stage: true,
        unstage: false,
        discard: true,
      },
    }))
    expect(ids(actions)).toEqual([
      'stageFile',
      'unstageFile',
      'discardFile',
      'openExternal',
      'copyPatch',
    ])
    expect(actions.find((action) => action.id === 'stageFile')?.enabled).toBe(true)
    expect(actions.find((action) => action.id === 'unstageFile')?.enabled).toBe(false)
    expect(actions.find((action) => action.id === 'discardFile')?.enabled).toBe(true)
    expect(actions.find((action) => action.id === 'discardFile')?.danger).toBe(true)
  })

  it('disables git working tree actions without capabilities', () => {
    const actions = reviewActionsForSource('gitWorkingTree', entryInfo())
    expect(actions.find((action) => action.id === 'stageFile')?.enabled).toBe(false)
    expect(actions.find((action) => action.id === 'stageFile')?.tooltip).toBe(
      'No unstaged changes to stage for this file',
    )
    expect(actions.find((action) => action.id === 'unstageFile')?.enabled).toBe(false)
    expect(actions.find((action) => action.id === 'unstageFile')?.tooltip).toBe(
      'No staged changes to unstage for this file',
    )
    expect(actions.find((action) => action.id === 'discardFile')?.enabled).toBe(false)
    expect(actions.find((action) => action.id === 'discardFile')?.tooltip).toBe(
      'No unstaged changes to discard for this file',
    )
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
    expect(info).toEqual({
      status: 'modified',
      binary: true,
      hasTextDiff: false,
      gitReviewCapabilities: null,
    })
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

  const gitReviewAction = (
    id: 'stageFile' | 'unstageFile' | 'discardFile',
    capabilities: GitWorkingTreeReviewCapabilities,
  ) =>
    reviewActionsForSource('gitWorkingTree', entryInfo({ gitReviewCapabilities: capabilities }))
      .find((action) => action.id === id) as ReviewActionItem

  function stubBridge(applyFileChange = vi.fn(() => Promise.resolve())) {
    vi.stubGlobal('window', { diffly: { applyFileChange } })
    return applyFileChange
  }

  function stubGitBridge(applyGitWorkingTreeAction = vi.fn(() => Promise.resolve())) {
    vi.stubGlobal('window', { diffly: { applyGitWorkingTreeAction } })
    return applyGitWorkingTreeAction
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

  it('stages git working tree files through the bridge and refreshes', async () => {
    const applyGitWorkingTreeAction = stubGitBridge()
    const context = actionContext()
    await runReviewAction(gitReviewAction('stageFile', {
      stage: true,
      unstage: false,
      discard: true,
    }), context)

    expect(applyGitWorkingTreeAction).toHaveBeenCalledWith({
      sessionId: 'session-1',
      entryId: 'git:all::src%2Fapp.ts',
      action: 'stage',
    })
    expect(context.confirmAction).not.toHaveBeenCalled()
    expect(context.refresh).toHaveBeenCalled()
    expect(context.notify).toHaveBeenCalledWith('Staged file.')
  })

  it('unstages git working tree files through the bridge and refreshes', async () => {
    const applyGitWorkingTreeAction = stubGitBridge()
    const context = actionContext()
    await runReviewAction(gitReviewAction('unstageFile', {
      stage: false,
      unstage: true,
      discard: false,
    }), context)

    expect(applyGitWorkingTreeAction).toHaveBeenCalledWith({
      sessionId: 'session-1',
      entryId: 'git:all::src%2Fapp.ts',
      action: 'unstage',
    })
    expect(context.confirmAction).not.toHaveBeenCalled()
    expect(context.refresh).toHaveBeenCalled()
    expect(context.notify).toHaveBeenCalledWith('Unstaged file.')
  })

  it('confirms before discarding unstaged git changes', async () => {
    const applyGitWorkingTreeAction = stubGitBridge()
    const context = actionContext()
    await runReviewAction(gitReviewAction('discardFile', {
      stage: true,
      unstage: false,
      discard: true,
    }), context)

    expect(context.confirmAction).toHaveBeenCalledWith(
      expect.stringContaining('Only unstaged/untracked changes will be discarded.'),
    )
    expect(applyGitWorkingTreeAction).toHaveBeenCalledWith({
      sessionId: 'session-1',
      entryId: 'git:all::src%2Fapp.ts',
      action: 'discard',
    })
    expect(context.refresh).toHaveBeenCalled()
    expect(context.notify).toHaveBeenCalledWith('Discarded unstaged changes.')
  })

  it('does not discard git changes when confirmation is rejected', async () => {
    const applyGitWorkingTreeAction = stubGitBridge()
    const context = actionContext({ confirmAction: vi.fn(() => false) })
    await runReviewAction(gitReviewAction('discardFile', {
      stage: true,
      unstage: false,
      discard: true,
    }), context)

    expect(context.confirmAction).toHaveBeenCalled()
    expect(applyGitWorkingTreeAction).not.toHaveBeenCalled()
    expect(context.refresh).not.toHaveBeenCalled()
  })

  it('surfaces git backend errors without refreshing', async () => {
    stubGitBridge(vi.fn(() => Promise.reject(new Error('This file is no longer in that review state.'))))
    const context = actionContext()
    await runReviewAction(gitReviewAction('stageFile', {
      stage: true,
      unstage: false,
      discard: true,
    }), context)

    expect(context.notify).toHaveBeenCalledWith('This file is no longer in that review state.')
    expect(context.refresh).not.toHaveBeenCalled()
  })

  it('reports when git review bridge is unavailable', async () => {
    vi.stubGlobal('window', { diffly: {} })
    const context = actionContext()
    await runReviewAction(gitReviewAction('stageFile', {
      stage: true,
      unstage: false,
      discard: true,
    }), context)

    expect(context.notify).toHaveBeenCalledWith('Git review actions are unavailable in this build.')
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
