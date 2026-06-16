import { themeToTreeStyles } from '@pierre/trees'
import type { AppearanceSettings } from './index'
import { createThemeTokens, resolveTheme } from './index'
import { resolveThemeForVariant } from './runtime'

function cssDeclarations(styles: Record<string, string>) {
  return Object.entries(styles)
    .filter(([, value]) => value.length > 0)
    .map(([property, value]) => {
      const cssProperty = property.startsWith('--')
        ? property
        : property.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)

      return `      ${cssProperty}: ${value};`
    })
    .join('\n')
}

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
      --diffs-light-bg: var(--editor-bg);
      --diffs-dark-bg: var(--editor-bg);
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

    *,
    *::before,
    *::after {
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    *::-webkit-scrollbar {
      width: 0;
      height: 0;
      display: none;
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
    resolveThemeForVariant(settings, resolvedThemeMode),
    settings.uiFontSize,
    settings.codeFontSize,
  )
  const themeDeclarations = cssDeclarations(
    themeToTreeStyles({
      type: resolvedThemeMode,
      bg: tokens.panelSurface,
      fg: tokens.ink,
      colors: {
        'editor.background': tokens.panelSurface,
        'editor.foreground': tokens.ink,
        'sideBar.background': tokens.panelSurface,
        'sideBar.foreground': tokens.ink,
        'sideBar.border': tokens.borderColor,
        'sideBarSectionHeader.foreground': tokens.mutedText,
        'list.hoverBackground': tokens.hoverSurface,
        'list.activeSelectionBackground': tokens.hoverSurface,
        'list.activeSelectionForeground': tokens.ink,
        'focusBorder': tokens.accent,
        'input.background': tokens.elevatedSurface,
        'input.foreground': tokens.ink,
        'input.border': tokens.borderColor,
        'scrollbarSlider.background': tokens.borderColor,
        'gitDecoration.addedResourceForeground': tokens.diffAdded,
        'gitDecoration.modifiedResourceForeground': tokens.accent,
        'gitDecoration.deletedResourceForeground': tokens.diffRemoved,
      },
    }),
  )

  return `
    :host {
${themeDeclarations}
      color-scheme: ${resolvedThemeMode};
      display: flex;
      width: 100%;
      min-width: 0;
      height: 100%;
      min-height: 0;
      background-color: ${tokens.panelSurface};
      border-color: ${tokens.borderColor};
      color: ${tokens.ink};
      --trees-font-family-override: ${tokens.uiFont};
      --trees-font-size-override: ${settings.uiFontSize}px;
      --trees-bg-override: ${tokens.panelSurface};
      --trees-bg-muted-override: ${tokens.hoverSurface};
      --trees-fg-override: ${tokens.ink};
      --trees-fg-muted-override: ${tokens.mutedText};
      --trees-accent-override: ${tokens.accent};
      --trees-border-color-override: ${tokens.borderColor};
      --trees-selected-bg-override: ${tokens.hoverSurface};
      --trees-selected-fg-override: ${tokens.ink};
      --trees-selected-focused-border-color-override: ${tokens.accent};
      --trees-input-bg-override: ${tokens.elevatedSurface};
      --trees-search-bg-override: ${tokens.elevatedSurface};
      --trees-search-fg-override: ${tokens.ink};
      --trees-focus-ring-color-override: ${tokens.accent};
      --trees-scrollbar-thumb-override: ${tokens.borderColor};
      --trees-status-added-override: ${tokens.diffAdded};
      --trees-status-modified-override: ${tokens.accent};
      --trees-status-deleted-override: ${tokens.diffRemoved};
      --trees-git-added-color-override: ${tokens.diffAdded};
      --trees-git-modified-color-override: ${tokens.accent};
      --trees-git-deleted-color-override: ${tokens.diffRemoved};
      --trees-padding-inline-override: 9px;
      --trees-scrollbar-gutter-override: 4px;
    }

    button[data-type='item'] {
      min-height: 22px;
      padding-left: 2px;
      border-radius: 4px;
    }

    button[data-type='item'][data-diffly-non-diffable='true'] {
      color: ${tokens.mutedText};
      opacity: 0.52;
    }

    button[data-type='item'][data-diffly-non-diffable='true'] [data-item-section='decoration'] {
      color: ${tokens.mutedText};
    }

    button[data-type='item'][data-diffly-unchanged='true'] {
      color: ${tokens.mutedText};
      opacity: 0.62;
    }

    [data-file-tree-search-container] {
      padding: 3px 4px 5px;
    }

    [data-file-tree-search-input] {
      min-height: 23px;
      font-size: ${Math.max(11, settings.uiFontSize - 1)}px;
    }

    [data-file-tree-virtualized-wrapper='true'],
    [data-file-tree-virtualized-root='true'] {
      width: 100%;
      min-width: 0;
      min-height: 0;
      background-color: ${tokens.panelSurface};
    }

    [data-file-tree-virtualized-scroll] {
      min-height: 0;
      padding-left: 0;
      background-color: ${tokens.panelSurface};
    }
  `
}
