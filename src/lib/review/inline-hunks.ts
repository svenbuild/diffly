import type { DiffLineAnnotation } from '@pierre/diffs'
import { applyPartialChange, listReviewHunks } from '../api'
import type { CompareSourceKind } from '../actions/compare-actions'
import type { GitWorkingTreeReviewCapabilities } from '../types'
import type { DifflyCommentAnnotation } from '../compare/directory-code-view-comments'
import type { PartialChangeOperation, ReviewHunkSummary, ReviewChangeRange } from '../review-types'
import { loadRevisions } from './hunk-controller'

export function inlineHunkOperations(source: CompareSourceKind, capabilities?: GitWorkingTreeReviewCapabilities | null): Array<{ operation: PartialChangeOperation; label: string }> {
  if (source === 'local') return [
    { operation: 'applyLeftToRight', label: 'Copy left → right' },
    { operation: 'applyRightToLeft', label: 'Copy right → left' },
  ]
  if (source !== 'gitWorkingTree') return []
  return [
    ...(capabilities?.stage ? [{ operation: 'stage' as const, label: 'Stage change' }] : []),
    ...(capabilities?.unstage ? [{ operation: 'unstage' as const, label: 'Unstage change' }] : []),
    ...(capabilities?.discard ? [{ operation: 'discard' as const, label: 'Discard change' }] : []),
  ]
}

export async function loadInlineHunks(
  sessionId: string, entryId: string, source: CompareSourceKind,
  capabilities: GitWorkingTreeReviewCapabilities | null | undefined,
  refresh: () => void | Promise<void>,
): Promise<Array<DiffLineAnnotation<DifflyCommentAnnotation>>> {
  const operations = inlineHunkOperations(source, capabilities)
  if (!operations.length) return []
  const hunks = await listReviewHunks(sessionId, entryId)
  return hunks.flatMap(hunk => hunk.changes.map(change => ({
    side: change.rightCount > 0 ? 'additions' : 'deletions',
    lineNumber: change.rightCount > 0 ? change.rightStart + change.rightCount - 1 : change.leftStart + change.leftCount - 1,
    metadata: {
      id: `hunk-${entryId}-${hunk.index}-${change.changeIndex}-${hunk.fingerprint.changeHash}`,
      text: hunk.header,
      render: () => renderActions(sessionId, entryId, hunk, change, operations, refresh),
    },
  })))
}

function renderActions(sessionId: string, entryId: string, hunk: ReviewHunkSummary, change: ReviewChangeRange,
  operations: ReturnType<typeof inlineHunkOperations>, refresh: () => void | Promise<void>) {
  const row = document.createElement('div')
  row.className = 'diffly-hunk-actions'
  row.setAttribute('role', 'group')
  row.setAttribute('aria-label', `Change ${hunk.index + 1}.${change.changeIndex + 1}`)
  const error = document.createElement('span')
  error.setAttribute('role', 'alert')
  let busy = false
  const draw = () => {
    row.replaceChildren()
    const scope = document.createElement('span')
    scope.className = 'diffly-change-scope'
    scope.textContent = `${change.leftCount} removed · ${change.rightCount} added`
    row.append(scope)
    for (const action of operations) {
      const button = document.createElement('button')
      button.type = 'button'
      const actionLabel = action.operation === 'applyLeftToRight' && change.leftCount === 0 ? 'Delete from right'
        : action.operation === 'applyRightToLeft' && change.rightCount === 0 ? 'Delete from left'
        : action.label
      button.textContent = actionLabel
      button.title = `${actionLabel}: only this highlighted change (${change.leftCount} removed, ${change.rightCount} added)`
      button.onclick = () => {
        if (busy) return
        const apply = async () => {
          if (busy) return
          busy = true
          row.querySelectorAll('button').forEach(item => item.disabled = true)
          error.textContent = ''
          try {
            const revisions = await loadRevisions(sessionId, entryId, action.operation)
            await applyPartialChange({ sessionId, entryId, operation: action.operation,
              selections: [{ fingerprint: hunk.fingerprint, changeIndex: change.changeIndex }], ...revisions })
            window.dispatchEvent(new CustomEvent('diffly:partial-change-applied', { detail: { sessionId } }))
            await refresh()
          } catch (cause) {
            error.textContent = cause instanceof Error ? cause.message : 'Unable to apply change.'
          } finally {
            busy = false
            draw()
          }
        }
        if (action.operation === 'stage' || action.operation === 'unstage') {
          void apply()
          return
        }
        row.replaceChildren()
        const label = document.createElement('span')
        label.textContent = action.operation === 'discard' ? 'Discard this change from the working file?' : `${actionLabel} for this change?`
        const confirm = document.createElement('button')
        confirm.type = 'button'
        confirm.textContent = 'Confirm'
        confirm.onclick = () => void apply()
        const cancel = document.createElement('button')
        cancel.type = 'button'
        cancel.textContent = 'Cancel'
        cancel.onclick = draw
        row.append(label, confirm, cancel, error)
      }
      row.append(button)
    }
    row.append(error)
  }
  draw()
  return row
}
