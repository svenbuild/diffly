import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DiffSource } from '../../../src/lib/types'
import { DiffSessionService } from '../diff/diff-session-service'
import { runGit } from '../git/git-service'
import { GitProvider } from '../providers/git-provider'
import { LocalProvider } from '../providers/local-provider'
import { OperationJournal } from './operation-journal'
import { PartialApplyService } from './partial-apply-service'

describe('PartialApplyService Git integration', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'diffly-partial-git-'))
    await runGit(root, ['init'])
    await runGit(root, ['config', 'user.name', 'Diffly Test'])
    await runGit(root, ['config', 'user.email', 'diffly@example.test'])
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('stages only the selected hunk and leaves the other worktree change untouched', async () => {
    const path = join(root, 'file.txt')
    const original = Array.from({ length: 24 }, (_, index) => `line ${index + 1}`)
    await writeFile(path, `${original.join('\n')}\n`)
    await runGit(root, ['add', '--', 'file.txt'])
    await runGit(root, ['commit', '-m', 'initial'])
    const changed = [...original]
    changed[1] = 'changed near start'
    changed[20] = 'changed near end'
    await writeFile(path, `${changed.join('\n')}\n`)

    const gitProvider = new GitProvider()
    const sessions = new DiffSessionService({ localProvider: new LocalProvider(), gitProvider })
    const source: DiffSource = {
      kind: 'git',
      repoPath: root,
      repositoryRoot: root,
      selection: { kind: 'workingTree', initialScope: 'unstaged' },
    }
    const session = await sessions.create(source, { ignoreCase: false, ignoreWhitespace: false })
    const entry = session.entries.find((item) => item.scope === 'unstaged' && item.path === 'file.txt')
    expect(entry).toBeDefined()
    const service = new PartialApplyService(sessions, new OperationJournal(join(root, '.journal')))
    const hunks = await service.listHunks(session.sessionId, entry!.id)
    expect(hunks).toHaveLength(2)
    const worktree = await sessions.openDocument({
      kind: 'gitWorktree', sessionId: session.sessionId, entryId: entry!.id,
    })

    await service.apply({
      sessionId: session.sessionId,
      entryId: entry!.id,
      operation: 'stage',
      selections: [{ fingerprint: hunks[0]!.fingerprint }],
      leftRevision: null,
      rightRevision: worktree.revision,
    })

    const staged = (await runGit(root, ['diff', '--cached'])).stdout
    const unstaged = (await runGit(root, ['diff'])).stdout
    expect(staged).toContain('changed near start')
    expect(staged).not.toContain('changed near end')
    expect(unstaged).toContain('changed near end')
    expect(await readFile(path, 'utf8')).toContain('changed near start')
  })
})
