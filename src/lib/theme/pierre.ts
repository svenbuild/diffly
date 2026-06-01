import type { AppearanceSettings } from './index'
import { createThemeTokens, resolveTheme } from './index'

export function resolvePierreDiffTheme(
  _settings: AppearanceSettings,
): string | { light: string; dark: string } {
  return {
    light: 'pierre-light',
    dark: 'pierre-dark',
  }
}

export function buildPierreDiffUnsafeCss(settings: AppearanceSettings) {
  const darkTokens = createThemeTokens(resolveTheme(settings, true), settings.uiFontSize, settings.codeFontSize)
  const lightTokens = createThemeTokens(resolveTheme(settings, false), settings.uiFontSize, settings.codeFontSize)

  return `
    :host {
      --diffs-font-family: ${darkTokens.codeFont};
      --diffs-font-size: ${settings.codeFontSize}px;
      color: ${darkTokens.ink};
    }

    .diffs-file-header {
      font-family: ${darkTokens.uiFont};
    }

    :host([data-theme='light']) {
      color: ${lightTokens.ink};
    }
  `
}

export function buildPierreTreeUnsafeCss(settings: AppearanceSettings) {
  const darkTokens = createThemeTokens(resolveTheme(settings, true), settings.uiFontSize, settings.codeFontSize)

  return `
    :host {
      --trees-font-family: ${darkTokens.uiFont};
      --trees-font-size: ${settings.uiFontSize}px;
      --trees-fg-override: ${darkTokens.ink};
      --trees-border-color-override: ${darkTokens.borderColor};
      --trees-selected-bg-override: ${darkTokens.hoverSurface};
    }

    button[data-type='item'] {
      border-radius: 6px;
    }
  `
}
