import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { DiffSource } from '../../../src/lib/types'
import { DiffSessionService } from '../diff/diff-session-service'
import { runGit } from '../git/git-service'
import { GitProvider } from '../providers/git-provider'
import { LocalProvider } from '../providers/local-provider'
import { DocumentService } from './document-service'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('DocumentService integration', () => {
  it('edits the Git index without modifying the working tree', async () => {
    const root = await gitRepository()
    const path = join(root, 'file.txt')
    await writeFile(path, 'staged\n')
    await runGit(root, ['add', '--', 'file.txt'])
    await writeFile(path, 'working tree\n')

    const sessions = new DiffSessionService({
      localProvider: new LocalProvider(),
      gitProvider: new GitProvider(),
    })
    const source: DiffSource = {
      kind: 'git',
      repoPath: root,
      repositoryRoot: root,
      selection: { kind: 'workingTree', initialScope: 'staged' },
    }
    const session = await sessions.create(source, { ignoreCase: false, ignoreWhitespace: false })
    const entry = session.entries.find((item) => item.scope === 'staged' && item.path === 'file.txt')!
    const documents = new DocumentService(sessions)
    const target = { kind: 'gitIndex' as const, sessionId: session.sessionId, entryId: entry.id }
    const opened = await documents.open(target)
    const result = await documents.save({
      target,
      contents: 'edited index\n',
      expectedRevision: opened.revision,
    })

    expect(result.ok).toBe(true)
    expect((await runGit(root, ['show', ':file.txt'])).stdout).toBe('edited index\n')
    expect(await readFile(path, 'utf8')).toBe('working tree\n')
  })

  it('returns STALE_DOCUMENT when the index changed after loading', async () => {
    const root = await gitRepository()
    const path = join(root, 'file.txt')
    await writeFile(path, 'staged\n')
    await runGit(root, ['add', '--', 'file.txt'])
    const sessions = new DiffSessionService({
      localProvider: new LocalProvider(),
      gitProvider: new GitProvider(),
    })
    const source: DiffSource = {
      kind: 'git',
      repoPath: root,
      repositoryRoot: root,
      selection: { kind: 'workingTree', initialScope: 'staged' },
    }
    const session = await sessions.create(source, { ignoreCase: false, ignoreWhitespace: false })
    const entry = session.entries.find((item) => item.scope === 'staged' && item.path === 'file.txt')!
    const documents = new DocumentService(sessions)
    const target = { kind: 'gitIndex' as const, sessionId: session.sessionId, entryId: entry.id }
    const opened = await documents.open(target)
    await writeFile(path, 'external index\n')
    await runGit(root, ['add', '--', 'file.txt'])

    const result = await documents.save({
      target,
      contents: 'draft\n',
      expectedRevision: opened.revision,
    })
    expect(result).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: 'STALE_DOCUMENT' }),
    }))
    expect((await runGit(root, ['show', ':file.txt'])).stdout).toBe('external index\n')
  })
})

async function gitRepository() {
  const root = await mkdtemp(join(tmpdir(), 'diffly-document-service-'))
  roots.push(root)
  await runGit(root, ['init'])
  await runGit(root, ['config', 'user.name', 'Diffly Test'])
  await runGit(root, ['config', 'user.email', 'diffly@example.test'])
  await writeFile(join(root, 'file.txt'), 'base\n')
  await runGit(root, ['add', '--', 'file.txt'])
  await runGit(root, ['commit', '-m', 'base'])
  return root
}
