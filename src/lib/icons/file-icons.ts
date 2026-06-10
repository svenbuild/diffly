import { getFiletypeFromFileName } from '@pierre/diffs'
import { createSvgIcon } from './app-icons'

// File-type icon registry keyed off the filetype string reported by
// @pierre/diffs getFiletypeFromFileName, with an explicit unknown-file
// fallback. Icons are stroke-based and use currentColor for theming.

export type FileTypeIconKind = 'code' | 'doc' | 'image' | 'config' | 'styles' | 'unknown'

export const FILE_ICON_PATHS: Record<FileTypeIconKind, string[]> = {
  code: ['M6 4.5 2.5 8 6 11.5', 'M10 4.5 13.5 8 10 11.5'],
  doc: [
    'M9.5 2.5h-5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V5.5L9.5 2.5Z',
    'M9.5 2.5v3h3',
    'M5.8 8.4h4.4',
    'M5.8 10.6h4.4',
  ],
  image: [
    'M3.5 3.5h9a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z',
    'm3.5 10.5 2.8-2.8 2.4 2.4 1.8-1.8 3 3',
    'M10.3 6.4h.01',
  ],
  config: [
    'M6.5 2.8c-1.6 0-1.1 2.2-1.1 3.1 0 .9-.6 1.5-1.4 1.7v.8c.8.2 1.4.8 1.4 1.7 0 .9-.5 3.1 1.1 3.1',
    'M9.5 2.8c1.6 0 1.1 2.2 1.1 3.1 0 .9.6 1.5 1.4 1.7v.8c-.8.2-1.4.8-1.4 1.7 0 .9.5 3.1-1.1 3.1',
  ],
  styles: ['M8 2.8s3.8 4.1 3.8 6.6a3.8 3.8 0 0 1-7.6 0C4.2 6.9 8 2.8 8 2.8Z'],
  unknown: [
    'M9.5 2.5h-5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V5.5L9.5 2.5Z',
    'M9.5 2.5v3h3',
    'M6.7 7.6a1.3 1.3 0 1 1 1.8 1.2c-.4.2-.5.5-.5.9',
    'M8 11.4h.01',
  ],
}

const FILETYPE_ICON_KIND: Record<string, FileTypeIconKind> = {
  markdown: 'doc',
  mdx: 'doc',
  asciidoc: 'doc',
  log: 'doc',
  csv: 'doc',
  json: 'config',
  jsonc: 'config',
  json5: 'config',
  yaml: 'config',
  toml: 'config',
  ini: 'config',
  xml: 'config',
  dockerfile: 'config',
  nginx: 'config',
  apache: 'config',
  css: 'styles',
  scss: 'styles',
  sass: 'styles',
  less: 'styles',
  stylus: 'styles',
  postcss: 'styles',
}

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'bmp',
  'ico',
  'svg',
  'tif',
  'tiff',
])

const PLAIN_TEXT_EXTENSIONS = new Set(['txt', 'text'])

function fileExtension(fileName: string) {
  return fileName.match(/\.([^.\\/]+)$/)?.[1]?.toLowerCase() ?? ''
}

export function fileTypeIconKind(fileName: string): FileTypeIconKind {
  const extension = fileExtension(fileName)
  if (IMAGE_EXTENSIONS.has(extension)) {
    return 'image'
  }

  const filetype = getFiletypeFromFileName(fileName)
  const mapped = FILETYPE_ICON_KIND[filetype]
  if (mapped) {
    return mapped
  }

  if (filetype === 'text') {
    // getFiletypeFromFileName falls back to 'text' for unrecognized files, so
    // only treat genuinely plain-text extensions as documents.
    return PLAIN_TEXT_EXTENSIONS.has(extension) ? 'doc' : 'unknown'
  }

  return 'code'
}

export function renderFileTypeIcon(fileName: string): HTMLElement {
  const kind = fileTypeIconKind(fileName)
  const icon = document.createElement('span')
  icon.className = 'diffly-codeview-file-icon'
  icon.dataset.difflyFileIcon = kind
  icon.setAttribute('aria-hidden', 'true')
  icon.appendChild(createSvgIcon(FILE_ICON_PATHS[kind]))
  return icon
}
