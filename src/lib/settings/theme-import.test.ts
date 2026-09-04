import { describe, expect, it } from 'vitest'
import { parseThemeImport } from './theme-import'
import { getDefaultAppearanceSettings } from '../theme'
import { normalizeAppearanceSettings, resolveThemeForVariant, setVariantThemeId } from '../theme/runtime'

const toHex = (value: unknown) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : null

describe('theme import', () => {
  it('imports both T3 variants without modifying an existing preset', () => {
    const themes = parseThemeImport(JSON.stringify({
      version: 1, name: 'Ocean', appearance: 'dark', colors: { canvas: '#101010', accent: '#123456' },
      variants: { light: { canvas: '#fafafa', accent: '#654321' } },
    }), 'custom-import', toHex)
    const settings = normalizeAppearanceSettings({ ...getDefaultAppearanceSettings(), customThemes: themes })
    expect(themes).toHaveLength(2)
    expect(settings.darkThemeId).toBe('codex')
    expect(resolveThemeForVariant(setVariantThemeId(settings, 'light', 'custom-import'), 'light').accent).toBe('#654321')
    expect(resolveThemeForVariant(setVariantThemeId(settings, 'dark', 'custom-import'), 'dark').advancedColors?.background).toBe('#101010')
  })

  it('rejects invalid colors and unsupported files before adding a theme', () => {
    expect(() => parseThemeImport('null', 'custom-import', toHex)).toThrow()
    expect(() => parseThemeImport(JSON.stringify({ version: 1, appearance: 'dark', colors: { accent: 'invalid' } }), 'custom-import', toHex)).toThrow('Invalid color')
  })

  it('reads the existing Diffly export prefix', () => {
    const themes = parseThemeImport('codex-theme-v1:' + JSON.stringify({ variant: 'dark', theme: { accent: '#abcdef' } }), 'custom-import', toHex)
    expect(themes[0].accent).toBe('#abcdef')
  })
})
