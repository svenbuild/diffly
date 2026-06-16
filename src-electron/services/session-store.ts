import { app } from 'electron'
import { existsSync } from 'node:fs'
import {
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { PersistedSession } from '../../src/lib/types'
import { replaceFile } from './atomic-file'

const MAX_SESSION_STATE_BYTES = 1024 * 1024

export async function loadSessionState(): Promise<PersistedSession | null> {
  const filePath = sessionPath()
  if (!existsSync(filePath)) {
    return null
  }

  const info = await stat(filePath)
  validateSessionStateSize(info.size)
  return JSON.parse(await readFile(filePath, 'utf8')) as PersistedSession
}

export async function saveSessionState(session: PersistedSession) {
  const json = JSON.stringify(session)
  validateSessionStateSize(Buffer.byteLength(json))
  const filePath = sessionPath()
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`

  await mkdir(dirname(filePath), { recursive: true })
  try {
    await writeFile(tempPath, json, 'utf8')
    await replaceFile(tempPath, filePath)
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined)
    throw error
  }
}

function sessionPath() {
  return join(app.getPath('userData'), 'session.json')
}

function validateSessionStateSize(byteLength: number) {
  if (byteLength > MAX_SESSION_STATE_BYTES) {
    throw new Error('Session state is too large to load safely.')
  }
}
