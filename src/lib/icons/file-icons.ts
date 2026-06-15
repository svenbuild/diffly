import { defaultIcon, getAllIcons, type Icon } from 'material-file-icons'

export interface DifflyFileTypeIcon {
  name: string
  svg: string
  token: string
}

function normalizeIconPath(fileName: string) {
  return fileName.replace(/\\/g, '/').toLowerCase()
}

const materialIcons = getAllIcons()
const fileNameIconByName = new Map<string, Icon>()
const extensionIconEntries = materialIcons
  .flatMap((icon) => (icon.extensions ?? []).map((extension) => [extension.toLowerCase(), icon] as const))
  .sort(([left], [right]) => right.length - left.length)

for (const icon of materialIcons) {
  for (const file of icon.files ?? []) {
    fileNameIconByName.set(normalizeIconPath(file), icon)
  }
}

function resolveMaterialIcon(fileName: string): Icon {
  const normalizedPath = normalizeIconPath(fileName)
  const baseName = normalizedPath.split('/').pop() ?? normalizedPath
  const fileNameIcon =
    fileNameIconByName.get(normalizedPath) ?? fileNameIconByName.get(baseName)

  if (fileNameIcon) {
    return fileNameIcon
  }

  for (const [extension, icon] of extensionIconEntries) {
    if (normalizedPath.endsWith(`.${extension}`)) {
      return icon
    }
  }

  return defaultIcon
}

export function resolveFileTypeIcon(fileName: string): DifflyFileTypeIcon {
  const icon = resolveMaterialIcon(fileName)
  return {
    name: `material-file-icon-${icon.name}`,
    svg: icon.svg,
    token: icon.name,
  }
}

export function renderFileTypeIcon(fileName: string): HTMLElement {
  const icon = resolveFileTypeIcon(fileName)
  const wrapper = document.createElement('span')
  wrapper.className = 'diffly-codeview-file-icon'
  wrapper.dataset.difflyFileIcon = icon.token
  wrapper.setAttribute('aria-hidden', 'true')
  wrapper.innerHTML = icon.svg

  const svg = wrapper.firstElementChild
  if (svg instanceof SVGSVGElement) {
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('data-icon-name', icon.name)
    svg.setAttribute('focusable', 'false')
  }

  return wrapper
}
