import { describe, expect, it } from 'vitest'
import { getAvailableThemes, getDefaultAppearanceSettings } from './index'
import { normalizeAppearanceSettings, resolveThemeForVariant, setVariantOverride, setVariantThemeId } from './runtime'

describe('per-preset theme edits', () => {
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
