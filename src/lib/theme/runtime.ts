import {
  applyOverrides,
  createThemeTokens,
  getAvailableThemes,
  getDefaultAppearanceSettings,
  getThemePreset,
  resolveTheme,
  type AppearanceMode,
  type AppearanceSettings,
  type ThemeDefinition,
  type ThemeId,
  type ThemeOverrides,
  type ThemeVariant,
} from './index'

export const MIN_UI_FONT_SIZE = 11
export const MAX_UI_FONT_SIZE = 16
export const MIN_CODE_FONT_SIZE = 10
export const MAX_CODE_FONT_SIZE = 18

export function isAppearanceMode(value: string | null | undefined): value is AppearanceMode {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function isThemeId(value: string | null | undefined, variant?: ThemeVariant): value is ThemeId {
  if (!value) {
    return false
  }

  if (!variant) {
    return (
      getAvailableThemes('light').some((theme) => theme.id === value) ||
      getAvailableThemes('dark').some((theme) => theme.id === value)
    )
  }

  return getAvailableThemes(variant).some((theme) => theme.id === value)
}

export function resolveThemeForVariant(
  settings: AppearanceSettings,
  variant: ThemeVariant
): ThemeDefinition {
  const presetId = variant === 'dark' ? settings.darkThemeId : settings.lightThemeId
  const overrides = variant === 'dark' ? settings.darkOverrides : settings.lightOverrides

  return applyOverrides(getThemePreset(presetId, variant), overrides)
}

export function normalizeAppearanceSettings(
  input: Partial<AppearanceSettings> | null | undefined,
  legacyMode?: string | null,
  legacyCodeFontSize?: number | null
): AppearanceSettings {
  const defaults = getDefaultAppearanceSettings()

  return {
    mode: isAppearanceMode(input?.mode) ? input.mode : isAppearanceMode(legacyMode) ? legacyMode : defaults.mode,
    lightThemeId: isThemeId(input?.lightThemeId, 'light') ? input.lightThemeId : defaults.lightThemeId,
    darkThemeId: isThemeId(input?.darkThemeId, 'dark') ? input.darkThemeId : defaults.darkThemeId,
    lightOverrides: normalizeThemeOverrides(input?.lightOverrides),
    darkOverrides: normalizeThemeOverrides(input?.darkOverrides),
    usePointerCursor:
      typeof input?.usePointerCursor === 'boolean'
        ? input.usePointerCursor
        : defaults.usePointerCursor,
    uiFontSize: clampNumber(input?.uiFontSize, MIN_UI_FONT_SIZE, MAX_UI_FONT_SIZE, defaults.uiFontSize),
    codeFontSize: clampNumber(
      input?.codeFontSize ?? legacyCodeFontSize,
      MIN_CODE_FONT_SIZE,
      MAX_CODE_FONT_SIZE,
      defaults.codeFontSize
    ),
  }
}

export function createThemeExport(theme: ThemeDefinition): string {
  return `codex-theme-v1:${JSON.stringify({
    codeThemeId: theme.codeThemeId,
    theme: {
      accent: theme.accent,
      contrast: theme.contrast,
      fonts: theme.fonts,
      ink: theme.ink,
      opaqueWindows: theme.opaqueWindows,
      semanticColors: theme.semanticColors,
      surface: theme.surface,
    },
    variant: theme.variant,
  })}`
}

export function resolveThemeCssVariables(
  settings: AppearanceSettings,
  systemPrefersDark: boolean
): Record<string, string> {
  return createThemeCssVariables(resolveTheme(settings, systemPrefersDark), settings)
}

export function createThemeCssVariables(
  theme: ThemeDefinition,
  settings: Pick<AppearanceSettings, 'codeFontSize' | 'uiFontSize' | 'usePointerCursor'>
): Record<string, string> {
  const tokens = createThemeTokens(theme, settings.uiFontSize, settings.codeFontSize)
  const isDark = theme.variant === 'dark'
  const contrastRatio = clamp(theme.contrast / 100, 0, 1)
  const surfaceAlt = mixHex(theme.surface, theme.ink, isDark ? 0.08 + contrastRatio * 0.06 : 0.025 + contrastRatio * 0.045)
  const surfaceStrong = mixHex(theme.surface, theme.ink, isDark ? 0.14 + contrastRatio * 0.08 : 0.06 + contrastRatio * 0.06)
  const canvas = mixHex(theme.surface, isDark ? '#000000' : '#ffffff', isDark ? 0.2 : 0.035)
  const canvasAlt = mixHex(theme.surface, isDark ? '#000000' : '#ffffff', isDark ? 0.12 : 0.015)
  const border = mixHex(theme.surface, theme.ink, isDark ? 0.22 + contrastRatio * 0.12 : 0.11 + contrastRatio * 0.11)
  const borderStrong = mixHex(theme.surface, theme.ink, isDark ? 0.32 + contrastRatio * 0.14 : 0.2 + contrastRatio * 0.12)
  const accentStrong = mixHex(theme.accent, isDark ? '#ffffff' : '#000000', isDark ? 0.2 : 0.14)
  const accentSoft = mixHex(theme.surface, theme.accent, isDark ? 0.17 : 0.11)
  const accentAlt = mixHex(theme.semanticColors.skill, theme.accent, 0.26)
  const accentAltSoft = mixHex(theme.surface, theme.semanticColors.skill, isDark ? 0.16 : 0.1)
  const accentOlive = mixHex(theme.accent, theme.semanticColors.diffAdded, 0.42)
  const primaryText = pickReadableText(theme.accent)
  const warning = mixHex(theme.accent, theme.semanticColors.diffRemoved, 0.42)
  const panelBg = theme.opaqueWindows
    ? tokens.panelSurface
    : rgbaFromHex(tokens.panelSurface, isDark ? 0.78 : 0.88)
  const elevatedBg = theme.opaqueWindows
    ? tokens.elevatedSurface
    : rgbaFromHex(tokens.elevatedSurface, isDark ? 0.84 : 0.92)
  const listBg = theme.opaqueWindows
    ? theme.surface
    : rgbaFromHex(theme.surface, isDark ? 0.72 : 0.9)
  const paneHeaderBg = theme.opaqueWindows
    ? surfaceStrong
    : rgbaFromHex(surfaceStrong, isDark ? 0.76 : 0.88)
  const diffInsertBg = mixHex(theme.surface, theme.semanticColors.diffAdded, isDark ? 0.24 : 0.18)
  const diffDeleteBg = mixHex(theme.surface, theme.semanticColors.diffRemoved, isDark ? 0.24 : 0.18)
  const collapsedBg = mixHex(canvasAlt, theme.ink, isDark ? 0.1 : 0.04)
  const scrollbarThumb = mixHex(theme.surface, theme.ink, isDark ? 0.28 : 0.18)
  const scrollbarThumbHover = mixHex(theme.surface, theme.ink, isDark ? 0.38 : 0.28)

  return {
    '--ui-font': tokens.uiFont,
    '--code': tokens.codeFont,
    '--ui-font-size': `${tokens.uiFontSize}px`,
    '--code-font-size': `${tokens.codeFontSize}px`,
    '--diff-font-size': `${tokens.codeFontSize}px`,
    '--diff-row-line-height': `${tokens.codeFontSize + 3}px`,
    '--diff-row-height': `${tokens.codeFontSize + 8}px`,
    '--interactive-cursor': settings.usePointerCursor ? 'pointer' : 'default',
    '--pane-backdrop-blur': theme.opaqueWindows ? 'none' : 'blur(18px)',
    '--canvas': canvas,
    '--canvas-alt': canvasAlt,
    '--surface': theme.surface,
    '--surface-alt': surfaceAlt,
    '--surface-strong': surfaceStrong,
    '--border': border,
    '--border-strong': borderStrong,
    '--toolbar-divider': border,
    '--text': theme.ink,
    '--muted': tokens.mutedText,
    '--accent': theme.accent,
    '--accent-strong': accentStrong,
    '--accent-soft': accentSoft,
    '--accent-alt': accentAlt,
    '--accent-alt-soft': accentAltSoft,
    '--accent-olive': accentOlive,
    '--success': theme.semanticColors.diffAdded,
    '--success-bg': mixHex(theme.surface, theme.semanticColors.diffAdded, isDark ? 0.14 : 0.11),
    '--danger': theme.semanticColors.diffRemoved,
    '--danger-bg': mixHex(theme.surface, theme.semanticColors.diffRemoved, isDark ? 0.14 : 0.11),
    '--warning': warning,
    '--warning-bg': mixHex(theme.surface, warning, isDark ? 0.15 : 0.1),
    '--neutral-bg': surfaceAlt,
    '--canvas-glow-primary': rgbaFromHex(theme.accent, isDark ? 0.07 : 0.045),
    '--canvas-glow-secondary': rgbaFromHex(theme.semanticColors.skill, isDark ? 0.05 : 0.035),
    '--app-bar-bg': panelBg,
    '--app-bar-shadow-strong': rgbaFromHex(isDark ? '#000000' : '#111111', isDark ? 0.22 : 0.08),
    '--app-bar-shadow-soft': rgbaFromHex('#ffffff', isDark ? 0.02 : 0.55),
    '--title': theme.ink,
    '--subtitle': tokens.mutedText,
    '--strong-text': theme.ink,
    '--secondary-text': mixHex(theme.ink, theme.surface, isDark ? 0.08 : 0.14),
    '--active-text': theme.ink,
    '--primary-text': primaryText,
    '--danger-text': pickReadableText(theme.semanticColors.diffRemoved),
    '--danger-border': mixHex(theme.surface, theme.semanticColors.diffRemoved, isDark ? 0.34 : 0.24),
    '--danger-strong-bg': mixHex(theme.surface, theme.semanticColors.diffRemoved, isDark ? 0.2 : 0.14),
    '--danger-strong-text': pickReadableText(mixHex(theme.surface, theme.semanticColors.diffRemoved, isDark ? 0.2 : 0.14), theme.ink),
    '--panel-title': theme.ink,
    '--panel-meta': tokens.mutedText,
    '--sidebar-panel-bg': panelBg,
    '--pane-bg': panelBg,
    '--card-bg': elevatedBg,
    '--card-top-border': rgbaFromHex(theme.ink, isDark ? 0.08 : 0.06),
    '--list-bg': listBg,
    '--list-header-bg': paneHeaderBg,
    '--selection-bg': rgbaFromHex(theme.accent, isDark ? 0.14 : 0.1),
    '--icon-color': mixHex(theme.ink, theme.accent, 0.32),
    '--status-modified-bg': mixHex(theme.surface, theme.accent, isDark ? 0.18 : 0.11),
    '--status-modified-border': mixHex(theme.surface, theme.accent, isDark ? 0.3 : 0.2),
    '--status-modified-text': pickReadableText(mixHex(theme.surface, theme.accent, isDark ? 0.18 : 0.11), theme.ink),
    '--status-success-border': mixHex(theme.surface, theme.semanticColors.diffAdded, isDark ? 0.32 : 0.2),
    '--status-success-text': pickReadableText(mixHex(theme.surface, theme.semanticColors.diffAdded, isDark ? 0.18 : 0.11), theme.ink),
    '--status-danger-border': mixHex(theme.surface, theme.semanticColors.diffRemoved, isDark ? 0.32 : 0.2),
    '--status-danger-text': pickReadableText(mixHex(theme.surface, theme.semanticColors.diffRemoved, isDark ? 0.18 : 0.11), theme.ink),
    '--pane-header-bg': paneHeaderBg,
    '--pane-header-shadow': rgbaFromHex(theme.ink, isDark ? 0.03 : 0.05),
    '--pane-inner-shadow': rgbaFromHex(theme.ink, isDark ? 0.02 : 0.04),
    '--hunk-bg': surfaceAlt,
    '--diff-divider': rgbaFromHex(theme.ink, isDark ? 0.12 : 0.12),
    '--diff-context-bg': panelBg,
    '--diff-insert-bg': diffInsertBg,
    '--diff-insert-text': pickReadableText(diffInsertBg, theme.ink),
    '--diff-delete-bg': diffDeleteBg,
    '--diff-delete-text': pickReadableText(diffDeleteBg, theme.ink),
    '--diff-gap-bg': canvasAlt,
    '--diff-gap-stripe': rgbaFromHex(theme.ink, isDark ? 0.04 : 0.03),
    '--collapsed-row-bg': collapsedBg,
    '--collapsed-row-line': rgbaFromHex(theme.ink, isDark ? 0.26 : 0.22),
    '--collapsed-chip-bg': elevatedBg,
    '--collapsed-chip-border': border,
    '--collapsed-chip-text': tokens.mutedText,
    '--scroll-marker-insert': theme.semanticColors.diffAdded,
    '--scroll-marker-delete': theme.semanticColors.diffRemoved,
    '--scroll-marker-mixed': theme.accent,
    '--syntax-comment': tokens.mutedText,
    '--syntax-keyword': theme.semanticColors.skill,
    '--syntax-type': accentStrong,
    '--syntax-string': theme.semanticColors.diffAdded,
    '--syntax-number': warning,
    '--syntax-function': mixHex(theme.accent, theme.semanticColors.skill, 0.38),
    '--syntax-property': mixHex(theme.accent, theme.ink, isDark ? 0.16 : 0.24),
    '--syntax-constant': theme.semanticColors.diffRemoved,
    '--syntax-selector': mixHex(theme.accent, theme.semanticColors.diffAdded, 0.26),
    '--syntax-macro': theme.semanticColors.diffRemoved,
    '--syntax-tag': theme.semanticColors.diffAdded,
    '--syntax-regex': mixHex(theme.semanticColors.diffAdded, theme.accent, 0.22),
    '--syntax-operator': theme.ink,
    '--syntax-punctuation': tokens.mutedText,
    '--insert-highlight-bg': rgbaFromHex(theme.semanticColors.diffAdded, isDark ? 0.45 : 0.28),
    '--delete-highlight-bg': rgbaFromHex(theme.semanticColors.diffRemoved, isDark ? 0.4 : 0.24),
    '--line-divider': rgbaFromHex(theme.ink, isDark ? 0.1 : 0.12),
    '--highlight-bg': rgbaFromHex(theme.accent, isDark ? 0.2 : 0.14),
    '--scrollbar-track': canvasAlt,
    '--scrollbar-thumb': scrollbarThumb,
    '--scrollbar-thumb-hover': scrollbarThumbHover,
    '--scrollbar-thumb-border': canvasAlt,
  }
}

export function setVariantThemeId(
  settings: AppearanceSettings,
  variant: ThemeVariant,
  themeId: ThemeId
): AppearanceSettings {
  if (variant === 'dark') {
    return {
      ...settings,
      darkThemeId: themeId,
      darkOverrides: {},
    }
  }

  return {
    ...settings,
    lightThemeId: themeId,
    lightOverrides: {},
  }
}

export function setVariantOverride(
  settings: AppearanceSettings,
  variant: ThemeVariant,
  updater: (next: ThemeOverrides, base: ThemeDefinition) => ThemeOverrides
): AppearanceSettings {
  const base = getThemePreset(
    variant === 'dark' ? settings.darkThemeId : settings.lightThemeId,
    variant
  )
  const current = variant === 'dark' ? settings.darkOverrides : settings.lightOverrides
  const next = sanitizeOverrideEntries(updater({ ...current }, base))

  if (variant === 'dark') {
    return {
      ...settings,
      darkOverrides: next,
    }
  }

  return {
    ...settings,
    lightOverrides: next,
  }
}

function normalizeThemeOverrides(input: ThemeOverrides | null | undefined): ThemeOverrides {
  return sanitizeOverrideEntries({ ...(input ?? {}) })
}

function sanitizeOverrideEntries(input: ThemeOverrides): ThemeOverrides {
  const next: ThemeOverrides = {}

  if (isHexColor(input.accent)) {
    next.accent = normalizeHexColor(input.accent)
  }

  if (isHexColor(input.surface)) {
    next.surface = normalizeHexColor(input.surface)
  }

  if (isHexColor(input.ink)) {
    next.ink = normalizeHexColor(input.ink)
  }

  if (typeof input.contrast === 'number' && Number.isFinite(input.contrast)) {
    next.contrast = Math.round(clamp(input.contrast, 0, 100))
  }

  if (typeof input.opaqueWindows === 'boolean') {
    next.opaqueWindows = input.opaqueWindows
  }

  if (input.uiFont === null || typeof input.uiFont === 'string') {
    const normalized = normalizeFontValue(input.uiFont)
    if (normalized !== undefined) {
      next.uiFont = normalized
    }
  }

  if (input.codeFont === null || typeof input.codeFont === 'string') {
    const normalized = normalizeFontValue(input.codeFont)
    if (normalized !== undefined) {
      next.codeFont = normalized
    }
  }

  return next
}

function normalizeFontValue(value: string | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined
  }

  if (value === null) {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function clampNumber(value: number | null | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.round(clamp(value, min, max))
}

function normalizeHexColor(value: string): string {
  return `#${value.trim().replace(/^#/, '').toUpperCase()}`
}

function isHexColor(value: string | null | undefined): value is string {
  if (!value) {
    return false
  }

  return /^#?[0-9A-Fa-f]{6}$/.test(value.trim())
}

function rgbaFromHex(value: string, alpha: number): string {
  const rgb = parseHexColor(value)
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp(alpha, 0, 1).toFixed(3)})`
}

function pickReadableText(background: string, preferredInk?: string): string {
  if (preferredInk) {
    const contrastWithInk = Math.abs(relativeLuminance(parseHexColor(background)) - relativeLuminance(parseHexColor(preferredInk)))
    if (contrastWithInk >= 0.45) {
      return preferredInk
    }
  }

  return relativeLuminance(parseHexColor(background)) > 0.5 ? '#111111' : '#FFFFFF'
}

function relativeLuminance(value: { r: number; g: number; b: number }): number {
  const toLinear = (channel: number) => {
    const normalized = channel / 255
    if (normalized <= 0.03928) {
      return normalized / 12.92
    }
    return ((normalized + 0.055) / 1.055) ** 2.4
  }

  return 0.2126 * toLinear(value.r) + 0.7152 * toLinear(value.g) + 0.0722 * toLinear(value.b)
}

function mixHex(left: string, right: string, amount: number): string {
  const clamped = clamp(amount, 0, 1)
  const leftRgb = parseHexColor(left)
  const rightRgb = parseHexColor(right)

  return rgbToHex({
    r: Math.round(leftRgb.r + (rightRgb.r - leftRgb.r) * clamped),
    g: Math.round(leftRgb.g + (rightRgb.g - leftRgb.g) * clamped),
    b: Math.round(leftRgb.b + (rightRgb.b - leftRgb.b) * clamped),
  })
}

function parseHexColor(value: string): { r: number; g: number; b: number } {
  const normalized = value.trim().replace(/^#/, '')
  if (normalized.length !== 6) {
    throw new Error(`Expected a 6-digit hex color, received "${value}"`)
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

function rgbToHex(value: { r: number; g: number; b: number }): string {
  return `#${toHex(value.r)}${toHex(value.g)}${toHex(value.b)}`
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, '0')
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
