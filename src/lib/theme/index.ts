export type AppearanceMode = 'light' | 'dark' | 'system'

export type ThemeVariant = 'light' | 'dark'

export interface ThemeSemanticColors {
  diffAdded: string
  diffRemoved: string
  skill: string
}

export type ThemeSemanticColorKey = keyof ThemeSemanticColors

export type ThemeId =
  | 'absolutely'
  | 'ayu'
  | 'catppuccin'
  | 'codex'
  | 'dracula'
  | 'everforest'
  | 'github'
  | 'gruvbox'
  | 'legacy-tuerkis'
  | 'linear'
  | 'lobster'
  | 'material'
  | 'matrix'
  | 'monokai'
  | 'night-owl'
  | 'nord'
  | 'notion'
  | 'one'
  | 'oscurange'
  | 'proof'
  | 'rose-pine'
  | 'sentry'
  | 'solarized'
  | 'temple'
  | 'tokyo-night'
  | 'vscode-plus'

export interface ThemeDefinition {
  id: ThemeId
  variant: ThemeVariant
  codeThemeId: string
  accent: string
  surface: string
  ink: string
  contrast: number
  opaqueWindows: boolean
  fonts: {
    ui: string | null
    code: string | null
  }
  semanticColors: ThemeSemanticColors
}

export interface ThemeOverrides {
  accent?: string
  surface?: string
  ink?: string
  diffAdded?: string
  diffRemoved?: string
  skill?: string
  contrast?: number
  uiFont?: string | null
  codeFont?: string | null
  opaqueWindows?: boolean
}

export interface AppearanceSettings {
  mode: AppearanceMode
  lightThemeId: ThemeId
  darkThemeId: ThemeId
  lightOverrides: ThemeOverrides
  darkOverrides: ThemeOverrides
  usePointerCursor: boolean
  uiFontSize: number
  codeFontSize: number
}

export interface ThemeTokens {
  accent: string
  surface: string
  ink: string
  diffAdded: string
  diffRemoved: string
  skill: string
  uiFont: string
  codeFont: string
  uiFontSize: number
  codeFontSize: number
  opaqueWindows: boolean
  contrast: number
  panelSurface: string
  elevatedSurface: string
  borderColor: string
  mutedText: string
  hoverSurface: string
}

export const DEFAULT_UI_FONT =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

export const DEFAULT_CODE_FONT =
  'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace'

