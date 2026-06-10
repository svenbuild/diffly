import { writable } from 'svelte/store'
import { getReviewApplyApi, getShellPathApi } from '../api'
import type { CompareSourceKind } from '../actions/compare-actions'
import type { DirectoryEntryResult, EntryStatus, TextDiffPayload } from '../types'
import { buildUnifiedPatch, MAX_PATCH_SOURCE_LENGTH } from './unified-patch'

// Review mode is session-only UI state: default off, never persisted. It
// follows the compare-actions registry split of a pure, unit-testable gating
// matrix (reviewActionsForSource) and a runner that wires the gated actions
// to IPC / clipboard at the call site.

export const reviewModeEnabled = writable(false)

export type ReviewActionId =
  | 'acceptLeft'
  | 'acceptRight'
  | 'stageFile'
  | 'unstageFile'
  | 'discardFile'
  | 'openExternal'
  | 'copyPatch'

export interface ReviewEntryInfo {
  status: EntryStatus
  binary: boolean
  /** Whether a text diff payload is loaded for this file (copyPatch input). */
  hasTextDiff: boolean
}

export interface ReviewActionItem {
  id: ReviewActionId
  label: string
  tooltip: string
  /** Mutating actions require an explicit confirm step before running. */
  mutating: boolean
  danger?: boolean
  enabled: boolean
}

const ACCEPT_DISABLED_REASON = 'Only modify-modify files can be accepted for now'
const GIT_ACTIONS_DISABLED_REASON = 'Git review actions coming soon'

export function reviewEntryInfoFromEntry(
  entry: DirectoryEntryResult,
  hasTextDiff: boolean,
): ReviewEntryInfo {
  return {
    status: entry.status,
    binary: entry.binary === true,
    hasTextDiff,
  }
}

export function reviewEntryInfoFromText(text: TextDiffPayload): ReviewEntryInfo {
  const status: EntryStatus =
    text.leftExists && text.rightExists
      ? 'modified'
      : text.leftExists
        ? 'leftOnly'
        : 'rightOnly'

  return { status, binary: false, hasTextDiff: true }
}

function acceptAction(
  id: 'acceptLeft' | 'acceptRight',
  entry: ReviewEntryInfo,
): ReviewActionItem {
  // Add/delete (one-sided) entries are rejected in this iteration because
  // accepting them would mean deleting a file; keep the buttons visible but
  // disabled so the gating is discoverable.
  const enabled = entry.status === 'modified'
  const direction =
    id === 'acceptLeft'
      ? 'Accept left — copy left file over right'
      : 'Accept right — copy right file over left'

  return {
    id,
    label: id === 'acceptLeft' ? 'Accept left' : 'Accept right',
    tooltip: enabled ? direction : `${direction} (${ACCEPT_DISABLED_REASON})`,
    mutating: true,
    danger: true,
    enabled,
  }
}

function openExternalAction(): ReviewActionItem {
  return {
    id: 'openExternal',
    label: 'Open',
    tooltip: 'Open file in the default application',
    mutating: false,
    enabled: true,
  }
}

function copyPatchAction(entry: ReviewEntryInfo): ReviewActionItem {
  const enabled = entry.hasTextDiff
  return {
    id: 'copyPatch',
    label: 'Copy patch',
    tooltip: enabled
      ? 'Copy a unified diff patch for this file'
      : 'Copy patch (no text diff loaded for this file)',
    mutating: false,
    enabled,
  }
}

function disabledGitAction(id: ReviewActionId, label: string): ReviewActionItem {
  return {
    id,
    label,
    tooltip: GIT_ACTIONS_DISABLED_REASON,
    mutating: true,
    enabled: false,
  }
}

/**
 * The per-source whole-file action matrix for review mode. Read-only sources
 * (commit, ref range, GitHub) get no mutating buttons at all — not even
 * disabled ones.
 */
