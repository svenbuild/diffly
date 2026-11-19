export const CODE_ZOOM_TARGET_SELECTOR =
  '.compare-viewer, .workspace-editor, .merge-conflict-viewer'

// One mouse wheel notch is about 100px, so every notch gives exactly one step.
// Touchpad pinch gestures send many small deltas, which add up before a step.
const PIXELS_PER_STEP = 50
const PIXELS_PER_LINE = 40
const PIXELS_PER_PAGE = 800
// A pause this long starts a new gesture, so leftover delta does not carry over.
const GESTURE_IDLE_MS = 300

const DOM_DELTA_LINE = 1
const DOM_DELTA_PAGE = 2

export interface CodeZoomWheelEventLike {
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
  deltaY: number
  deltaMode: number
  timeStamp: number
  target: EventTarget | null
}

export interface CodeZoomGestureState {
  accumulatedPixels: number
  lastTimeStamp: number
}

export function createCodeZoomGestureState(): CodeZoomGestureState {
  return { accumulatedPixels: 0, lastTimeStamp: Number.NEGATIVE_INFINITY }
}

function isCodeZoomTarget(target: EventTarget | null) {
  const element = target as { closest?: (selector: string) => unknown } | null
  return typeof element?.closest === 'function' && element.closest(CODE_ZOOM_TARGET_SELECTOR) !== null
}

function deltaPixels(event: CodeZoomWheelEventLike) {
  if (event.deltaMode === DOM_DELTA_LINE) return event.deltaY * PIXELS_PER_LINE
  if (event.deltaMode === DOM_DELTA_PAGE) return event.deltaY * PIXELS_PER_PAGE
  return event.deltaY
}

/**
 * Returns null when the event is not a code zoom gesture, so normal scrolling
 * and Chromium handling stay untouched. Otherwise returns the font size step
 * (+1, -1, or 0 while a touchpad gesture is still adding up).
 */
export function resolveCodeZoomStep(
  event: CodeZoomWheelEventLike,
  state: CodeZoomGestureState,
): -1 | 0 | 1 | null {
  if (!event.ctrlKey || event.altKey || event.shiftKey || event.metaKey || event.deltaY === 0) {
    return null
  }
  if (!isCodeZoomTarget(event.target)) {
    return null
  }

  if (event.timeStamp - state.lastTimeStamp > GESTURE_IDLE_MS) {
    state.accumulatedPixels = 0
  }
  state.lastTimeStamp = event.timeStamp
  const pixels = deltaPixels(event)

  // Wheel up (negative delta) makes the text bigger.
  if (Math.abs(pixels) >= PIXELS_PER_STEP) {
    // A mouse notch is always exactly one step, whatever its size.
    state.accumulatedPixels = 0
    return pixels < 0 ? 1 : -1
  }

  state.accumulatedPixels += pixels
  if (Math.abs(state.accumulatedPixels) < PIXELS_PER_STEP) {
    return 0
  }
  // Touchpad deltas keep their remainder, so zoom speed follows finger speed.
  const step = state.accumulatedPixels < 0 ? 1 : -1
  state.accumulatedPixels += step * PIXELS_PER_STEP
  return step
}
