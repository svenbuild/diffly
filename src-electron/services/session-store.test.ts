import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type { PersistedSession } from '../../src/lib/types'

let userDataPath = ''

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name !== 'userData') {
        throw new Error(`Unexpected app.getPath(${name}) in test.`)
      }
      return userDataPath
    },
  },
}))

import { loadSessionState, saveSessionState } from './session-store'

describe('session-store', () => {
  beforeEach(async () => {
    userDataPath = await mkdtemp(join(tmpdir(), 'diffly-session-'))
  })

  afterEach(async () => {
    await rm(userDataPath, { recursive: true, force: true })
  })

  it('returns null when no session file exists', async () => {
    expect(await loadSessionState()).toBeNull()
  })

  it('round-trips a session with a git DiffSource intact', async () => {
    const session = baseSession({
      setupMode: 'git',
      source: {
        kind: 'git',
        repoPath: 'C:/repo',
        repositoryRoot: 'C:/repo',
        selection: {
          kind: 'refRange',
          baseRef: 'main',
          headRef: 'feature/topic',
          notation: 'threeDot',
        },
      },
    })

    await saveSessionState(session)
    const loaded = await loadSessionState()

    expect(loaded?.setupMode).toBe('git')
    expect(loaded?.source).toEqual(session.source)
  })

  it('round-trips a session with a GitHub DiffSource intact', async () => {
    const session = baseSession({
      setupMode: 'github',
      source: {
        kind: 'githubPullRequest',
        owner: 'owner',
        repo: 'repo',
        pullNumber: 12,
        url: 'https://github.com/owner/repo/pull/12',
      },
    })

    await saveSessionState(session)
    const loaded = await loadSessionState()

    expect(loaded?.setupMode).toBe('github')
    expect(loaded?.source).toEqual(session.source)
  })

  it('loads legacy sessions without setupMode or source', async () => {
    // Shape written by builds that predate the setup-mode system.
    const legacySession = {
      mode: 'directory',
      ignoreWhitespace: false,
      ignoreCase: true,
      leftPane: legacyPane('C:/left'),
      rightPane: legacyPane('C:/right'),
    }
    await writeFile(
      join(userDataPath, 'session.json'),
      JSON.stringify(legacySession),
      'utf8',
    )

    const loaded = await loadSessionState()

    expect(loaded?.mode).toBe('directory')
    expect(loaded?.setupMode).toBeUndefined()
    expect(loaded?.source).toBeUndefined()
    expect(loaded?.ignoreCase).toBe(true)
  })

  it('rejects oversized session payloads instead of writing them', async () => {
    const session = baseSession({})
    const oversized = {
      ...session,
      gitSetup: {
        browser: {
          currentPath: 'x'.repeat(2 * 1024 * 1024),
          history: [],
          historyIndex: -1,
        },
      },
    }

    await expect(saveSessionState(oversized)).rejects.toThrow(
      'Session state is too large to load safely.',
    )
    expect(await loadSessionState()).toBeNull()
  })
})

function baseSession(overrides: Partial<PersistedSession>): PersistedSession {
  return {
    mode: 'directory',
    ignoreWhitespace: false,
    ignoreCase: false,
    leftPane: legacyPane('C:/left'),
    rightPane: legacyPane('C:/right'),
    ...overrides,
  }
}

function legacyPane(currentPath: string) {
  return {
    currentPath,
    history: [currentPath],
    historyIndex: 0,
    selectedTargetPath: '',
    selectedTargetKind: null,
  }
}
