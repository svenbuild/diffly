import { describe, expect, it } from 'vitest'
import { getResolvedOrResolveTheme } from '@pierre/diffs'
import { getDefaultAppearanceSettings } from './index'
import { buildPierreDiffUnsafeCss, buildPierreTreeUnsafeCss, resolvePierreDiffTheme } from './pierre'
import { setVariantOverride } from './runtime'

describe('buildPierreTreeUnsafeCss', () => {
  it('does not recolor syntax strings when changing added-line colors', () => {
    const settings = getDefaultAppearanceSettings()
    const before = buildPierreDiffUnsafeCss(settings)
    const changed = setVariantOverride(settings, 'dark', current => ({ ...current, diffAdded: '#123456' }))
    const after = buildPierreDiffUnsafeCss(changed)
    expect(resolvePierreDiffTheme(changed)).toEqual(resolvePierreDiffTheme(settings))
    expect(after).not.toBe(before)
    expect(after).toContain('--diffs-addition-color-override: #123456')
  })
  it('preserves scoped syntax rules when only the default text color changes', async () => {
    const settings = getDefaultAppearanceSettings()
    const changed = setVariantOverride(settings, 'dark', current => ({ ...current, ink: '#d32a8f' }))
    const names = resolvePierreDiffTheme(changed) as { dark: string }
    const originalNames = resolvePierreDiffTheme(settings) as { dark: string }
    const original = await getResolvedOrResolveTheme(originalNames.dark)
    const edited = await getResolvedOrResolveTheme(names.dark)
    expect(edited.fg).toBe('var(--text)')
    expect(edited.settings.filter(rule => rule.scope)).toEqual(original.settings.filter(rule => rule.scope))
  })
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
