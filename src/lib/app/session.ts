import type {
  CompareMode,
  ContextLinesSetting,
  PersistedExplorerPane,
  PersistedSession,
  UpdateChannel,
  ViewMode,
} from '../types'
import type { AppearanceSettings } from '../theme'
import type { ExplorerPaneState } from '../ui-types'

export interface BuildPersistedSessionArgs {
  mode: CompareMode
  viewMode: ViewMode
  appearanceSettings: AppearanceSettings
  ignoreWhitespace: boolean
  ignoreCase: boolean
  showFullFile: boolean
  showInlineHighlights: boolean
  wrapSideBySideLines: boolean
  showSyntaxHighlighting: boolean
  syncSideBySideScroll: boolean
  contextLines: ContextLinesSetting
  checkForUpdatesOnLaunch: boolean
  updateChannel: UpdateChannel
  lastUpdateCheckAt: string
  leftPane: ExplorerPaneState
  rightPane: ExplorerPaneState
}

export function buildPersistedPane(pane: ExplorerPaneState): PersistedExplorerPane {
  return {
    currentPath: pane.currentPath,
    history: pane.history,
    historyIndex: pane.historyIndex,
    selectedTargetPath: pane.selectedTargetPath,
    selectedTargetKind: pane.selectedTargetKind,
  }
}

export function buildPersistedSession(args: BuildPersistedSessionArgs): PersistedSession {
  return {
    mode: args.mode,
    viewMode: args.viewMode,
    themeMode: args.appearanceSettings.mode,
    appearance: args.appearanceSettings,
    ignoreWhitespace: args.ignoreWhitespace,
    ignoreCase: args.ignoreCase,
    showFullFile: args.showFullFile,
    showInlineHighlights: args.showInlineHighlights,
    wrapSideBySideLines: args.wrapSideBySideLines,
    showSyntaxHighlighting: args.showSyntaxHighlighting,
    syncSideBySideScroll: args.syncSideBySideScroll,
    viewerTextSize: args.appearanceSettings.codeFontSize,
    contextLines: args.contextLines,
    checkForUpdatesOnLaunch: args.checkForUpdatesOnLaunch,
    updateChannel: args.updateChannel,
    lastUpdateCheckAt: args.lastUpdateCheckAt,
    leftPane: buildPersistedPane(args.leftPane),
    rightPane: buildPersistedPane(args.rightPane),
  }
}
