import { describe, expect, it } from 'vitest'
import {
  CODE_ZOOM_TARGET_SELECTOR,
  createCodeZoomGestureState,
  resolveCodeZoomStep,
  type CodeZoomWheelEventLike,
} from './code-font-zoom'

function mockElement(insideCodePanel: boolean) {
  return {
    closest(selector: string) {
      return selector === CODE_ZOOM_TARGET_SELECTOR && insideCodePanel ? {} : null
    },
  } as unknown as EventTarget
}

function wheelEvent(overrides: Partial<CodeZoomWheelEventLike> = {}): CodeZoomWheelEventLike {
  return {
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    deltaY: -100,
    deltaMode: 0,
    timeStamp: 1000,
    target: mockElement(true),
    ...overrides,
  }
}

describe('code-font-zoom', () => {
  it('steps once per mouse wheel notch in the right direction', () => {
    const state = createCodeZoomGestureState()
    expect(resolveCodeZoomStep(wheelEvent({ deltaY: -100 }), state)).toBe(1)
    expect(resolveCodeZoomStep(wheelEvent({ deltaY: 100, timeStamp: 1050 }), state)).toBe(-1)
    // Large high-DPI notches still give a single step.
    expect(resolveCodeZoomStep(wheelEvent({ deltaY: -250, timeStamp: 1100 }), state)).toBe(1)
  })

  it('adds up small touchpad deltas before stepping', () => {
    const state = createCodeZoomGestureState()
    const steps = [0, 10, 20, 30, 40, 50].map((offset) =>
      resolveCodeZoomStep(wheelEvent({ deltaY: -10, timeStamp: 1000 + offset }), state),
    )
    expect(steps).toEqual([0, 0, 0, 0, 1, 0])
  })

  it('keeps the touchpad remainder between steps', () => {
    const state = createCodeZoomGestureState()
    const steps = [0, 10, 20, 30].map((offset) =>
      resolveCodeZoomStep(wheelEvent({ deltaY: -40, timeStamp: 1000 + offset }), state),
    )
    expect(steps).toEqual([0, 1, 1, 1])
  })

  it('forgets leftover delta after a pause', () => {
    const state = createCodeZoomGestureState()
    expect(resolveCodeZoomStep(wheelEvent({ deltaY: -40, timeStamp: 1000 }), state)).toBe(0)
    expect(resolveCodeZoomStep(wheelEvent({ deltaY: -40, timeStamp: 2000 }), state)).toBe(0)
  })

  it('converts line based deltas to pixels', () => {
    const state = createCodeZoomGestureState()
    expect(resolveCodeZoomStep(wheelEvent({ deltaY: 3, deltaMode: 1 }), state)).toBe(-1)
  })

  it('ignores events without Ctrl, with extra modifiers, zero delta, or outside code panels', () => {
    const state = createCodeZoomGestureState()
    expect(resolveCodeZoomStep(wheelEvent({ ctrlKey: false }), state)).toBeNull()
    expect(resolveCodeZoomStep(wheelEvent({ altKey: true }), state)).toBeNull()
    expect(resolveCodeZoomStep(wheelEvent({ shiftKey: true }), state)).toBeNull()
    expect(resolveCodeZoomStep(wheelEvent({ metaKey: true }), state)).toBeNull()
    expect(resolveCodeZoomStep(wheelEvent({ deltaY: 0 }), state)).toBeNull()
    expect(resolveCodeZoomStep(wheelEvent({ target: mockElement(false) }), state)).toBeNull()
    expect(resolveCodeZoomStep(wheelEvent({ target: null }), state)).toBeNull()
  })
})
