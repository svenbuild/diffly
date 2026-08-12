import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ReviewPreferencesStore } from './review-preferences-store'

describe('ReviewPreferencesStore', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'diffly-review-preferences-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('persists the local author profile and comment drafts atomically', async () => {
    const store = new ReviewPreferencesStore(root)
    const original = await store.getProfile()
    expect(original.id).toBeTruthy()

    await store.saveProfile({ ...original, name: 'Ada', avatar: 'avatar.png' })
    expect(await new ReviewPreferencesStore(root).getProfile()).toMatchObject({ name: 'Ada', avatar: 'avatar.png' })

    const identity = 'a'.repeat(64)
    await store.saveDraft(identity, 'reply:thread-1', 'Unfinished reply')
    expect(await new ReviewPreferencesStore(root).listDrafts(identity)).toMatchObject([
      { key: 'reply:thread-1', body: 'Unfinished reply' },
    ])
    await store.removeDraft(identity, 'reply:thread-1')
    expect(await store.listDrafts(identity)).toEqual([])
  })
})
