import type {
  CompareTreeSettings,
  CompareViewerSettings,
  CompareMode,
  PersistedExplorerPane,
  PersistedSession,
  UpdateChannel,
  UpdateMetadata,
} from '../types'
import type { AppearanceSettings } from '../theme'
import type { ExplorerPaneState } from '../ui-types'

export interface BuildPersistedSessionArgs {
  mode: CompareMode
  viewerSettings: CompareViewerSettings
  treeSettings: CompareTreeSettings
  appearanceSettings: AppearanceSettings
  ignoreWhitespace: boolean
  ignoreCase: boolean
  checkForUpdatesOnLaunch: boolean
  updateChannel: UpdateChannel
  lastUpdateCheckAt: string
  lastUpdateStatus: string
  lastUpdateMetadata: UpdateMetadata | null
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
    source: {
      kind: 'localPaths',
      leftPath: args.leftPane.selectedTargetPath,
      rightPath: args.rightPane.selectedTargetPath,
      mode: args.mode,
    },
    viewMode: args.viewerSettings.diffStyle === 'split' ? 'sideBySide' : 'unified',
    viewerSettings: args.viewerSettings,
    treeSettings: args.treeSettings,
    themeMode: args.appearanceSettings.mode,
    appearance: args.appearanceSettings,
    ignoreWhitespace: args.ignoreWhitespace,
    ignoreCase: args.ignoreCase,
    viewerTextSize: args.appearanceSettings.codeFontSize,
    checkForUpdatesOnLaunch: args.checkForUpdatesOnLaunch,
    updateChannel: args.updateChannel,
    lastUpdateCheckAt: args.lastUpdateCheckAt,
    lastUpdateStatus: args.lastUpdateStatus,
    lastUpdateMetadata: args.lastUpdateMetadata,
    leftPane: buildPersistedPane(args.leftPane),
    rightPane: buildPersistedPane(args.rightPane),
  }
}
