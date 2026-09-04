import { describe, expect, it } from 'vitest'
import { getAvailableThemes, getDefaultAppearanceSettings } from './index'
import { createThemeCssVariables, normalizeAppearanceSettings, resetThemeColorOverrides, resolveThemeForVariant, setVariantOverride, setVariantThemeId } from './runtime'

describe('per-preset theme edits', () => {
  it('changes text without recoloring surfaces, borders, muted text, or scrollbars', () => {
    for (const variant of ['light', 'dark'] as const) {
      const settings = getDefaultAppearanceSettings()
      const before = createThemeCssVariables(resolveThemeForVariant(settings, variant), settings)
      const changed = setVariantOverride(settings, variant, current => ({ ...current, ink: '#d32a8f' }))
      const after = createThemeCssVariables(resolveThemeForVariant(changed, variant), changed)
      expect(after['--text']).toBe('#D32A8F')
      for (const key of ['--canvas', '--surface', '--surface-alt', '--overlay-surface', '--pane-bg',
        '--card-bg', '--border', '--border-subtle', '--input-surface', '--muted',
        '--scrollbar-thumb', '--active-surface', '--selection-bg']) {
        expect(after[key], `${variant} ${key}`).toBe(before[key])
      }
    }
  })
  it('keeps overlay colors separate from regular surfaces, inputs, and headers', () => {
    const settings = getDefaultAppearanceSettings()
    const before = createThemeCssVariables(resolveThemeForVariant(settings, 'dark'), settings)
    const changed = setVariantOverride(settings, 'dark', current => ({ ...current, overlay: '#123456' }))
    const after = createThemeCssVariables(resolveThemeForVariant(changed, 'dark'), changed)
    expect(after['--overlay-surface']).toBe('#123456')
    for (const key of ['--canvas', '--surface', '--surface-alt', '--surface-strong', '--input-surface', '--list-header-bg']) {
      expect(after[key], key).toBe(before[key])
    }
  })
  it('removes every color override while retaining typography and interface preferences', () => {
    expect(resetThemeColorOverrides({
      accent: '#123456', surface: '#123456', ink: '#123456', diffAdded: '#123456',
      diffRemoved: '#123456', skill: '#123456', background: '#123456', raisedSurface: '#123456',
      overlay: '#123456', mutedText: '#123456', border: '#123456', input: '#123456',
      uiFont: 'Georgia', codeFont: 'Consolas', contrast: 42, opaqueWindows: true,
    })).toEqual({ uiFont: 'Georgia', codeFont: 'Consolas', contrast: 42, opaqueWindows: true })
  })
  it('keeps inactive edits without selecting them and restores them after persistence', () => {
    const initial = getDefaultAppearanceSettings()
    const target = getAvailableThemes('dark').find(theme => theme.id !== initial.darkThemeId)!
    let settings = setVariantOverride(initial, 'dark', overrides => ({ ...overrides, accent: '#123456' }))
    settings = setVariantThemeId(settings, 'dark', target.id)
    settings = setVariantOverride(settings, 'dark', overrides => ({ ...overrides, accent: '#abcdef' }))
    settings = setVariantThemeId(settings, 'dark', initial.darkThemeId)
    expect(settings.darkThemeId).toBe(initial.darkThemeId)
    expect(resolveThemeForVariant(settings, 'dark').accent).toBe('#123456')
    settings = normalizeAppearanceSettings(JSON.parse(JSON.stringify(settings)))
    settings = setVariantThemeId(settings, 'dark', target.id)
    expect(resolveThemeForVariant(settings, 'dark').accent).toBe('#ABCDEF')
    expect(settings.lightThemeId).toBe(initial.lightThemeId)
    expect(settings.lightOverrides).toEqual(initial.lightOverrides)
  })

  it('does not reset overrides when selecting the current preset', () => {
    const initial = getDefaultAppearanceSettings()
    const settings = setVariantOverride(initial, 'light', overrides => ({ ...overrides, accent: '#123456' }))
    expect(setVariantThemeId(settings, 'light', settings.lightThemeId)).toBe(settings)
  })
})