export const THEME_REGISTRY: ThemeDefinition[] = [
  {
    id: 'absolutely',
    variant: 'dark',
    codeThemeId: 'absolutely',
    accent: '#cc7d5e',
    surface: '#2d2d2b',
    ink: '#f9f9f7',
    contrast: 60,
    opaqueWindows: true,
    fonts: {
      ui: 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      code: null,
    },
    semanticColors: {
      diffAdded: '#00c853',
      diffRemoved: '#ff5f38',
      skill: '#cc7d5e',
    },
  },
  {
    id: 'absolutely',
    variant: 'light',
    codeThemeId: 'absolutely',
    accent: '#cc7d5e',
    surface: '#f9f9f7',
    ink: '#2d2d2b',
    contrast: 45,
    opaqueWindows: true,
    fonts: {
      ui: null,
      code: null,
    },
    semanticColors: {
      diffAdded: '#00c853',
      diffRemoved: '#ff5f38',
      skill: '#cc7d5e',
    },
  },
  {
    id: 'ayu',
    variant: 'dark',
    codeThemeId: 'ayu',
    accent: '#e6b450',
    surface: '#0b0e14',
    ink: '#bfbdb6',
    contrast: 60,
    opaqueWindows: true,
    fonts: {
      ui: 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      code: null,
    },
    semanticColors: {
      diffAdded: '#7fd962',
      diffRemoved: '#ea6c73',
      skill: '#cda1fa',
    },
  },
  {
    id: 'catppuccin',
    variant: 'dark',
    codeThemeId: 'catppuccin',
    accent: '#cba6f7',
    surface: '#1e1e2e',
    ink: '#cdd6f4',
    contrast: 60,
    opaqueWindows: true,
    fonts: {
      ui: 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      code: null,
    },
    semanticColors: {
      diffAdded: '#a6e3a1',
      diffRemoved: '#f38ba8',
      skill: '#cba6f7',
    },
  },
  {
    id: 'catppuccin',
    variant: 'light',
    codeThemeId: 'catppuccin',
    accent: '#8839ef',
    surface: '#eff1f5',
    ink: '#4c4f69',
    contrast: 45,
    opaqueWindows: true,
    fonts: {
      ui: null,
      code: null,
    },
    semanticColors: {
      diffAdded: '#40a02b',
      diffRemoved: '#d20f39',
      skill: '#8839ef',
    },
  },
  {
    id: 'codex',
    variant: 'dark',
    codeThemeId: 'codex',
    accent: '#0169cc',
    surface: '#111111',
    ink: '#fcfcfc',
    contrast: 60,
    opaqueWindows: true,
    fonts: {
      ui: 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      code: null,
    },
    semanticColors: {
      diffAdded: '#00a240',
      diffRemoved: '#e02e2a',
      skill: '#b06dff',
    },
  },
  {
    id: 'codex',
    variant: 'light',
    codeThemeId: 'codex',
    accent: '#0169cc',
    surface: '#ffffff',
    ink: '#0d0d0d',
    contrast: 45,
    opaqueWindows: true,
    fonts: {
      ui: null,
      code: null,
    },
    semanticColors: {
      diffAdded: '#00a240',
      diffRemoved: '#e02e2a',
      skill: '#751ed9',
    },
  },
  {
    id: 'dracula',
    variant: 'dark',
    codeThemeId: 'dracula',
    accent: '#ff79c6',
    surface: '#282a36',
    ink: '#f8f8f2',
    contrast: 60,
    opaqueWindows: true,
    fonts: {
      ui: 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      code: null,
    },
    semanticColors: {
      diffAdded: '#50fa7b',
      diffRemoved: '#ff5555',
      skill: '#ff79c6',
    },
  },
  {
    id: 'everforest',
    variant: 'dark',
    codeThemeId: 'everforest',
    accent: '#a7c080',
    surface: '#2d353b',
    ink: '#d3c6aa',
    contrast: 60,
    opaqueWindows: true,
    fonts: {
      ui: 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      code: null,
    },
    semanticColors: {
      diffAdded: '#a7c080',
      diffRemoved: '#e67e80',
      skill: '#d699b6',
    },
  },
  {
    id: 'everforest',
    variant: 'light',
    codeThemeId: 'everforest',
    accent: '#93b259',
    surface: '#fdf6e3',
    ink: '#5c6a72',
    contrast: 45,
    opaqueWindows: true,
    fonts: {
      ui: null,
      code: null,
    },
    semanticColors: {
      diffAdded: '#8da101',
      diffRemoved: '#f85552',
      skill: '#df69ba',
    },
  },
  {
    id: 'github',
    variant: 'dark',
    codeThemeId: 'github',
    accent: '#1f6feb',
    surface: '#0d1117',
    ink: '#e6edf3',
    contrast: 60,
    opaqueWindows: true,
    fonts: {
      ui: 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      code: null,
    },
    semanticColors: {
      diffAdded: '#3fb950',
      diffRemoved: '#f85149',
      skill: '#bc8cff',
    },
  },
  {
    id: 'github',
    variant: 'light',
    codeThemeId: 'github',
    accent: '#0969da',
    surface: '#ffffff',
    ink: '#1f2328',
    contrast: 45,
    opaqueWindows: true,
    fonts: {
      ui: null,
      code: null,
    },
    semanticColors: {
      diffAdded: '#1a7f37',
      diffRemoved: '#cf222e',
      skill: '#8250df',
    },
  },
  {
    id: 'gruvbox',
    variant: 'dark',
    codeThemeId: 'gruvbox',
    accent: '#458588',
    surface: '#282828',
    ink: '#ebdbb2',
    contrast: 60,
    opaqueWindows: true,
    fonts: {
      ui: 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      code: null,
    },
    semanticColors: {
      diffAdded: '#ebdbb2',
      diffRemoved: '#cc241d',
      skill: '#b16286',
    },
  },
  {
    id: 'gruvbox',
    variant: 'light',
    codeThemeId: 'gruvbox',
    accent: '#458588',
    surface: '#fbf1c7',
    ink: '#3c3836',
    contrast: 45,
    opaqueWindows: true,
    fonts: {
      ui: null,
      code: null,
    },
    semanticColors: {
      diffAdded: '#3c3836',
      diffRemoved: '#cc241d',
      skill: '#b16286',
    },
  },
  {
    id: 'legacy-tuerkis',
    variant: 'dark',
    codeThemeId: 'material',
    accent: '#22C7C7',
    surface: '#202020',
    ink: '#F5F7FA',
    contrast: 60,
    opaqueWindows: true,
    fonts: {
      ui: null,
      code: null,
    },
    semanticColors: {
      diffAdded: '#3FB950',
      diffRemoved: '#FF6B6B',
      skill: '#63D5D5',
    },
  },
  {
    id: 'legacy-tuerkis',
    variant: 'light',
    codeThemeId: 'material',
    accent: '#159A9C',
    surface: '#F4FBFB',
    ink: '#173536',
    contrast: 52,
    opaqueWindows: true,
    fonts: {
      ui: null,
      code: null,
    },
    semanticColors: {
      diffAdded: '#1B8F63',
      diffRemoved: '#C84C45',
      skill: '#18AEB0',
    },
  },
  {
    id: 'linear',
    variant: 'dark',
    codeThemeId: 'linear',
    accent: '#5e6ad2',
    surface: '#17181d',
    ink: '#e6e9ef',
    contrast: 60,
    opaqueWindows: true,
    fonts: {
      ui: '"Aptos Display", "IBM Plex Sans", Aptos, "Noto Sans", sans-serif',
      code: null,
    },
    semanticColors: {
      diffAdded: '#7ad9c0',
      diffRemoved: '#fa423e',
      skill: '#c2a1ff',
    },
  },
  {
    id: 'linear',
    variant: 'light',
    codeThemeId: 'linear',
    accent: '#5e6ad2',
    surface: '#f7f8fa',
    ink: '#2a3140',
    contrast: 45,
    opaqueWindows: true,
    fonts: {
      ui: '"Aptos Display", "IBM Plex Sans", Aptos, "Noto Sans", sans-serif',
      code: null,
    },
    semanticColors: {
      diffAdded: '#00a240',
      diffRemoved: '#ba2623',
      skill: '#8160d8',
    },
  },
  {
    id: 'lobster',
    variant: 'dark',
    codeThemeId: 'lobster',
    accent: '#ff5c5c',
    surface: '#111827',
    ink: '#e4e4e7',
    contrast: 60,
    opaqueWindows: true,
    fonts: {
      ui: 'Bahnschrift, "IBM Plex Sans", Aptos, "Noto Sans", sans-serif',
      code: null,
    },
    semanticColors: {
      diffAdded: '#22c55e',
      diffRemoved: '#ff5c5c',
      skill: '#3b82f6',
    },
  },
  {
    id: 'material',
    variant: 'dark',
    codeThemeId: 'material',
    accent: '#80cbc4',
    surface: '#212121',
    ink: '#eeffff',
    contrast: 60,
    opaqueWindows: true,
    fonts: {
      ui: null,
      code: null,
    },
    semanticColors: {
      diffAdded: '#c3e88d',
      diffRemoved: '#f07178',
      skill: '#c792ea',
    },
  },
  {
    id: 'matrix',
    variant: 'dark',
    codeThemeId: 'matrix',
    accent: '#1eff5a',
    surface: '#040805',
    ink: '#b8ffca',
    contrast: 60,
    opaqueWindows: true,
    fonts: {
      ui: 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      code: null,
    },
    semanticColors: {
      diffAdded: '#1eff5a',
      diffRemoved: '#fa423e',
      skill: '#1eff5a',
    },
  },
  {
    id: 'monokai',
    variant: 'dark',
    codeThemeId: 'monokai',
    accent: '#99947c',
    surface: '#272822',
    ink: '#f8f8f2',
    contrast: 60,
    opaqueWindows: true,
    fonts: {
      ui: 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      code: null,
    },
    semanticColors: {
      diffAdded: '#86b42b',
      diffRemoved: '#c4265e',
      skill: '#8c6bc8',
    },
  },
  {
    id: 'night-owl',
    variant: 'dark',
    codeThemeId: 'night-owl',
    accent: '#44596b',
    surface: '#011627',
    ink: '#d6deeb',
    contrast: 60,
    opaqueWindows: true,
    fonts: {
      ui: 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      code: null,
    },
    semanticColors: {
      diffAdded: '#c5e478',
      diffRemoved: '#ef5350',
      skill: '#c792ea',
    },
  },
  {
    id: 'nord',
    variant: 'dark',
    codeThemeId: 'nord',
    accent: '#88c0d0',
    surface: '#2e3440',
    ink: '#d8dee9',
    contrast: 60,
    opaqueWindows: true,
    fonts: {
      ui: 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      code: null,
    },
    semanticColors: {
      diffAdded: '#a3be8c',
      diffRemoved: '#bf616a',
      skill: '#b48ead',
    },
  },
  {
    id: 'notion',
    variant: 'dark',
    codeThemeId: 'notion',
    accent: '#3183d8',
    surface: '#191919',
    ink: '#d9d9d8',
    contrast: 60,
    opaqueWindows: true,
    fonts: {
      ui: null,
      code: null,
    },
    semanticColors: {
      diffAdded: '#4ec9b0',
      diffRemoved: '#fa423e',
      skill: '#3183d8',
    },
  },
  {
    id: 'notion',
    variant: 'light',
    codeThemeId: 'notion',
    accent: '#3183d8',
    surface: '#ffffff',
    ink: '#37352f',
    contrast: 45,
    opaqueWindows: true,
    fonts: {
      ui: null,
      code: null,
    },
    semanticColors: {
      diffAdded: '#008000',
      diffRemoved: '#a31515',
      skill: '#0000ff',
    },
  },
  {
    id: 'one',
    variant: 'dark',
    codeThemeId: 'one',
    accent: '#4d78cc',
    surface: '#282c34',
    ink: '#abb2bf',
    contrast: 60,
    opaqueWindows: true,
    fonts: {
      ui: null,
      code: null,
    },
    semanticColors: {
      diffAdded: '#8cc265',
      diffRemoved: '#e05561',
      skill: '#c162de',
    },
  },
  {
    id: 'one',
    variant: 'light',
    codeThemeId: 'one',
    accent: '#526fff',
    surface: '#fafafa',
    ink: '#383a42',
    contrast: 45,
    opaqueWindows: true,
    fonts: {
      ui: null,
      code: null,
    },
    semanticColors: {
      diffAdded: '#3bba54',
      diffRemoved: '#e45649',
      skill: '#526fff',
    },
  },
  {
    id: 'oscurange',
    variant: 'dark',
    codeThemeId: 'oscurange',
    accent: '#f9b98c',
    surface: '#0b0b0f',
    ink: '#e6e6e6',
    contrast: 60,
    opaqueWindows: true,
    fonts: {
      ui: null,
      code: null,
    },
    semanticColors: {
      diffAdded: '#40c977',
      diffRemoved: '#fa423e',
      skill: '#479ffa',
    },
  },
  {
    id: 'proof',
    variant: 'light',
    codeThemeId: 'proof',
    accent: '#3d755d',
    surface: '#f5f3ed',
    ink: '#2f312d',
    contrast: 45,
    opaqueWindows: false,
    fonts: {
      ui: null,
      code: null,
    },
    semanticColors: {
      diffAdded: '#3d755d',
      diffRemoved: '#ba2623',
      skill: '#5f6ac2',
    },
  },
  {
    id: 'rose-pine',
    variant: 'dark',
    codeThemeId: 'rose-pine',
    accent: '#ea9a97',
    surface: '#232136',
    ink: '#e0def4',
    contrast: 60,
    opaqueWindows: true,
    fonts: {
      ui: null,
      code: null,
    },
    semanticColors: {
      diffAdded: '#9ccfd8',
      diffRemoved: '#908caa',
      skill: '#c4a7e7',
    },
  },
  {
    id: 'rose-pine',
    variant: 'light',
    codeThemeId: 'rose-pine',
    accent: '#d7827e',
    surface: '#faf4ed',
    ink: '#575279',
    contrast: 45,
    opaqueWindows: false,
    fonts: {
      ui: null,
      code: null,
    },
    semanticColors: {
      diffAdded: '#56949f',
      diffRemoved: '#797593',
      skill: '#907aa9',
    },
  },
  {
    id: 'sentry',
    variant: 'dark',
    codeThemeId: 'sentry',
    accent: '#7055f6',
    surface: '#2d2935',
    ink: '#e6dff9',
    contrast: 60,
    opaqueWindows: true,
    fonts: {
      ui: null,
      code: null,
    },
    semanticColors: {
      diffAdded: '#8ee6d7',
      diffRemoved: '#fa423e',
      skill: '#7055f6',
    },
  },
  {
    id: 'solarized',
    variant: 'dark',
    codeThemeId: 'solarized',
    accent: '#d30102',
    surface: '#002b36',
    ink: '#93a1a1',
    contrast: 60,
    opaqueWindows: true,
    fonts: {
      ui: null,
      code: null,
    },
    semanticColors: {
      diffAdded: '#859900',
      diffRemoved: '#dc322f',
      skill: '#d33682',
    },
  },
  {
    id: 'solarized',
    variant: 'light',
    codeThemeId: 'solarized',
    accent: '#b58900',
    surface: '#fdf6e3',
    ink: '#53676d',
    contrast: 45,
    opaqueWindows: false,
    fonts: {
      ui: null,
      code: null,
    },
    semanticColors: {
      diffAdded: '#859900',
      diffRemoved: '#dc322f',
      skill: '#d33682',
    },
  },
  {
    id: 'temple',
    variant: 'dark',
    codeThemeId: 'temple',
    accent: '#e4f222',
    surface: '#02120c',
    ink: '#c7e6da',
    contrast: 60,
    opaqueWindows: true,
    fonts: {
      ui: null,
      code: null,
    },
    semanticColors: {
      diffAdded: '#40c977',
      diffRemoved: '#fa423e',
      skill: '#e4f222',
    },
  },
  {
    id: 'tokyo-night',
    variant: 'dark',
    codeThemeId: 'tokyo-night',
    accent: '#3d59a1',
    surface: '#1a1b26',
    ink: '#a9b1d6',
    contrast: 60,
    opaqueWindows: true,
    fonts: {
      ui: null,
      code: null,
    },
    semanticColors: {
      diffAdded: '#449dab',
      diffRemoved: '#914c54',
      skill: '#9d7cd8',
    },
  },
  {
    id: 'vscode-plus',
    variant: 'dark',
    codeThemeId: 'vscode-plus',
    accent: '#007acc',
    surface: '#1e1e1e',
    ink: '#d4d4d4',
    contrast: 60,
    opaqueWindows: true,
    fonts: {
      ui: null,
      code: null,
    },
    semanticColors: {
      diffAdded: '#369432',
      diffRemoved: '#f44747',
      skill: '#000080',
    },
  },
  {
    id: 'vscode-plus',
    variant: 'light',
    codeThemeId: 'vscode-plus',
    accent: '#007acc',
    surface: '#ffffff',
    ink: '#000000',
    contrast: 45,
    opaqueWindows: false,
    fonts: {
      ui: null,
      code: null,
    },
    semanticColors: {
      diffAdded: '#008000',
      diffRemoved: '#ee0000',
      skill: '#0000ff',
    },
  },
]

