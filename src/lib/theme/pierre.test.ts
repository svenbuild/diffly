import { describe, expect, it } from 'vitest'
import { getDefaultAppearanceSettings } from './index'
import { buildPierreTreeUnsafeCss } from './pierre'

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
})
