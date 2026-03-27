import {
  resolveVariant,
  type AppearanceSettings,
  type ThemeDefinition,
  type ThemeId,
  type ThemeSemanticColorKey,
  type ThemeVariant,
} from '../theme'
import {
  resolveThemeCssVariables,
  resolveThemeForVariant,
  setVariantOverride,
  setVariantThemeId,
} from '../theme/runtime'
import type { ThemeMode } from '../types'

export interface ResolvedAppearanceState {
  resolvedThemeMode: Exclude<ThemeMode, 'system'>
  lightAppearanceTheme: ThemeDefinition
  darkAppearanceTheme: ThemeDefinition
  visibleAppearanceVariants: ThemeVariant[]
}

export function resolveAppearanceState(
  appearanceSettings: AppearanceSettings,
  systemPrefersDark: boolean,
): ResolvedAppearanceState {
  return {
    resolvedThemeMode: resolveVariant(appearanceSettings.mode, systemPrefersDark),
    lightAppearanceTheme: resolveThemeForVariant(appearanceSettings, 'light'),
    darkAppearanceTheme: resolveThemeForVariant(appearanceSettings, 'dark'),
    visibleAppearanceVariants:
      appearanceSettings.mode === 'system' ? ['light', 'dark'] : [appearanceSettings.mode],
  }
}

export function applyAppearanceToRoot(
  root: HTMLElement,
  appearanceSettings: AppearanceSettings,
  systemPrefersDark: boolean,
  resolvedThemeMode: Exclude<ThemeMode, 'system'>,
) {
  root.dataset.theme = resolvedThemeMode
  root.style.colorScheme = resolvedThemeMode

  for (const [name, value] of Object.entries(
    resolveThemeCssVariables(appearanceSettings, systemPrefersDark),
  )) {
    root.style.setProperty(name, value)
  }
}

export function normalizeHexColor(value: string) {
  return `#${value.trim().replace(/^#/, '').toUpperCase()}`
}

export function setThemePreset(
  appearanceSettings: AppearanceSettings,
  variant: ThemeVariant,
  themeId: string,
  availableLightThemes: ThemeDefinition[],
  availableDarkThemes: ThemeDefinition[],
) {
  if (
    (variant === 'light' && availableLightThemes.some((theme) => theme.id === themeId)) ||
    (variant === 'dark' && availableDarkThemes.some((theme) => theme.id === themeId))
  ) {
    return setVariantThemeId(appearanceSettings, variant, themeId as ThemeId)
  }

  return appearanceSettings
}

export function setThemeColorOverride(
  appearanceSettings: AppearanceSettings,
  variant: ThemeVariant,
  field: 'accent' | 'surface' | 'ink',
  value: string,
) {
  const nextColor = normalizeHexColor(value)

  return setVariantOverride(appearanceSettings, variant, (next, base) => {
    if (nextColor === base[field].toUpperCase()) {
      delete next[field]
    } else {
      next[field] = nextColor
    }

    return next
  })
}

export function setThemeSemanticColorOverride(
  appearanceSettings: AppearanceSettings,
  variant: ThemeVariant,
  field: ThemeSemanticColorKey,
  value: string,
) {
  const nextColor = normalizeHexColor(value)

  return setVariantOverride(appearanceSettings, variant, (next, base) => {
    if (nextColor === base.semanticColors[field].toUpperCase()) {
      delete next[field]
    } else {
      next[field] = nextColor
    }

    return next
  })
}

export function setThemeFontOverride(
  appearanceSettings: AppearanceSettings,
  variant: ThemeVariant,
  field: 'ui' | 'code',
  value: string,
) {
  const nextValue = value.trim() ? value.trim() : null
  const overrideKey = field === 'ui' ? 'uiFont' : 'codeFont'

  return setVariantOverride(appearanceSettings, variant, (next, base) => {
    const baseValue = field === 'ui' ? base.fonts.ui : base.fonts.code

    if (nextValue === baseValue) {
      delete next[overrideKey]
    } else {
      next[overrideKey] = nextValue
    }

    return next
  })
}

export function setThemeContrast(
  appearanceSettings: AppearanceSettings,
  variant: ThemeVariant,
  value: number,
) {
  const nextContrast = Math.min(100, Math.max(0, Math.round(value)))

  return setVariantOverride(appearanceSettings, variant, (next, base) => {
    if (nextContrast === base.contrast) {
      delete next.contrast
    } else {
      next.contrast = nextContrast
    }

    return next
  })
}

export function setThemeTranslucency(
  appearanceSettings: AppearanceSettings,
  variant: ThemeVariant,
  enabled: boolean,
) {
  const nextOpaqueWindows = !enabled

  return setVariantOverride(appearanceSettings, variant, (next, base) => {
    if (nextOpaqueWindows === base.opaqueWindows) {
      delete next.opaqueWindows
    } else {
      next.opaqueWindows = nextOpaqueWindows
    }

    return next
  })
}

export function scheduleThemeTransitionCleanup(
  root: HTMLElement,
  existingTimer: number | null,
  delayMs: number,
  setTimer: (timer: number | null) => void,
) {
  if (existingTimer !== null) {
    window.clearTimeout(existingTimer)
  }

  const timer = window.setTimeout(() => {
    root.classList.remove('theme-switching')
    setTimer(null)
  }, delayMs)

  setTimer(timer)
}

export function setThemeMode(
  appearanceSettings: AppearanceSettings,
  nextThemeMode: ThemeMode,
  onChange: (next: AppearanceSettings) => void,
  onScheduleCleanup: (root: HTMLElement) => void,
) {
  if (appearanceSettings.mode === nextThemeMode) {
    return
  }

  if (typeof document === 'undefined') {
    onChange({
      ...appearanceSettings,
      mode: nextThemeMode,
    })
    return
  }

  const root = document.documentElement
  root.classList.add('theme-switching')

  if (typeof document.startViewTransition === 'function') {
    void document
      .startViewTransition(() => {
        onChange({
          ...appearanceSettings,
          mode: nextThemeMode,
        })
      })
      .finished.finally(() => {
        onScheduleCleanup(root)
      })

    return
  }

  onChange({
    ...appearanceSettings,
    mode: nextThemeMode,
  })
  onScheduleCleanup(root)
}
