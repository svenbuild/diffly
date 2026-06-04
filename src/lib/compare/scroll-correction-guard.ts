export interface ScrollCorrectionGuardView {
  pendingLayoutAnchor?: unknown
  pendingScrollTarget?: unknown
  renderState?: {
    scrollTop: number
  }
  scrollAnimation?: unknown
  scrollDirty?: boolean
  scrollPageOffset?: number
  scrollTop?: number
}

export interface ScrollCorrectionSuppressionInput {
  now: number
  programmaticScrollAllowedUntil: number
  syncedScrollTop: number
  targetScrollTop: number
  userScrollCorrectionSuppressedUntil: number
}

const SCROLL_CORRECTION_EPSILON_PX = 0.5

export function clearScrollCorrectionTargets(view: ScrollCorrectionGuardView) {
  view.pendingLayoutAnchor = undefined
  view.pendingScrollTarget = undefined
  view.scrollAnimation = undefined
}

export function shouldSuppressManualScrollCorrection({
  now,
  programmaticScrollAllowedUntil,
  syncedScrollTop,
  targetScrollTop,
  userScrollCorrectionSuppressedUntil,
}: ScrollCorrectionSuppressionInput) {
  if (
    now >= userScrollCorrectionSuppressedUntil ||
    now < programmaticScrollAllowedUntil
  ) {
    return false
  }

  return Math.abs(targetScrollTop - syncedScrollTop) > SCROLL_CORRECTION_EPSILON_PX
}

export function logicalScrollTop(
  view: ScrollCorrectionGuardView,
  hostScrollTop: number,
) {
  return hostScrollTop + (typeof view.scrollPageOffset === 'number' ? view.scrollPageOffset : 0)
}

export function applySuppressedScrollCorrection(
  view: ScrollCorrectionGuardView,
  hostScrollTop: number,
) {
  const scrollTop = logicalScrollTop(view, hostScrollTop)
  clearScrollCorrectionTargets(view)
  view.scrollDirty = false
  view.scrollTop = scrollTop
  if (view.renderState) {
    view.renderState.scrollTop = scrollTop
  }
  return scrollTop
}
