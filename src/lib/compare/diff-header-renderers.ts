import { createAppIcon } from '../icons/app-icons'
import { renderFileTypeIcon } from '../icons/file-icons'

// Pierre renders its own generic change-type icon between the header prefix
// slot and the file name. We render a file-type icon in the prefix instead,
// so hide the built-in one inside the shadow DOM via unsafeCSS.
export const DIFF_HEADER_UNSAFE_CSS = `
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
  button.appendChild(chevron)
  button.appendChild(renderFileTypeIcon(fileName))

  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    onToggle()
  })

  return button
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
