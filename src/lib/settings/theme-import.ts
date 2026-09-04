import { applyOverrides, getThemePreset, type ThemeDefinition, type ThemeId, type ThemeOverrides, type ThemeVariant } from '../theme'

export function parseThemeImport(raw: string, id: ThemeId, toHex: (value: unknown) => string | null): ThemeDefinition[] {
  const parsed = JSON.parse(raw.startsWith('codex-theme-v1:') ? raw.slice(15) : raw)
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid theme file.')
  const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim().slice(0, 48) : 'Imported theme'
  const themes: ThemeDefinition[] = []
  const add = (variant: ThemeVariant, values: Record<string, unknown>, mapping: Record<string, string[]>) => {
    const overrides: ThemeOverrides = {}
    for (const [field, candidates] of Object.entries(mapping)) {
      const key = candidates.find(candidate => values[candidate] !== undefined)
      if (!key) continue
      const color = toHex(values[key])
      if (!color) throw new Error(`Invalid color: ${key}`)
      Object.assign(overrides, { [field]: color })
    }
    if (Object.keys(overrides).length === 0) throw new Error('No supported theme colors found.')
    themes.push({ ...applyOverrides(getThemePreset('codex', variant), overrides), id, name })
  }
  if (parsed.version === 1 && (parsed.appearance === 'light' || parsed.appearance === 'dark') && parsed.colors) {
    const mapping = {
      accent: ['accent', 'messageAction', 'focus'], surface: ['surface', 'canvas', 'codeBackground'],
      ink: ['text', 'codeForeground', 'sidebarForeground'], background: ['canvas'],
      raisedSurface: ['surfaceRaised'], overlay: ['surfaceOverlay'], mutedText: ['textMuted', 'mutedForeground'],
      border: ['border'], input: ['input'], diffAdded: ['success'], diffRemoved: ['error'], skill: ['messageAction', 'accent'],
    }
    add(parsed.appearance, parsed.colors, mapping)
    for (const variant of ['light', 'dark'] as const) {
      if (variant !== parsed.appearance && parsed.variants?.[variant]) add(variant, parsed.variants[variant], mapping)
    }
  } else if ((parsed.variant === 'light' || parsed.variant === 'dark') && parsed.theme) {
    const theme = parsed.theme
    add(parsed.variant, { ...theme, ...theme.advancedColors, ...theme.semanticColors }, {
      accent: ['accent'], surface: ['surface'], ink: ['ink'], background: ['background'],
      raisedSurface: ['raisedSurface'], overlay: ['overlay'], mutedText: ['mutedText'],
      border: ['border'], input: ['input'], diffAdded: ['diffAdded'], diffRemoved: ['diffRemoved'], skill: ['skill'],
    })
    const result = themes[0]!
    if (typeof theme.contrast === 'number' && Number.isFinite(theme.contrast)) result.contrast = Math.max(0, Math.min(100, theme.contrast))
    if (typeof theme.fonts?.ui === 'string') result.fonts.ui = theme.fonts.ui.slice(0, 200)
    if (typeof theme.fonts?.code === 'string') result.fonts.code = theme.fonts.code.slice(0, 200)
  } else throw new Error('This file does not contain a supported Diffly or T3 Code theme.')
  return themes
}
