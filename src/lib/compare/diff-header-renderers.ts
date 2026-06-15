import { createAppIcon } from '../icons/app-icons'
import { renderFileTypeIcon } from '../icons/file-icons'
import type { ReviewActionItem } from './review-mode'

// Pierre renders its own generic change-type icon between the header prefix
// slot and the file name. We render a file-type icon in the prefix instead,
// so hide the built-in one inside the shadow DOM via unsafeCSS.
export const DIFF_HEADER_UNSAFE_CSS = `
  [data-diffs-header=default] [data-header-content] {
    gap: 9px;
  }

  [data-diffs-header=default] [data-title],
  [data-diffs-header=default] [data-prev-name] {
    line-height: 1.2;
  }

  [data-diffs-header=default] [data-additions-count],
  [data-diffs-header=default] [data-deletions-count] {
    display: inline-flex;
    align-items: center;
    min-height: 20px;
    padding: 0 7px;
    border-radius: 6px;
    font-family: var(--diffs-header-font-family, var(--diffs-header-font-fallback));
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
  }

  [data-diffs-header=default] [data-additions-count] {
    background: color-mix(in srgb, var(--diffs-addition-base) 14%, transparent);
  }

  [data-diffs-header=default] [data-deletions-count] {
    background: color-mix(in srgb, var(--diffs-deletion-base) 14%, transparent);
  }

  [data-diffs-header] [data-change-icon] {
    display: none;
  }
`

export interface DiffHeaderCollapseOptions {
  collapsed: boolean
  onToggle: () => void
}

export function renderDiffHeaderPrefix(
  fileName: string,
  collapse?: DiffHeaderCollapseOptions,
): HTMLElement {
  if (!collapse) {
    const prefix = document.createElement('span')
    prefix.className = 'diffly-codeview-header-prefix'
    prefix.appendChild(renderFileTypeIcon(fileName))
    return prefix
  }

  const { collapsed, onToggle } = collapse
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'diffly-codeview-collapse-button'
  button.dataset.collapsed = collapsed ? 'true' : 'false'
  button.setAttribute('aria-label', collapsed ? 'Expand file diff' : 'Collapse file diff')
  button.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
  button.title = collapsed ? 'Expand file diff' : 'Collapse file diff'

  const chevron = createAppIcon('chevronRight', '1.8')
  chevron.classList.add('diffly-codeview-collapse-chevron')
  const icon = renderFileTypeIcon(fileName)
  button.appendChild(chevron)
  button.appendChild(icon)

  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    onToggle()
  })

  return button
}

/**
 * Renders the review-mode per-file action buttons for a diff header. Buttons
 * are real <button> elements (keyboard accessible) with the tooltip mirrored
 * into title/aria-label; disabled actions stay visible but inert.
 */
export function renderReviewActionButtons(
  actions: ReviewActionItem[],
  onRun: (action: ReviewActionItem) => void,
): HTMLElement {
  const container = document.createElement('span')
  container.className = 'diffly-review-actions'

  for (const action of actions) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'diffly-review-action-button'
    if (action.danger) {
      button.dataset.danger = 'true'
    }
    button.textContent = action.label
    button.title = action.tooltip
    button.setAttribute('aria-label', action.tooltip)
    button.disabled = !action.enabled
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      onRun(action)
    })
    container.appendChild(button)
  }

  return container
}

/**
 * Combines the status metadata element with review action buttons in a single
 * header metadata slot.
 */
export function renderDiffHeaderMetadataWithActions(
  metadata: HTMLElement | null,
  actions: HTMLElement,
): HTMLElement {
  if (!metadata) {
    return actions
  }

  const container = document.createElement('span')
  container.className = 'diffly-codeview-metadata-group'
  container.appendChild(metadata)
  container.appendChild(actions)
  return container
}

export function renderDiffHeaderMetadata(options: {
  text: string
  title?: string
}): HTMLElement {
  const metadata = document.createElement('span')
  metadata.className = 'diffly-codeview-status-metadata'
  metadata.textContent = options.text
  if (options.title) {
    metadata.title = options.title
  }
  return metadata
}
