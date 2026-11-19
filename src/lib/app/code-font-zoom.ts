import { MAX_CODE_FONT_SIZE, MIN_CODE_FONT_SIZE } from '../theme/runtime'

export const CODE_ZOOM_TARGET_SELECTOR =
  '.compare-viewer, .workspace-editor, .merge-conflict-viewer'

export interface CodeZoomWheelEventLike {
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
  deltaY: number
  target: EventTarget | null
}

export interface CodeFontZoomResult {
  nextSize: number
  changed: boolean
}

export function isCodeZoomTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') {
    return false
  }

  const candidate = target as {
    closest?: (selector: string) => unknown
    parentElement?: { closest?: (selector: string) => unknown } | null
  }

  if (typeof candidate.closest === 'function') {
    return candidate.closest(CODE_ZOOM_TARGET_SELECTOR) !== null
  }

  if (candidate.parentElement && typeof candidate.parentElement.closest === 'function') {
    return candidate.parentElement.closest(CODE_ZOOM_TARGET_SELECTOR) !== null
  }

  return false
}

export function resolveCodeFontSizeFromWheel(
  event: CodeZoomWheelEventLike,
  currentSize: number,
  minSize = MIN_CODE_FONT_SIZE,
  maxSize = MAX_CODE_FONT_SIZE,
): CodeFontZoomResult | null {
  if (
    !event.ctrlKey ||
    event.altKey ||
    event.shiftKey ||
    event.metaKey ||
    event.deltaY === 0
  ) {
    return null
  }

  if (!isCodeZoomTarget(event.target)) {
    return null
  }

  const step = event.deltaY < 0 ? 1 : -1
  const clampedCurrent = Math.min(maxSize, Math.max(minSize, Math.round(currentSize)))
  const nextSize = Math.min(maxSize, Math.max(minSize, clampedCurrent + step))

  return {
    nextSize,
    changed: nextSize !== clampedCurrent,
  }
}
