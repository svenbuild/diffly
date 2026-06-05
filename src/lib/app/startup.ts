import { loadLaunchContext } from '../api'
import type {
  LaunchContext,
  PathInfo,
  PathKind,
  PersistedExplorerPane,
} from '../types'

const STARTUP_FOLDER_QUERY_KEYS = [
  'startupFolder',
  'startupFolderPath',
  'startupPath',
  'folder',
  'folderPath',
  'path',
]

function normalizeStartupPath(value: string | null | undefined) {
  const trimmed = value?.trim()

  return trimmed ? trimmed : null
}

export interface StartupTarget {
  folderPath: string
  targetPath: string
  kind: PathKind
}

export interface E2ECompareTarget {
  leftPath: string
  rightPath: string
}

export interface E2EHarness {
  getState(): {
    directoryEntries: number
    errorMessage: string
    loading: boolean
    mode: string
    screen: string
    selectedRelativePath: string
  }
  selectPath(relativePath: string): Promise<boolean>
}

type PathInfoReader = (path: string) => Promise<PathInfo>

export async function readStartupFolderOverride() {
  try {
    const launchContext = await loadLaunchContext()
    const contextOverride = normalizeStartupPath(launchContext?.openHerePath)

    if (contextOverride) {
      return contextOverride
    }
  } catch {
    // Fall through to URL-based overrides so development builds can still inject startup state.
  }

  if (typeof window === 'undefined') {
    return null
  }

  const params = new URLSearchParams(window.location.search)

  for (const key of STARTUP_FOLDER_QUERY_KEYS) {
    const queryValue = normalizeStartupPath(params.get(key))

    if (queryValue) {
      return queryValue
    }
  }

  return null
}

export function readE2ECompareTarget(): E2ECompareTarget | null {
  if (typeof window === 'undefined') {
    return null
  }

  const params = new URLSearchParams(window.location.search)
  const left = params.get('difflyE2ELeft')?.trim()
  const right = params.get('difflyE2ERight')?.trim()

  return left && right ? { leftPath: left, rightPath: right } : null
}

export function isLaunchContext(value: unknown): value is LaunchContext {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as LaunchContext).openHerePath === 'string'
  )
}

export function installE2EHarness(enabled: boolean, harness: E2EHarness) {
  if (!enabled || typeof window === 'undefined') {
    return
  }

  ;(window as unknown as { __difflyE2E?: E2EHarness }).__difflyE2E = harness
}

export function waitForInitialPaint() {
  if (typeof window === 'undefined') {
    return Promise.resolve()
  }

  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.setTimeout(resolve, 0)
    })
  })
}

export async function resolveInitialPanePath(
  pane: PersistedExplorerPane | null,
  fallbackPath: string,
  readPathInfo: PathInfoReader,
) {
  if (pane?.currentPath) {
    const currentInfo = await readPathInfo(pane.currentPath)

    if (currentInfo.exists && currentInfo.isDirectory) {
      return currentInfo.path
    }
  }

  if (pane?.selectedTargetPath) {
    const targetInfo = await readPathInfo(pane.selectedTargetPath)

    if (targetInfo.exists && targetInfo.isDirectory) {
      return targetInfo.path
    }

    if (targetInfo.exists && targetInfo.isFile && targetInfo.parentPath) {
      return targetInfo.parentPath
    }
  }

  return fallbackPath
}

export async function resolveStartupTarget(
  overridePath: string | null,
  readPathInfo: PathInfoReader,
): Promise<StartupTarget | null> {
  if (!overridePath) {
    return null
  }

  const info = await readPathInfo(overridePath)

  if (info.exists && info.isDirectory) {
    return {
      folderPath: info.path,
      targetPath: info.path,
      kind: 'directory',
    }
  }

  if (info.exists && info.isFile && info.parentPath) {
    return {
      folderPath: info.parentPath,
      targetPath: info.path,
      kind: 'file',
    }
  }

  return null
}
