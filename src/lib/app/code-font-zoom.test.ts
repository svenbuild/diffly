import { describe, expect, it } from 'vitest'
import { MAX_CODE_FONT_SIZE, MIN_CODE_FONT_SIZE } from '../theme/runtime'
import {
  CODE_ZOOM_TARGET_SELECTOR,
  isCodeZoomTarget,
  resolveCodeFontSizeFromWheel,
  type CodeZoomWheelEventLike,
} from './code-font-zoom'

function mockElement(matchedSelector: string | null) {
  return {
    closest(selector: string) {
      if (selector === CODE_ZOOM_TARGET_SELECTOR && matchedSelector !== null) {
        return { selector: matchedSelector }
      }
      return null
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
    target: mockElement('.compare-viewer'),
    ...overrides,
  }
}

describe('code-font-zoom', () => {
  it('detects diff, editor, and merge conflict panels as valid zoom targets', () => {
    expect(isCodeZoomTarget(mockElement('.compare-viewer'))).toBe(true)
    expect(isCodeZoomTarget(mockElement('.workspace-editor'))).toBe(true)
    expect(isCodeZoomTarget(mockElement('.merge-conflict-viewer'))).toBe(true)

    const textNode = { parentElement: mockElement('.compare-viewer') } as unknown as EventTarget
    expect(isCodeZoomTarget(textNode)).toBe(true)

    expect(isCodeZoomTarget(mockElement(null))).toBe(false)
    expect(isCodeZoomTarget(null)).toBe(false)
  })

  it('increases monospace font size by 1px on Ctrl + wheel up over a code panel', () => {
    const result = resolveCodeFontSizeFromWheel(wheelEvent({ deltaY: -120 }), 13)
    expect(result).toEqual({ nextSize: 14, changed: true })
  })

  it('decreases monospace font size by 1px on Ctrl + wheel down over a code panel', () => {
    const result = resolveCodeFontSizeFromWheel(
      wheelEvent({ deltaY: 120, target: mockElement('.workspace-editor') }),
      13,
    )
    expect(result).toEqual({ nextSize: 12, changed: true })
  })

  it('clamps at min and max bounds while still returning a handled result', () => {
    expect(
      resolveCodeFontSizeFromWheel(wheelEvent({ deltaY: -100 }), MAX_CODE_FONT_SIZE),
    ).toEqual({ nextSize: MAX_CODE_FONT_SIZE, changed: false })

    expect(
      resolveCodeFontSizeFromWheel(wheelEvent({ deltaY: 100 }), MIN_CODE_FONT_SIZE),
    ).toEqual({ nextSize: MIN_CODE_FONT_SIZE, changed: false })
  })

  it('ignores wheel events without Ctrl, with extra modifiers, zero delta, or outside code panels', () => {
    expect(resolveCodeFontSizeFromWheel(wheelEvent({ ctrlKey: false }), 13)).toBeNull()
    expect(resolveCodeFontSizeFromWheel(wheelEvent({ altKey: true }), 13)).toBeNull()
    expect(resolveCodeFontSizeFromWheel(wheelEvent({ shiftKey: true }), 13)).toBeNull()
    expect(resolveCodeFontSizeFromWheel(wheelEvent({ metaKey: true }), 13)).toBeNull()
    expect(resolveCodeFontSizeFromWheel(wheelEvent({ deltaY: 0 }), 13)).toBeNull()
    expect(resolveCodeFontSizeFromWheel(wheelEvent({ target: mockElement(null) }), 13)).toBeNull()
  })
})
