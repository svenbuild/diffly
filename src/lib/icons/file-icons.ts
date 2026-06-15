import { createFileTreeIconResolver, getBuiltInSpriteSheet } from '@pierre/trees'

const SVG_NS = 'http://www.w3.org/2000/svg'
const DIFF_HEADER_TREE_ICON_SET = 'complete'
const DIFF_HEADER_ICON_SPRITE_ID = 'diffly-file-tree-icon-sprite'

const fileTreeIconResolver = createFileTreeIconResolver({
  colored: true,
  set: DIFF_HEADER_TREE_ICON_SET,
})

type FileTreeIconResolver = ReturnType<typeof createFileTreeIconResolver>
export type DifflyFileTypeIcon = ReturnType<FileTreeIconResolver['resolveIcon']>

const injectedSpriteDocuments = new WeakSet<Document>()

const FILE_TREE_ICON_COLOR_FALLBACKS: Record<string, string> = {
  astro: 'light-dark(#a631be, #d568ea)',
  babel: 'light-dark(#d5a910, #ffd452)',
  bash: 'light-dark(#199f43, #5ecc71)',
  biome: 'light-dark(#1a85d4, #69b1ff)',
  bootstrap: 'light-dark(#693acf, #9d6afb)',
  browserslist: 'light-dark(#d5a910, #ffd452)',
  bun: 'light-dark(#594c5b, #79697b)',
  c: 'light-dark(#1a85d4, #69b1ff)',
  claude: 'light-dark(#d47628, #ffa359)',
  cpp: 'light-dark(#1a85d4, #69b1ff)',
  css: 'light-dark(#693acf, #9d6afb)',
  database: 'light-dark(#a631be, #d568ea)',
  default: 'light-dark(#84848a, #adadb1)',
  docker: 'light-dark(#1a85d4, #69b1ff)',
  eslint: 'light-dark(#693acf, #9d6afb)',
  git: 'light-dark(#ff8c5b, #d5512f)',
  go: 'light-dark(#1ca1c7, #68cdf2)',
  graphql: 'light-dark(#d32a61, #ff678d)',
  html: 'light-dark(#d47628, #ffa359)',
  image: 'light-dark(#d32a61, #ff678d)',
  javascript: 'light-dark(#d5a910, #ffd452)',
  json: 'light-dark(#d47628, #ffa359)',
  markdown: 'light-dark(#199f43, #5ecc71)',
  mcp: 'light-dark(#17a5af, #64d1db)',
  npm: 'light-dark(#d52c36, #ff6762)',
  oxc: 'light-dark(#1ca1c7, #68cdf2)',
  postcss: 'light-dark(#d52c36, #ff6762)',
  prettier: 'light-dark(#17a5af, #64d1db)',
  python: 'light-dark(#1a85d4, #69b1ff)',
  react: 'light-dark(#1ca1c7, #68cdf2)',
  ruby: 'light-dark(#d52c36, #ff6762)',
  rust: 'light-dark(#d47628, #ffa359)',
  sass: 'light-dark(#d32a61, #ff678d)',
  svg: 'light-dark(#d47628, #ffa359)',
  svelte: 'light-dark(#d52c36, #ff6762)',
  svgo: 'light-dark(#199f43, #5ecc71)',
  swift: 'light-dark(#d47628, #ffa359)',
  table: 'light-dark(#17a5af, #64d1db)',
  tailwind: 'light-dark(#1ca1c7, #68cdf2)',
  terraform: 'light-dark(#693acf, #9d6afb)',
  text: 'light-dark(#84848a, #adadb1)',
  typescript: 'light-dark(#1a85d4, #69b1ff)',
  vite: 'light-dark(#a631be, #d568ea)',
  vscode: 'light-dark(#1a85d4, #69b1ff)',
  vue: 'light-dark(#199f43, #5ecc71)',
  wasm: 'light-dark(#693acf, #9d6afb)',
  webpack: 'light-dark(#1a85d4, #69b1ff)',
  yml: 'light-dark(#d52c36, #ff6762)',
  zig: 'light-dark(#d47628, #ffa359)',
  zip: 'light-dark(#d47628, #ffa359)',
}

export function resolveFileTypeIcon(fileName: string): DifflyFileTypeIcon {
  return fileTreeIconResolver.resolveIcon('file-tree-icon-file', fileName)
}

function ensureFileTreeIconSprite(ownerDocument: Document) {
  if (injectedSpriteDocuments.has(ownerDocument)) {
    return
  }

  const host = ownerDocument.body ?? ownerDocument.documentElement
  if (!host) {
    return
  }

  if (!ownerDocument.getElementById(DIFF_HEADER_ICON_SPRITE_ID)) {
    const sprite = ownerDocument.createElement('div')
    sprite.id = DIFF_HEADER_ICON_SPRITE_ID
    sprite.setAttribute('aria-hidden', 'true')
    sprite.style.position = 'absolute'
    sprite.style.width = '0'
    sprite.style.height = '0'
    sprite.style.overflow = 'hidden'
    sprite.innerHTML = getBuiltInSpriteSheet(DIFF_HEADER_TREE_ICON_SET)
    host.prepend(sprite)
  }

  injectedSpriteDocuments.add(ownerDocument)
}

function iconColor(token: string | undefined) {
  if (!token) {
    return ''
  }

  const fallback = FILE_TREE_ICON_COLOR_FALLBACKS[token]
  return fallback ? `var(--trees-file-icon-color-${token}, ${fallback})` : ''
}

function createFileTreeSvgIcon(
  icon: DifflyFileTypeIcon,
  ownerDocument: Document,
): SVGSVGElement {
  const width = icon.width ?? 16
  const height = icon.height ?? 16
  const svg = ownerDocument.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('data-icon-name', icon.remappedFrom ?? icon.name)
  svg.setAttribute('viewBox', icon.viewBox ?? `0 0 ${width} ${height}`)
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  if (icon.token) {
    svg.setAttribute('data-icon-token', icon.token)
  }

  const color = iconColor(icon.token)
  if (color) {
    svg.style.color = color
  }

  const use = ownerDocument.createElementNS(SVG_NS, 'use')
  use.setAttribute('href', `#${icon.name.replace(/^#/, '')}`)
  svg.appendChild(use)

  return svg
}

export function renderFileTypeIcon(fileName: string): HTMLElement {
  const icon = resolveFileTypeIcon(fileName)
  const wrapper = document.createElement('span')
  wrapper.className = 'diffly-codeview-file-icon'
  wrapper.dataset.difflyFileIcon = icon.token ?? 'default'
  wrapper.setAttribute('aria-hidden', 'true')
  ensureFileTreeIconSprite(wrapper.ownerDocument)
  wrapper.appendChild(createFileTreeSvgIcon(icon, wrapper.ownerDocument))
  return wrapper
}
