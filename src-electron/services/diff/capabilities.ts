import type {
  DiffEntryCapabilities,
  DiffEntryStatus,
  GitWorkingTreeReviewCapabilities,
  GitWorkingTreeScope,
} from '../../../src/lib/types'

const NONE: DiffEntryCapabilities = {
  editLeft: false,
  editRight: false,
  editIndex: false,
  save: false,
  saveAs: false,
  partialApplyLeftToRight: false,
  partialApplyRightToLeft: false,
  stageHunks: false,
  unstageHunks: false,
  discardHunks: false,
  resolveConflict: false,
  comment: true,
  search: false,
}

export function localEntryCapabilities(
  status: DiffEntryStatus,
  binary = false,
): DiffEntryCapabilities {
  const editable = !binary && status !== 'unsupported'

  return {
    ...NONE,
    editLeft: editable,
    editRight: editable,
    save: editable,
    saveAs: true,
    partialApplyLeftToRight: editable && status !== 'added',
    partialApplyRightToLeft: editable && status !== 'deleted',
    search: editable,
  }
}

export function gitWorkingTreeEntryCapabilities(
  status: DiffEntryStatus,
  scope: GitWorkingTreeScope,
  review: GitWorkingTreeReviewCapabilities,
  binary = false,
): DiffEntryCapabilities {
  const conflicted = status === 'conflicted'
  const text = !binary && status !== 'unsupported'

  return {
    ...NONE,
    editRight: text && !conflicted && scope !== 'staged',
    editIndex: text && !conflicted && (scope === 'staged' || scope === 'all'),
    save: text && !conflicted,
    saveAs: true,
    stageHunks: text && review.stage,
    unstageHunks: text && review.unstage,
    discardHunks: text && review.discard,
    resolveConflict: conflicted,
    search: text,
  }
}

export function readOnlyEntryCapabilities(binary = false): DiffEntryCapabilities {
  return {
    ...NONE,
    editLeft: !binary,
    editRight: !binary,
    saveAs: true,
    search: !binary,
  }
}