const THEME_BY_ID_AND_VARIANT = new Map<string, ThemeDefinition>(
  THEME_REGISTRY.map((theme) => [getThemeKey(theme.id, theme.variant), theme])
)

function getThemeKey(id: ThemeId, variant: ThemeVariant): string {
  return `${id}:${variant}`
}

export function getThemePreset(id: ThemeId, variant: ThemeVariant): ThemeDefinition {
  const theme = THEME_BY_ID_AND_VARIANT.get(getThemeKey(id, variant))
  if (!theme) {
    throw new Error(`Unknown theme preset: ${id} (${variant})`)
  }
  return theme
}

export function getAvailableThemes(variant: ThemeVariant): ThemeDefinition[] {
  return THEME_REGISTRY.filter((theme) => theme.variant === variant)
}

export function resolveVariant(mode: AppearanceMode, systemPrefersDark: boolean): ThemeVariant {
  if (mode === 'light') return 'light'
  if (mode === 'dark') return 'dark'
  return systemPrefersDark ? 'dark' : 'light'
}

export function applyOverrides(base: ThemeDefinition, overrides: ThemeOverrides): ThemeDefinition {
  return {
    ...base,
    accent: overrides.accent ?? base.accent,
    surface: overrides.surface ?? base.surface,
    ink: overrides.ink ?? base.ink,
    semanticColors: {
      diffAdded: overrides.diffAdded ?? base.semanticColors.diffAdded,
      diffRemoved: overrides.diffRemoved ?? base.semanticColors.diffRemoved,
      skill: overrides.skill ?? base.semanticColors.skill,
    },
    contrast: overrides.contrast !== undefined ? overrides.contrast : base.contrast,
    opaqueWindows:
      overrides.opaqueWindows !== undefined ? overrides.opaqueWindows : base.opaqueWindows,
    fonts: {
      ui: overrides.uiFont !== undefined ? overrides.uiFont : base.fonts.ui,
      code: overrides.codeFont !== undefined ? overrides.codeFont : base.fonts.code,
    },
  }
}

