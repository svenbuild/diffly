import type { CompareMode } from '../types'
import type { ExplorerPaneState } from '../ui-types'

export function createExplorerPane(title: string): ExplorerPaneState {
  return {
    title,
    roots: [],
    currentPath: '',
    pathInput: '',
    currentListing: null,
    listings: {},
    history: [],
    historyIndex: -1,
    selectedTargetPath: '',
    selectedTargetKind: null,
    loading: false,
    error: '',
  }
}

export function buildNextHistoryState(
  pane: ExplorerPaneState,
  path: string,
  historyMode: 'push' | 'keep',
) {
  if (historyMode === 'keep') {
    return {
      history: pane.history,
      historyIndex: pane.historyIndex,
    }
  }

  const currentPath = pane.history[pane.historyIndex]

  if (currentPath === path) {
    return {
      history: pane.history,
      historyIndex: pane.historyIndex,
    }
  }

  const nextHistory = pane.history.slice(0, pane.historyIndex + 1)
  nextHistory.push(path)

  return {
    history: nextHistory,
    historyIndex: nextHistory.length - 1,
  }
}

export function canGoBack(pane: ExplorerPaneState) {
  return pane.historyIndex > 0
}

export function canGoForward(pane: ExplorerPaneState) {
  return pane.historyIndex !== -1 && pane.historyIndex < pane.history.length - 1
}

export function currentDrive(pane: ExplorerPaneState) {
  const normalized = pane.currentPath.toLowerCase()

  return pane.roots.find((root) => normalized.startsWith(root.path.toLowerCase()))?.path ?? ''
}

export function sanitizePaneForMode(pane: ExplorerPaneState, nextMode: CompareMode) {
  if (nextMode === 'file' && pane.selectedTargetKind !== 'file') {
    return {
      ...pane,
      selectedTargetPath: '',
      selectedTargetKind: null,
    }
  }

  if (nextMode === 'directory' && pane.selectedTargetKind !== 'directory') {
    return {
      ...pane,
      selectedTargetPath: '',
      selectedTargetKind: null,
    }
  }

  return pane
}

export function retitlePane(pane: ExplorerPaneState, title: string): ExplorerPaneState {
  return {
    ...pane,
    title,
  }
}
