import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DiffSource } from '../../../src/lib/types'
import { DiffSessionService } from '../diff/diff-session-service'
import { runGit } from '../git/git-service'
import { GitProvider } from '../providers/git-provider'
import { LocalProvider } from '../providers/local-provider'
import { OperationJournal } from '../review/operation-journal'
import { ConflictService } from './conflict-service'

describe('ConflictService integration', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'diffly-conflict-'))
    await runGit(root, ['init'])
    await runGit(root, ['config', 'user.name', 'Diffly Test'])
    await runGit(root, ['config', 'user.email', 'diffly@example.test'])
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('loads all index stages, resolves and stages, then restores the unmerged index', async () => {
    const path = join(root, 'file.txt')
    await writeFile(path, 'base\n')
    await runGit(root, ['add', '--', 'file.txt'])
    await runGit(root, ['commit', '-m', 'base'])
    const mainBranch = (await runGit(root, ['branch', '--show-current'])).stdout.trim()
    await runGit(root, ['checkout', '-b', 'incoming'])
    await writeFile(path, 'incoming\n')
    await runGit(root, ['commit', '-am', 'incoming'])
    await runGit(root, ['checkout', mainBranch])
    await writeFile(path, 'current\n')
    await runGit(root, ['commit', '-am', 'current'])
    const merge = await runGit(root, ['merge', 'incoming'], { allowNonZeroExit: true })
    expect(merge.exitCode).not.toBe(0)

    const provider = new GitProvider()
    const sessions = new DiffSessionService({ localProvider: new LocalProvider(), gitProvider: provider })
    const source: DiffSource = {
      kind: 'git',
      repoPath: root,
      repositoryRoot: root,
      selection: { kind: 'workingTree', initialScope: 'all' },
    }
    const session = await sessions.create(source, { ignoreCase: false, ignoreWhitespace: false })
    const entry = session.entries.find((item) => item.status === 'conflicted')
    expect(entry?.conflictKind).toBe('UU')
    const reviewDiff = await sessions.openEntry(session.sessionId, entry!.id, {
      ignoreCase: false,
      ignoreWhitespace: false,
    })
    expect(reviewDiff.text?.leftText).toBe('current\n')
    expect(reviewDiff.text?.rightText).toBe('incoming\n')
    const service = new ConflictService(sessions, new OperationJournal(join(root, '.journal')))
    const conflict = await service.open(session.sessionId, entry!.id)
    expect(conflict.base?.contents).toBe('base\n')
    expect(conflict.current?.contents).toBe('current\n')
    expect(conflict.incoming?.contents).toBe('incoming\n')
    expect(conflict.markerContents).toContain('<<<<<<<')

    await service.resolve({
      sessionId: session.sessionId,
      entryId: entry!.id,
      expectedRevision: conflict.revision,
      resolution: { kind: 'side', side: 'current' },
    })
    expect((await runGit(root, ['ls-files', '--unmerged'])).stdout).toBe('')
    expect(await readFile(path, 'utf8')).toBe('current\n')

    await service.undoResolution(session.sessionId)
    expect((await runGit(root, ['ls-files', '--unmerged'])).stdout).not.toBe('')
    expect(await readFile(path, 'utf8')).toContain('<<<<<<<')
  })
})
