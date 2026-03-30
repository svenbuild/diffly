import { loadLaunchContext } from '../api'

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
