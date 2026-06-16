import {
  rename,
  rm,
} from 'node:fs/promises'

export async function replaceFile(tempPath: string, filePath: string) {
  try {
    await rename(tempPath, filePath)
    return
  } catch (error) {
    if (!isWindowsReplaceError(error)) {
      throw error
    }
  }

  await rm(filePath, { force: true })
  await rename(tempPath, filePath)
}

function isWindowsReplaceError(error: unknown) {
  if (process.platform !== 'win32' || !error || typeof error !== 'object') {
    return false
  }

  const code = 'code' in error ? error.code : null
  return code === 'EPERM' || code === 'EACCES' || code === 'EEXIST'
}