export function resolveTheme(
  settings: AppearanceSettings,
  systemPrefersDark: boolean
): ThemeDefinition {
  const variant = resolveVariant(settings.mode, systemPrefersDark)
  const presetId = variant === 'dark' ? settings.darkThemeId : settings.lightThemeId
  const base = getThemePreset(presetId, variant)
  const overrides = variant === 'dark' ? settings.darkOverrides : settings.lightOverrides

  return applyOverrides(base, overrides)
}

export function resolveThemeTokens(
  settings: AppearanceSettings,
  systemPrefersDark: boolean
): ThemeTokens {
  const theme = resolveTheme(settings, systemPrefersDark)

  return createThemeTokens(theme, settings.uiFontSize, settings.codeFontSize)
}

export function createThemeTokens(
  theme: ThemeDefinition,
  uiFontSize: number,
  codeFontSize: number
): ThemeTokens {
  const uiFont = theme.fonts.ui ?? DEFAULT_UI_FONT
  const codeFont = theme.fonts.code ?? DEFAULT_CODE_FONT
  const isDark = theme.variant === 'dark'
  const contrastScale = clamp(theme.contrast, 0, 100) / 100
  const borderAlpha = scaleByContrast(contrastScale, 0.12, 0.38)
  const hoverAlpha = scaleByContrast(contrastScale, 0.04, 0.15)
  const panelAlpha = theme.opaqueWindows
    ? 0.96
    : scaleByContrast(contrastScale, isDark ? 0.78 : 0.88, isDark ? 0.94 : 0.98)
  const elevatedAlpha = theme.opaqueWindows
    ? 1
    : scaleByContrast(contrastScale, isDark ? 0.84 : 0.94, isDark ? 0.98 : 0.995)
  const mutedMix = scaleByContrast(contrastScale, 0.72, 0.42)

  return {
    accent: theme.accent,
    surface: theme.surface,
    ink: theme.ink,
    diffAdded: theme.semanticColors.diffAdded,
    diffRemoved: theme.semanticColors.diffRemoved,
    skill: theme.semanticColors.skill,
    uiFont,
    codeFont,
    uiFontSize,
    codeFontSize,
    opaqueWindows: theme.opaqueWindows,
    contrast: theme.contrast,
    panelSurface: mixHex(theme.surface, theme.ink, 1 - panelAlpha),
    elevatedSurface: mixHex(theme.surface, theme.ink, 1 - elevatedAlpha),
    borderColor: mixHex(theme.surface, theme.ink, borderAlpha),
    mutedText: mixHex(theme.ink, theme.surface, mutedMix),
    hoverSurface: mixHex(theme.surface, theme.ink, hoverAlpha),
  }
}

export function getDefaultAppearanceSettings(): AppearanceSettings {
  const lightTheme = getThemePreset('codex', 'light')
  const darkTheme = getThemePreset('codex', 'dark')

  return {
    mode: 'system',
    lightThemeId: lightTheme.id,
    darkThemeId: darkTheme.id,
    lightOverrides: {},
    darkOverrides: {},
    usePointerCursor: true,
    uiFontSize: 12,
    codeFontSize: 11,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function scaleByContrast(contrastScale: number, low: number, high: number): number {
  return low + (high - low) * clamp(contrastScale, 0, 1)
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
