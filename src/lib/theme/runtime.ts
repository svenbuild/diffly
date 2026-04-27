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
  const contrastScale = clamp(theme.contrast / 100, 0, 1)
  const surfaceAlt = mixHex(
    theme.surface,
    theme.ink,
    isDark ? scaleByContrast(contrastScale, 0.04, 0.18) : scaleByContrast(contrastScale, 0.015, 0.11)
  )
  const surfaceStrong = mixHex(
    theme.surface,
    theme.ink,
    isDark ? scaleByContrast(contrastScale, 0.08, 0.28) : scaleByContrast(contrastScale, 0.04, 0.18)
  )
  const canvas = mixHex(
    theme.surface,
    isDark ? '#000000' : '#ffffff',
    isDark ? scaleByContrast(contrastScale, 0.12, 0.32) : scaleByContrast(contrastScale, 0.015, 0.075)
  )
  const canvasAlt = mixHex(
    theme.surface,
    isDark ? '#000000' : '#ffffff',
    isDark ? scaleByContrast(contrastScale, 0.06, 0.22) : scaleByContrast(contrastScale, 0.008, 0.05)
  )
  const border = mixHex(
    theme.surface,
    theme.ink,
    isDark ? scaleByContrast(contrastScale, 0.16, 0.46) : scaleByContrast(contrastScale, 0.08, 0.3)
  )
  const borderStrong = mixHex(
    theme.surface,
    theme.ink,
    isDark ? scaleByContrast(contrastScale, 0.24, 0.58) : scaleByContrast(contrastScale, 0.16, 0.42)
  )
  const accentStrong = mixHex(
    theme.accent,
    isDark ? '#ffffff' : '#000000',
    isDark ? scaleByContrast(contrastScale, 0.08, 0.26) : scaleByContrast(contrastScale, 0.06, 0.18)
  )
  const accentSoft = mixHex(
    theme.surface,
    theme.accent,
    isDark ? scaleByContrast(contrastScale, 0.11, 0.28) : scaleByContrast(contrastScale, 0.08, 0.19)
  )
  const accentAlt = mixHex(theme.semanticColors.skill, theme.accent, 0.26)
  const accentAltSoft = mixHex(
    theme.surface,
    theme.semanticColors.skill,
    isDark ? scaleByContrast(contrastScale, 0.1, 0.25) : scaleByContrast(contrastScale, 0.08, 0.17)
  )
  const accentOlive = mixHex(theme.accent, theme.semanticColors.diffAdded, 0.42)
  const warning = mixHex(theme.accent, theme.semanticColors.diffRemoved, 0.48)
  const panelAlpha = scaleByContrast(contrastScale, isDark ? 0.82 : 0.9, isDark ? 0.94 : 0.98)
  const elevatedAlpha = scaleByContrast(contrastScale, isDark ? 0.88 : 0.95, isDark ? 0.98 : 0.995)
  const paneHeaderAlpha = scaleByContrast(contrastScale, isDark ? 0.84 : 0.92, isDark ? 0.97 : 0.99)
  const panelBg = theme.opaqueWindows
    ? tokens.panelSurface
    : rgbaFromHex(tokens.panelSurface, panelAlpha)
  const elevatedBg = theme.opaqueWindows
    ? tokens.elevatedSurface
    : rgbaFromHex(tokens.elevatedSurface, elevatedAlpha)
  const listBg = theme.opaqueWindows
    ? theme.surface
    : rgbaFromHex(
        theme.surface,
        isDark ? scaleByContrast(contrastScale, 0.74, 0.9) : scaleByContrast(contrastScale, 0.88, 0.97)
      )
  const listBgResolved = theme.opaqueWindows
    ? theme.surface
    : compositeHex(
        theme.surface,
        canvas,
        isDark ? scaleByContrast(contrastScale, 0.74, 0.9) : scaleByContrast(contrastScale, 0.88, 0.97)
      )
  const paneHeaderBg = theme.opaqueWindows
    ? surfaceStrong
    : rgbaFromHex(surfaceStrong, paneHeaderAlpha)
  const panelBgResolved = theme.opaqueWindows
    ? tokens.panelSurface
    : compositeHex(tokens.panelSurface, canvas, panelAlpha)
  const diffContextBgResolved = theme.opaqueWindows
    ? tokens.panelSurface
    : compositeHex(tokens.panelSurface, canvasAlt, panelAlpha)
  const cardBgResolved = theme.opaqueWindows
    ? tokens.elevatedSurface
    : compositeHex(tokens.elevatedSurface, theme.surface, elevatedAlpha)
  const listHeaderBgResolved = theme.opaqueWindows
    ? surfaceStrong
    : compositeHex(surfaceStrong, panelBgResolved, paneHeaderAlpha)
  const diffInsertBg = mixHex(
    theme.surface,
    theme.semanticColors.diffAdded,
    isDark ? scaleByContrast(contrastScale, 0.1, 0.22) : scaleByContrast(contrastScale, 0.08, 0.18)
  )
  const diffDeleteBg = mixHex(
    theme.surface,
    theme.semanticColors.diffRemoved,
    isDark ? scaleByContrast(contrastScale, 0.1, 0.22) : scaleByContrast(contrastScale, 0.08, 0.18)
  )
  const successBg = mixHex(
    theme.surface,
    theme.semanticColors.diffAdded,
    isDark ? scaleByContrast(contrastScale, 0.1, 0.22) : scaleByContrast(contrastScale, 0.08, 0.18)
  )
  const dangerBg = mixHex(
    theme.surface,
    theme.semanticColors.diffRemoved,
    isDark ? scaleByContrast(contrastScale, 0.1, 0.22) : scaleByContrast(contrastScale, 0.08, 0.18)
  )
  const warningBg = mixHex(
    theme.surface,
    warning,
    isDark ? scaleByContrast(contrastScale, 0.1, 0.22) : scaleByContrast(contrastScale, 0.08, 0.18)
  )
  const dangerStrongBg = mixHex(
    theme.surface,
    theme.semanticColors.diffRemoved,
    isDark ? scaleByContrast(contrastScale, 0.15, 0.3) : scaleByContrast(contrastScale, 0.12, 0.23)
  )
  const statusModifiedBg = mixHex(
    theme.surface,
    theme.accent,
    isDark ? scaleByContrast(contrastScale, 0.12, 0.28) : scaleByContrast(contrastScale, 0.09, 0.2)
  )
  const collapsedBg = mixHex(canvasAlt, theme.ink, isDark ? 0.1 : 0.04)
  const collapsedChipBgResolved = theme.opaqueWindows
    ? tokens.elevatedSurface
    : compositeHex(tokens.elevatedSurface, collapsedBg, elevatedAlpha)
  const scrollbarThumb = mixHex(
    theme.surface,
    theme.ink,
    isDark ? scaleByContrast(contrastScale, 0.22, 0.46) : scaleByContrast(contrastScale, 0.12, 0.34)
  )
  const scrollbarThumbHover = mixHex(
    theme.surface,
    theme.ink,
    isDark ? scaleByContrast(contrastScale, 0.32, 0.56) : scaleByContrast(contrastScale, 0.22, 0.44)
  )
  const textContrastTarget = scaleByContrast(contrastScale, 4.5, 6.4)
  const mutedContrastTarget = scaleByContrast(contrastScale, 4.45, 5.4)
  const secondaryContrastTarget = scaleByContrast(contrastScale, 4.6, 5.9)
  const syntaxContrastTarget = scaleByContrast(contrastScale, 3.45, 4.55)
  const syntaxMutedContrastTarget = scaleByContrast(contrastScale, 3.7, 4.7)
  const syntaxTextSeparationTarget = scaleByContrast(contrastScale, isDark ? 1.26 : 1.2, isDark ? 1.42 : 1.3)
  const readableText = ensureReadableForeground(
    theme.ink,
    [theme.surface, surfaceAlt, panelBgResolved, cardBgResolved, listHeaderBgResolved],
    isDark ? '#FFFFFF' : '#111111',
    textContrastTarget
  )
  const baseMutedText = tokens.mutedText
  const mutedText = ensureReadableForeground(
    baseMutedText,
    [theme.surface, surfaceAlt, panelBgResolved, cardBgResolved, listHeaderBgResolved],
    readableText,
    mutedContrastTarget
  )
  const secondaryText = ensureReadableForeground(
    mixHex(theme.ink, theme.surface, isDark ? 0.08 : 0.14),
    [theme.surface, surfaceAlt, panelBgResolved, cardBgResolved, listHeaderBgResolved],
    readableText,
    secondaryContrastTarget
  )
  const activeSurface = ensureDistinguishableSurface(
    mixHex(
      theme.surface,
      accentStrong,
      isDark ? scaleByContrast(contrastScale, 0.22, 0.44) : scaleByContrast(contrastScale, 0.18, 0.34)
    ),
    [theme.surface, surfaceAlt, panelBgResolved, cardBgResolved, listHeaderBgResolved, listBgResolved],
    readableText,
    isDark ? 1.18 : 1.16
  )
  const activeBorder = ensureReadableForeground(
    accentStrong,
    [theme.surface, surfaceAlt, panelBgResolved, cardBgResolved, listHeaderBgResolved, listBgResolved],
    readableText,
    scaleByContrast(contrastScale, 2.7, 3.3)
  )
  const activeText = pickReadableText(activeSurface, readableText, 4.5)
  const primaryText = pickReadableText(theme.accent, readableText, 4.5)
  const primaryHoverText = pickReadableText(accentStrong, readableText, 4.5)
  const dangerText = pickReadableText(dangerBg, readableText, 4.5)
  const dangerStrongText = pickReadableText(dangerStrongBg, readableText, 4.5)
  const statusModifiedText = pickReadableText(statusModifiedBg, readableText, 4.5)
  const statusSuccessText = pickReadableText(successBg, readableText, 4.5)
  const statusDangerText = pickReadableText(dangerBg, readableText, 4.5)
  const diffInsertText = pickReadableText(diffInsertBg, readableText, 4.5)
  const diffDeleteText = pickReadableText(diffDeleteBg, readableText, 4.5)
  const collapsedChipText = ensureReadableForeground(
    mutedText,
    collapsedChipBgResolved,
    secondaryText,
    4.5
  )
  const selectedRowBg = ensureDistinguishableSurface(
    mixHex(
      listBgResolved,
      activeBorder,
      isDark ? scaleByContrast(contrastScale, 0.18, 0.34) : scaleByContrast(contrastScale, 0.15, 0.28)
    ),
    [theme.surface, surfaceAlt, panelBgResolved, listBgResolved],
    readableText,
    isDark ? 1.16 : 1.14
  )
  const syntaxBackgrounds = [diffContextBgResolved, diffInsertBg, diffDeleteBg]
  const syntaxKeyword = ensureReadableSyntaxForeground(
    theme.semanticColors.skill,
    syntaxBackgrounds,
    readableText,
    isDark ? '#FFFFFF' : '#111111',
    syntaxContrastTarget,
    syntaxTextSeparationTarget
  )
  const syntaxType = ensureReadableSyntaxForeground(
    accentStrong,
    syntaxBackgrounds,
    readableText,
    isDark ? '#FFFFFF' : '#111111',
    syntaxContrastTarget,
    syntaxTextSeparationTarget
  )
  const syntaxString = ensureReadableSyntaxForeground(
    theme.semanticColors.diffAdded,
    syntaxBackgrounds,
    readableText,
    isDark ? '#FFFFFF' : '#111111',
    syntaxContrastTarget,
    syntaxTextSeparationTarget
  )
  const syntaxNumber = ensureReadableSyntaxForeground(
    warning,
    syntaxBackgrounds,
    readableText,
    isDark ? '#FFFFFF' : '#111111',
    syntaxContrastTarget,
    syntaxTextSeparationTarget
  )
  const syntaxFunction = ensureReadableSyntaxForeground(
    mixHex(theme.accent, theme.semanticColors.skill, 0.38),
    syntaxBackgrounds,
    readableText,
    isDark ? '#FFFFFF' : '#111111',
    syntaxContrastTarget,
    syntaxTextSeparationTarget
  )
  const syntaxProperty = ensureReadableSyntaxForeground(
    mixHex(theme.accent, theme.ink, isDark ? 0.16 : 0.24),
    syntaxBackgrounds,
    readableText,
    isDark ? '#FFFFFF' : '#111111',
    syntaxContrastTarget,
    syntaxTextSeparationTarget
  )
  const syntaxConstant = ensureReadableSyntaxForeground(
    theme.semanticColors.diffRemoved,
    syntaxBackgrounds,
    readableText,
    isDark ? '#FFFFFF' : '#111111',
    syntaxContrastTarget,
    syntaxTextSeparationTarget
  )
  const syntaxSelector = ensureReadableSyntaxForeground(
    mixHex(theme.accent, theme.semanticColors.diffAdded, 0.26),
    syntaxBackgrounds,
    readableText,
    isDark ? '#FFFFFF' : '#111111',
    syntaxContrastTarget,
    syntaxTextSeparationTarget
  )
  const syntaxRegex = ensureReadableSyntaxForeground(
    mixHex(theme.semanticColors.diffAdded, theme.accent, 0.22),
    syntaxBackgrounds,
    readableText,
    isDark ? '#FFFFFF' : '#111111',
    syntaxContrastTarget,
    syntaxTextSeparationTarget
  )

  return {
    '--ui-font': tokens.uiFont,
    '--code': tokens.codeFont,
    '--ui-font-size': `${tokens.uiFontSize}px`,
    '--code-font-size': `${tokens.codeFontSize}px`,
    '--diff-font-size': `${tokens.codeFontSize}px`,
    '--diff-row-line-height': `${tokens.codeFontSize + 3}px`,
    '--diff-row-height': `${tokens.codeFontSize + 8}px`,
    '--interactive-cursor': settings.usePointerCursor ? 'pointer' : 'default',
    '--pane-backdrop-blur': theme.opaqueWindows ? 'none' : 'blur(10px)',
    '--canvas': canvas,
    '--canvas-alt': canvasAlt,
    '--surface': theme.surface,
    '--surface-alt': surfaceAlt,
    '--surface-strong': surfaceStrong,
    '--border': border,
    '--border-strong': borderStrong,
    '--toolbar-divider': border,
    '--text': readableText,
    '--muted': mutedText,
    '--accent': theme.accent,
    '--accent-strong': accentStrong,
    '--accent-soft': accentSoft,
    '--active-surface': activeSurface,
    '--active-border': activeBorder,
    '--accent-alt': accentAlt,
    '--accent-alt-soft': accentAltSoft,
    '--accent-olive': accentOlive,
    '--success': theme.semanticColors.diffAdded,
    '--success-bg': successBg,
    '--danger': theme.semanticColors.diffRemoved,
    '--danger-bg': dangerBg,
    '--warning': warning,
    '--warning-bg': warningBg,
    '--neutral-bg': surfaceAlt,
    '--canvas-glow-primary': rgbaFromHex(theme.accent, isDark ? 0.045 : 0.028),
    '--canvas-glow-secondary': rgbaFromHex(theme.semanticColors.skill, isDark ? 0.032 : 0.022),
    '--app-bar-bg': panelBg,
    '--app-bar-shadow-strong': rgbaFromHex(isDark ? '#000000' : '#111111', isDark ? 0.22 : 0.08),
    '--app-bar-shadow-soft': rgbaFromHex('#ffffff', isDark ? 0.02 : 0.55),
    '--title': readableText,
    '--subtitle': mutedText,
    '--strong-text': readableText,
    '--secondary-text': secondaryText,
    '--active-text': activeText,
    '--primary-text': primaryText,
    '--primary-hover-text': primaryHoverText,
    '--danger-text': dangerText,
    '--danger-border': mixHex(theme.surface, theme.semanticColors.diffRemoved, isDark ? 0.34 : 0.24),
    '--danger-strong-bg': dangerStrongBg,
    '--danger-strong-text': dangerStrongText,
    '--panel-title': readableText,
    '--panel-meta': mutedText,
    '--sidebar-panel-bg': panelBg,
    '--pane-bg': panelBg,
    '--card-bg': elevatedBg,
    '--card-top-border': rgbaFromHex(
      theme.ink,
      isDark ? scaleByContrast(contrastScale, 0.04, 0.1) : scaleByContrast(contrastScale, 0.04, 0.09)
    ),
    '--list-bg': listBg,
    '--list-header-bg': paneHeaderBg,
    '--selection-bg': selectedRowBg,
    '--icon-color': mixHex(theme.ink, theme.accent, 0.32),
    '--status-modified-bg': statusModifiedBg,
    '--status-modified-border': mixHex(theme.surface, theme.accent, isDark ? 0.3 : 0.2),
    '--status-modified-text': statusModifiedText,
    '--status-success-border': mixHex(theme.surface, theme.semanticColors.diffAdded, isDark ? 0.32 : 0.2),
    '--status-success-text': statusSuccessText,
    '--status-danger-border': mixHex(theme.surface, theme.semanticColors.diffRemoved, isDark ? 0.32 : 0.2),
    '--status-danger-text': statusDangerText,
    '--pane-header-bg': paneHeaderBg,
    '--pane-header-shadow': rgbaFromHex(
      theme.ink,
      isDark ? scaleByContrast(contrastScale, 0.02, 0.06) : scaleByContrast(contrastScale, 0.03, 0.08)
    ),
    '--pane-inner-shadow': rgbaFromHex(
      theme.ink,
      isDark ? scaleByContrast(contrastScale, 0.01, 0.05) : scaleByContrast(contrastScale, 0.02, 0.06)
    ),
    '--hunk-bg': surfaceAlt,
    '--diff-divider': rgbaFromHex(
      theme.ink,
      isDark ? scaleByContrast(contrastScale, 0.08, 0.2) : scaleByContrast(contrastScale, 0.08, 0.18)
    ),
    '--diff-context-bg': diffContextBgResolved,
    '--diff-insert-bg': diffInsertBg,
    '--diff-insert-text': diffInsertText,
    '--diff-delete-bg': diffDeleteBg,
    '--diff-delete-text': diffDeleteText,
    '--diff-gap-bg': canvasAlt,
    '--diff-gap-stripe': rgbaFromHex(
      theme.ink,
      isDark ? scaleByContrast(contrastScale, 0.04, 0.08) : scaleByContrast(contrastScale, 0.03, 0.065)
    ),
    '--collapsed-row-bg': collapsedBg,
    '--collapsed-row-line': rgbaFromHex(theme.ink, isDark ? 0.26 : 0.22),
    '--collapsed-chip-bg': elevatedBg,
    '--collapsed-chip-border': border,
    '--collapsed-chip-text': collapsedChipText,
    '--scroll-marker-insert': theme.semanticColors.diffAdded,
    '--scroll-marker-delete': theme.semanticColors.diffRemoved,
    '--scroll-marker-mixed': theme.accent,
    '--syntax-comment': ensureReadableForeground(
      mutedText,
      syntaxBackgrounds,
      theme.ink,
      syntaxMutedContrastTarget
    ),
    '--syntax-keyword': syntaxKeyword,
    '--syntax-type': syntaxType,
    '--syntax-string': syntaxString,
    '--syntax-number': syntaxNumber,
    '--syntax-function': syntaxFunction,
    '--syntax-property': syntaxProperty,
    '--syntax-constant': syntaxConstant,
    '--syntax-selector': syntaxSelector,
    '--syntax-macro': syntaxConstant,
    '--syntax-tag': syntaxString,
    '--syntax-regex': syntaxRegex,
    '--syntax-operator': readableText,
    '--syntax-punctuation': ensureReadableForeground(
      mutedText,
      syntaxBackgrounds,
      theme.ink,
      syntaxMutedContrastTarget
    ),
    '--insert-highlight-bg': rgbaFromHex(theme.semanticColors.diffAdded, isDark ? 0.34 : 0.24),
    '--delete-highlight-bg': rgbaFromHex(theme.semanticColors.diffRemoved, isDark ? 0.34 : 0.22),
    '--line-divider': rgbaFromHex(
      theme.ink,
      isDark ? scaleByContrast(contrastScale, 0.06, 0.14) : scaleByContrast(contrastScale, 0.08, 0.16)
    ),
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

  if (isHexColor(input.diffAdded)) {
    next.diffAdded = normalizeHexColor(input.diffAdded)
  }

  if (isHexColor(input.diffRemoved)) {
    next.diffRemoved = normalizeHexColor(input.diffRemoved)
  }

  if (isHexColor(input.skill)) {
    next.skill = normalizeHexColor(input.skill)
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

function compositeHex(foreground: string, background: string, alpha: number): string {
  const foregroundRgb = parseHexColor(foreground)
  const backgroundRgb = parseHexColor(background)
  const clampedAlpha = clamp(alpha, 0, 1)

  return rgbToHex({
    r: Math.round(foregroundRgb.r * clampedAlpha + backgroundRgb.r * (1 - clampedAlpha)),
    g: Math.round(foregroundRgb.g * clampedAlpha + backgroundRgb.g * (1 - clampedAlpha)),
    b: Math.round(foregroundRgb.b * clampedAlpha + backgroundRgb.b * (1 - clampedAlpha)),
  })
}

function pickReadableText(
  background: string | string[],
  preferredInk?: string,
  minRatio = 4.5
): string {
  const backgrounds = Array.isArray(background) ? background : [background]
  const normalizedPreferred = preferredInk ? normalizeHexColor(preferredInk) : undefined

  if (normalizedPreferred && minContrastRatio(normalizedPreferred, backgrounds) >= minRatio) {
    return normalizedPreferred
  }

  const fallbackCandidates = ['#000000', '#111111', '#FFFFFF']
  let bestCandidate = fallbackCandidates[0]
  let bestRatio = 0

  for (const candidate of fallbackCandidates) {
    const contrast = minContrastRatio(candidate, backgrounds)
    if (contrast > bestRatio) {
      bestCandidate = candidate
      bestRatio = contrast
    }
  }

  return bestCandidate
}

function ensureReadableForeground(
  color: string,
  background: string | string[],
  fallbackColor: string,
  minRatio = 4.5
): string {
  const normalizedColor = normalizeHexColor(color)
  const normalizedFallback = normalizeHexColor(fallbackColor)
  const backgrounds = Array.isArray(background) ? background : [background]

  if (minContrastRatio(normalizedColor, backgrounds) >= minRatio) {
    return normalizedColor
  }

  let bestCandidate = normalizedColor
  let bestRatio = minContrastRatio(normalizedColor, backgrounds)

  for (let amount = 0.08; amount <= 1; amount += 0.04) {
    const candidate = mixHex(normalizedColor, normalizedFallback, amount)
    const contrast = minContrastRatio(candidate, backgrounds)
    if (contrast > bestRatio) {
      bestCandidate = candidate
      bestRatio = contrast
    }

    if (contrast >= minRatio) {
      return candidate
    }
  }

  const fallbackCandidate = pickReadableText(backgrounds, normalizedFallback, minRatio)
  return minContrastRatio(fallbackCandidate, backgrounds) > bestRatio
    ? fallbackCandidate
    : bestCandidate
}

function ensureReadableSyntaxForeground(
  color: string,
  background: string | string[],
  baseTextColor: string,
  readabilityFallbackColor: string,
  minRatio = 4.5,
  minTextDelta = 1.2
): string {
  const normalizedColor = normalizeHexColor(color)
  const normalizedBaseText = normalizeHexColor(baseTextColor)
  const normalizedFallback = normalizeHexColor(readabilityFallbackColor)
  const backgrounds = Array.isArray(background) ? background : [background]

  const readableCandidate = ensureReadableForeground(
    normalizedColor,
    backgrounds,
    normalizedFallback,
    minRatio
  )

  if (contrastRatio(readableCandidate, normalizedBaseText) >= minTextDelta) {
    return readableCandidate
  }

  const oppositeOfBaseText =
    contrastRatio('#111111', normalizedBaseText) > contrastRatio('#FFFFFF', normalizedBaseText)
      ? '#111111'
      : '#FFFFFF'

  let bestCandidate = readableCandidate
  let bestTextDelta = contrastRatio(readableCandidate, normalizedBaseText)

  for (let amount = 0.04; amount <= 1; amount += 0.04) {
    const candidate = mixHex(normalizedColor, oppositeOfBaseText, amount)
    const contrast = minContrastRatio(candidate, backgrounds)
    if (contrast < minRatio) {
      continue
    }

    const textDelta = contrastRatio(candidate, normalizedBaseText)
    if (textDelta > bestTextDelta) {
      bestCandidate = candidate
      bestTextDelta = textDelta
    }

    if (textDelta >= minTextDelta) {
      return candidate
    }
  }

  return bestCandidate
}

function ensureDistinguishableSurface(
  color: string,
  background: string | string[],
  fallbackColor: string,
  minRatio = 1.14
): string {
  const normalizedColor = normalizeHexColor(color)
  const normalizedFallback = normalizeHexColor(fallbackColor)
  const backgrounds = Array.isArray(background) ? background : [background]

  if (minContrastRatio(normalizedColor, backgrounds) >= minRatio) {
    return normalizedColor
  }

  let bestCandidate = normalizedColor
  let bestRatio = minContrastRatio(normalizedColor, backgrounds)

  for (let amount = 0.04; amount <= 1; amount += 0.04) {
    const candidate = mixHex(normalizedColor, normalizedFallback, amount)
    const contrast = minContrastRatio(candidate, backgrounds)
    if (contrast > bestRatio) {
      bestCandidate = candidate
      bestRatio = contrast
    }

    if (contrast >= minRatio) {
      return candidate
    }
  }

  return bestCandidate
}

function minContrastRatio(foreground: string, backgrounds: string[]): number {
  return Math.min(...backgrounds.map((background) => contrastRatio(foreground, background)))
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(parseHexColor(foreground))
  const backgroundLuminance = relativeLuminance(parseHexColor(background))
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)

  return (lighter + 0.05) / (darker + 0.05)
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

function scaleByContrast(contrastScale: number, low: number, high: number): number {
  return low + (high - low) * clamp(contrastScale, 0, 1)
}