export function reviewActionsForSource(
  sourceKind: CompareSourceKind,
  entry: ReviewEntryInfo,
): ReviewActionItem[] {
  switch (sourceKind) {
    case 'local':
      return [
        acceptAction('acceptLeft', entry),
        acceptAction('acceptRight', entry),
        openExternalAction(),
        copyPatchAction(entry),
      ]
    case 'gitWorkingTree':
      return [
        disabledGitAction('stageFile', 'Stage'),
        disabledGitAction('unstageFile', 'Unstage'),
        disabledGitAction('discardFile', 'Discard'),
        openExternalAction(),
        copyPatchAction(entry),
      ]
    case 'gitRefRange':
    case 'gitCommit':
    case 'github':
      return [copyPatchAction(entry)]
  }
}

export interface ReviewActionContext {
  /** Display path used in confirm prompts and patch headers. */
  displayPath: string
  leftPath: string | null
  rightPath: string | null
  leftBase: string
  rightBase: string
  text: TextDiffPayload | null
  refresh: () => Promise<void> | void
  notify: (message: string) => void
  /** Injectable for tests; defaults to window.confirm. */
  confirmAction?: (message: string) => boolean
}

export async function runReviewAction(
  action: ReviewActionItem,
  context: ReviewActionContext,
): Promise<void> {
  if (!action.enabled) {
    return
  }

  switch (action.id) {
    case 'acceptLeft':
      await runAccept('left', context)
      return
    case 'acceptRight':
      await runAccept('right', context)
      return
    case 'openExternal':
      await runOpenExternal(context)
      return
    case 'copyPatch':
      await runCopyPatch(context)
      return
    default:
      // stage/unstage/discard are rendered disabled in this iteration and
      // never reach the runner; fail closed if they somehow do.
      context.notify('This action is not available yet.')
  }
}

async function runAccept(side: 'left' | 'right', context: ReviewActionContext) {
  const sourcePath = side === 'left' ? context.leftPath : context.rightPath
  const targetPath = side === 'left' ? context.rightPath : context.leftPath

  if (!sourcePath || !targetPath) {
    context.notify('Only modify-modify files can be accepted for now.')
    return
  }

  const api = getReviewApplyApi()
  if (!api) {
    context.notify('Accepting files is unavailable in this build.')
    return
  }

  const confirmAction =
    context.confirmAction ??
    ((message: string) => (typeof window === 'undefined' ? false : window.confirm(message)))
  const confirmed = confirmAction(
    `Copy the ${side} file over the ${side === 'left' ? 'right' : 'left'} file?\n\n` +
      `${context.displayPath}\n\n${sourcePath}\n→ ${targetPath}\n\n` +
      'The overwritten file cannot be restored.',
  )
  if (!confirmed) {
    return
  }

  try {
    await api.applyFileChange({
      sourcePath,
      targetPath,
      leftBase: context.leftBase,
      rightBase: context.rightBase,
    })
  } catch (error) {
    context.notify(error instanceof Error ? error.message : 'Unable to apply file change.')
    return
  }

  context.notify(side === 'left' ? 'Accepted left file.' : 'Accepted right file.')
  await context.refresh()
}

async function runOpenExternal(context: ReviewActionContext) {
  const shellApi = getShellPathApi()
  const path = context.rightPath ?? context.leftPath
  if (!shellApi || !path) {
    context.notify('Opening files is unavailable here.')
    return
  }

  try {
    await shellApi.openPath(path)
  } catch {
    context.notify('Unable to open this file.')
  }
}

async function runCopyPatch(context: ReviewActionContext) {
  const text = context.text
  if (!text) {
    context.notify('No text diff is loaded for this file.')
    return
  }

  if (text.leftText.length + text.rightText.length > MAX_PATCH_SOURCE_LENGTH) {
    context.notify('File too large to copy as patch.')
    return
  }

  const clipboard = typeof navigator === 'undefined' ? null : navigator.clipboard ?? null
  if (!clipboard) {
    context.notify('Clipboard is unavailable.')
    return
  }

  const patch = buildUnifiedPatch({
    leftLabel: `a/${context.displayPath}`,
    rightLabel: `b/${context.displayPath}`,
    leftText: text.leftText,
    rightText: text.rightText,
  })

  try {
    await clipboard.writeText(patch)
    context.notify('Patch copied to clipboard.')
  } catch {
    context.notify('Unable to copy the patch to the clipboard.')
  }
}
