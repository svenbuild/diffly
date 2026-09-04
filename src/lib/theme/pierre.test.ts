import { describe, expect, it } from 'vitest'
import { getDefaultAppearanceSettings } from './index'
import { buildPierreTreeUnsafeCss } from './pierre'
import { setVariantOverride } from './runtime'

describe('buildPierreTreeUnsafeCss', () => {
  it('pins Pierre trees to the resolved light theme', () => {
    const css = buildPierreTreeUnsafeCss(getDefaultAppearanceSettings(), 'light')

    expect(css).toContain('color-scheme: light;')
    expect(css).toContain('background-color:')
    expect(css).toContain('--trees-theme-sidebar-bg:')
    expect(css).toContain('--trees-bg-override:')
    expect(css).toContain('--trees-input-bg-override:')
  })

  it('keeps light and dark tree CSS distinct', () => {
    const settings = getDefaultAppearanceSettings()

    expect(buildPierreTreeUnsafeCss(settings, 'light')).not.toBe(
      buildPierreTreeUnsafeCss(settings, 'dark'),
    )
  })

  it('uses explicit border, input, raised surface, and muted colors in the file tree', () => {
    const settings = setVariantOverride(getDefaultAppearanceSettings(), 'dark', () => ({
      border: '#123456', input: '#234567', raisedSurface: '#345678', mutedText: '#456789',
    }))
    const css = buildPierreTreeUnsafeCss(settings, 'dark')
    expect(css).toContain('--trees-border-color-override: #123456')
    expect(css).toContain('--trees-input-bg-override: #234567')
    expect(css).toContain('--trees-bg-muted-override: #345678')
    expect(css).toContain('--trees-fg-muted-override: #456789')
  })
})
