// Shared UI icon registry. SVG path data for icons used in more than one
// place lives here, and createSvgIcon is the single factory for building
// stroke-based icons in imperative (non-Svelte) DOM code. All icons use
// currentColor so they follow light/dark themes.

const SVG_NS = 'http://www.w3.org/2000/svg'

export type AppIconName = 'chevronRight' | 'close' | 'send'

export const APP_ICON_PATHS: Record<AppIconName, string[]> = {
  chevronRight: ['M5.75 3.5 10.25 8l-4.5 4.5'],
  close: ['M4.5 4.5l7 7', 'M11.5 4.5l-7 7'],
  send: ['M8 13V4', 'M4.6 7.4 8 4l3.4 3.4'],
}

export function createSvgIcon(paths: string[], strokeWidth = '1.6'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('fill', 'none')
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', d)
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', 'currentColor')
    path.setAttribute('stroke-width', strokeWidth)
    path.setAttribute('stroke-linecap', 'round')
    path.setAttribute('stroke-linejoin', 'round')
    svg.appendChild(path)
  }
  return svg
}

export function createAppIcon(name: AppIconName, strokeWidth = '1.6'): SVGSVGElement {
  return createSvgIcon(APP_ICON_PATHS[name], strokeWidth)
}
