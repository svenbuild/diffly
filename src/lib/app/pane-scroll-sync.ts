export function getMaxScrollTop(element: HTMLDivElement) {
  return Math.max(0, element.scrollHeight - element.clientHeight)
}

export function getMaxScrollLeft(element: HTMLDivElement) {
  return Math.max(0, element.scrollWidth - element.clientWidth)
}

export function clampScrollOffset(nextValue: number, maxValue: number) {
  return Math.min(Math.max(nextValue, 0), maxValue)
}

export function mapScrollOffset(
  sourceOffset: number,
  sourceMaxOffset: number,
  targetMaxOffset: number,
) {
  if (targetMaxOffset <= 0) {
    return 0
  }

  if (sourceMaxOffset <= 0) {
    return clampScrollOffset(sourceOffset, targetMaxOffset)
  }

  return clampScrollOffset((sourceOffset / sourceMaxOffset) * targetMaxOffset, targetMaxOffset)
}

export function normalizeWheelDelta(delta: number, deltaMode: number) {
  if (deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return delta * 16
  }

  if (deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return delta * 100
  }

  return delta
}

export function getScrollTopForAnchor(container: HTMLDivElement, anchor: HTMLElement) {
  return clampScrollOffset(
    container.scrollTop + anchor.getBoundingClientRect().top - container.getBoundingClientRect().top - 8,
    getMaxScrollTop(container),
  )
}
