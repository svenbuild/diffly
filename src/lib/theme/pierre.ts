import type { AppearanceSettings } from './index'
import { createThemeTokens, resolveTheme } from './index'
import { resolveThemeForVariant } from './runtime'

export function resolvePierreDiffTheme(
  settings: AppearanceSettings,
): string | { light: string; dark: string } {
  return {
    light: resolveThemeForVariant(settings, 'light').codeThemeId,
    dark: resolveThemeForVariant(settings, 'dark').codeThemeId,
  }
}

export function buildPierreDiffUnsafeCss(settings: AppearanceSettings) {
  const darkTokens = createThemeTokens(resolveTheme(settings, true), settings.uiFontSize, settings.codeFontSize)
  const lightTokens = createThemeTokens(resolveTheme(settings, false), settings.uiFontSize, settings.codeFontSize)

  return `
    :host {
      --diffs-font-family-override: ${darkTokens.codeFont};
      --diffs-header-font-family: ${darkTokens.uiFont};
      --diffs-font-size: ${settings.codeFontSize}px;
      --diffs-line-height: ${settings.codeFontSize + 5}px;
      --diffs-addition-color-override: ${darkTokens.diffAdded};
      --diffs-deletion-color-override: ${darkTokens.diffRemoved};
      --diffs-modified-color-override: ${darkTokens.accent};
      --diffs-bg-hover-override: ${darkTokens.accent};
      color: ${darkTokens.ink};
    }

    .diffs-file-header {
      font-family: ${darkTokens.uiFont};
    }

    :host([data-theme='light']) {
      --diffs-font-family-override: ${lightTokens.codeFont};
      --diffs-header-font-family: ${lightTokens.uiFont};
      --diffs-addition-color-override: ${lightTokens.diffAdded};
      --diffs-deletion-color-override: ${lightTokens.diffRemoved};
      --diffs-modified-color-override: ${lightTokens.accent};
      --diffs-bg-hover-override: ${lightTokens.accent};
      color: ${lightTokens.ink};
    }
  `
}

export function buildPierreTreeUnsafeCss(
  settings: AppearanceSettings,
  resolvedThemeMode: 'light' | 'dark',
) {
  const tokens = createThemeTokens(
    resolveTheme(settings, resolvedThemeMode === 'dark'),
    settings.uiFontSize,
    settings.codeFontSize,
  )

  return `
    :host {
      color-scheme: ${resolvedThemeMode};
      --trees-font-family-override: ${tokens.uiFont};
      --trees-font-size-override: ${settings.uiFontSize}px;
      --trees-bg-override: ${tokens.panelSurface};
      --trees-fg-override: ${tokens.ink};
      --trees-fg-muted-override: ${tokens.mutedText};
      --trees-accent-override: ${tokens.accent};
      --trees-border-color-override: ${tokens.borderColor};
      --trees-selected-bg-override: ${tokens.hoverSurface};
      --trees-selected-fg-override: ${tokens.ink};
      --trees-search-bg-override: ${tokens.elevatedSurface};
      --trees-search-fg-override: ${tokens.ink};
      --trees-focus-ring-color-override: ${tokens.accent};
      --trees-status-added-override: ${tokens.diffAdded};
      --trees-status-modified-override: ${tokens.accent};
      --trees-status-deleted-override: ${tokens.diffRemoved};
    }

    button[data-type='item'] {
      min-height: 22px;
      padding-left: 2px;
      border-radius: 4px;
    }

    [data-file-tree-search-container] {
      padding: 4px 4px 6px;
    }

    [data-file-tree-search-input] {
      min-height: 26px;
      font-size: ${Math.max(11, settings.uiFontSize - 1)}px;
    }

    [data-file-tree-virtualized-scroll] {
      padding-left: 0;
    }
  `
}
